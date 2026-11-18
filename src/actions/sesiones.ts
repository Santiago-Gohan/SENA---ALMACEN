'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
import { requirePermiso } from '@/lib/auth';
import { norm, hoyISO } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function resolverInstructor(nombreRaw: string, crearSiFalta: boolean): Promise<string | null> {
  const nombre = nombreRaw.replace(/\s+/g, ' ').trim();
  if (!nombre) return null;

  const personas = await q<any>(
    `select id, nombres, apellidos
       from persona
      where tipo_persona = any($1)
      limit 2000`,
    [['instructor', 'funcionario', 'contratista']]
  );

  const objetivo = norm(nombre);
  const encontrada = personas.find(
    (p) => norm(`${p.nombres ?? ''} ${p.apellidos ?? ''}`) === objetivo
  );
  if (encontrada) return encontrada.id;
  if (!crearSiFalta) return null;

  const partes = nombre.split(' ');
  const apellidos = partes.length >= 3 ? partes.slice(-2).join(' ') : partes[1] ?? '';
  const nombres = partes.length >= 3 ? partes.slice(0, -2).join(' ') : partes[0];

  const nueva = await uno<{ id: string }>(
    `insert into persona (nombres, apellidos, tipo_persona)
     values ($1, $2, 'instructor') returning id`,
    [nombres, apellidos]
  );

  if (!nueva) throw new Error('No se pudo crear el instructor');
  return nueva.id;
}

async function buscarAmbientePorCodigo(raw: string): Promise<any | null> {
  const codigo = raw.replace(/^SENA-AMB:/i, '').trim();
  if (!codigo) return null;

  const porCodigo = await uno<any>(
    'select id, codigo, nombre, activo from ambiente where codigo = $1',
    [codigo]
  );
  if (porCodigo) return porCodigo;

  const limpio = codigo.replace(/[%,()]/g, ' ').trim();
  if (!limpio) return null;

  return uno<any>(
    'select id, codigo, nombre, activo from ambiente where nombre ilike $1 limit 1',
    [`%${limpio}%`]
  );
}

/**
 * Guarda la firma como dataURL dentro de la misma fila (columna text).
 * No se usa almacenamiento externo: así el respaldo viaja con la base.
 */
async function guardarFirma(dataUrl: string): Promise<{ url: string | null; hash: string | null }> {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) return { url: null, hash: null };

  const buffer = Buffer.from(m[2], 'base64');
  const hash = createHash('sha256').update(buffer).digest('hex');
  return { url: dataUrl, hash };
}

