export type TipoQR = 'ambiente' | 'objeto' | 'desconocido';

/** Quita tildes, pasa a minúsculas y normaliza espacios. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function titulo(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------------- Fechas y horas ----------------------------- */

export function fmtFecha(v?: string | null): string {
  if (!v) return '—';

  // Fecha pura (columna DATE): se muestra tal cual, sin conversión de zona.
  if (v.length <= 10) {
    const [y, m, d] = v.slice(0, 10).split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
  }

  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function fmtHora(v?: string | null): string {
  if (!v) return '—';
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function fmtFechaHora(v?: string | null): string {
  if (!v) return '—';
  return `${fmtFecha(v)} ${fmtHora(v)}`;
}

/** Hora de una columna TIME (07:00:00) sin pasarla por Date. */
export function fmtHoraCorta(v?: string | null): string {
  if (!v) return '—';
  const s = String(v);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fmtHora(s);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano). */
export function hoyISO(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Convierte dd/mm/yyyy, dd/mm/yy, dd-mm-yy, yyyy-mm-dd o serial de Excel a YYYY-MM-DD. */
export function normalizarFecha(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Serial de Excel (por ejemplo 46270)
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }

  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!m) return null;

  let y: number, mo: number, da: number;
  if (m[1].length === 4) {
    y = Number(m[1]);
    mo = Number(m[2]);
    da = Number(m[3]);
  } else {
    da = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += 2000;
  }

  if (mo < 1 || mo > 12 || da < 1 || da > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

/** Convierte 7:00, 07:00, 1:00 pm, 6.00 p.m., 13:00 a HH:MM:00. */
export function normalizarHora(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  if (!s) return null;

  // Excel puede devolver una fracción del día (0.2916 = 07:00)
  if (/^0?[.,]\d+$/.test(s)) {
    const frac = Number(s.replace(',', '.'));
    const mins = Math.round(frac * 1440);
    if (mins >= 0 && mins < 1440) {
      return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
    }
  }

  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a m|p m)?$/);
  if (!m) return null;

  let h = Number(m[1]);
  const mi = Number(m[2] || 0);
  const ap = m[3] ? m[3].replace(' ', '') : null;

  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;

  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
}

/** Ficha del SENA: 7 u 8 dígitos, sin puntos ni espacios. */
export function normalizarFicha(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\D/g, '');
  return /^\d{7,8}$/.test(s) ? s : null;
}

/* ----------------------------- QR ----------------------------- */

export function qrAmbiente(codigo: string): string {
  return `SENA-AMB:${codigo}`;
}

export function qrObjeto(codigo: string): string {
  return `SENA-OBJ:${codigo}`;
}

export function parseQr(raw: string): { tipo: TipoQR; codigo: string } {
  const s = (raw || '').trim();
  if (!s) return { tipo: 'desconocido', codigo: '' };

  const directo = s.match(/^SENA-(AMB|OBJ):(.+)$/i);
  if (directo) {
    return {
      tipo: directo[1].toUpperCase() === 'AMB' ? 'ambiente' : 'objeto',
      codigo: directo[2].trim(),
    };
  }

  // QR nuevo de ambientes: URL corta /a/<codigo>
  const urlAmbiente = s.match(/\/a\/([^/?#]+)/i);
  if (urlAmbiente) {
    return { tipo: 'ambiente', codigo: decodeURIComponent(urlAmbiente[1]) };
  }

  const url = s.match(/\/(ambientes|inventario)\/([^/?#]+)/i);
  if (url) {
    return {
      tipo: url[1].toLowerCase() === 'ambientes' ? 'ambiente' : 'objeto',
      codigo: decodeURIComponent(url[2]),
    };
  }

  return { tipo: 'desconocido', codigo: s };
}

/* ----------------------------- Tablas / CSV ----------------------------- */

function dividirLinea(linea: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (ch === delim && !entreComillas) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Acepta texto pegado desde Excel (TAB), CSV (coma) o CSV con punto y coma. */
export function parseTabla(texto: string): string[][] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  return lineas.map((linea) => {
    const delim = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ',';
    return dividirLinea(linea, delim).map((c) => c.trim());
  });
}

/* ----------------------------- Presentación ----------------------------- */

export const ESTADOS_OBJETO = [
  'disponible',
  'en_uso',
  'prestado',
  'mantenimiento',
  'baja',
  'perdido',
] as const;

export const CONDICIONES = ['bueno', 'regular', 'malo'] as const;
export const CRITICIDADES = ['alta', 'media', 'baja'] as const;
export const TIPOS_AMBIENTE = ['aula', 'taller', 'laboratorio', 'almacen', 'oficina', 'zona_comun'] as const;
export const JORNADAS = ['mañana', 'tarde', 'noche', 'mixta'] as const;

/** Jornadas de portería para el préstamo de llaves. */
export const JORNADAS_PORTERIA = {
  manana: { etiqueta: 'Mañana', inicio: '07:00', fin: '12:00', horario: '7:00 – 12:00' },
  tarde: { etiqueta: 'Tarde', inicio: '13:00', fin: '18:00', horario: '1:00 – 6:00 p.m.' },
} as const;

export type JornadaPorteria = keyof typeof JORNADAS_PORTERIA;

export function claseBadge(valor: string): string {
  switch (valor) {
    case 'disponible':
    case 'cerrada':
    case 'bueno':
    case 'validada':
    case 'listo':
    case 'ok':
    case 'devuelta':
      return 'badge ok';
    case 'en_uso':
    case 'abierta':
    case 'prestado':
    case 'prestada':
    case 'entregada':
      return 'badge info';
    case 'mantenimiento':
    case 'con_novedad':
    case 'regular':
    case 'pendiente':
    case 'en_proceso':
    case 'programa_no_coincide':
      return 'badge warn';
    case 'baja':
    case 'perdido':
    case 'malo':
    case 'sin_cierre':
    case 'vencida':
    case 'duplicado':
      return 'badge danger';
    default:
      return 'badge';
  }
}
