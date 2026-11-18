'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError } from '@/lib/db';
import { requirePermiso } from '@/lib/auth';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function volver(ok: string | null, error: string | null): never {
  const qs = ok
    ? '?ok=' + encodeURIComponent(ok)
    : '?error=' + encodeURIComponent(error || 'No se pudo completar la operación');
  redirect('/configuracion' + qs);
}

/**
 * Interruptor de la huella. Por defecto está apagada: solo se activa cuando el
 * centro aprueba el uso de biometría (Ley 1581 de 2012).
 */
export async function guardarHuellaActiva(formData: FormData): Promise<void> {
  const actor = await requirePermiso('config');
  const activa = texto(formData.get('huella_activa')) === 'on';

  let error = '';

  try {
    await ejecutar(
      `insert into configuracion (clave, valor, descripcion, actualizado_por, actualizado_en)
       values ('huella_activa', $1, 'Permite identificar instructores con huella/WebAuthn en portería', $2, now())
       on conflict (clave) do update
         set valor = excluded.valor,
             actualizado_por = excluded.actualizado_por,
             actualizado_en = now()`,
      [activa ? '1' : '0', actor.id]
    );

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id, datos)
       values ($1, $2, 'configuracion', 'huella_activa', $3::jsonb)`,
      [
        actor.id,
        activa ? 'activar_huella' : 'desactivar_huella',
        JSON.stringify({ activa }),
      ]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/configuracion');
  revalidatePath('/porteria');
  revalidatePath('/mi-huella');
  volver(activa ? 'Huella activada' : 'Huella desactivada', null);
}

/** El administrador puede borrar una credencial extraviada o de prueba. */
export async function eliminarCredencial(formData: FormData): Promise<void> {
  const actor = await requirePermiso('config');
  const id = texto(formData.get('id'));

  if (!id) volver(null, 'Credencial inválida');

  let error = '';

  try {
    const credencial = await ejecutar(
      `delete from credencial_huella where id = $1`,
      [id]
    );
    if (!credencial) throw new Error('La credencial no existe');

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'eliminar_credencial', 'credencial_huella', $2)`,
      [actor.id, id]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/configuracion');
  volver('Credencial eliminada', null);
}