export async function abrirSesion(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('sesiones');

  const ambienteId = entero(formData.get('ambiente_id'));
  const ambienteCodigo = texto(formData.get('ambiente_codigo'));
  const fichaCodigo = texto(formData.get('ficha')).replace(/\D/g, '');
  const instructorNombre = texto(formData.get('instructor'));
  const programaForm = entero(formData.get('programa_id'));
  const firma = texto(formData.get('firma_data'));
  const sinFirma = texto(formData.get('sin_firma')) === 'on';
  const observaciones = texto(formData.get('observaciones'));

  if (!ambienteId && !ambienteCodigo) {
    redirect('/acceso?error=' + encodeURIComponent('Escanea el QR o selecciona el ambiente'));
  }
  if (!/^\d{7,8}$/.test(fichaCodigo)) {
    redirect('/acceso?error=' + encodeURIComponent('La ficha debe tener 7 u 8 dígitos'));
  }
  if (!instructorNombre) {
    redirect('/acceso?error=' + encodeURIComponent('Escribe el nombre del instructor'));
  }
  if (!firma && !sinFirma) {
    redirect('/acceso?error=' + encodeURIComponent('Falta la firma del instructor'));
  }

  let error = '';

  try {
    let ambiente: any = null;

    if (ambienteCodigo) {
      ambiente = await buscarAmbientePorCodigo(ambienteCodigo);
    }
    if (!ambiente && ambienteId) {
      ambiente = await uno<any>(
        'select id, codigo, nombre, activo from ambiente where id = $1',
        [ambienteId]
      );
    }

    if (!ambiente) {
      throw new Error('No se encontró el ambiente. Escanea el QR de nuevo o selecciónalo de la lista.');
    }
    if (!ambiente.activo) throw new Error('El ambiente está inactivo');

    const ficha = await uno<any>(
      'select id, codigo, programa_id, activa from ficha where codigo = $1',
      [fichaCodigo]
    );
    if (!ficha) throw new Error(`La ficha ${fichaCodigo} no está registrada. Créala antes de usarla.`);
    if (!ficha.activa) throw new Error(`La ficha ${fichaCodigo} está inactiva`);

    const programaId = programaForm ?? ficha.programa_id;
    if (!programaId) throw new Error('La ficha no tiene programa de formación asignado');

    const instructorId = await resolverInstructor(instructorNombre, true);
    if (!instructorId) throw new Error('No se pudo identificar al instructor');

    const abierta = await uno(
      `select id from sesion_ambiente
        where ambiente_id = $1 and instructor_id = $2 and hora_salida is null`,
      [ambiente.id, instructorId]
    );
    if (abierta) throw new Error('Ese instructor ya tiene una sesión abierta en este ambiente');

    const firmaGuardada = firma ? await guardarFirma(firma) : { url: null, hash: null };

    await q(
      `insert into sesion_ambiente
         (ambiente_id, instructor_id, ficha_id, programa_id,
          instructor_texto_original, ficha_texto_original, ambiente_texto_original,
          fecha, hora_entrada, estado, firma_url, firma_hash, firma_metodo,
          observaciones, origen, registrado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now(), 'abierta', $9, $10, $11, $12, 'digital', $13)`,
      [
        ambiente.id,
        instructorId,
        ficha.id,
        programaId,
        instructorNombre,
        fichaCodigo,
        `${ambiente.codigo} - ${ambiente.nombre}`,
        hoyISO(),
        firmaGuardada.url,
        firmaGuardada.hash,
        firma ? 'canvas' : 'ninguna',
        observaciones || null,
        usuario.id,
      ]
    );

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, $2, $3, $4)`,
      [usuario.id, 'abrir_sesion', 'sesion_ambiente', `${ambiente.codigo}/${fichaCodigo}`]
    );

    revalidatePath('/acceso');
    revalidatePath('/');
    redirect('/acceso?ok=' + encodeURIComponent(`Entrada registrada en ${ambiente.codigo}`));
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  redirect('/acceso?error=' + encodeURIComponent(error));
}

export async function cerrarSesion(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('sesiones');
  const id = entero(formData.get('id'));
  const observaciones = texto(formData.get('observaciones'));
  const tipoNovedad = texto(formData.get('tipo_novedad'));

  if (!id) redirect('/acceso?error=' + encodeURIComponent('Sesión inválida'));

  let error = '';

  try {
    const sesion = await uno<any>(
      'select id, hora_entrada, hora_salida, ambiente_id from sesion_ambiente where id = $1',
      [id]
    );
    if (!sesion) throw new Error('La sesión no existe');
    if (sesion.hora_salida) throw new Error('Esa sesión ya está cerrada');

    const conNovedad = Boolean(tipoNovedad);

    await ejecutar(
      `update sesion_ambiente
          set hora_salida = now(), estado = $2, observaciones = $3, updated_at = now()
        where id = $1`,
      [id, conNovedad ? 'con_novedad' : 'cerrada', observaciones || null]
    );

    if (conNovedad) {
      await q(
        `insert into novedad (sesion_id, tipo, descripcion, estado, creado_por)
         values ($1, $2, $3, 'abierta', $4)`,
        [id, tipoNovedad, observaciones || 'Novedad reportada al cierre de la sesión', usuario.id]
      );
    }

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, $2, $3, $4)`,
      [usuario.id, 'cerrar_sesion', 'sesion_ambiente', String(id)]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/acceso?error=' + encodeURIComponent(error));

  revalidatePath('/acceso');
  revalidatePath('/');
  redirect('/acceso?ok=' + encodeURIComponent('Salida registrada'));
}
