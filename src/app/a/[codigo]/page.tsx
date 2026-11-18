import Link from 'next/link';
import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q, uno } from '@/lib/db';
import { claseBadge, fmtFecha, fmtHora, hoyISO, titulo } from '@/lib/utils';
import { registrarVerificacion } from '@/actions/verificacion';
import { logoutAction } from '@/actions/auth';
import FirmaPad from '@/components/FirmaPad';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function AmbienteQRPage({
  params,
  searchParams,
}: {
  params: { codigo: string };
  searchParams: SP;
}) {
  const usuario = await requirePermiso('verificar');

  if (!dbConfigurada()) return <SetupNotice />;

  const codigo = decodeURIComponent(params.codigo || '').trim();

  let ambiente: any = null;
  let objetos: any[] = [];
  let abierta: any = null;
  let verificaciones: any[] = [];
  let error = '';

  try {
    ambiente = await uno<any>('select * from ambiente where codigo = $1', [codigo]);

    if (ambiente) {
      const [resObjetos, resAbierta, resVerificaciones] = await Promise.all([
        q<any>(
          `select o.id, o.codigo_interno, o.nombre, o.estado, o.condicion,
                  pl.valor as placa_valor
             from objeto o
             left join placa pl on pl.id = o.placa_id
            where o.ambiente_id = $1 and o.activo
            order by o.nombre`,
          [ambiente.id]
        ),
        uno<any>(
          `select s.id, s.fecha, s.hora_entrada, s.estado, s.aprendices,
                  f.codigo as ficha_codigo, pr.nombre as programa_nombre,
                  p.nombres as instructor_nombres, p.apellidos as instructor_apellidos
             from sesion_ambiente s
             left join ficha f on f.id = s.ficha_id
             left join programa pr on pr.id = s.programa_id
             left join persona p on p.id = s.instructor_id
            where s.ambiente_id = $1 and s.hora_salida is null
            order by s.hora_entrada desc
            limit 1`,
          [ambiente.id]
        ),
        q<any>(
          `select v.id, v.sesion_id, v.momento, v.todo_en_orden, v.detalle, v.aprendices,
                  v.observaciones, v.firma_url, v.created_at
             from verificacion v
            where v.ambiente_id = $1
              and (
                (v.created_at at time zone 'America/Bogota')::date = $2::date
                or v.sesion_id = (
                  select s.id from sesion_ambiente s
                   where s.ambiente_id = $1 and s.hora_salida is null
                   order by s.hora_entrada desc
                   limit 1
                )
              )
            order by v.created_at desc
            limit 12`,
          [ambiente.id, hoyISO()]
        ),
      ]);

      objetos = resObjetos;
      abierta = resAbierta;
      verificaciones = resVerificaciones;
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) {
    return (
      <div className="qr-wrap">
        <Alerta error={error} />
        <SetupNotice detalle={error} />
      </div>
    );
  }

  if (!ambiente) {
    return (
      <div className="qr-wrap">
        <div className="qr-top">
          <Link href="/">← Volver al panel</Link>
        </div>
        <div className="card">
          <h1>Ambiente no encontrado</h1>
          <p className="muted">
            El QR apunta al ambiente <code>{codigo || '(sin código)'}</code>, pero no está
            registrado en el sistema.
          </p>
          <Link className="btn" href="/ambientes">
            Ver ambientes
          </Link>
        </div>
      </div>
    );
  }

  const aprendicesAbiertos = (abierta?.aprendices ?? '')
    .split('/')
    .map((a: string) => a.trim())
    .filter(Boolean);

  // Si la sesión la abrió vigilancia en portería, el instructor todavía debe
  // verificar el inventario de entrada. Después de esa verificación, sigue la salida.
  const entradaVerificada = Boolean(
    abierta &&
      verificaciones.some(
        (v) => v.momento === 'entrada' && String(v.sesion_id) === String(abierta.id)
      )
  );
  const modo: 'entrada' | 'salida' = abierta && entradaVerificada ? 'salida' : 'entrada';

  const totalObjetos = objetos.length;
  const novedades = verificaciones.filter((v) => !v.todo_en_orden).length;

  return (
    <div className="qr-wrap">
      <div className="qr-top">
        <Link href="/" className="qr-marca">
          <span className="logo">S</span>
          <span>
            <strong>Almacén SENA</strong>
            <small>CGAO Oriente · Vélez</small>
          </span>
        </Link>
        <div className="row" style={{ gap: 10 }}>
          <small className="muted">{usuario.nombre}</small>
          <form action={logoutAction}>
            <button className="btn btn-sm" type="submit">
              Salir
            </button>
          </form>
        </div>
      </div>

      <div className="page-head">
        <div>
          <p className="qr-rotulo">Inventario del ambiente · {fmtFecha(hoyISO())}</p>
          <h1>
            {ambiente.codigo} · {ambiente.nombre}
          </h1>
          <p className="sub">
            {[
              titulo(ambiente.tipo),
              ambiente.bloque ? `Bloque ${ambiente.bloque}` : null,
              ambiente.piso !== null && ambiente.piso !== undefined ? `Piso ${ambiente.piso}` : null,
              ambiente.capacidad ? `Capacidad ${ambiente.capacidad}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className={abierta ? 'badge info' : 'badge'}>
          {abierta
            ? entradaVerificada
              ? 'Sesión abierta · falta la salida'
              : 'Sesión abierta · falta verificar entrada'
            : 'Sin sesión abierta'}
        </span>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      {abierta && (
        <div className="card qr-sesion">
          <div>
            <div className="titulo">
              Entrada registrada a las {fmtHora(abierta.hora_entrada)}
            </div>
            <div className="meta">
              Ficha {abierta.ficha_codigo ?? '—'}
              {abierta.programa_nombre ? ` · ${abierta.programa_nombre}` : ''}
              {' · '}
              {abierta.instructor_nombres
                ? `${abierta.instructor_nombres} ${abierta.instructor_apellidos ?? ''}`
                : 'Instructor sin registrar'}
            </div>
            {aprendicesAbiertos.length > 0 && (
              <div className="meta">Aprendices de turno: {aprendicesAbiertos.join(' · ')}</div>
            )}
          </div>
          <span className="badge warn">
            {entradaVerificada ? 'Falta la salida' : 'Falta verificar entrada'}
          </span>
        </div>
      )}

      <form action={registrarVerificacion} className="card qr-form">
        <input type="hidden" name="ambiente_codigo" value={ambiente.codigo} />

        <h2>{modo === 'salida' ? 'Verificación de salida' : 'Verificación de entrada'}</h2>
        <p className="muted">
          <small>
            Marca con una ✓ los objetos que están en orden. Si algo falta o está dañado, deja el
            espacio sin marcar y descríbelo en observaciones.
          </small>
        </p>

        <div className="check-lista">
          {totalObjetos === 0 ? (
            <div className="empty">
              Este ambiente no tiene objetos registrados. Puedes continuar: se guardará la
              verificación del ambiente.
            </div>
          ) : (
            objetos.map((o) => (
              <label className="check-item" key={o.id}>
                <input type="checkbox" name={`ok_${o.id}`} defaultChecked />
                <span className="crece">
                  <strong>{o.codigo_interno}</strong> · {o.nombre}
                  {o.placa_valor ? <span className="muted"> · Placa {o.placa_valor}</span> : null}
                </span>
                <span className={claseBadge(o.estado)}>{titulo(o.estado)}</span>
              </label>
            ))
          )}
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label className="label" htmlFor="aprendiz_1">
              Aprendiz de turno 1 *
            </label>
            <input
              id="aprendiz_1"
              className="input"
              name="aprendiz_1"
              defaultValue={aprendicesAbiertos[0] ?? ''}
              placeholder="Nombres y apellidos"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="aprendiz_2">
              Aprendiz de turno 2 *
            </label>
            <input
              id="aprendiz_2"
              className="input"
              name="aprendiz_2"
              defaultValue={aprendicesAbiertos[1] ?? ''}
              placeholder="Nombres y apellidos"
              required
            />
          </div>

          {!abierta && (
            <div className="field">
              <label className="label" htmlFor="ficha">
                Ficha *
              </label>
              <input
                id="ficha"
                className="input"
                name="ficha"
                inputMode="numeric"
                pattern="[0-9]{7,8}"
                placeholder="Ej. 3535013"
                required
              />
              <small className="muted">7 u 8 dígitos. Abre la sesión del instructor.</small>
            </div>
          )}

          <div className="field full">
            <label className="label" htmlFor="observaciones">
              Observaciones
            </label>
            <textarea
              id="observaciones"
              className="input"
              name="observaciones"
              rows={2}
              placeholder="Opcional: objetos faltantes, daños o novedades"
            />
          </div>

          <div className="field full">
            <FirmaPad label="Firma del instructor *" />
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" name="momento" value={modo}>
            {modo === 'salida' ? 'Registrar salida' : 'Registrar entrada'}
          </button>
        </div>
      </form>

      <div className="seccion">
        <h2>Verificaciones de hoy</h2>
        <span className="badge">
          {verificaciones.length} registro{verificaciones.length === 1 ? '' : 's'}
          {novedades > 0 ? ` · ${novedades} con novedad` : ''}
        </span>
      </div>

      {verificaciones.length === 0 ? (
        <div className="card empty">Todavía no hay verificaciones hoy en este ambiente.</div>
      ) : (
        <div className="card">
          <div className="lista">
            {verificaciones.map((v) => {
              const detalle = Array.isArray(v.detalle) ? v.detalle : [];
              const malos = detalle.filter((d: any) => d && d.ok === false);

              return (
                <div className="lista-item qr-verificacion" key={v.id}>
                  <div className="crece">
                    <div className="titulo">
                      {v.momento === 'entrada' ? 'Entrada' : 'Salida'} · {fmtHora(v.created_at)}
                      {v.todo_en_orden ? (
                        <span className="badge ok" style={{ marginLeft: 8 }}>
                          Todo en orden
                        </span>
                      ) : (
                        <span className="badge warn" style={{ marginLeft: 8 }}>
                          Con novedad
                        </span>
                      )}
                    </div>
                    <div className="meta">Aprendices: {v.aprendices ?? '—'}</div>
                    {malos.length > 0 && (
                      <div className="meta">
                        Sin marcar: {malos.map((d: any) => `${d.codigo} ${d.nombre}`).join(', ')}
                      </div>
                    )}
                    {v.observaciones && <div className="meta">{v.observaciones}</div>}
                  </div>
                  {v.firma_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="qr-firma" src={v.firma_url} alt="Firma del instructor" />
                  ) : (
                    <span className="badge warn">Sin firma</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="aviso-legal" style={{ marginTop: 16 }}>
        Los 2 aprendices de turno rotan según el aseo del día. La firma del instructor cierra la
        verificación y queda guardada con fecha y hora de Colombia.
      </p>

      <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>
        <small>
          <Link href="/">Panel</Link> · <Link href="/acceso">Control de acceso</Link>
        </small>
      </p>
    </div>
  );
}
