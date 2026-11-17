'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, mensajeError } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
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
  sb: ReturnType<typeof db>,
  placaRaw: string
): Promise<{ placa_id: number | null; placa_original: string | null; es_sp: boolean }> {
  const original = placaRaw.trim();
  if (!original) return { placa_id: null, placa_original: null, es_sp: false };

  if (SIN_PLACA.includes(norm(original))) {
    return { placa_id: null, placa_original: original, es_sp: true };
  }

  const valor = original.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/\s+/g, '');
  if (!valor) return { placa_id: null, placa_original: original, es_sp: true };

  const { data: existente } = await sb
    .from('placa')
    .select('id, valor, valor_original')
    .eq('valor', valor)
    .maybeSingle();

  if (existente) {
    if (existente.valor_original && norm(existente.valor_original) !== norm(original)) {
      await sb.from('placa').update({ tiene_conflicto: true }).eq('id', existente.id);
    }
    return { placa_id: existente.id, placa_original: original, es_sp: false };
  }

  const { data: creada, error } = await sb
    .from('placa')
    .insert({ valor, valor_original: original })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { placa_id: creada.id, placa_original: original, es_sp: false };
}

async function registrarHistorial(
  sb: ReturnType<typeof db>,
  datos: {
    objeto_id: number;
    tipo_evento: string;
    ambiente_origen_id?: number | null;
    ambiente_destino_id?: number | null;
    persona_id?: string | null;
    detalle?: string | null;
    usuario_id?: string | null;
  }
): Promise<void> {
  await sb.from('objeto_historial').insert({
    objeto_id: datos.objeto_id,
    tipo_evento: datos.tipo_evento,
    ambiente_origen_id: datos.ambiente_origen_id ?? null,
    ambiente_destino_id: datos.ambiente_destino_id ?? null,
    persona_id: datos.persona_id ?? null,
    detalle: datos.detalle ?? null,
    usuario_id: datos.usuario_id ?? null,
  });
}

export async function crearObjeto(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const nombre = texto(formData.get('nombre'));

  if (!nombre) {
    redirect('/inventario?error=' + encodeURIComponent('El nombre del objeto es obligatorio'));
  }

  let error = '';
  try {
    const sb = db();
    const placa = await resolverPlaca(sb, texto(formData.get('placa')));
    const temp = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: creado, error: err } = await sb
      .from('objeto')
      .insert({
        codigo_interno: temp,
        codigo_qr: `TMP-QR:${temp}`,
        nombre,
        descripcion: texto(formData.get('descripcion')) || null,
        placa_id: placa.placa_id,
        placa_original: placa.placa_original,
        es_sp: placa.es_sp,
        categoria_id: entero(formData.get('categoria_id')),
        ambiente_id: entero(formData.get('ambiente_id')),
        estado: texto(formData.get('estado')) || 'disponible',
        condicion: texto(formData.get('condicion')) || 'bueno',
        criticidad: texto(formData.get('criticidad')) || 'media',
        es_consumible: bool(formData.get('es_consumible')),
        cantidad_actual: entero(formData.get('cantidad_actual')) ?? 1,
        stock_minimo: entero(formData.get('stock_minimo')),
        observaciones: texto(formData.get('observaciones')) || null,
      })
      .select('id')
      .single();

    if (err) throw new Error(err.message);

    const codigoInterno = `OBJ-${String(creado.id).padStart(6, '0')}`;
    const { error: err2 } = await sb
      .from('objeto')
      .update({ codigo_interno: codigoInterno, codigo_qr: qrObjeto(codigoInterno) })
      .eq('id', creado.id);
    if (err2) throw new Error(err2.message);

    await registrarHistorial(sb, {
      objeto_id: creado.id,
      tipo_evento: 'creacion',
      ambiente_destino_id: entero(formData.get('ambiente_id')),
      detalle: 'Registro inicial en inventario',
      usuario_id: usuario.id,
    });

    await sb.from('auditoria').insert({
      usuario_id: usuario.id,
      accion: 'crear_objeto',
      entidad: 'objeto',
      entidad_id: String(creado.id),
      datos: { nombre, codigo_interno: codigoInterno },
    });

    revalidatePath('/inventario');
    redirect(`/inventario/${creado.id}?ok=` + encodeURIComponent(`Objeto ${codigoInterno} creado`));
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  redirect('/inventario?error=' + encodeURIComponent(error));
}

