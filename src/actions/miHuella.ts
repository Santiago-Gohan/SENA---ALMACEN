'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError } from '@/lib/db';
import { requireSession } from '@/lib/auth';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function volver(ok: string | null, error: string | null): never {
  const qs = ok
    ? '?ok=' + encodeURIComponent(ok)
    : '?error=' + encodeURIComponent(error || 'No se pudo completar la operación');
  redirect('/mi-huella' + qs);
}

/** Cada usuario puede borrar sus propias credenciales (equipo perdido, cambio de celular). */
export async function eliminarMiCredencial(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const id = texto(formData.get('id'));

  if (!id) volver(null, 'Credencial inválida');

  let error = '';

  try {
    const borradas = await ejecutar(
      'delete from credencial_huella where id = $1 and usuario_id = $2',
      [id, usuario.id]
    );
    if (!borradas) throw new Error('La credencial no existe o no es tuya');

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'eliminar_mi_huella', 'credencial_huella', $2)`,
      [usuario.id, id]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/mi-huella');
  revalidatePath('/configuracion');
  volver('Credencial eliminada', null);
}
