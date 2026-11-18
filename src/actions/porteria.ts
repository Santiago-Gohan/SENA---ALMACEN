'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
import { requirePermiso } from '@/lib/auth';
import { norm, hoyISO, JORNADAS_PORTERIA, type JornadaPorteria } from '@/lib/utils';
import { borrarIdentidad, getIdentidad, huellaActiva } from '@/lib/huella';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function volver(ok: string | null, error: string | null): never {
  const qs = ok
    ? '?ok=' + encodeURIComponent(ok)
    : '?error=' + encodeURIComponent(error || 'No se pudo completar la operación');
  redirect('/porteria' + qs);
}

/**
 * Busca un instructor por nombre exacto (sin tildes ni mayúsculas) y, si no
 * existe, lo crea como persona de tipo instructor. Igual que en Control de
 * acceso: así portería no se bloquea cuando llega alguien nuevo.
 */
async function resolverInstructor(nombreRaw: string): Promise<string> {
  const nombre = nombreRaw.replace(/\s+/g, ' ').trim();
  if (!nombre) throw new Error('Escribe el nombre del instructor');

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

  const partes = nombre.split(' ');
  const apellidos = partes.length >= 3 ? partes.slice(-2).join(' ') : partes[1] ?? '';
  const nombres = partes.length >= 3 ? partes.slice(0, -2).join(' ') : partes[0];

  const nueva = await uno<{ id: string }>(
    `insert into persona (nombres, apellidos, tipo_persona)
     values ($1, $2, 'instructor') returning id`,
    [nombres, apellidos]
  );

  if (!nueva) throw new Error('No se pudo registrar el instructor');
  return nueva.id;
}

/** Resuelve el instructor que solicita la llave: huella o registro manual. */
async function identificarInstructor(formData: FormData): Promise<{
  instructorId: string;
  usuarioId: string | null;
  credencialId: string | null;
  metodo: 'huella' | 'manual';
  nombre: string;
}> {
  const identidad = (await huellaActiva()) ? await getIdentidad() : null;

  if (identidad) {
    const cuenta = await uno<any>(
      `select u.id, u.persona_id, u.activo, p.nombres, p.apellidos
         from usuario u
         left join persona p on p.id = u.persona_id
        where u.id = $1`,
      [identidad.usuarioId]
    );

    if (!cuenta) throw new Error('La identidad de la huella ya no es válida. Vuelve a intentarlo.');
    if (!cuenta.activo) throw new Error('La cuenta de esa persona está desactivada');
    if (!cuenta.persona_id) {
      throw new Error(
        'La cuenta identificada no tiene una persona asociada. Pídele al administrador que la complete.'
      );
    }

    const nombre =
      `${cuenta.nombres ?? ''} ${cuenta.apellidos ?? ''}`.trim() || identidad.nombre;

    return {
      instructorId: cuenta.persona_id,
      usuarioId: cuenta.id,
      credencialId: identidad.credencialId,
      metodo: 'huella',
      nombre,
    };
  }

  const instructorId = texto(formData.get('instructor_id'));
  const instructorNombre = texto(formData.get('instructor_nombre'));

  let personaId = instructorId;
  let usuarioId: string | null = null;

  if (personaId) {
    const persona = await uno<any>(
      `select p.id, p.nombres, p.apellidos, p.activo, p.tipo_persona
         from persona p
        where p.id = $1`,
      [personaId]
    );
    if (!persona) throw new Error('El instructor seleccionado no existe');
    if (!persona.activo) throw new Error('El instructor seleccionado está inactivo');
    if (!['instructor', 'funcionario', 'contratista'].includes(persona.tipo_persona)) {
      throw new Error('La persona seleccionada no es un instructor');
    }

    const cuenta = await uno<{ id: string }>(
      'select id from usuario where persona_id = $1 and activo limit 1',
      [personaId]
    );
    usuarioId = cuenta?.id ?? null;

    return {
      instructorId: personaId,
      usuarioId,
      credencialId: null,
      metodo: 'manual',
      nombre: `${persona.nombres} ${persona.apellidos ?? ''}`.trim(),
    };
  }

  if (!instructorNombre) {
    throw new Error('Identifica al instructor con la huella o selecciónalo de la lista');
  }

  personaId = await resolverInstructor(instructorNombre);
  const cuenta = await uno<{ id: string }>(
    'select id from usuario where persona_id = $1 and activo limit 1',
    [personaId]
  );

  return {
    instructorId: personaId,
    usuarioId: cuenta?.id ?? null,
    credencialId: null,
    metodo: 'manual',
    nombre: instructorNombre,
  };
}

