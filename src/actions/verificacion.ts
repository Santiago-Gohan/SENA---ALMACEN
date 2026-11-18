'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
import { requirePermiso, type SessionUser } from '@/lib/auth';
import { hoyISO, normalizarFicha, parseQr } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function codigoAmbiente(raw: string): string {
  const leido = parseQr(raw);
  return (leido.codigo || raw).trim();
}

/**
 * La firma viaja como dataURL dentro de la misma fila (texto).
 * No se usa almacenamiento externo: el respaldo queda completo en la base.
 */
async function guardarFirma(dataUrl: string): Promise<{ url: string | null; hash: string | null }> {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) return { url: null, hash: null };

  const buffer = Buffer.from(m[2], 'base64');
  const hash = createHash('sha256').update(buffer).digest('hex');
  return { url: dataUrl, hash };
}

/** Persona asociada al usuario; si no tiene, se crea a partir de su nombre. */
async function personaDelUsuario(usuario: SessionUser): Promise<string> {
  const fila = await uno<any>('select persona_id from usuario where id = $1', [usuario.id]);
  if (fila?.persona_id) return fila.persona_id;

  const partes = (usuario.nombre || usuario.username).trim().split(/\s+/);
  const nombres = partes.slice(0, 2).join(' ') || 'Instructor';
  const apellidos = partes.slice(2).join(' ') || 'SENA';

  const persona = await uno<any>(
    `insert into persona (nombres, apellidos, tipo_persona)
     values ($1, $2, 'instructor') returning id`,
    [nombres, apellidos]
  );
  if (!persona) throw new Error('No se pudo registrar al instructor');

  await ejecutar('update usuario set persona_id = $2 where id = $1 and persona_id is null', [
    usuario.id,
    persona.id,
  ]);

  return persona.id;
}

async function ambientePorCodigo(codigo: string): Promise<any | null> {
  if (!codigo) return null;
  return uno<any>(
    'select id, codigo, nombre, bloque, piso, tipo, activo from ambiente where codigo = $1',
    [codigo]
  );
}

async function sesionAbierta(ambienteId: number): Promise<any | null> {
  return uno<any>(
    `select s.id, s.ficha_id, s.programa_id, s.aprendices, s.hora_entrada,
            f.codigo as ficha_codigo
       from sesion_ambiente s
       left join ficha f on f.id = s.ficha_id
      where s.ambiente_id = $1 and s.hora_salida is null
      order by s.hora_entrada desc
      limit 1`,
    [ambienteId]
  );
}

async function objetosDelAmbiente(ambienteId: number): Promise<any[]> {
  return q<any>(
    `select id, codigo_interno, nombre, estado, condicion
       from objeto
      where ambiente_id = $1 and activo
      order by nombre`,
    [ambienteId]
  );
}

async function registrarNovedad(
  sesionId: number,
  detalle: any[],
  observaciones: string,
  usuarioId: string
): Promise<void> {
  const faltantes = detalle.filter((d) => !d.ok);
  if (!faltantes.length) return;

  const lista = faltantes
    .map((d) => `${d.codigo} ${d.nombre}`)
    .join(', ')
    .slice(0, 500);

  await q(
    `insert into novedad (sesion_id, tipo, descripcion, estado, creado_por)
     values ($1, 'desorden', $2, 'abierta', $3)`,
    [
      sesionId,
      `Verificación QR: ${faltantes.length} objeto(s) sin marcar en orden: ${lista}${
        observaciones ? ` · ${observaciones}` : ''
      }`.slice(0, 1000),
      usuarioId,
    ]
  );
}

