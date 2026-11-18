import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q, uno } from '@/lib/db';
import {
  TIPOS_AMBIENTE,
  claseBadge,
  fmtFecha,
  fmtHora,
  titulo,
} from '@/lib/utils';
import { actualizarAmbiente, cambiarEstadoAmbiente } from '@/actions/ambientes';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function AmbienteDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SP;
}) {
  await requirePermiso('ambientes_ver');

  if (!dbConfigurada()) return <SetupNotice />;

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let ambiente: any = null;
  let objetos: any[] = [];
  let sesiones: any[] = [];
  let error = '';

  try {
    const [res, resObj, resSes] = await Promise.all([
      uno<any>('select * from ambiente where id = $1', [id]),
      q<any>(
        `select o.id, o.codigo_interno, o.nombre, o.estado, o.es_sp,
                pl.valor as placa_valor
           from objeto o
           left join placa pl on pl.id = o.placa_id
          where o.ambiente_id = $1 and o.activo
          order by o.nombre
          limit 200`,
        [id]
      ),
      q<any>(
        `select s.id, s.fecha, s.hora_entrada, s.hora_salida, s.estado,
                p.nombres as instructor_nombres, p.apellidos as instructor_apellidos,
                f.codigo as ficha_codigo
           from sesion_ambiente s
           left join persona p on p.id = s.instructor_id
           left join ficha f on f.id = s.ficha_id
          where s.ambiente_id = $1
          order by s.hora_entrada desc
          limit 12`,
        [id]
      ),
    ]);

    ambiente = res;
    objetos = resObj.map((o) => ({
      ...o,
      placa: o.placa_valor ? { valor: o.placa_valor } : null,
    }));
    sesiones = resSes.map((s) => ({
      ...s,
      instructor: s.instructor_nombres
        ? { nombres: s.instructor_nombres, apellidos: s.instructor_apellidos }
        : null,
      ficha: s.ficha_codigo ? { codigo: s.ficha_codigo } : null,
    }));
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

  if (!ambiente) notFound();

  const abiertas = sesiones.filter((s) => !s.hora_salida);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub">
            <Link href="/ambientes">← Ambientes</Link>
          </p>
          <h1>
            {ambiente.codigo} · {ambiente.nombre}
          </h1>
          <p className="sub">
            {titulo(ambiente.tipo)}
            {ambiente.bloque ? ` · Bloque ${ambiente.bloque}` : ''}
            {ambiente.piso ? ` · Piso ${ambiente.piso}` : ''}
            {ambiente.capacidad ? ` · Capacidad ${ambiente.capacidad}` : ''}{' '}
            {ambiente.activo ? (
              <span className="badge ok">Activo</span>
            ) : (
              <span className="badge danger">Inactivo</span>
            )}
          </p>
        </div>

        <div className="row">
          <Link
            className="btn"
            href={`/etiquetas?tipo=ambientes&q=${encodeURIComponent(ambiente.codigo)}`}
          >
            🏷 QR
          </Link>
          <Link className="btn btn-primary" href="/acceso">
            + Registrar entrada
          </Link>
        </div>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2>Datos del ambiente</h2>

          <form action={actualizarAmbiente}>
            <input type="hidden" name="id" value={ambiente.id} />

            <div className="form-grid">
              <div className="field full">
                <label className="label" htmlFor="nombre">
                  Nombre *
                </label>
                <input
                  id="nombre"
                  className="input"
                  name="nombre"
                  defaultValue={ambiente.nombre}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="tipo">
                  Tipo
                </label>
                <select
                  id="tipo"
                  className="input"
                  name="tipo"
                  defaultValue={ambiente.tipo}
                >
                  {TIPOS_AMBIENTE.map((t) => (
                    <option key={t} value={t}>
                      {titulo(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="capacidad">
                  Capacidad
                </label>
                <input
                  id="capacidad"
                  className="input"
                  name="capacidad"
                  type="number"
                  min="0"
                  defaultValue={ambiente.capacidad ?? ''}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="bloque">
                  Bloque
                </label>
                <input
                  id="bloque"
                  className="input"
                  name="bloque"
                  defaultValue={ambiente.bloque ?? ''}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="piso">
                  Piso
                </label>
                <input
                  id="piso"
                  className="input"
                  name="piso"
                  type="number"
                  min="0"
                  defaultValue={ambiente.piso ?? ''}
                />
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Guardar cambios
            </button>
          </form>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h2>QR del ambiente</h2>
          <div className="qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?data=${encodeURIComponent(ambiente.codigo_qr)}&size=260`}
              alt={`QR de ${ambiente.codigo}`}
              width={150}
              height={150}
            />
            <code>{ambiente.codigo_qr}</code>
          </div>

          <form action={cambiarEstadoAmbiente} style={{ marginTop: 14 }}>
            <input type="hidden" name="id" value={ambiente.id} />
            <input type="hidden" name="activo" value={ambiente.activo ? 'false' : 'true'} />
            <button className={`btn ${ambiente.activo ? 'btn-danger' : 'btn-primary'}`} type="submit">
              {ambiente.activo ? 'Desactivar ambiente' : 'Activar ambiente'}
            </button>
          </form>
        </div>
      </div>

      <div className="seccion">
        <h2>Objetos en este ambiente ({objetos.length})</h2>
        <Link className="btn btn-sm" href="/inventario">
          Ir al inventario
        </Link>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Objeto</th>
              <th className="hide-sm">Placa</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {objetos.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">Este ambiente no tiene objetos asignados.</div>
                </td>
              </tr>
            ) : (
              objetos.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.codigo_interno}</code>
                  </td>
                  <td>
                    <Link href={`/inventario/${o.id}`}>{o.nombre}</Link>
                  </td>
                  <td className="hide-sm">
                    {o.es_sp ? 'S/P' : o.placa?.valor || '—'}
                  </td>
                  <td>
                    <span className={claseBadge(o.estado)}>{titulo(o.estado)}</span>
                  </td>
                  <td>
                    <Link className="btn btn-sm" href={`/inventario/${o.id}`}>
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="seccion">
        <h2>Últimas sesiones</h2>
        <span className={abiertas.length ? 'badge info' : 'badge'}>
          {abiertas.length} abierta{abiertas.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Instructor</th>
              <th className="hide-sm">Ficha</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sesiones.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">Sin sesiones registradas en este ambiente.</div>
                </td>
              </tr>
            ) : (
              sesiones.map((s) => (
                <tr key={s.id}>
                  <td>{fmtFecha(s.fecha)}</td>
                  <td>
                    {s.instructor
                      ? `${s.instructor.nombres} ${s.instructor.apellidos ?? ''}`
                      : '—'}
                  </td>
                  <td className="hide-sm">{s.ficha?.codigo ?? '—'}</td>
                  <td>{fmtHora(s.hora_entrada)}</td>
                  <td>{fmtHora(s.hora_salida)}</td>
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

