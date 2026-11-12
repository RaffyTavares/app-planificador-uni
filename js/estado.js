/*
 * Estado en memoria (cargado desde la API) y cálculos derivados.
 * Nada de esto se guarda en localStorage: la fuente de verdad es el servidor.
 */
import {
    DIAS, toISO, fromISO, fromDateTime, startOfDay, addDays, daysUntil, toMin, nowMin, fmtTime, fmtDuration, pad, hoyISO, lunesDe, setHora24,
} from './util.js';

export const COLECCIONES = ['materias', 'clases', 'tareas', 'anotaciones', 'evaluaciones', 'asistencias', 'sesiones', 'flashcards', 'archivos'];

export const db = {
    usuario: null,
    semestre: null,
    semestres: [],
    historico: { materias: [], evaluaciones: [] },
    usoAlmacenamiento: 0,
    cuotaAlmacenamiento: 0,
    grupos: null, // se cargan al abrir la vista de grupos
};
COLECCIONES.forEach(k => { db[k] = []; });

export const app = { ia: false, pushKey: null, maxSubida: 25 * 1048576, cargado: false, enLinea: true };

export function cargarEstado(e) {
    COLECCIONES.forEach(k => { db[k] = e[k] || []; });
    ['usuario', 'semestre', 'semestres', 'historico', 'usoAlmacenamiento', 'cuotaAlmacenamiento'].forEach(k => { if (k in e) db[k] = e[k]; });
    if ('ia' in e) app.ia = e.ia;
    if ('pushKey' in e) app.pushKey = e.pushKey;
    aplicarPerfil();
    app.cargado = true;
}

/* ---------- Perfil académico (universidad, tipo de período, formato de hora) ---------- */
export const TIPOS_PERIODO = {
    semestre: { uno: 'semestre', varios: 'semestres', desc: '2 al año' },
    cuatrimestre: { uno: 'cuatrimestre', varios: 'cuatrimestres', desc: '3 al año' },
    trimestre: { uno: 'trimestre', varios: 'trimestres', desc: '4 al año' },
    bimestre: { uno: 'bimestre', varios: 'bimestres', desc: '6 al año' },
    anual: { uno: 'año académico', varios: 'años académicos', desc: '1 al año' },
};

/** Tramos del año de cada tipo de período: [clave, nombre, inicio MM-DD, fin MM-DD]. */
export const TRAMOS = {
    semestre: [['ene-jun', 'Enero – Junio', '01-08', '06-30'], ['ago-dic', 'Agosto – Diciembre', '08-01', '12-20'], ['verano', 'Verano', '06-01', '07-31']],
    cuatrimestre: [['ene-abr', 'Enero – Abril', '01-08', '04-30'], ['may-ago', 'Mayo – Agosto', '05-01', '08-31'], ['sep-dic', 'Septiembre – Diciembre', '09-01', '12-20'], ['verano', 'Verano', '06-01', '07-31']],
    trimestre: [['ene-mar', 'Enero – Marzo', '01-08', '03-31'], ['abr-jun', 'Abril – Junio', '04-01', '06-30'], ['jul-sep', 'Julio – Septiembre', '07-01', '09-30'], ['oct-dic', 'Octubre – Diciembre', '10-01', '12-20']],
    bimestre: [['ene-feb', 'Enero – Febrero', '01-08', '02-28'], ['mar-abr', 'Marzo – Abril', '03-01', '04-30'], ['may-jun', 'Mayo – Junio', '05-01', '06-30'],
        ['jul-ago', 'Julio – Agosto', '07-01', '08-31'], ['sep-oct', 'Septiembre – Octubre', '09-01', '10-31'], ['nov-dic', 'Noviembre – Diciembre', '11-01', '12-20']],
    anual: [['anual', 'Año', '01-08', '12-20']],
};

