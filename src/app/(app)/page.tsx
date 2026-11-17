import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { db, dbConfigurada, mensajeError } from '@/lib/supabase';
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
    const sb = db();

    const contar = (tabla: string, filtro?: (q: any) => any) => {
      let q = sb.from(tabla).select('id', { count: 'exact', head: true });
      if (filtro) q = filtro(q);
      return q;
    };

    const [
      objetos,
      enUso,
      mantenimiento,
      ambientes,
      abiertas,
      novedades,
      sesionesHoy,
      ultimos,
      abiertasLista,
      novedadesLista,
      listaAmbientes,
      objetosAmbiente,
    ] = await Promise.all([
      contar('objeto', (q) => q.eq('activo', true)),
      contar('objeto', (q) => q.eq('activo', true).eq('estado', 'en_uso')),
      contar('objeto', (q) => q.eq('activo', true).eq('estado', 'mantenimiento')),
      contar('ambiente', (q) => q.eq('activo', true)),
      contar('sesion_ambiente', (q) => q.is('hora_salida', null)),
      contar('novedad', (q) => q.eq('estado', 'abierta')),
      contar('sesion_ambiente', (q) => q.eq('fecha', hoyISO())),
      sb
        .from('objeto')
        .select('id, codigo_interno, nombre, estado, ambiente:ambiente_id(codigo)')
        .eq('activo', true)
        .order('id', { ascending: false })
        .limit(6),
      sb
        .from('sesion_ambiente')
        .select(
          'id, hora_entrada, estado, ambiente:ambiente_id(codigo, nombre), instructor:instructor_id(nombres, apellidos), ficha:ficha_id(codigo)'
        )
        .is('hora_salida', null)
        .order('hora_entrada', { ascending: false })
        .limit(5),
      sb
        .from('novedad')
        .select('id, tipo, descripcion, fecha_apertura, estado')
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(5),
      sb.from('ambiente').select('id, codigo, nombre').eq('activo', true).limit(300),
      sb.from('objeto').select('ambiente_id').eq('activo', true),
    ]);

    const conteo: Record<number, number> = {};
    for (const o of (objetosAmbiente.data || []) as any[]) {
      if (o.ambiente_id) conteo[o.ambiente_id] = (conteo[o.ambiente_id] || 0) + 1;
    }

    const topAmbientes = ((listaAmbientes.data || []) as any[])
      .map((a) => ({ ...a, total: conteo[a.id] || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    d = {
      objetos: objetos.count || 0,
      enUso: enUso.count || 0,
      mantenimiento: mantenimiento.count || 0,
      ambientes: ambientes.count || 0,
      abiertas: abiertas.count || 0,
      novedades: novedades.count || 0,
      sesionesHoy: sesionesHoy.count || 0,
      ultimos: ultimos.data || [],
      abiertasLista: abiertasLista.data || [],
      novedadesLista: novedadesLista.data || [],
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
          <Link className="btn" href="/inventario">
            Ver inventario
          </Link>
          <Link className="btn btn-primary" href="/acceso">
            + Registrar entrada
          </Link>
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
