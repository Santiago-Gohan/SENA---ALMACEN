import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { dbConfigurada, mensajeError, q, uno } from '@/lib/db';
import { getSession, puede, type SessionUser } from '@/lib/auth';
import {
  COOKIE_IDENTIDAD,
  COOKIE_RETO,
  firmarIdentidad,
  huellaActiva,
  leerRetoToken,
  opcionesCookieIdentidad,
  opcionesCookieReto,
  rpConfig,
  transportes,
} from '@/lib/huella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const actor = await getSession();
  if (!actor) {
    return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  }
  if (!puede(actor, 'porteria')) {
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

  const body = await req.json().catch(() => null);
  if (!body?.response?.id) {
    return NextResponse.json({ error: 'No llegó la respuesta del dispositivo' }, { status: 400 });
  }

  const reto = await leerRetoToken(req.cookies.get(COOKIE_RETO)?.value, 'identificacion');
  if (!reto) {
    return NextResponse.json(
      { error: 'El tiempo para identificar la huella expiró. Inténtalo de nuevo.' },
      { status: 400 }
    );
  }

  const credencial = await uno<any>(
    `select c.id, c.usuario_id, c.credential_id, c.public_key, c.counter,
            c.transports, c.device_label,
            u.username, u.activo,
            r.nombre as rol, r.permisos,
            p.nombres, p.apellidos
       from credencial_huella c
       join usuario u on u.id = c.usuario_id
       left join rol r on r.id = u.rol_id
       left join persona p on p.id = u.persona_id
      where c.credential_id = $1`,
    [body.response.id]
  );

  if (!credencial) {
    return NextResponse.json(
      { error: 'Esta huella no está registrada. Inscríbela en Mi huella o usa el registro manual.' },
      { status: 404 }
    );
  }
  if (!credencial.activo) {
    return NextResponse.json({ error: 'La cuenta de esa persona está desactivada' }, { status: 403 });
  }
  if (!['instructor', 'administrador'].includes(credencial.rol)) {
    return NextResponse.json(
      { error: 'Solo instructores y administradores pueden solicitar llaves' },
      { status: 403 }
    );
  }

  const { rpID, origin } = rpConfig(req);

  try {
    const verificacion = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: reto.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credencial.credential_id,
        publicKey: Buffer.from(credencial.public_key, 'base64url'),
        counter: Number(credencial.counter),
        transports: transportes(credencial.transports) as any,
      },
      requireUserVerification: true,
    });

    if (!verificacion.verified) {
      throw new Error('El dispositivo no pudo confirmar la huella');
    }

    await q(
      `update credencial_huella
          set counter = $2, last_used_at = now()
        where id = $1`,
      [credencial.id, verificacion.authenticationInfo.newCounter]
    );

    const nombre =
      `${credencial.nombres ?? ''} ${credencial.apellidos ?? ''}`.trim() || credencial.username;

    const identificado: SessionUser = {
      id: credencial.usuario_id,
      username: credencial.username,
      nombre,
      rol: credencial.rol,
      permisos: credencial.permisos ?? {},
    };

    const token = await firmarIdentidad(identificado, credencial.id);

    await q(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'identificar_huella', 'porteria', $2)`,
      [actor.id, credencial.username]
    );

    const res = NextResponse.json({ ok: true, nombre, rol: credencial.rol });
    res.cookies.set(COOKIE_IDENTIDAD, token, opcionesCookieIdentidad);
    res.cookies.set(COOKIE_RETO, '', { ...opcionesCookieReto, maxAge: 0 });
    return res;
  } catch (e) {
    const res = NextResponse.json(
      { error: mensajeError(e) || 'No se pudo verificar la huella' },
      { status: 400 }
    );
    res.cookies.set(COOKIE_RETO, '', { ...opcionesCookieReto, maxAge: 0 });
    return res;
  }
}
