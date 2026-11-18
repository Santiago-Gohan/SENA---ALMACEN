import Link from 'next/link';
import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import {
  claseBadge,
  fmtFecha,
  fmtHora,
  fmtHoraCorta,
  hoyISO,
  JORNADAS_PORTERIA,
  titulo,
  type JornadaPorteria,
} from '@/lib/utils';
import { devolverLlave, olvidarIdentidad, registrarPrestamo } from '@/actions/porteria';
import { getIdentidad, huellaActiva } from '@/lib/huella';
import HuellaIdentificar from '@/components/HuellaIdentificar';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

function etiquetaJornada(jornada: string): string {
  return JORNADAS_PORTERIA[jornada as JornadaPorteria]?.etiqueta ?? titulo(jornada);
}

export default async function PorteriaPage({ searchParams }: { searchParams: SP }) {
  await requirePermiso('porteria');

  if (!dbConfigurada()) return <SetupNotice />;

  let ambientes: any[] = [];
  let fichas: any[] = [];
  let instructores: any[] = [];
  let activos: any[] = [];
  let recientes: any[] = [];
  let activa = false;
  let identidad: Awaited<ReturnType<typeof getIdentidad>> = null;
  let error = '';

  try {
    activa = await huellaActiva();
    identidad = activa ? await getIdentidad() : null;

    const [resAmbientes, resFichas, resInstructores, resActivos, resRecientes] =
      await Promise.all([
        q<any>('select id, codigo, nombre from ambiente where activo order by codigo'),
        q<any>(
          `select f.id, f.codigo, p.nombre as programa_nombre
             from ficha f
             left join programa p on p.id = f.programa_id
            where f.activa
            order by f.codigo
            limit 300`
        ),
        q<any>(
          `select p.id, p.nombres, p.apellidos,
                  exists(
                    select 1
                      from credencial_huella c
                      join usuario u on u.id = c.usuario_id
                     where u.persona_id = p.id
                  ) as tiene_huella
             from persona p
            where p.activo
              and p.tipo_persona in ('instructor', 'funcionario', 'contratista')
            order by p.nombres, p.apellidos
            limit 500`
        ),
        q<any>(
          `select p.id, p.fecha, p.jornada, p.hora_inicio, p.hora_fin, p.hora_prestamo,
                  p.metodo_identificacion, p.observaciones,
                  a.codigo as ambiente_codigo, a.nombre as ambiente_nombre,
                  per.nombres, per.apellidos,
                  f.codigo as ficha_codigo,
                  ur.username as registrado_por_username
             from prestamo_llave p
             join ambiente a on a.id = p.ambiente_id
             join persona per on per.id = p.instructor_id
             left join ficha f on f.id = p.ficha_id
             left join usuario ur on ur.id = p.registrado_por
            where p.hora_devolucion is null
            order by p.hora_prestamo asc`
        ),
        q<any>(
          `select p.id, p.fecha, p.jornada, p.hora_prestamo, p.hora_devolucion, p.estado,
                  p.metodo_identificacion,
                  a.codigo as ambiente_codigo, a.nombre as ambiente_nombre,
                  per.nombres, per.apellidos
             from prestamo_llave p
             join ambiente a on a.id = p.ambiente_id
             join persona per on per.id = p.instructor_id
            order by p.hora_prestamo desc
            limit 20`
        ),
      ]);

    ambientes = resAmbientes;
    fichas = resFichas;
    instructores = resInstructores;
    activos = resActivos;
    recientes = resRecientes;
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
          <h1>Portería · préstamo de llaves</h1>
          <p className="sub">
            {fmtFecha(hoyISO())} · registra la llave que solicita el instructor para su ambiente
          </p>
        </div>
        <Link className="btn" href="/mi-huella">
          ☝ Mi huella
        </Link>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2>Solicitud de llave</h2>

          {identidad ? (
            <div className="identidad-box">
              <div>
                <span className="badge ok">Huella verificada</span>
                <h3 style={{ margin: '8px 0 2px' }}>{identidad.nombre}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  <small>
                    {identidad.rol} · identidad válida por unos minutos. La huella reemplaza la
                    firma del instructor.
                  </small>
                </p>
              </div>
              <form action={olvidarIdentidad}>
                <button className="btn btn-sm" type="submit">
                  Cambiar instructor
                </button>
              </form>
            </div>
          ) : (
            <>
              <HuellaIdentificar activa={activa} />

              {activa && (
                <p className="muted" style={{ margin: '10px 0 0' }}>
                  <small>
                    Si el instructor no tiene la huella inscrita, regístralo manualmente abajo.
                  </small>
                </p>
              )}

              {!activa && (
                <div className="alert error" style={{ marginBottom: 0 }}>
                  ⚠ La huella está desactivada. El administrador puede activarla en Configuración;
                  mientras tanto, registra al instructor manualmente.
                </div>
              )}
            </>
          )}

          <form action={registrarPrestamo} style={{ marginTop: 18 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="ambiente_id">
                  Ambiente / área *
                </label>
                <select id="ambiente_id" className="input" name="ambiente_id" required defaultValue="">
                  <option value="">Selecciona el ambiente</option>
                  {ambientes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} · {a.nombre}
                    </option>
                  ))}
                </select>
                <small className="muted">Ej. 207 · Taller 207 o ADSO.</small>
              </div>

              <div className="field">
                <label className="label" htmlFor="ficha_id">
                  Ficha / programa (opcional)
                </label>
                <select id="ficha_id" className="input" name="ficha_id" defaultValue="">
                  <option value="">Sin ficha</option>
                  {fichas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.codigo}
                      {f.programa_nombre ? ` · ${f.programa_nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {!identidad && (
                <>
                  <div className="field">
                    <label className="label" htmlFor="instructor_id">
                      Instructor registrado
                    </label>
                    <select
                      id="instructor_id"
                      className="input"
                      name="instructor_id"
                      defaultValue=""
                    >
                      <option value="">Selecciona de la lista</option>
                      {instructores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombres} {p.apellidos ?? ''}
                          {p.tiene_huella ? ' · con huella' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="instructor_nombre">
                      … o escribe el nombre
                    </label>
                    <input
                      id="instructor_nombre"
                      className="input"
                      name="instructor_nombre"
                      list="lista-instructores"
                      placeholder="Nombres y apellidos"
                    />
                    <datalist id="lista-instructores">
                      {instructores.map((p) => (
                        <option key={p.id} value={`${p.nombres} ${p.apellidos ?? ''}`.trim()} />
                      ))}
                    </datalist>
                    <small className="muted">
                      Si no está en la lista, se registra automáticamente.
                    </small>
                  </div>
                </>
              )}

              <div className="field full">
                <span className="label">Jornada / tiempo de trabajo *</span>
                <div className="row">
                  {(Object.keys(JORNADAS_PORTERIA) as JornadaPorteria[]).map((clave) => {
                    const j = JORNADAS_PORTERIA[clave];
                    return (
                      <label className="opcion" key={clave}>
                        <input
                          type="radio"
                          name="jornada"
                          value={clave}
                          defaultChecked={clave === 'manana'}
                          required
                        />
                        <span>
                          <strong>{j.etiqueta}</strong>
                          <br />
                          <small className="muted">{j.horario}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="field full">
                <label className="label" htmlFor="observaciones">
                  Observaciones
                </label>
                <input
                  id="observaciones"
                  className="input"
                  name="observaciones"
                  placeholder="Opcional: novedad, llave adicional, etc."
                />
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Registrar préstamo de llave
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Resumen</h2>
          <div className="stat" style={{ marginBottom: 14 }}>
            <span className="num">{activos.length}</span>
            <span className="rotulo">Llaves prestadas</span>
            <span className="pie">sin devolución registrada</span>
          </div>

          <h3>Cómo funciona</h3>
          <ol className="muted" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
            <li>
              <small>El instructor llega a portería y solicita la llave de su ambiente.</small>
            </li>
            <li>
              <small>Vigilancia lo identifica con la huella o lo selecciona manualmente.</small>
            </li>
            <li>
              <small>Se registra el ambiente, la jornada y la hora del préstamo.</small>
            </li>
            <li>
              <small>Al terminar, el instructor devuelve la llave y se cierra el registro.</small>
            </li>
          </ol>

          <p className="muted" style={{ margin: 0 }}>
            <small>
              {activa
                ? 'La huella está activa. Si un instructor no la tiene inscrita, puede hacerlo en Mi huella.'
                : 'La huella está desactivada por ahora. El registro manual queda como respaldo.'}
            </small>
          </p>
        </div>
      </div>

      <div className="seccion">
        <h2>Llaves en portería ({activos.length})</h2>
        <span className="badge info">Registra la devolución al cerrar</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ambiente</th>
              <th>Instructor</th>
              <th className="hide-sm">Jornada</th>
              <th className="hide-sm">Préstamo</th>
              <th>Identificación</th>
              <th>Devolución</th>
            </tr>
          </thead>
          <tbody>
            {activos.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No hay llaves prestadas en este momento. 🎉</div>
                </td>
              </tr>
            ) : (
              activos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.ambiente_codigo}</strong>
                    <div className="meta">
                      <small className="muted">{p.ambiente_nombre}</small>
                    </div>
                  </td>
                  <td>
                    {`${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim() || '—'}
                    {p.ficha_codigo && (
                      <div className="meta">
                        <small className="muted">Ficha {p.ficha_codigo}</small>
                      </div>
                    )}
                  </td>
                  <td className="hide-sm">
                    {etiquetaJornada(p.jornada)}
                    <div className="meta">
                      <small className="muted">
                        {fmtHoraCorta(p.hora_inicio)} – {fmtHoraCorta(p.hora_fin)}
                      </small>
                    </div>
                  </td>
                  <td className="hide-sm">
                    {fmtHora(p.hora_prestamo)}
                    <div className="meta">
                      <small className="muted">{fmtFecha(p.fecha)}</small>
                    </div>
                  </td>
                  <td>
                    {p.metodo_identificacion === 'huella' ? (
                      <span className="badge ok">Huella</span>
                    ) : (
                      <span className="badge warn">Manual</span>
                    )}
                    {p.registrado_por_username && (
                      <div className="meta">
                        <small className="muted">por {p.registrado_por_username}</small>
                      </div>
                    )}
                  </td>
                  <td>
                    <form action={devolverLlave} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="id" value={p.id} />
                      <select
                        className="input"
                        name="estado"
                        defaultValue="devuelta"
                        style={{ maxWidth: 110, padding: '6px 8px' }}
                      >
                        <option value="devuelta">Devuelta</option>
                        <option value="novedad">Con novedad</option>
                      </select>
                      <input
                        className="input"
                        name="observaciones"
                        placeholder="Observaciones"
                        style={{ maxWidth: 150, padding: '6px 8px' }}
                      />
                      <button className="btn btn-primary btn-sm" type="submit">
                        Registrar
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
        <h2>Últimos préstamos</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ambiente</th>
              <th className="hide-sm">Instructor</th>
              <th className="hide-sm">Jornada</th>
              <th className="hide-sm">Préstamo</th>
              <th className="hide-sm">Devolución</th>
              <th>Identificación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {recientes.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Todavía no hay préstamos registrados.</div>
                </td>
              </tr>
            ) : (
              recientes.map((p) => (
                <tr key={p.id}>
                  <td>{fmtFecha(p.fecha)}</td>
                  <td>
                    <strong>{p.ambiente_codigo}</strong>
                    <div className="meta">
                      <small className="muted">{p.ambiente_nombre}</small>
                    </div>
                  </td>
                  <td className="hide-sm">
                    {`${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim() || '—'}
                  </td>
                  <td className="hide-sm">{etiquetaJornada(p.jornada)}</td>
                  <td className="hide-sm">{fmtHora(p.hora_prestamo)}</td>
                  <td className="hide-sm">{fmtHora(p.hora_devolucion)}</td>
                  <td>
                    {p.metodo_identificacion === 'huella' ? (
                      <span className="badge ok">Huella</span>
                    ) : (
                      <span className="badge warn">Manual</span>
                    )}
                  </td>
                  <td>
                    <span className={claseBadge(p.estado)}>{titulo(p.estado)}</span>
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
