import { requireAdmin } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { claseBadge, titulo } from '@/lib/utils';
import {
  cargarPlanilla,
  conciliarPlanilla,
  descartarFila,
  forzarListo,
  migrarPlanilla,
  reabrirFila,
} from '@/actions/importar';
import AreaPlanilla from '@/components/AreaPlanilla';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function ImportarPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();

  if (!dbConfigurada()) return <SetupNotice />;

  let conteo: Record<string, number> = {};
  let filas: any[] = [];
  let error = '';

  try {
    const [resEstados, resFilas] = await Promise.all([
      q<any>(
        `select estado_validacion, count(*)::int as total
           from stg_planilla_papel
          group by estado_validacion`
      ),
      q<any>('select * from stg_planilla_papel order by id desc limit 50'),
    ]);

    for (const r of resEstados) {
      conteo[r.estado_validacion] = r.total;
    }
    filas = resFilas;
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

  const total = Object.values(conteo).reduce((a, b) => a + b, 0);
  const pendientes = conteo.pendiente || 0;
  const listos = conteo.listo || 0;
  const migrados = conteo.migrado || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar planilla de papel</h1>
          <p className="sub">
            Digitaliza la planilla “Control de ambientes de formación” sin perder el dato original
          </p>
        </div>
        <span className="badge">{total} filas en bandeja</span>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-2">
        <div className="card">
          <h2>1. Cargar la planilla</h2>
          <p className="muted">
            <small>
              Pega las filas desde Excel o carga un CSV. Si la primera fila trae los encabezados,
              se detectan solos; si no, se asume el orden oficial de 9 columnas.
            </small>
          </p>

          <form action={cargarPlanilla}>
            <div className="field">
              <label className="label" htmlFor="folio">
                Folio / hoja
              </label>
              <input
                id="folio"
                className="input"
                name="folio"
                placeholder="Ej. PLANILLA-2026-08"
              />
            </div>

            <AreaPlanilla />

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" type="submit">
                Cargar en bandeja
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2>2. Conciliar y migrar</h2>
          <p className="muted">
            <small>
              La conciliación busca ficha, instructor, programa y ambiente. Solo las filas{' '}
              <strong>listas</strong> pasan a las sesiones reales.
            </small>
          </p>

          <div className="row" style={{ gap: 6, marginBottom: 14 }}>
            <span className={claseBadge('pendiente')}>Pendientes: {pendientes}</span>
            <span className={claseBadge('listo')}>Listas: {listos}</span>
            <span className={claseBadge('migrado')}>Migradas: {migrados}</span>
            <span className={claseBadge('duplicado')}>Duplicadas: {conteo.duplicado || 0}</span>
          </div>

          <div className="row">
            <form action={conciliarPlanilla}>
              <button className="btn" type="submit">
                Conciliar pendientes
              </button>
            </form>
            <form action={migrarPlanilla}>
              <button className="btn btn-primary" type="submit">
                Migrar filas listas
              </button>
            </form>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--linea)', margin: '16px 0' }} />

          <h3>Reglas de normalización</h3>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: '0.85rem' }}>
            <li>Fecha: 26/08/2026, 26-08-26, 2026-08-26 o serial de Excel.</li>
            <li>Hora: 7:00, 07:00, 1:00 pm, 6.00 p.m. → formato 24 h.</li>
            <li>Ficha: 7 u 8 dígitos; debe existir en el sistema.</li>
            <li>Ambiente: código (203) o nombre (Sistemas); puede venir vacío.</li>
            <li>Instructor: si no existe se crea automáticamente para revisión.</li>
            <li>Firma: S / X / SI se marca como firma en papel.</li>
          </ul>
        </div>
      </div>

      <div className="seccion">
        <h2>Bandeja de entrada</h2>
        <span className="badge">Últimas 50 filas</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              <th>Fecha</th>
              <th>Ficha</th>
              <th>Instructor</th>
              <th className="hide-sm">Ambiente</th>
              <th className="hide-sm">Entrada</th>
              <th className="hide-sm">Salida</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty">La bandeja está vacía. Carga la planilla arriba.</div>
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <small className="muted">{f.folio || '—'}</small>
                    <div>#{f.fila ?? '—'}</div>
                  </td>
                  <td>{f.fecha_raw || '—'}</td>
                  <td>{f.ficha_raw || '—'}</td>
                  <td>{f.nombres_raw || '—'}</td>
                  <td className="hide-sm">{f.ambiente_raw || '—'}</td>
                  <td className="hide-sm">{f.hora_entrada_raw || '—'}</td>
                  <td className="hide-sm">{f.hora_salida_raw || '—'}</td>
                  <td>
                    <span className={claseBadge(f.estado_validacion)}>
                      {titulo(f.estado_validacion)}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {f.estado_validacion !== 'listo' && f.estado_validacion !== 'migrado' && (
                        <form action={forzarListo}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="btn btn-sm" type="submit">
                            Forzar
                          </button>
                        </form>
                      )}
                      {f.estado_validacion !== 'migrado' && (
                        <form action={descartarFila}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="btn btn-sm btn-danger" type="submit">
                            Descartar
                          </button>
                        </form>
                      )}
                      {(f.estado_validacion === 'migrado' ||
                        f.estado_validacion === 'descartado') && (
                        <form action={reabrirFila}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="btn btn-sm" type="submit">
                            Reabrir
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="aviso-legal" style={{ marginTop: 18 }}>
        <strong>Importante:</strong> las filas migradas conservan el texto original del papel
        (ficha, instructor, programa y ambiente) junto con los datos normalizados. Así la
        digitalización es auditable y se puede corregir después sin perder el registro físico.
      </p>
    </>
  );
}
