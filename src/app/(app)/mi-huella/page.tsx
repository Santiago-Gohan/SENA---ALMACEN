import { esAdmin, requireSession } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { fmtFechaHora } from '@/lib/utils';
import { huellaActiva } from '@/lib/huella';
import { eliminarMiCredencial } from '@/actions/miHuella';
import HuellaRegistro from '@/components/HuellaRegistro';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function MiHuellaPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requireSession();
  const puedeInscribir = usuario.rol === 'instructor' || esAdmin(usuario);

  if (!dbConfigurada()) return <SetupNotice />;

  let activa = false;
  let credenciales: any[] = [];
  let error = '';

  try {
    activa = await huellaActiva();
    credenciales = await q<any>(
      `select id, device_label, created_at, last_used_at
         from credencial_huella
        where usuario_id = $1
        order by created_at desc`,
      [usuario.id]
    );
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
          <h1>Mi huella</h1>
          <p className="sub">
            {usuario.nombre} · inscripción de la huella para identificarte en portería
          </p>
        </div>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-2">
        <div className="card">
          <h2>Inscribir huella</h2>
          {puedeInscribir ? (
            <HuellaRegistro activa={activa} yaTiene={credenciales.length > 0} />
          ) : (
            <div className="alert error">
              ⚠ Solo instructores y administradores pueden inscribir la huella para portería.
            </div>
          )}
        </div>

        <div className="card">
          <h2>¿Cómo se usa?</h2>
          <ol className="muted" style={{ paddingLeft: 18 }}>
            <li>
              <small>Inscribe la huella en el equipo de portería o en tu celular.</small>
            </li>
            <li>
              <small>Cuando solicites la llave, vigilancia te pide la huella.</small>
            </li>
            <li>
              <small>La huella reemplaza la firma y queda registrada la hora exacta.</small>
            </li>
            <li>
              <small>
                La huella nunca se guarda: solo la llave pública del dispositivo. Si cambias de
                equipo, borra la credencial y vuelve a inscribirla.
              </small>
            </li>
          </ol>

          <div className="alert error" style={{ marginBottom: 0 }}>
            ⚠ Dato biométrico: su uso requiere autorización y aviso de privacidad conforme a la
            Ley 1581 de 2012. El administrador activa esta función solo cuando el centro la
            aprueba.
          </div>
        </div>
      </div>

      <div className="seccion">
        <h2>Mis dispositivos ({credenciales.length})</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Inscrita</th>
              <th>Último uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {credenciales.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">Todavía no tienes una huella inscrita.</div>
                </td>
              </tr>
            ) : (
              credenciales.map((c) => (
                <tr key={c.id}>
                  <td>{c.device_label || 'Dispositivo'}</td>
                  <td>{fmtFechaHora(c.created_at)}</td>
                  <td>{fmtFechaHora(c.last_used_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={eliminarMiCredencial}>
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
    </>
  );
}
