'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, mensajeError } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
import { qrAmbiente } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function crearAmbiente(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const codigo = texto(formData.get('codigo'));
  const nombre = texto(formData.get('nombre'));

  if (!codigo || !nombre) {
    redirect('/ambientes?error=' + encodeURIComponent('Código y nombre son obligatorios'));
  }

  let error = '';
  try {
    const sb = db();
    const { data: existente } = await sb.from('ambiente').select('id').eq('codigo', codigo).maybeSingle();
    if (existente) {
      error = `Ya existe un ambiente con el código ${codigo}`;
    } else {
      const { error: err } = await sb.from('ambiente').insert({
        codigo,
        nombre,
        bloque: texto(formData.get('bloque')) || null,
        piso: entero(formData.get('piso')),
        capacidad: entero(formData.get('capacidad')),
        tipo: texto(formData.get('tipo')) || 'aula',
        codigo_qr: qrAmbiente(codigo),
      });
      if (err) error = err.message;
      else {
        await sb.from('auditoria').insert({
          usuario_id: usuario.id,
          accion: 'crear_ambiente',
          entidad: 'ambiente',
          entidad_id: codigo,
          datos: { nombre },
        });
      }
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/ambientes?error=' + encodeURIComponent(error));

  revalidatePath('/ambientes');
  redirect('/ambientes?ok=' + encodeURIComponent(`Ambiente ${codigo} creado`));
}

export async function actualizarAmbiente(formData: FormData): Promise<void> {
  await requireSession();
  const id = entero(formData.get('id'));
  if (!id) redirect('/ambientes?error=' + encodeURIComponent('Ambiente inválido'));

  let error = '';
  try {
    const { error: err } = await db()
      .from('ambiente')
      .update({
        nombre: texto(formData.get('nombre')),
        bloque: texto(formData.get('bloque')) || null,
        piso: entero(formData.get('piso')),
        capacidad: entero(formData.get('capacidad')),
        tipo: texto(formData.get('tipo')) || 'aula',
      })
      .eq('id', id);
    if (err) error = err.message;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/ambientes/${id}?error=` + encodeURIComponent(error));

  revalidatePath('/ambientes');
  revalidatePath(`/ambientes/${id}`);
  redirect(`/ambientes/${id}?ok=` + encodeURIComponent('Ambiente actualizado'));
}

export async function cambiarEstadoAmbiente(formData: FormData): Promise<void> {
  await requireSession();
  const id = entero(formData.get('id'));
  const activo = texto(formData.get('activo')) === 'true';
  if (!id) redirect('/ambientes?error=' + encodeURIComponent('Ambiente inválido'));

  let error = '';
  try {
    const { error: err } = await db().from('ambiente').update({ activo }).eq('id', id);
    if (err) error = err.message;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/ambientes/${id}?error=` + encodeURIComponent(error));

  revalidatePath('/ambientes');
  revalidatePath(`/ambientes/${id}`);
  redirect(`/ambientes/${id}?ok=` + encodeURIComponent(activo ? 'Ambiente activado' : 'Ambiente desactivado'));
}