export async function registrarVerificacion(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('verificar');

  const codigoRaw = texto(formData.get('ambiente_codigo'));
  const codigo = codigoAmbiente(codigoRaw);
  const momento = texto(formData.get('momento')) === 'salida' ? 'salida' : 'entrada';
  const aprendiz1 = texto(formData.get('aprendiz_1')).replace(/\s+/g, ' ');
  const aprendiz2 = texto(formData.get('aprendiz_2')).replace(/\s+/g, ' ');
  const fichaCodigo = normalizarFicha(texto(formData.get('ficha')));
  const observaciones = texto(formData.get('observaciones'));
  const firma = texto(formData.get('firma_data'));

  const volver = (ok: string | null, error: string | null): never => {
    const qs = ok
      ? '?ok=' + encodeURIComponent(ok)
      : '?error=' + encodeURIComponent(error || 'No se pudo registrar la verificación');
    redirect(`/a/${encodeURIComponent(codigo || '')}${qs}`);
  };

  if (!codigo) volver(null, 'No se identificó el ambiente');
  if (!aprendiz1 || !aprendiz2) volver(null, 'Escribe los nombres de los 2 aprendices de turno');
  if (!firma) volver(null, 'Falta la firma del instructor');

  let error = '';

  try {
    const ambiente = await ambientePorCodigo(codigo);
    if (!ambiente) throw new Error(`El ambiente ${codigo} no existe`);
    if (!ambiente.activo) throw new Error('El ambiente está inactivo');

    const objetos = await objetosDelAmbiente(ambiente.id);
    const detalle = objetos.map((o) => ({
      id: o.id,
      codigo: o.codigo_interno,
      nombre: o.nombre,
      estado: o.estado,
      ok: formData.get(`ok_${o.id}`) === 'on',
    }));
    const todoEnOrden = detalle.every((d) => d.ok);
    const firmaGuardada = await guardarFirma(firma);
    const aprendices = `${aprendiz1} / ${aprendiz2}`;

    if (momento === 'entrada') {
      if (!fichaCodigo) throw new Error('Escribe la ficha (7 u 8 dígitos) para abrir la sesión');

      const abierta = await sesionAbierta(ambiente.id);
      if (abierta) {
        throw new Error(
          `Ya hay una entrada abierta en este ambiente (${abierta.ficha_codigo ?? 'ficha'} desde ${new Date(
            abierta.hora_entrada
          ).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}). Registra primero la salida.`
        );
      }

      const ficha = await uno<any>(
        'select id, codigo, programa_id, activa from ficha where codigo = $1',
        [fichaCodigo]
      );
      if (!ficha) throw new Error(`La ficha ${fichaCodigo} no está registrada`);
      if (!ficha.activa) throw new Error(`La ficha ${fichaCodigo} está inactiva`);
      if (!ficha.programa_id) throw new Error('La ficha no tiene programa de formación asignado');

      const instructorId = await personaDelUsuario(usuario);

      const sesion = await uno<any>(
        `insert into sesion_ambiente
           (ambiente_id, instructor_id, ficha_id, programa_id,
            instructor_texto_original, ficha_texto_original, ambiente_texto_original,
            fecha, hora_entrada, estado, firma_url, firma_hash, firma_metodo,
            observaciones, origen, aprendices, registrado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now(), 'abierta', $9, $10, 'canvas',
                 $11, 'digital', $12, $13)
         returning id`,
        [
          ambiente.id,
          instructorId,
          ficha.id,
          ficha.programa_id,
          usuario.nombre,
          fichaCodigo,
          `${ambiente.codigo} - ${ambiente.nombre}`,
          hoyISO(),
          firmaGuardada.url,
          firmaGuardada.hash,
          observaciones || null,
          aprendices,
          usuario.id,
        ]
      );
      if (!sesion) throw new Error('No se pudo abrir la sesión');

      await q(
        `insert into verificacion
           (sesion_id, ambiente_id, momento, todo_en_orden, detalle, aprendices,
            observaciones, firma_url, firma_hash, firma_metodo, registrado_por)
         values ($1, $2, 'entrada', $3, $4::jsonb, $5, $6, $7, $8, 'canvas', $9)`,
        [
          sesion.id,
          ambiente.id,
          todoEnOrden,
          JSON.stringify(detalle),
          aprendices,
          observaciones || null,
          firmaGuardada.url,
          firmaGuardada.hash,
          usuario.id,
        ]
      );

      if (!todoEnOrden) await registrarNovedad(sesion.id, detalle, observaciones, usuario.id);

      await q(
        `insert into auditoria (usuario_id, accion, entidad, entidad_id)
         values ($1, 'verificacion_entrada', 'ambiente', $2)`,
        [usuario.id, ambiente.codigo]
      );

      revalidatePath('/');
      revalidatePath('/acceso');
      revalidatePath(`/a/${ambiente.codigo}`);
      volver(`Entrada registrada en ${ambiente.codigo} · ${aprendices}`, null);
    }

    // ----------------------------- SALIDA -----------------------------
    const sesion = await sesionAbierta(ambiente.id);
    if (!sesion) throw new Error('No hay una entrada abierta en este ambiente. Registra primero la entrada.');

    await ejecutar(
      `update sesion_ambiente
          set hora_salida = now(),
              estado = $2,
              firma_url = coalesce($3, firma_url),
              firma_hash = coalesce($4, firma_hash),
              firma_metodo = 'canvas',
              aprendices = $5,
              observaciones = coalesce(nullif($6, ''), observaciones),
              updated_at = now()
        where id = $1`,
      [
        sesion.id,
        todoEnOrden ? 'cerrada' : 'con_novedad',
        firmaGuardada.url,
        firmaGuardada.hash,
        aprendices,
        observaciones,
      ]
    );

    await q(
      `insert into verificacion
         (sesion_id, ambiente_id, momento, todo_en_orden, detalle, aprendices,
          observaciones, firma_url, firma_hash, firma_metodo, registrado_por)
       values ($1, $2, 'salida', $3, $4::jsonb, $5, $6, $7, $8, 'canvas', $9)`,
      [
        sesion.id,
        ambiente.id,
        todoEnOrden,
        JSON.stringify(detalle),
        aprendices,
        observaciones || null,
        firmaGuardada.url,
        firmaGuardada.hash,
        usuario.id,
      ]
    );

    if (!todoEnOrden) await registrarNovedad(sesion.id, detalle, observaciones, usuario.id);

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'verificacion_salida', 'ambiente', $2)`,
      [usuario.id, ambiente.codigo]
    );

    revalidatePath('/');
    revalidatePath('/acceso');
    revalidatePath(`/a/${ambiente.codigo}`);
    volver(`Salida registrada en ${ambiente.codigo}`, null);
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  volver(null, error);
}
