import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { db, dbConfigurada, mensajeError } from '@/lib/supabase';
import { claseBadge, fmtFecha, fmtHora, hoyISO, titulo } from '@/lib/utils';
import { abrirSesion, cerrarSesion } from '@/actions/sesiones';
import ScanQR from '@/components/ScanQR';
import FirmaPad from '@/components/FirmaPad';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function AccesoPage({ searchParams }: { searchParams: SP }) {
  await requireSession();

  if (!dbConfigurada()) return <SetupNotice />;

  let ambientes: any[] = [];
  let programas: any[] = [];
  let fichas: any[] = [];
  let instructores: any[] = [];
  let abiertas: any[] = [];
  let recientes: any[] = [];
  let error = '';

  try {
    const sb = db();

    const [resAmb, resProg, resFichas, resPers, resAbiertas, resRecientes] = await Promise.all([
      sb.from('ambiente').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      sb.from('programa').select('id, nombre, codigo').eq('activo', true).order('nombre'),
      sb
        .from('ficha')
        .select('id, codigo, programa:programa_id(nombre)')
        .eq('activa', true)
        .order('codigo')
        .limit(300),
      sb
        .from('persona')
        .select('id, nombres, apellidos')
        .eq('tipo_persona', 'instructor')
        .eq('activo', true)
        .order('nombres')
        .limit(500),
      sb
        .from('sesion_ambiente')
        .select(
          'id, fecha, hora_entrada, estado, ambiente:ambiente_id(codigo, nombre), instructor:instructor_id(nombres, apellidos), ficha:ficha_id(codigo)'
        )
        .is('hora_salida', null)
        .order('hora_entrada', { ascending: true })
        .limit(100),
      sb
        .from('sesion_ambiente')
        .select(
          'id, fecha, hora_entrada, hora_salida, estado, firma_metodo, ambiente:ambiente_id(codigo), instructor:instructor_id(nombres, apellidos), ficha:ficha_id(codigo)'
        )
        .order('hora_entrada', { ascending: false })
        .limit(20),
    ]);

    ambientes = resAmb.data || [];
    programas = resProg.data || [];
    fichas = resFichas.data || [];
    instructores = resPers.data || [];
    abiertas = resAbiertas.data || [];
    recientes = resRecientes.data || [];
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
          <h1>Control de acceso</h1>
          <p className="sub">
            {fmtFecha(hoyISO())} · registra la entrada y la salida del instructor en cada ambiente
          </p>
        </div>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2>Registrar entrada</h2>
          <p className="muted">
            <small>
              Escanea el QR del ambiente o selecciónalo. La firma del instructor es obligatoria
              salvo que marques la excepción.
            </small>
          </p>

          <form action={abrirSesion}>
            <div className="form-grid">
              <div className="field full">
                <ScanQR
                  name="ambiente_codigo"
                  label="Escanear QR del ambiente (opcional)"
                  placeholder="Ej. 203 o SENA-AMB:203"
                  tipo="ambiente"
                />
              </div>

              <div className="field full">
                <label className="label" htmlFor="ambiente_id">
                  … o selecciona el ambiente
                </label>
                <select id="ambiente_id" className="input" name="ambiente_id" defaultValue="">
                  <option value="">Selecciona un ambiente</option>
                  {ambientes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} · {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="ficha">
                  Ficha *
                </label>
                <input
                  id="ficha"
                  className="input"
                  name="ficha"
                  list="lista-fichas"
                  inputMode="numeric"
                  pattern="[0-9]{7,8}"
                  placeholder="Ej. 3535013"
                  required
                />
                <datalist id="lista-fichas">
                  {fichas.map((f) => (
                    <option key={f.id} value={f.codigo}>
                      {f.programa?.nombre ?? ''}
                    </option>
                  ))}
                </datalist>
                <small className="muted">7 u 8 dígitos, debe existir en el sistema.</small>
              </div>

              <div className="field">
                <label className="label" htmlFor="instructor">
                  Instructor *
                </label>
                <input
                  id="instructor"
                  className="input"
                  name="instructor"
                  list="lista-instructores"
                  placeholder="Nombres y apellidos"
                  required
                />
                <datalist id="lista-instructores">
                  {instructores.map((p) => (
                    <option key={p.id} value={`${p.nombres} ${p.apellidos ?? ''}`.trim()} />
                  ))}
                </datalist>
                <small className="muted">Si no existe, se crea automáticamente.</small>
              </div>

              <div className="field">
                <label className="label" htmlFor="programa_id">
                  Programa (opcional)
                </label>
                <select id="programa_id" className="input" name="programa_id" defaultValue="">
                  <option value="">Se toma de la ficha</option>
                  {programas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="observaciones">
                  Observaciones
                </label>
                <input
                  id="observaciones"
                  className="input"
                  name="observaciones"
                  placeholder="Opcional"
                />
              </div>

              <div className="field full">
                <FirmaPad />
                <label className="row" style={{ gap: 8, marginTop: 6 }}>
                  <input type="checkbox" name="sin_firma" />
                  <span>
                    <small>
                      El instructor no puede firmar en pantalla (se registra la excepción)
                    </small>
                  </span>
                </label>
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Registrar entrada
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Ambientes con QR</h2>
          <p className="muted">
            <small>Imprime el QR de cada ambiente y pégalo en la puerta.</small>
          </p>
          <Link className="btn" href="/etiquetas?tipo=ambientes">
            🏷 Ver QRs
          </Link>

          <hr style={{ border: 'none', borderTop: '1px solid var(--linea)', margin: '16px 0' }} />

          <h3>Sesión abierta = responsabilidad</h3>
          <p className="muted">
            <small>
              Mientras una sesión esté abierta, el instructor y la ficha quedan asociados a ese
              ambiente. Si falta un objeto, el sistema puede decir quién fue el último.
            </small>
          </p>
        </div>
      </div>

      <div className="seccion">
        <h2>Sesiones abiertas ({abiertas.length})</h2>
        <span className="badge info">Cerrar la salida libera el ambiente</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ambiente</th>
              <th>Instructor</th>
              <th className="hide-sm">Ficha</th>
              <th>Entrada</th>
              <th>Cerrar sesión</th>
            </tr>
          </thead>
          <tbody>
            {abiertas.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">No hay sesiones abiertas. 🎉</div>
                </td>
              </tr>
            ) : (
              abiertas.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.ambiente?.codigo ?? '—'}</strong>
                    <div className="meta">
                      <small className="muted">{s.ambiente?.nombre ?? ''}</small>
                    </div>
                  </td>
                  <td>
                    {s.instructor
                      ? `${s.instructor.nombres} ${s.instructor.apellidos ?? ''}`
                      : '—'}
                  </td>
                  <td className="hide-sm">{s.ficha?.codigo ?? '—'}</td>
                  <td>
                    {fmtHora(s.hora_entrada)}
                    <div className="meta">
                      <small className="muted">{fmtFecha(s.fecha)}</small>
                    </div>
                  </td>
                  <td>
                    <form action={cerrarSesion} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="id" value={s.id} />
                      <select
                        className="input"
                        name="tipo_novedad"
                        defaultValue=""
                        style={{ maxWidth: 120, padding: '6px 8px' }}
                      >
                        <option value="">Sin novedad</option>
                        <option value="faltante">Faltante</option>
                        <option value="dano">Daño</option>
                        <option value="desorden">Desorden</option>
                      </select>
                      <input
                        className="input"
                        name="observaciones"
                        placeholder="Observaciones"
                        style={{ maxWidth: 160, padding: '6px 8px' }}
                      />
                      <button className="btn btn-primary btn-sm" type="submit">
                        Registrar salida
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
        <h2>Últimos registros</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ambiente</th>
              <th className="hide-sm">Instructor</th>
              <th className="hide-sm">Ficha</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Firma</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {recientes.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Todavía no hay registros.</div>
                </td>
              </tr>
            ) : (
              recientes.map((s) => (
                <tr key={s.id}>
                  <td>{fmtFecha(s.fecha)}</td>
                  <td>{s.ambiente?.codigo ?? '—'}</td>
                  <td className="hide-sm">
                    {s.instructor
                      ? `${s.instructor.nombres} ${s.instructor.apellidos ?? ''}`
                      : '—'}
                  </td>
                  <td className="hide-sm">{s.ficha?.codigo ?? '—'}</td>
                  <td>{fmtHora(s.hora_entrada)}</td>
                  <td>{fmtHora(s.hora_salida)}</td>
                  <td>
                    {s.firma_metodo === 'ninguna' ? (
                      <span className="badge warn">Sin firma</span>
                    ) : (
                      <span className="badge ok">Firmada</span>
                    )}
                  </td>
                  <td>
                    <span className={claseBadge(s.estado)}>{titulo(s.estado)}</span>
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
