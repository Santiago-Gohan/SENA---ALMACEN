'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
import { requirePermiso } from '@/lib/auth';
import { norm, qrObjeto } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function bool(v: FormDataEntryValue | null): boolean {
  const s = texto(v).toLowerCase();
  return s === 'on' || s === 'true' || s === '1' || s === 'si' || s === 'sí';
}

const SIN_PLACA = ['', 'sp', 's p', 'sin placa', 'sinplaca', 'no tiene', 'n a', 'na', 'ninguna', 'sin'];

/**
 * Normaliza la placa. S/P se guarda como bandera, no como placa.
 * Si el mismo valor normalizado llega con otra escritura, se marca conflicto.
 */
async function resolverPlaca(
  placaRaw: string
): Promise<{ placa_id: number | null; placa_original: string | null; es_sp: boolean }> {
  const original = placaRaw.trim();
  if (!original) return { placa_id: null, placa_original: null, es_sp: false };

  if (SIN_PLACA.includes(norm(original))) {
    return { placa_id: null, placa_original: original, es_sp: true };
  }

  const valor = original.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/\s+/g, '');
  if (!valor) return { placa_id: null, placa_original: original, es_sp: true };

  const existente = await uno<any>(
    'select id, valor, valor_original from placa where valor = $1',
    [valor]
  );

  if (existente) {
    if (existente.valor_original && norm(existente.valor_original) !== norm(original)) {
      await ejecutar('update placa set tiene_conflicto = true where id = $1', [existente.id]);
    }
    return { placa_id: existente.id, placa_original: original, es_sp: false };
  }

  const creada = await uno<{ id: number }>(
    `insert into placa (valor, valor_original) values ($1, $2) returning id`,
    [valor, original]
  );

  if (!creada) throw new Error('No se pudo registrar la placa');
  return { placa_id: creada.id, placa_original: original, es_sp: false };
}

async function registrarHistorial(datos: {
  objeto_id: number | string;
  tipo_evento: string;
  ambiente_origen_id?: number | null;
  ambiente_destino_id?: number | null;
  persona_id?: string | null;
  detalle?: string | null;
  usuario_id?: string | null;
}): Promise<void> {
  await q(
    `insert into objeto_historial
       (objeto_id, tipo_evento, ambiente_origen_id, ambiente_destino_id, persona_id, detalle, usuario_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      datos.objeto_id,
      datos.tipo_evento,
      datos.ambiente_origen_id ?? null,
      datos.ambiente_destino_id ?? null,
      datos.persona_id ?? null,
      datos.detalle ?? null,
      datos.usuario_id ?? null,
    ]
  );
}

export async function crearObjeto(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('inventario_editar');
  const nombre = texto(formData.get('nombre'));

  if (!nombre) {
    redirect('/inventario?error=' + encodeURIComponent('El nombre del objeto es obligatorio'));
  }

  let error = '';
  try {
    const placa = await resolverPlaca(texto(formData.get('placa')));
    const temp = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ambienteId = entero(formData.get('ambiente_id'));

    const creado = await uno<{ id: string }>(
      `insert into objeto
         (codigo_interno, codigo_qr, nombre, descripcion, placa_id, placa_original, es_sp,
          categoria_id, ambiente_id, estado, condicion, criticidad, es_consumible,
          cantidad_actual, stock_minimo, observaciones)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning id`,
      [
        temp,
        `TMP-QR:${temp}`,
        nombre,
        texto(formData.get('descripcion')) || null,
        placa.placa_id,
        placa.placa_original,
        placa.es_sp,
        entero(formData.get('categoria_id')),
        ambienteId,
        texto(formData.get('estado')) || 'disponible',
        texto(formData.get('condicion')) || 'bueno',
        texto(formData.get('criticidad')) || 'media',
        bool(formData.get('es_consumible')),
        entero(formData.get('cantidad_actual')) ?? 1,
        entero(formData.get('stock_minimo')),
        texto(formData.get('observaciones')) || null,
      ]
    );

    if (!creado) throw new Error('No se pudo crear el objeto');

    const codigoInterno = `OBJ-${String(creado.id).padStart(6, '0')}`;
    await ejecutar(
      'update objeto set codigo_interno = $2, codigo_qr = $3 where id = $1',
      [creado.id, codigoInterno, qrObjeto(codigoInterno)]
    );

    await registrarHistorial({
      objeto_id: creado.id,
      tipo_evento: 'creacion',
      ambiente_destino_id: ambienteId,
      detalle: 'Registro inicial en inventario',
      usuario_id: usuario.id,
    });

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id, datos)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        usuario.id,
        'crear_objeto',
        'objeto',
        String(creado.id),
        JSON.stringify({ nombre, codigo_interno: codigoInterno }),
      ]
    );

    revalidatePath('/inventario');
    redirect(`/inventario/${creado.id}?ok=` + encodeURIComponent(`Objeto ${codigoInterno} creado`));
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  redirect('/inventario?error=' + encodeURIComponent(error));
}

export async function actualizarObjeto(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('inventario_editar');
  const id = entero(formData.get('id'));
  if (!id) redirect('/inventario?error=' + encodeURIComponent('Objeto inválido'));

  let error = '';
  try {
    const placa = await resolverPlaca(texto(formData.get('placa')));

    await ejecutar(
      `update objeto
          set nombre = $2, descripcion = $3, placa_id = $4, placa_original = $5, es_sp = $6,
              categoria_id = $7, ambiente_id = $8, condicion = $9, criticidad = $10,
              es_consumible = $11, cantidad_actual = $12, stock_minimo = $13,
              observaciones = $14, updated_at = now()
        where id = $1`,
      [
        id,
        texto(formData.get('nombre')),
        texto(formData.get('descripcion')) || null,
        placa.placa_id,
        placa.placa_original,
        placa.es_sp,
        entero(formData.get('categoria_id')),
        entero(formData.get('ambiente_id')),
        texto(formData.get('condicion')) || 'bueno',
        texto(formData.get('criticidad')) || 'media',
        bool(formData.get('es_consumible')),
        entero(formData.get('cantidad_actual')) ?? 1,
        entero(formData.get('stock_minimo')),
        texto(formData.get('observaciones')) || null,
      ]
    );

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, $2, $3, $4)`,
      [usuario.id, 'actualizar_objeto', 'objeto', String(id)]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/inventario/${id}?error=` + encodeURIComponent(error));

  revalidatePath(`/inventario/${id}`);
  revalidatePath('/inventario');
  redirect(`/inventario/${id}?ok=` + encodeURIComponent('Objeto actualizado'));
}

export async function trasladarObjeto(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('inventario_editar');
  const id = entero(formData.get('id'));
  const destino = entero(formData.get('ambiente_destino_id'));
  if (!id || !destino) {
    redirect('/inventario?error=' + encodeURIComponent('Datos de traslado incompletos'));
  }

  let error = '';
  try {
    const actual = await uno<any>('select ambiente_id, codigo_interno from objeto where id = $1', [
      id,
    ]);
    if (!actual) throw new Error('El objeto no existe');

    await ejecutar('update objeto set ambiente_id = $2, updated_at = now() where id = $1', [
      id,
      destino,
    ]);

    await registrarHistorial({
      objeto_id: id,
      tipo_evento: 'traslado',
      ambiente_origen_id: actual.ambiente_id ?? null,
      ambiente_destino_id: destino,
      detalle: texto(formData.get('detalle')) || 'Traslado de ambiente',
      usuario_id: usuario.id,
    });
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/inventario/${id}?error=` + encodeURIComponent(error));

  revalidatePath(`/inventario/${id}`);
  revalidatePath('/inventario');
  redirect(`/inventario/${id}?ok=` + encodeURIComponent('Traslado registrado'));
}

