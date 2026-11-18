import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { secreto, type SessionUser } from './auth';
import { uno } from './db';

/**
 * WebAuthn para portería.
 *
 * La huella nunca sale del dispositivo: el navegador guarda una llave privada y
 * aquí solo se almacena la llave pública de la credencial. El sistema usa la
 * huella (o el PIN/biometría del sistema operativo) para identificar al
 * instructor que solicita la llave de un ambiente.
 */

export const COOKIE_RETO = 'sena_huella_reto';
export const COOKIE_IDENTIDAD = 'sena_huella_identidad';

const MAX_RETO = 5 * 60; // 5 minutos para completar el diálogo del navegador
const MAX_IDENTIDAD = 10 * 60; // 10 minutos para diligenciar el préstamo

const seguro = process.env.NODE_ENV === 'production';

export const opcionesCookieReto = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: seguro,
  path: '/api/huella',
  maxAge: MAX_RETO,
};

export const opcionesCookieIdentidad = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: seguro,
  path: '/',
  maxAge: MAX_IDENTIDAD,
};

export type TipoReto = 'registro' | 'identificacion';

export type RetoHuella = {
  kind: TipoReto;
  challenge: string;
  usuarioId?: string;
};

export type IdentidadHuella = {
  usuarioId: string;
  nombre: string;
  rol: string;
  credencialId: string;
  verificadoEn: string;
};

/**
 * Dominio y origen que el navegador validará. En Vercel llegan por los headers
 * x-forwarded-*; en local es http://localhost:3000.
 * Si algún día se usa un dominio propio, se puede fijar con WEBAUTHN_RP_ID y
 * WEBAUTHN_ORIGIN.
 */
export function rpConfig(req: Request): { rpID: string; origin: string } {
  const h = req.headers;
  const hostRaw = (h.get('x-forwarded-host') || h.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();

  const proto = (
    h.get('x-forwarded-proto') ||
    (hostRaw.startsWith('localhost') || hostRaw.startsWith('127.0.0.1') ? 'http' : 'https')
  )
    .split(',')[0]
    .trim();

  const host = hostRaw.replace(/:\d+$/, '');

  return {
    rpID: process.env.WEBAUTHN_RP_ID || host,
    origin: process.env.WEBAUTHN_ORIGIN || `${proto}://${hostRaw}`,
  };
}

export async function firmarReto(reto: RetoHuella): Promise<string> {
  return new SignJWT({ ...reto })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_RETO}s`)
    .sign(secreto());
}

export async function leerRetoToken(
  token: string | undefined,
  kind: TipoReto
): Promise<RetoHuella | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secreto());
    if (payload.kind !== kind || typeof payload.challenge !== 'string') return null;

    return {
      kind,
      challenge: payload.challenge,
      usuarioId: typeof payload.usuarioId === 'string' ? payload.usuarioId : undefined,
    };
  } catch {
    return null;
  }
}

export async function firmarIdentidad(
  usuario: SessionUser,
  credencialId: string
): Promise<string> {
  return new SignJWT({
    kind: 'porteria',
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    credencialId,
    verificadoEn: new Date().toISOString(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_IDENTIDAD}s`)
    .sign(secreto());
}

/** Identidad temporal del instructor que acaba de validar su huella. */
export async function getIdentidad(): Promise<IdentidadHuella | null> {
  const token = cookies().get(COOKIE_IDENTIDAD)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secreto());
    if (payload.kind !== 'porteria') return null;

    return {
      usuarioId: String(payload.usuarioId ?? ''),
      nombre: String(payload.nombre ?? ''),
      rol: String(payload.rol ?? ''),
      credencialId: String(payload.credencialId ?? ''),
      verificadoEn: String(payload.verificadoEn ?? ''),
    };
  } catch {
    return null;
  }
}

export function borrarIdentidad(): void {
  cookies().set(COOKIE_IDENTIDAD, '', { ...opcionesCookieIdentidad, maxAge: 0 });
}

/** Interruptor del administrador: la huella solo se usa si está aprobada. */
export async function huellaActiva(): Promise<boolean> {
  const fila = await uno<{ valor: string | null }>(
    "select valor from configuracion where clave = 'huella_activa'"
  );
  return fila?.valor === '1';
}

export function etiquetaDispositivo(userAgent: string | null): string {
  const ua = userAgent || '';
  if (/android/i.test(ua)) return 'Dispositivo Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'Dispositivo iOS';
  if (/windows/i.test(ua)) return 'Equipo Windows';
  if (/macintosh|mac os/i.test(ua)) return 'Equipo Mac';
  if (/linux/i.test(ua)) return 'Equipo Linux';
  return 'Dispositivo';
}

/** Los transportes se guardan como JSON; si viene vacío o malformado, se ignora. */
export function transportes(valor: string | null | undefined): string[] {
  if (!valor) return [];
  try {
    const datos = JSON.parse(valor);
    return Array.isArray(datos) ? datos.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
