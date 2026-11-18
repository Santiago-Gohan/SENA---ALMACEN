import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { esAdmin, getSession } from '@/lib/auth';
import {
  COOKIE_RETO,
  etiquetaDispositivo,
  huellaActiva,
  leerRetoToken,
  opcionesCookieReto,
  rpConfig,
} from '@/lib/huella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'La huella está desactivada' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.response) {
    return NextResponse.json({ error: 'No llegó la respuesta del dispositivo' }, { status: 400 });
  }

  const reto = await leerRetoToken(req.cookies.get(COOKIE_RETO)?.value, 'registro');
  if (!reto || reto.usuarioId !== usuario.id) {
    return NextResponse.json(
      { error: 'El tiempo para registrar la huella expiró. Inténtalo de nuevo.' },
      { status: 400 }
    );
  }

  const { rpID, origin } = rpConfig(req);

  try {
    const verificacion = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: reto.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verificacion.verified) {
      throw new Error('El dispositivo no pudo confirmar la huella');
    }

    const credencial = verificacion.registrationInfo.credential;
    const etiqueta =
      String(body.label ?? '').trim().slice(0, 80) ||
      etiquetaDispositivo(req.headers.get('user-agent'));

    await q(
      `insert into credencial_huella
         (usuario_id, credential_id, public_key, counter, transports, device_label)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        usuario.id,
        credencial.id,
        Buffer.from(credencial.publicKey).toString('base64url'),
        credencial.counter,
        JSON.stringify(credencial.transports ?? []),
        etiqueta,
      ]
    );

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'registrar_huella', 'usuario', $2)`,
      [usuario.id, usuario.username]
    );

    const res = NextResponse.json({ ok: true, etiqueta });
    res.cookies.set(COOKIE_RETO, '', { ...opcionesCookieReto, maxAge: 0 });
    return res;
  } catch (e) {
    const res = NextResponse.json(
      { error: mensajeError(e) || 'No se pudo registrar la huella' },
      { status: 400 }
    );
    res.cookies.set(COOKIE_RETO, '', { ...opcionesCookieReto, maxAge: 0 });
    return res;
  }
}
