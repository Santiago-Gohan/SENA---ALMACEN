import Link from 'next/link';
import { puede, requireSession } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { claseBadge, fmtFecha, fmtHora, hoyISO, titulo } from '@/lib/utils';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function PanelPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requireSession();

  if (!dbConfigurada()) return <SetupNotice />;

  let d: any = null;
  let error = '';

  try {
    const [totales, ultimos, abiertasLista, novedadesLista, topAmbientes] = await Promise.all([
      q<any>(
        `select
           (select count(*) from objeto where activo)::int as objetos,
           (select count(*) from objeto where activo and estado = 'en_uso')::int as en_uso,
           (select count(*) from objeto where activo and estado = 'mantenimiento')::int as mantenimiento,
           (select count(*) from ambiente where activo)::int as ambientes,
           (select count(*) from sesion_ambiente where hora_salida is null)::int as abiertas,
           (select count(*) from novedad where estado = 'abierta')::int as novedades,
           (select count(*) from sesion_ambiente where fecha = $1::date)::int as sesiones_hoy`,
        [hoyISO()]
      ),
      q<any>(
        `select o.id, o.codigo_interno, o.nombre, o.estado, a.codigo as ambiente_codigo
           from objeto o
           left join ambiente a on a.id = o.ambiente_id
          where o.activo
          order by o.id desc
          limit 6`
      ),
      q<any>(
        `select s.id, s.hora_entrada, s.estado,
                a.codigo as ambiente_codigo, a.nombre as ambiente_nombre,
                p.nombres as instructor_nombres, p.apellidos as instructor_apellidos,
                f.codigo as ficha_codigo
           from sesion_ambiente s
           left join ambiente a on a.id = s.ambiente_id
           left join persona p on p.id = s.instructor_id
           left join ficha f on f.id = s.ficha_id
          where s.hora_salida is null
          order by s.hora_entrada desc
          limit 5`
      ),
      q<any>(
        `select id, tipo, descripcion, fecha_apertura, estado
           from novedad
          where estado = 'abierta'
          order by fecha_apertura desc
          limit 5`
      ),
      q<any>(
        `select a.id, a.codigo, a.nombre, count(o.id)::int as total
           from ambiente a
           left join objeto o on o.ambiente_id = a.id and o.activo
          where a.activo
          group by a.id, a.codigo, a.nombre
          order by total desc, a.codigo
          limit 5`
      ),
    ]);

    const t = totales[0] ?? {};

    d = {
      objetos: t.objetos ?? 0,
      enUso: t.en_uso ?? 0,
      mantenimiento: t.mantenimiento ?? 0,
      ambientes: t.ambientes ?? 0,
      abiertas: t.abiertas ?? 0,
      novedades: t.novedades ?? 0,
      sesionesHoy: t.sesiones_hoy ?? 0,
      ultimos: ultimos.map((o) => ({
        ...o,
        ambiente: o.ambiente_codigo ? { codigo: o.ambiente_codigo } : null,
      })),
      abiertasLista: abiertasLista.map((s) => ({
        ...s,
        ambiente: s.ambiente_codigo
          ? { codigo: s.ambiente_codigo, nombre: s.ambiente_nombre }
          : null,
        instructor: s.instructor_nombres
          ? { nombres: s.instructor_nombres, apellidos: s.instructor_apellidos }
          : null,
        ficha: s.ficha_codigo ? { codigo: s.ficha_codigo } : null,
      })),
      novedadesLista,
      topAmbientes,
    };
  } catch (e) {
    error = mensajeError(e);
  }

  if (error || !d) {
    return (
      <>
        <Alerta error={error || 'No se pudieron cargar los datos'} />
        <SetupNotice detalle={error} />
      </>
    );
  }

  const saludo = usuario.nombre.split(' ')[0] || usuario.username;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hola, {saludo} 👋</h1>
          <p className="sub">
            {fmtFecha(hoyISO())} · Panel de control del almacén y los ambientes
          </p>
        </div>
        <div className="row">
          {puede(usuario, 'inventario_ver') && (
            <Link className="btn" href="/inventario">
              Ver inventario
            </Link>
          )}
          {puede(usuario, 'sesiones') && (
            <Link className="btn btn-primary" href="/acceso">
              + Registrar entrada
            </Link>
          )}
        </div>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-4">
        <div className="card stat">
          <span className="rotulo">Objetos activos</span>
          <span className="num">{d.objetos}</span>
          <span className="pie">{d.enUso} en uso · {d.mantenimiento} en mantenimiento</span>
        </div>
        <div className="card stat">
          <span className="rotulo">Ambientes activos</span>
          <span className="num">{d.ambientes}</span>
          <span className="pie">Aulas, talleres y laboratorios</span>
        </div>
        <div className="card stat">
          <span className="rotulo">Sesiones abiertas</span>
          <span className="num">{d.abiertas}</span>
          <span className="pie">{d.sesionesHoy} registradas hoy</span>
        </div>
        <div className="card stat">
          <span className="rotulo">Novedades abiertas</span>
          <span className="num">{d.novedades}</span>
          <span className="pie">
            {d.novedades > 0 ? 'Requieren seguimiento' : 'Todo en orden'}
          </span>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2>Sesiones abiertas ahora</h2>
            <Link className="btn btn-sm" href="/acceso">
              Ir a acceso
            </Link>
          </div>

          {d.abiertasLista.length === 0 ? (
            <div className="empty">No hay sesiones abiertas en este momento.</div>
          ) : (
            <div className="lista">
              {d.abiertasLista.map((s: any) => (
                <div className="lista-item" key={s.id}>
                  <div className="crece">
                    <div className="titulo">
                      {s.ambiente ? `${s.ambiente.codigo} · ${s.ambiente.nombre}` : 'Sin ambiente'}
                    </div>
                    <div className="meta">
                      {s.instructor
                        ? `${s.instructor.nombres} ${s.instructor.apellidos ?? ''}`
                        : 'Instructor sin registrar'}{' '}
                      · Ficha {s.ficha?.codigo ?? '—'}
                    </div>
                  </div>
                  <div className="meta">{fmtHora(s.hora_entrada)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2>Novedades abiertas</h2>
            <Link className="btn btn-sm" href="/acceso">
              Ir a acceso
            </Link>
          </div>

          {d.novedadesLista.length === 0 ? (
            <div className="empty">Sin novedades registradas. 🎉</div>
          ) : (
            <div className="lista">
              {d.novedadesLista.map((n: any) => (
                <div className="lista-item" key={n.id}>
                  <div className="crece">
                    <div className="titulo">{titulo(n.tipo)}</div>
                    <div className="meta">{n.descripcion}</div>
                  </div>
                  <span className={claseBadge(n.estado)}>{titulo(n.estado)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Últimos objetos registrados</h2>
          {d.ultimos.length === 0 ? (
            <div className="empty">
              Aún no hay objetos.{' '}
              <Link href="/inventario">Registra el primero</Link>.
            </div>
          ) : (
            <div className="lista">
              {d.ultimos.map((o: any) => (
                <Link className="lista-item" key={o.id} href={`/inventario/${o.id}`}>
                  <div className="crece">
                    <div className="titulo">{o.nombre}</div>
                    <div className="meta">
                      {o.codigo_interno}
                      {o.ambiente ? ` · Ambiente ${o.ambiente.codigo}` : ' · Sin ambiente'}
                    </div>
                  </div>
                  <span className={claseBadge(o.estado)}>{titulo(o.estado)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ambientes con más objetos</h2>
          {d.topAmbientes.length === 0 ? (
            <div className="empty">
              <Link href="/ambientes">Crea los ambientes</Link> para empezar.
            </div>
          ) : (
            <div className="lista">
              {d.topAmbientes.map((a: any) => (
                <Link className="lista-item" key={a.id} href={`/ambientes/${a.id}`}>
                  <div className="crece">
                    <div className="titulo">
                      {a.codigo} · {a.nombre}
                    </div>
                  </div>
                  <span className="badge">{a.total} objetos</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="aviso-legal" style={{ marginTop: 18 }}>
        <strong>Recordatorio Ley 1581:</strong> este sistema trata datos personales de instructores
        y aprendices. Informa el uso de los datos y limita el acceso según el rol.
      </p>
    </>
  );
}
