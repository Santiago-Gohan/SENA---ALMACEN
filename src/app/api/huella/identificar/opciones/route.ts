import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { dbConfigurada } from '@/lib/db';
import { getSession, puede } from '@/lib/auth';
import {
  COOKIE_RETO,
  firmarReto,
  huellaActiva,
  opcionesCookieReto,
  rpConfig,
} from '@/lib/huella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const usuario = await getSession();
  if (!usuario) {
    return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  }
  if (!puede(usuario, 'porteria')) {
    return NextResponse.json(
      { error: 'Tu rol no puede registrar préstamos de llaves' },
      { status: 403 }
    );
  }
  if (!dbConfigurada()) {
    return NextResponse.json({ error: 'La base de datos no está configurada' }, { status: 500 });
  }
  if (!(await huellaActiva())) {
    return NextResponse.json(
      { error: 'La huella está desactivada. Usa el registro manual.' },
      { status: 403 }
    );
  }

  const { rpID } = rpConfig(req);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: [],
    timeout: 60_000,
  });

  const token = await firmarReto({
    kind: 'identificacion',
    challenge: options.challenge,
  });

  const res = NextResponse.json(options);
  res.cookies.set(COOKIE_RETO, token, opcionesCookieReto);
  return res;
}
