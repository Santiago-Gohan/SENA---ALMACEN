'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, mensajeError } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
import { normalizarFicha } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function crearFicha(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const codigo = normalizarFicha(texto(formData.get('codigo')));
  const programaId = entero(formData.get('programa_id'));
  const jornada = texto(formData.get('jornada')) || 'mañana';

  if (!codigo) {
    redirect('/fichas?error=' + encodeURIComponent('La ficha debe tener 7 u 8 dígitos'));
  }

  let error = '';

  try {
    const sb = db();
    const { data: existe } = await sb.from('ficha').select('id').eq('codigo', codigo).maybeSingle();

    if (existe) {
      error = `La ficha ${codigo} ya está registrada`;
    } else {
      const { error: err } = await sb.from('ficha').insert({
        codigo,
        programa_id: programaId,
        jornada,
        activa: true,
      });
      if (err) throw new Error(err.message);

      await sb.from('auditoria').insert({
        usuario_id: usuario.id,
        accion: 'crear_ficha',
        entidad: 'ficha',
        entidad_id: codigo,
      });
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/fichas?error=' + encodeURIComponent(error));

  revalidatePath('/fichas');
  revalidatePath('/acceso');
  redirect('/fichas?ok=' + encodeURIComponent(`Ficha ${codigo} creada`));
}

export async function cambiarEstadoFicha(formData: FormData): Promise<void> {
  await requireSession();
  const id = entero(formData.get('id'));
  const activa = texto(formData.get('activa')) === 'true';
  if (!id) redirect('/fichas?error=' + encodeURIComponent('Ficha inválida'));

  let error = '';

  try {
    const { error: err } = await db().from('ficha').update({ activa }).eq('id', id);
    if (err) throw new Error(err.message);
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/fichas?error=' + encodeURIComponent(error));

  revalidatePath('/fichas');
  revalidatePath('/acceso');
  redirect('/fichas?ok=' + encodeURIComponent(activa ? 'Ficha activada' : 'Ficha desactivada'));
}

export async function crearPrograma(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const codigo = texto(formData.get('codigo'));
  const nombre = texto(formData.get('nombre'));
  const nivel = texto(formData.get('nivel')) || 'tecnologo';

  if (!codigo || !nombre) {
    redirect('/fichas?error=' + encodeURIComponent('Código y nombre del programa son obligatorios'));
  }

  let error = '';

  try {
    const sb = db();
    const { data: existe } = await sb
      .from('programa')
      .select('id')
      .eq('codigo', codigo)
      .maybeSingle();

    if (existe) {
      error = `El programa ${codigo} ya existe`;
    } else {
      const { error: err } = await sb.from('programa').insert({ codigo, nombre, nivel });
      if (err) throw new Error(err.message);

      await sb.from('auditoria').insert({
        usuario_id: usuario.id,
        accion: 'crear_programa',
        entidad: 'programa',
        entidad_id: codigo,
      });
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/fichas?error=' + encodeURIComponent(error));

  revalidatePath('/fichas');
  redirect('/fichas?ok=' + encodeURIComponent(`Programa ${codigo} creado`));
}