export async function registrarPrestamo(formData: FormData): Promise<void> {
  const actor = await requirePermiso('porteria');

  const ambienteId = entero(formData.get('ambiente_id'));
  const fichaId = entero(formData.get('ficha_id'));
  const jornadaRaw = texto(formData.get('jornada')) as JornadaPorteria;
  const observaciones = texto(formData.get('observaciones'));

  if (!ambienteId) volver(null, 'Selecciona el ambiente de la llave');

  const jornada = JORNADAS_PORTERIA[jornadaRaw];
  if (!jornada) volver(null, 'Selecciona la jornada (mañana o tarde)');

  let error = '';

  try {
    const ambiente = await uno<any>(
      'select id, codigo, nombre, activo from ambiente where id = $1',
      [ambienteId]
    );
    if (!ambiente) throw new Error('El ambiente no existe');
    if (!ambiente.activo) throw new Error('El ambiente está inactivo');

    const abierta = await uno(
      'select id from prestamo_llave where ambiente_id = $1 and hora_devolucion is null',
      [ambienteId]
    );
    if (abierta) {
      throw new Error(
        `La llave de ${ambiente.codigo} ya está prestada. Registra primero la devolución.`
      );
    }

    const instructor = await identificarInstructor(formData);

    if (fichaId) {
      const ficha = await uno('select id from ficha where id = $1', [fichaId]);
      if (!ficha) throw new Error('La ficha seleccionada no existe');
    }

    await q(
      `insert into prestamo_llave
         (ambiente_id, instructor_id, usuario_id, ficha_id, fecha, jornada,
          hora_inicio, hora_fin, estado, metodo_identificacion, credencial_id,
          observaciones, registrado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'prestada', $9, $10, $11, $12)`,
      [
        ambienteId,
        instructor.instructorId,
        instructor.usuarioId,
        fichaId,
        hoyISO(),
        jornadaRaw,
        jornada.inicio,
        jornada.fin,
        instructor.metodo,
        instructor.credencialId,
        observaciones || null,
        actor.id,
      ]
    );

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id, datos)
       values ($1, 'prestar_llave', 'prestamo_llave', $2, $3::jsonb)`,
      [
        actor.id,
        `${ambiente.codigo}/${instructor.nombre}`,
        JSON.stringify({
          ambiente: ambiente.codigo,
          instructor: instructor.nombre,
          jornada: jornadaRaw,
          metodo: instructor.metodo,
        }),
      ]
    );

    // La identidad de la huella es de un solo uso: se borra al registrar.
    if (instructor.metodo === 'huella') borrarIdentidad();
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/porteria');
  revalidatePath('/');
  volver('Préstamo de llave registrado', null);
}

export async function devolverLlave(formData: FormData): Promise<void> {
  const actor = await requirePermiso('porteria');

  const id = entero(formData.get('id'));
  const observaciones = texto(formData.get('observaciones'));
  const conNovedad = texto(formData.get('estado')) === 'novedad';

  if (!id) volver(null, 'Préstamo inválido');

  let error = '';

  try {
    const prestamo = await uno<any>(
      `select p.id, p.hora_devolucion, a.codigo
         from prestamo_llave p
         join ambiente a on a.id = p.ambiente_id
        where p.id = $1`,
      [id]
    );
    if (!prestamo) throw new Error('El préstamo no existe');
    if (prestamo.hora_devolucion) throw new Error('Esa llave ya fue devuelta');

    const actualizadas = await ejecutar(
      `update prestamo_llave
          set hora_devolucion = now(),
              estado = $2,
              observaciones = coalesce(nullif($3, ''), observaciones),
              updated_at = now()
        where id = $1 and hora_devolucion is null`,
      [id, conNovedad ? 'novedad' : 'devuelta', observaciones]
    );
    if (!actualizadas) throw new Error('La llave ya fue devuelta');

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id, datos)
       values ($1, $2, 'prestamo_llave', $3, $4::jsonb)`,
      [
        actor.id,
        conNovedad ? 'devolver_llave_novedad' : 'devolver_llave',
        String(id),
        JSON.stringify({ ambiente: prestamo.codigo, observaciones: observaciones || null }),
      ]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/porteria');
  revalidatePath('/');
  volver('Devolución registrada', null);
}

/** Descarta la identidad temporal para que otro instructor pueda identificarse. */
export async function olvidarIdentidad(): Promise<void> {
  await requirePermiso('porteria');
  borrarIdentidad();
  revalidatePath('/porteria');
  redirect('/porteria?ok=' + encodeURIComponent('Identidad descartada'));
}
