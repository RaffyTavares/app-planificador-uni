/* Utilidades generales: DOM, texto, fechas y formato. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function debounce(fn, ms = 200) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Fechas ---------- */
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const WEEK = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
    const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
};
/** "2026-11-10 14:05:00" → Date local */
export const fromDateTime = (s) => {
    const [f, h = '00:00:00'] = String(s || '').split(/[ T]/);
    const [hh, mm, ss] = h.split(':').map(Number);
    const d = fromISO(f);
    d.setHours(hh || 0, mm || 0, ss || 0, 0);
    return d;
};
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const daysUntil = (iso) => Math.round((fromISO(iso) - startOfDay(new Date())) / 86400000);
export const hoyISO = () => toISO(new Date());
export const lunesDe = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export const toMin = (hhmm) => {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};
export const minToHHMM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

let hora24 = false;
/** Formato de hora del estudiante: true = 14:30, false = 2:30 PM. */
export const setHora24 = (v) => { hora24 = !!v; };

export function fmtTime(hhmm) {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    if (hora24) return `${pad(h || 0)}:${pad(m || 0)}`;
    return `${(h % 12) || 12}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
    return fromISO(iso).toLocaleDateString('es', opts).replace('.', '');
}

export function fmtDuration(min) {
    min = Math.round(min);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/** Formato compacto para métricas: "45 min", "2 h", "2 h 30". */
export function fmtCorto(min) {
    min = Math.round(min);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function fmtHours(min) {
    const h = min / 60;
    return Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',');
}

export function fmtRelativo(fechaHora) {
    const d = fromDateTime(fechaHora);
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    const dias = Math.floor(s / 86400);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).replace('.', '');
}

export function fmtBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1073741824) return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
    return `${(b / 1073741824).toFixed(2).replace('.', ',')} GB`;
}

export function fmtNota(n, dec = 1) {
    if (n == null || Number.isNaN(n)) return '—';
    const r = Math.round(n * 10 ** dec) / 10 ** dec;
    return Number.isInteger(r) ? String(r) : r.toFixed(dec).replace('.', ',');
}

export function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