export const perfil = () => ({ universidad: '', periodo: 'semestre', formatoHora: '12', creditosCarrera: null, ...(db.usuario?.perfil || {}) });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Palabras del período del estudiante: P().uno → "cuatrimestre", P().Varios → "Cuatrimestres". */
export function P() {
    const t = TIPOS_PERIODO[perfil().periodo] || TIPOS_PERIODO.semestre;
    return { uno: t.uno, varios: t.varios, Uno: cap(t.uno), Varios: cap(t.varios) };
}

/** Aplica las preferencias que afectan al formato (llamar tras cambiar db.usuario). */
export function aplicarPerfil() {
    setHora24(perfil().formatoHora === '24');
}

/* ---------- Helpers de colecciones ---------- */
export const porId = (col, id) => db[col].find(x => x.id === id);
export function reemplazar(col, item) {
    const i = db[col].findIndex(x => x.id === item.id);
    if (i >= 0) db[col][i] = item; else db[col].push(item);
    return item;
}
export const quitar = (col, id) => { db[col] = db[col].filter(x => x.id !== id); };

/* ---------- Materias: colores y nombres ---------- */
// Orden fijo de la paleta categórica validada (CVD y visión normal, claro y oscuro).
// Las claves se conservan porque ya están guardadas en la base de datos.
export const HUES = ['sky', 'ember', 'teal', 'amber', 'pink', 'green', 'violet', 'rose'];
export const HUE_LABEL = { sky: 'Azul', ember: 'Naranja', teal: 'Aguamarina', amber: 'Amarillo', pink: 'Magenta', green: 'Verde', violet: 'Violeta', rose: 'Rojo' };

export const materiaById = (id) => db.materias.find(m => m.id === id) || db.historico.materias.find(m => m.id === id);

export function hueOf(materiaId) {
    if (materiaId == null || materiaId === '') return 'none';
    const m = materiaById(materiaId);
    if (m && HUES.includes(m.color)) return m.color;
    return HUES[Math.abs(Number(materiaId) || 0) % HUES.length];
}
export const mc = (materiaId) => `--mc:var(--h-${hueOf(materiaId)})`;

export function materiaName(materiaId, fallback) {
    const m = materiaById(materiaId);
    return m ? m.nombre : (fallback || 'General');
}

export function nextFreeHue() {
    const usados = new Set(db.materias.map(m => hueOf(m.id)));
    return HUES.find(h => !usados.has(h)) || HUES[db.materias.length % HUES.length];
}

/* ---------- Horario ---------- */
export const durOf = (c) => Math.max(5, parseInt(c.duracion, 10) || 60);
export const fmtRange = (c) => `${fmtTime(c.hora)} – ${fmtTime(`${pad(Math.floor((toMin(c.hora) + durOf(c)) / 60) % 24)}:${pad((toMin(c.hora) + durOf(c)) % 60)}`)}`;

export const classesOnDay = (dayIdx) => db.clases
    .filter(c => c.dia === DIAS[dayIdx])
    .sort((a, b) => toMin(a.hora) - toMin(b.hora));

export function classStatus(c, dayIdx = new Date().getDay()) {
    if (dayIdx !== new Date().getDay()) return 'other';
    const s = toMin(c.hora), e = s + durOf(c), n = nowMin();
    if (n >= s && n < e) return 'live';
    if (n < s) return 'next';
    return 'past';
}

/** Clase en curso o la próxima clase de la semana. */
export function upcomingClass() {
    const today = new Date().getDay();
    const n = nowMin();
    let best = null;
    for (const c of db.clases) {
        const dayIdx = DIAS.indexOf(c.dia);
        if (dayIdx < 0) continue;
        const s = toMin(c.hora), e = s + durOf(c);
        if (dayIdx === today && n >= s && n < e) {
            return { clase: c, live: true, minutesTo: 0, elapsed: n - s, remaining: e - n, dayOffset: 0 };
        }
        let offset = (dayIdx - today + 7) % 7;
        let t = offset * 1440 + s - n;
        if (t <= 0) { offset = 7; t += 7 * 1440; }
        if (!best || t < best.minutesTo) best = { clase: c, live: false, minutesTo: t, dayOffset: offset };
    }
    return best;
}

