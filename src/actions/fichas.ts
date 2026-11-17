'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, q, uno } from '@/lib/db';
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
    const existe = await uno('select id from ficha where codigo = $1', [codigo]);

    if (existe) {
      error = `La ficha ${codigo} ya está registrada`;
    } else {
      await q(
        `insert into ficha (codigo, programa_id, jornada, activa) values ($1, $2, $3, true)`,
        [codigo, programaId, jornada]
      );

      await q(
        `insert into auditoria (usuario_id, accion, entidad, entidad_id)
         values ($1, $2, $3, $4)`,
        [usuario.id, 'crear_ficha', 'ficha', codigo]
      );
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
    await ejecutar('update ficha set activa = $2 where id = $1', [id, activa]);
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
    const existe = await uno('select id from programa where codigo = $1', [codigo]);

    if (existe) {
      error = `El programa ${codigo} ya existe`;
    } else {
      await q('insert into programa (codigo, nombre, nivel) values ($1, $2, $3)', [
        codigo,
        nombre,
        nivel,
      ]);

      await q(
        `insert into auditoria (usuario_id, accion, entidad, entidad_id)
         values ($1, $2, $3, $4)`,
        [usuario.id, 'crear_programa', 'programa', codigo]
      );
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/fichas?error=' + encodeURIComponent(error));

  revalidatePath('/fichas');
  redirect('/fichas?ok=' + encodeURIComponent(`Programa ${codigo} creado`));
}
