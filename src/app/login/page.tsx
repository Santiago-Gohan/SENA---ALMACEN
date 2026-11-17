import { loginAction } from '@/actions/auth';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ingresar · Almacén SENA' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-marca">
          <div className="logo">S</div>
          <div>
            <strong>Almacén SENA</strong>
            <span>Centro de Gestión Agroempresarial del Oriente · Vélez</span>
          </div>
        </div>

        <h1>Iniciar sesión</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Ingresa con tu usuario y tu PIN personal.
        </p>

        <Alerta error={searchParams.error} />

        <form action={loginAction}>
          <input type="hidden" name="next" value={searchParams.next || '/'} />

          <div className="field">
            <label className="label" htmlFor="username">
              Usuario
            </label>
            <input
              id="username"
              className="input"
              name="username"
              autoComplete="username"
              placeholder="admin"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="pin">
              PIN
            </label>
            <input
              id="pin"
              className="input"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Entrar
          </button>
        </form>

        <div className="login-pie">
          Datos personales protegidos · Ley 1581 de 2012
        </div>
      </div>
    </div>
  );
}