export function whenText(up) {
    const { minutesTo, dayOffset, clase } = up;
    if (minutesTo < 60) return `en ${minutesTo} min`;
    if (dayOffset === 0) return `en ${fmtDuration(minutesTo)}`;
    if (dayOffset === 1) return `mañana a las ${fmtTime(clase.hora)}`;
    return `el ${clase.dia.toLowerCase()} a las ${fmtTime(clase.hora)}`;
}

export function countdownParts(min) {
    if (min < 60) return [String(min), 'minutos'];
    if (min < 1440) return [`${Math.floor(min / 60)}h ${pad(min % 60)}m`, 'para empezar'];
    const d = Math.round(min / 1440);
    return [String(d), d === 1 ? 'día' : 'días'];
}

export function overlapsFor(cand) {
    const s = toMin(cand.hora), e = s + durOf(cand);
    return db.clases.filter(c => c.id !== cand.id && c.dia === cand.dia && s < toMin(c.hora) + durOf(c) && toMin(c.hora) < e);
}

/* ---------- Tareas ---------- */
export const PRIO_RANK = { alta: 0, media: 1, baja: 2 };
export const PRIO_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
export const REC_LABEL = { diaria: 'Cada día', semanal: 'Cada semana', mensual: 'Cada mes' };

export function bucketOf(t) {
    if (t.completada) return 'done';
    const d = daysUntil(t.fecha);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d <= 7) return 'week';
    return 'later';
}

export const BUCKETS = {
    overdue: { label: 'Vencidas', tone: 'danger' },
    today: { label: 'Hoy', tone: 'warn' },
    tomorrow: { label: 'Mañana', tone: '' },
    week: { label: 'Próximos 7 días', tone: '' },
    later: { label: 'Más adelante', tone: '' },
    done: { label: 'Completadas', tone: '' },
};

export function sortTasks(list) {
    return [...list].sort((a, b) => {
        if (a.completada !== b.completada) return a.completada ? 1 : -1;
        if (a.completada) return String(b.completadaEn || b.fecha).localeCompare(String(a.completadaEn || a.fecha));
        const byDate = String(a.fecha).localeCompare(String(b.fecha));
        if (byDate) return byDate;
        if (a.tipo !== b.tipo) return a.tipo === 'examen' ? -1 : 1;
        return (PRIO_RANK[a.prioridad] ?? 1) - (PRIO_RANK[b.prioridad] ?? 1);
    });
}

