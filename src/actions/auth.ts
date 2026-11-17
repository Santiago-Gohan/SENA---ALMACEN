'use server';

import { redirect } from 'next/navigation';
import { createSession, destroySession, verifyLogin } from '@/lib/auth';
import { mensajeError } from '@/lib/db';

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get('username') || '').trim();
  const pin = String(formData.get('pin') || '').trim();
  const destino = String(formData.get('next') || '/');

  if (!username || !pin) {
    redirect('/login?error=' + encodeURIComponent('Escribe tu usuario y tu PIN'));
  }

  let usuario = null;
  let error = '';

  try {
    usuario = await verifyLogin(username, pin);
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error));
  }

  if (!usuario) {
    redirect('/login?error=' + encodeURIComponent('Usuario o PIN incorrecto'));
  }

  await createSession(usuario);
  redirect(destino.startsWith('/') && !destino.startsWith('//') ? destino : '/');
}

export async function logoutAction(): Promise<void> {
  destroySession();
  redirect('/login');
}
