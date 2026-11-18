import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { fmtFechaHora, titulo } from '@/lib/utils';
import {
  alternarActivo,
  cambiarRol,
  crearUsuario,
  resetPin,
} from '@/actions/usuarios';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function UsuariosPage({ searchParams }: { searchParams: SP }) {
  const actual = await requirePermiso('usuarios');

  if (!dbConfigurada()) return <SetupNotice />;

  let usuarios: any[] = [];
  let roles: any[] = [];
  let error = '';

  try {
    const [resUsuarios, resRoles] = await Promise.all([
      q<any>(
        `select u.id, u.username, u.activo, u.ultimo_login, u.created_at,
                r.id as rol_id, r.nombre as rol_nombre,
                p.nombres, p.apellidos
           from usuario u
           left join rol r on r.id = u.rol_id
           left join persona p on p.id = u.persona_id
          order by u.created_at`
      ),
      q<any>('select id, nombre, descripcion, permisos from rol order by id'),
    ]);
    usuarios = resUsuarios;
    roles = resRoles;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) {
    return (
      <>
        <Alerta error={error} />
        <SetupNotice detalle={error} />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usuarios y roles</h1>
          <p className="sub">
            Cada persona entra con su usuario y su PIN. Solo el administrador puede crear cuentas,
            cambiar roles y resetear PIN.
          </p>
        </div>
        <span className="badge">{usuarios.length} usuarios</span>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-2">
        <div className="card">
          <h2>Crear usuario</h2>

          <form action={crearUsuario}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="username">
                  Usuario *
                </label>
                <input
                  id="username"
                  className="input"
                  name="username"
                  placeholder="Ej. juan.perez"
                  autoComplete="off"
                  required
                />
                <small className="muted">3 a 24 caracteres: letras, números, punto o guion.</small>
              </div>

              <div className="field">
                <label className="label" htmlFor="rol_id">
                  Rol *
                </label>
                <select id="rol_id" className="input" name="rol_id" required defaultValue="">
                  <option value="" disabled>
                    Selecciona un rol
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {titulo(r.nombre)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="nombres">
                  Nombres *
                </label>
                <input id="nombres" className="input" name="nombres" required />
              </div>

              <div className="field">
                <label className="label" htmlFor="apellidos">
                  Apellidos *
                </label>
                <input id="apellidos" className="input" name="apellidos" required />
              </div>

              <div className="field">
                <label className="label" htmlFor="pin">
                  PIN inicial *
                </label>
                <input
                  id="pin"
                  className="input"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  placeholder="4 a 8 dígitos"
                  autoComplete="new-password"
                  required
                />
                <small className="muted">La persona puede pedir el cambio después.</small>
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Crear usuario
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Roles del sistema</h2>
          <div className="lista">
            {roles.map((r) => (
              <div className="lista-item" key={r.id}>
                <div className="crece">
                  <div className="titulo">{titulo(r.nombre)}</div>
                  <div className="meta">{r.descripcion}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="aviso-legal" style={{ marginTop: 14 }}>
            <strong>Administrador:</strong> todo. <strong>Vigilancia:</strong> entrada y salida en
            portería. <strong>Instructor:</strong> registra su sesión y verifica el inventario con
            los 2 aprendices de turno.
          </p>
        </div>
      </div>

      <div className="seccion">
        <h2>Cuentas registradas</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th className="hide-sm">Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th className="hide-sm">Último ingreso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">Aún no hay usuarios. Crea el primero arriba.</div>
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const esMiCuenta = u.id === actual.id;
                const nombre = `${u.nombres ?? ''} ${u.apellidos ?? ''}`.trim();

                return (
                  <tr key={u.id}>
                    <td>
                      <code>{u.username}</code>
                      {esMiCuenta && (
                        <div className="meta">
                          <small className="muted">Tu cuenta</small>
                        </div>
                      )}
                    </td>
                    <td className="hide-sm">{nombre || '—'}</td>
                    <td>
                      <form action={cambiarRol} className="row" style={{ gap: 6 }}>
                        <input type="hidden" name="id" value={u.id} />
                        <select
                          className="input"
                          name="rol_id"
                          defaultValue={u.rol_id ?? ''}
                          disabled={esMiCuenta}
                          style={{ maxWidth: 140, padding: '6px 8px' }}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {titulo(r.nombre)}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-sm" type="submit" disabled={esMiCuenta}>
                          Cambiar
                        </button>
                      </form>
                    </td>
                    <td>
                      {u.activo ? (
                        <span className="badge ok">Activo</span>
                      ) : (
                        <span className="badge danger">Inactivo</span>
                      )}
                    </td>
                    <td className="hide-sm">
                      {u.ultimo_login ? fmtFechaHora(u.ultimo_login) : 'Nunca'}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <form action={alternarActivo}>
                          <input type="hidden" name="id" value={u.id} />
                          <button
                            className={`btn btn-sm ${u.activo ? 'btn-danger' : ''}`}
                            type="submit"
                            disabled={esMiCuenta}
                          >
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </form>

                        <form action={resetPin} className="row" style={{ gap: 4 }}>
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            className="input"
                            name="pin"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{4,8}"
                            placeholder="Nuevo PIN"
                            autoComplete="new-password"
                            required
                            style={{ maxWidth: 110, padding: '6px 8px' }}
                          />
                          <button className="btn btn-sm" type="submit">
                            Resetear
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="aviso-legal" style={{ marginTop: 18 }}>
        <strong>Seguridad:</strong> no compartas el PIN del administrador. Si alguien sale del
        centro, desactiva su cuenta en vez de borrarla: así queda la trazabilidad.
      </p>
    </>
  );
}