export function dueLabel(t) {
    const d = daysUntil(t.fecha);
    if (t.completada) return { text: `Entrega ${fromISO(t.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')}`, tone: '' };
    if (d < -1) return { text: `Vencida hace ${-d} días`, tone: 'danger' };
    if (d === -1) return { text: 'Venció ayer', tone: 'danger' };
    if (d === 0) return { text: 'Hoy', tone: 'warn' };
    if (d === 1) return { text: 'Mañana', tone: 'info' };
    if (d < 7) return { text: DIAS[fromISO(t.fecha).getDay()], tone: '' };
    return { text: fromISO(t.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', ''), tone: '' };
}

export const pendingTasks = () => db.tareas.filter(t => !t.completada);
export const overdueCount = () => pendingTasks().filter(t => daysUntil(t.fecha) < 0).length;
export const proximosExamenes = () => sortTasks(db.tareas.filter(t => t.tipo === 'examen' && !t.completada && daysUntil(t.fecha) >= 0));
export const archivosDeTarea = (id) => db.archivos.filter(a => a.tareaId === id);

/* ---------- Calificaciones e índice académico ---------- */
export const ESCALA_DEFECTO = [
    { letra: 'A', min: 90, puntos: 4 },
    { letra: 'B', min: 80, puntos: 3 },
    { letra: 'C', min: 70, puntos: 2 },
    { letra: 'D', min: 60, puntos: 1 },
    { letra: 'F', min: 0, puntos: 0 },
];
export const escala = () => (db.usuario?.escala?.length ? db.usuario.escala : ESCALA_DEFECTO);
export const notaAprobatoria = () => {
    const e = escala();
    const aprobadas = e.filter(n => n.puntos > 0);
    return aprobadas.length ? Math.min(...aprobadas.map(n => n.min)) : 60;
};

export function letraDe(nota) {
    if (nota == null) return null;
    return escala().find(n => nota >= n.min) || escala()[escala().length - 1];
}

/**
 * Resumen de calificaciones de una materia.
 *  acumulado: puntos ganados sobre 100 (lo que ya tienes seguro)
 *  promedio: rendimiento en lo evaluado (proyección si sigues igual)
 *  final: nota final (si todo está evaluado) o proyectada
 */
export function notaMateria(materiaId, evaluaciones = db.evaluaciones) {
    const evs = evaluaciones.filter(e => e.materiaId === materiaId);
    const pesoTotal = evs.reduce((s, e) => s + e.peso, 0);
    const evaluadas = evs.filter(e => e.nota != null);
    const pesoEvaluado = evaluadas.reduce((s, e) => s + e.peso, 0);
    const acumulado = evaluadas.reduce((s, e) => s + (e.nota / e.notaMax) * e.peso, 0);
    const promedio = pesoEvaluado ? (acumulado / pesoEvaluado) * 100 : null;
    // Nota final registrada (récord de semestres cursados): manda sobre las evaluaciones
    const oficial = materiaById(materiaId)?.notaFinal;
    if (oficial != null) {
        return { evs, pesoTotal, pesoEvaluado, acumulado, promedio, final: oficial, completa: true, oficial: true, restante: 0, letra: letraDe(oficial) };
    }
    const completa = pesoEvaluado >= 99.99;
    const final = completa ? acumulado : promedio;
    return { evs, pesoTotal, pesoEvaluado, acumulado, promedio, final, completa, restante: Math.max(0, 100 - pesoEvaluado), letra: letraDe(final) };
}

/** Nota que necesitas en lo que falta para llegar a `objetivo` (sobre 100). */
export function notaNecesaria(materiaId, objetivo) {
    const r = notaMateria(materiaId);
    if (r.restante <= 0) return { estado: r.acumulado >= objetivo ? 'logrado' : 'imposible', necesaria: null };
    const nec = ((objetivo - r.acumulado) / r.restante) * 100;
    if (nec <= 0) return { estado: 'asegurado', necesaria: 0 };
    if (nec > 100) return { estado: 'imposible', necesaria: nec };
    return { estado: 'posible', necesaria: nec };
}

/** Índice (0–4) ponderado por créditos de una lista de materias. */
export function indice(materias, evaluaciones) {
    let pts = 0, cred = 0, proyectado = false;
    materias.forEach(m => {
        const r = notaMateria(m.id, evaluaciones);
        const c = Number(m.creditos) || 0;
        if (r.final == null || !c) return;
        if (!r.completa) proyectado = true;
        pts += r.letra.puntos * c;
        cred += c;
    });
    return { valor: cred ? pts / cred : null, creditos: cred, proyectado };
}
export const indiceSemestre = () => indice(db.materias, db.evaluaciones);
export const indiceAcumulado = () => indice(db.historico.materias, db.historico.evaluaciones);

/* ---------- Asistencia ---------- */
export function asistenciaMateria(materiaId) {
    const marcas = db.asistencias.filter(a => a.materiaId === materiaId);
    const cuenta = { presente: 0, ausente: 0, tarde: 0, justificada: 0 };
    marcas.forEach(a => { cuenta[a.estado] = (cuenta[a.estado] || 0) + 1; });
    const total = marcas.length;
    const asistio = cuenta.presente + cuenta.tarde + cuenta.justificada;
    const m = materiaById(materiaId);
    const max = m?.maxAusencias ?? null;
    return {
        ...cuenta, total,
        porcentaje: total ? Math.round((asistio / total) * 100) : null,
        max,
        riesgo: max != null && cuenta.ausente >= Math.max(0, max - 1),
        excedido: max != null && cuenta.ausente > max,
    };
}

export const marcaAsistencia = (claseId, fecha) => db.asistencias.find(a => a.claseId === claseId && a.fecha === fecha);

/** Fechas pasadas (hasta hoy) en que se impartió una clase, desde el inicio del semestre o 10 semanas atrás. */
export function fechasDeClase(c, semanas = 10) {
    const dia = DIAS.indexOf(c.dia);
    const hoy = startOfDay(new Date());
    const inicio = db.semestre?.inicio ? fromISO(db.semestre.inicio) : addDays(hoy, -7 * semanas);
    const out = [];
    let d = addDays(hoy, -((hoy.getDay() - dia + 7) % 7));
    // Hoy solo cuenta si la clase ya empezó
    if (toISO(d) === toISO(hoy) && toMin(c.hora) > nowMin()) d = addDays(d, -7);
    while (d >= inicio && out.length < 40) { out.push(toISO(d)); d = addDays(d, -7); }
    return out;
}

/* ---------- Estadísticas de estudio ---------- */
export function minutosPorDia(dias = 7) {
    const hoy = startOfDay(new Date());
    const mapa = new Map();
    for (let i = dias - 1; i >= 0; i--) mapa.set(toISO(addDays(hoy, -i)), 0);
    db.sesiones.forEach(s => {
        const k = String(s.inicio).slice(0, 10);
        if (mapa.has(k)) mapa.set(k, mapa.get(k) + s.minutos);
    });
    return [...mapa.entries()].map(([fecha, min]) => ({ fecha, min }));
}

export function minutosHoy() {
    const h = hoyISO();
    return db.sesiones.filter(s => String(s.inicio).startsWith(h)).reduce((a, s) => a + s.minutos, 0);
}

export function minutosSemanaPorMateria() {
    const desde = lunesDe(new Date());
    const mapa = new Map();
    db.sesiones.forEach(s => {
        if (fromDateTime(s.inicio) < desde) return;
        const k = s.materiaId ?? 0;
        mapa.set(k, (mapa.get(k) || 0) + s.minutos);
    });
    return [...mapa.entries()].map(([materiaId, min]) => ({ materiaId: materiaId || null, min })).sort((a, b) => b.min - a.min);
}

/** Días seguidos (hasta hoy o ayer) con al menos una sesión. */
export function racha() {
    const dias = new Set(db.sesiones.map(s => String(s.inicio).slice(0, 10)));
    let d = startOfDay(new Date());
    if (!dias.has(toISO(d))) d = addDays(d, -1);
    let n = 0;
    while (dias.has(toISO(d))) { n++; d = addDays(d, -1); }
    return n;
}

export const tarjetasPendientes = () => db.flashcards.filter(f => f.proxima <= hoyISO());

export const pomodoroConfig = () => ({ trabajo: 25, descanso: 5, descansoLargo: 15, ciclos: 4, metaDiaria: 120, ...(db.usuario?.pomodoro || {}) });

/* ---------- Interfaz ---------- */
export const ui = {
    route: 'inicio',
    param: null,
    taskFilter: 'pendientes',
    taskMateria: '',
    taskQuery: '',
    noteQuery: '',
    noteMateria: '',
    schedMode: window.innerWidth < 760 ? 'dia' : 'semana',
    schedDay: new Date().getDay(),
    calMes: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
    calDia: hoyISO(),
    materiaTab: 'resumen',
    archivoCategoria: '',
    grupoActivo: null,
    qa: { materiaId: '', fecha: '', prioridad: 'media' },
};
