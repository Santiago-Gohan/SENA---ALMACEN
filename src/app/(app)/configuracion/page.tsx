import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { fmtFechaHora } from '@/lib/utils';
import { eliminarCredencial, guardarHuellaActiva } from '@/actions/configuracion';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function ConfiguracionPage({ searchParams }: { searchParams: SP }) {
  await requirePermiso('config');

  if (!dbConfigurada()) return <SetupNotice />;

  let config: any[] = [];
  let credenciales: any[] = [];
  let activa = false;
  let error = '';

  try {
    const [resConfig, resCredenciales] = await Promise.all([
      q<any>(
        `select clave, valor, descripcion, actualizado_en
           from configuracion
          order by clave`
      ),
      q<any>(
        `select c.id, c.device_label, c.created_at, c.last_used_at,
                u.username, r.nombre as rol,
                p.nombres, p.apellidos
           from credencial_huella c
           join usuario u on u.id = c.usuario_id
           left join rol r on r.id = u.rol_id
           left join persona p on p.id = u.persona_id
          order by c.created_at desc`
      ),
    ]);

    config = resConfig;
    credenciales = resCredenciales;
    activa = resConfig.find((c) => c.clave === 'huella_activa')?.valor === '1';
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
          <h1>Configuración</h1>
          <p className="sub">Parámetros del centro y control de la identificación por huella</p>
        </div>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-2">
        <div className="card">
          <h2>Identificación por huella</h2>
          <p className="muted">
            <small>
              La huella reemplaza la firma del instructor en el préstamo de llaves. Está apagada
              por defecto: actívala solo cuando el centro apruebe el uso de datos biométricos.
            </small>
          </p>

          <form action={guardarHuellaActiva}>
            <label className="opcion" style={{ marginBottom: 14 }}>
              <input type="checkbox" name="huella_activa" defaultChecked={activa} />
              <span>
                <strong>Permitir identificar instructores con huella</strong>
                <br />
                <small className="muted">
                  {activa
                    ? 'Activa: portería puede usar WebAuthn.'
                    : 'Apagada: portería registra al instructor manualmente.'}
                </small>
              </span>
            </label>

            <button className="btn btn-primary" type="submit">
              Guardar
            </button>
          </form>

          <div className="alert error" style={{ marginTop: 14, marginBottom: 0 }}>
            ⚠ Ley 1581 de 2012: los datos biométricos son datos sensibles. Se requiere
            autorización expresa del titular, aviso de privacidad y medidas de seguridad. Aquí no
            se guarda la huella, solo la llave pública del dispositivo.
          </div>
        </div>

        <div className="card">
          <h2>Estado del sistema</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="badge ok">Base de datos conectada</span>
            <span className={activa ? 'badge ok' : 'badge warn'}>
              Huella {activa ? 'activa' : 'desactivada'}
            </span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--linea)', margin: '16px 0' }} />

          <h3>Credenciales inscritas</h3>
          <div className="stat" style={{ marginBottom: 10 }}>
            <span className="num">{credenciales.length}</span>
            <span className="rotulo">Huellas / dispositivos</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            <small>
              Cada usuario puede inscribir su huella desde <strong>Mi huella</strong>. Si un
              equipo se pierde o se cambia, borra la credencial desde la tabla de abajo.
            </small>
          </p>
        </div>
      </div>

      <div className="seccion">
        <h2>Credenciales de huella ({credenciales.length})</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th className="hide-sm">Usuario</th>
              <th>Dispositivo</th>
              <th className="hide-sm">Inscrita</th>
              <th className="hide-sm">Último uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {credenciales.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No hay credenciales inscritas.</div>
                </td>
              </tr>
            ) : (
              credenciales.map((c) => (
                <tr key={c.id}>
                  <td>
                    {`${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim() || '—'}
                    {c.rol && (
                      <div className="meta">
                        <small className="muted">{c.rol}</small>
                      </div>
                    )}
                  </td>
                  <td className="hide-sm">{c.username}</td>
                  <td>{c.device_label || 'Dispositivo'}</td>
                  <td className="hide-sm">{fmtFechaHora(c.created_at)}</td>
                  <td className="hide-sm">{fmtFechaHora(c.last_used_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={eliminarCredencial}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-danger btn-sm" type="submit">
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="seccion">
        <h2>Parámetros</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Valor</th>
              <th className="hide-sm">Descripción</th>
              <th className="hide-sm">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {config.map((c) => (
              <tr key={c.clave}>
                <td>
                  <code>{c.clave}</code>
                </td>
                <td>{c.clave === 'huella_activa' ? (c.valor === '1' ? 'Activa' : 'Apagada') : c.valor}</td>
                <td className="hide-sm">
                  <small className="muted">{c.descripcion ?? '—'}</small>
                </td>
                <td className="hide-sm">{fmtFechaHora(c.actualizado_en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