export async function actualizarObjeto(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const id = entero(formData.get('id'));
  if (!id) redirect('/inventario?error=' + encodeURIComponent('Objeto inválido'));

  let error = '';
  try {
    const sb = db();
    const placa = await resolverPlaca(sb, texto(formData.get('placa')));

    const { error: err } = await sb
      .from('objeto')
      .update({
        nombre: texto(formData.get('nombre')),
        descripcion: texto(formData.get('descripcion')) || null,
        placa_id: placa.placa_id,
        placa_original: placa.placa_original,
        es_sp: placa.es_sp,
        categoria_id: entero(formData.get('categoria_id')),
        ambiente_id: entero(formData.get('ambiente_id')),
        condicion: texto(formData.get('condicion')) || 'bueno',
        criticidad: texto(formData.get('criticidad')) || 'media',
        es_consumible: bool(formData.get('es_consumible')),
        cantidad_actual: entero(formData.get('cantidad_actual')) ?? 1,
        stock_minimo: entero(formData.get('stock_minimo')),
        observaciones: texto(formData.get('observaciones')) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (err) throw new Error(err.message);

    await sb.from('auditoria').insert({
      usuario_id: usuario.id,
      accion: 'actualizar_objeto',
      entidad: 'objeto',
      entidad_id: String(id),
    });
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/inventario/${id}?error=` + encodeURIComponent(error));

  revalidatePath(`/inventario/${id}`);
  revalidatePath('/inventario');
  redirect(`/inventario/${id}?ok=` + encodeURIComponent('Objeto actualizado'));
}

export async function trasladarObjeto(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const id = entero(formData.get('id'));
  const destino = entero(formData.get('ambiente_destino_id'));
  if (!id || !destino) {
    redirect('/inventario?error=' + encodeURIComponent('Datos de traslado incompletos'));
  }

  let error = '';
  try {
    const sb = db();
    const { data: actual, error: err0 } = await sb
      .from('objeto')
      .select('ambiente_id, codigo_interno')
      .eq('id', id)
      .single();
    if (err0) throw new Error(err0.message);

    const { error: err } = await sb
      .from('objeto')
      .update({ ambiente_id: destino, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) throw new Error(err.message);

    await registrarHistorial(sb, {
      objeto_id: id,
      tipo_evento: 'traslado',
      ambiente_origen_id: actual?.ambiente_id ?? null,
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
  const usuario = await requireSession();
  const id = entero(formData.get('id'));
  const estado = texto(formData.get('estado'));
  if (!id || !estado) redirect('/inventario?error=' + encodeURIComponent('Datos incompletos'));

  let error = '';
  try {
    const sb = db();
    const { error: err } = await sb
      .from('objeto')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) throw new Error(err.message);

    const tipoEvento =
      estado === 'mantenimiento'
        ? 'mantenimiento'
        : estado === 'baja'
        ? 'baja'
        : estado === 'perdido'
        ? 'perdida'
        : 'ajuste';

    await registrarHistorial(sb, {
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
  const usuario = await requireSession();
  const id = entero(formData.get('id'));
  if (!id) redirect('/inventario?error=' + encodeURIComponent('Objeto inválido'));

  let error = '';
  try {
    const sb = db();
    const { error: err } = await sb
      .from('objeto')
      .update({ activo: false, estado: 'baja', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) throw new Error(err.message);

    await registrarHistorial(sb, {
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
