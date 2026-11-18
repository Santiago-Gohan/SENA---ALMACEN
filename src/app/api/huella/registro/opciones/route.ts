import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { dbConfigurada, q } from '@/lib/db';
import { esAdmin, getSession } from '@/lib/auth';
import {
  COOKIE_RETO,
  firmarReto,
  huellaActiva,
  opcionesCookieReto,
  rpConfig,
  transportes,
} from '@/lib/huella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const usuario = await getSession();
  if (!usuario) {
    return NextResponse.json({ error: 'Inicia sesión para registrar la huella' }, { status: 401 });
  }
  if (!['instructor', 'administrador'].includes(usuario.rol) && !esAdmin(usuario)) {
    return NextResponse.json(
      { error: 'Solo instructores y administradores pueden inscribir la huella' },
      { status: 403 }
    );
  }
  if (!dbConfigurada()) {
    return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 500 });
  }
  if (!(await huellaActiva())) {
    return NextResponse.json(
      { error: 'La huella está desactivada. El administrador debe activarla en Configuración.' },
      { status: 403 }
    );
  }

  const { rpID } = rpConfig(req);

  const existentes = await q<{ credential_id: string; transports: string | null }>(
    'select credential_id, transports from credencial_huella where usuario_id = $1',
    [usuario.id]
  );

  const options = await generateRegistrationOptions({
    rpName: 'SENA · Almacén',
    rpID,
    userID: new TextEncoder().encode(usuario.id),
    userName: usuario.username,
    userDisplayName: usuario.nombre,
    attestationType: 'none',
    excludeCredentials: existentes.map((c) => ({
      id: c.credential_id,
      transports: transportes(c.transports) as any,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
    timeout: 60_000,
  });

  const token = await firmarReto({
    kind: 'registro',
    challenge: options.challenge,
    usuarioId: usuario.id,
  });

  const res = NextResponse.json(options);
  res.cookies.set(COOKIE_RETO, token, opcionesCookieReto);
  return res;
}
