'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
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
    const existente = await uno('select id from ambiente where codigo = $1', [codigo]);
    if (existente) {
      error = `Ya existe un ambiente con el código ${codigo}`;
    } else {
      await q(
        `insert into ambiente (codigo, nombre, bloque, piso, capacidad, tipo, codigo_qr)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          codigo,
          nombre,
          texto(formData.get('bloque')) || null,
          entero(formData.get('piso')),
          entero(formData.get('capacidad')),
          texto(formData.get('tipo')) || 'aula',
          qrAmbiente(codigo),
        ]
      );

      await q(
        `insert into auditoria (usuario_id, accion, entidad, entidad_id, datos)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [usuario.id, 'crear_ambiente', 'ambiente', codigo, JSON.stringify({ nombre })]
      );
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
    await ejecutar(
      `update ambiente
          set nombre = $2, bloque = $3, piso = $4, capacidad = $5, tipo = $6
        where id = $1`,
      [
        id,
        texto(formData.get('nombre')),
        texto(formData.get('bloque')) || null,
        entero(formData.get('piso')),
        entero(formData.get('capacidad')),
        texto(formData.get('tipo')) || 'aula',
      ]
    );
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
    await ejecutar('update ambiente set activo = $2 where id = $1', [id, activo]);
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect(`/ambientes/${id}?error=` + encodeURIComponent(error));

  revalidatePath('/ambientes');
  revalidatePath(`/ambientes/${id}`);
  redirect(`/ambientes/${id}?ok=` + encodeURIComponent(activo ? 'Ambiente activado' : 'Ambiente desactivado'));
}