export async function cambiarEstadoObjeto(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('inventario_editar');
  const id = entero(formData.get('id'));
  const estado = texto(formData.get('estado'));
  if (!id || !estado) redirect('/inventario?error=' + encodeURIComponent('Datos incompletos'));

  let error = '';
  try {
    await ejecutar('update objeto set estado = $2, updated_at = now() where id = $1', [id, estado]);

    const tipoEvento =
      estado === 'mantenimiento'
        ? 'mantenimiento'
        : estado === 'baja'
        ? 'baja'
        : estado === 'perdido'
        ? 'perdida'
        : 'ajuste';

    await registrarHistorial({
      objeto_id: id,
      tipo_evento: tipoEvento,
      detalle: `Cambio de estado a ${estado}`,
      usuario_id: usuario.id,
    });
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/inventario/${id}?error=` + encodeURIComponent(error));

  revalidatePath(`/inventario/${id}`);
  revalidatePath('/inventario');
  redirect(`/inventario/${id}?ok=` + encodeURIComponent('Estado actualizado'));
}

export async function darDeBajaObjeto(formData: FormData): Promise<void> {
  const usuario = await requirePermiso('inventario_editar');
  const id = entero(formData.get('id'));
  if (!id) redirect('/inventario?error=' + encodeURIComponent('Objeto inválido'));

  let error = '';
  try {
    await ejecutar(
      `update objeto set activo = false, estado = 'baja', updated_at = now() where id = $1`,
      [id]
    );

    await registrarHistorial({
      objeto_id: id,
      tipo_evento: 'baja',
      detalle: texto(formData.get('detalle')) || 'Objeto dado de baja',
      usuario_id: usuario.id,
    });
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/inventario/${id}?error=` + encodeURIComponent(error));

  revalidatePath('/inventario');
  redirect('/inventario?ok=' + encodeURIComponent('Objeto dado de baja'));
}
