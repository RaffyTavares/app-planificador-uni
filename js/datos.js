/*
 * Operaciones sobre los datos: llaman a la API y actualizan el estado local.
 * Los borrados se aplican primero en pantalla y se confirman en el servidor
 * a los 7 segundos, lo que permite "Deshacer" sin endpoints especiales.
 */
import { api, subir } from './api.js';
import { db, app, cargarEstado, reemplazar, quitar, porId, pendingTasks } from './estado.js';
import { toast, toastError, render, confirmDialog } from './ui.js';
import { plural, descargar, hoyISO, daysUntil } from './util.js';

export const TIPOS = {
    materia: { col: 'materias', ruta: 'materias', etiqueta: 'Materia eliminada' },
    clase: { col: 'clases', ruta: 'clases', etiqueta: 'Clase eliminada' },
    tarea: { col: 'tareas', ruta: 'tareas', etiqueta: 'Tarea eliminada' },
    nota: { col: 'anotaciones', ruta: 'anotaciones', etiqueta: 'Nota eliminada' },
    evaluacion: { col: 'evaluaciones', ruta: 'evaluaciones', etiqueta: 'Evaluación eliminada' },
    archivo: { col: 'archivos', ruta: 'archivos', etiqueta: 'Archivo eliminado' },
    flashcard: { col: 'flashcards', ruta: 'flashcards', etiqueta: 'Tarjeta eliminada' },
    sesion: { col: 'sesiones', ruta: 'sesiones', etiqueta: 'Sesión eliminada' },
};

/* ---------- Crear / actualizar ---------- */
export async function crear(tipo, cuerpo) {
    const t = TIPOS[tipo];
    const item = await api.post(t.ruta, cuerpo);
    reemplazar(t.col, item);
    if (tipo === 'materia') db.historico.materias.push(item);
    if (tipo === 'evaluacion') db.historico.evaluaciones.push(item);
    render();
    return item;
}

export async function actualizar(tipo, id, cuerpo) {
    const t = TIPOS[tipo];
    const item = await api.patch(`${t.ruta}/${id}`, cuerpo);
    reemplazar(t.col, item);
    if (tipo === 'materia') {
        sincronizarHistorico('materias', item);
        // Mantiene el nombre visible en los registros relacionados
        ['clases', 'tareas', 'anotaciones'].forEach(k => db[k].forEach(x => { if (x.materiaId === item.id) x.materiaNombre = item.nombre; }));
    }
    if (tipo === 'evaluacion') sincronizarHistorico('evaluaciones', item);
    render();
    return item;
}

function sincronizarHistorico(k, item) {
    const i = db.historico[k].findIndex(x => x.id === item.id);
    if (i >= 0) db.historico[k][i] = item; else db.historico[k].push(item);
}

/* ---------- Borrado con deshacer ---------- */
const pendientes = new Map();

/** Quita del estado local lo que el servidor borraría en cascada. Devuelve cómo restaurarlo. */
function quitarLocal(tipo, id) {
    const t = TIPOS[tipo];
    const quitados = {};
    const sacar = (col, pred) => {
        const fuera = db[col].filter(pred);
        if (fuera.length) { quitados[col] = (quitados[col] || []).concat(fuera); db[col] = db[col].filter(x => !pred(x)); }
    };
    const cambios = []; // [obj, campo, valorAnterior]
    const anular = (col, campo, pred) => db[col].forEach(x => { if (pred(x)) { cambios.push([x, campo, x[campo]]); x[campo] = null; } });

    sacar(t.col, x => x.id === id);
    if (tipo === 'materia') {
        ['clases', 'tareas', 'anotaciones', 'evaluaciones', 'asistencias', 'archivos', 'flashcards'].forEach(c => sacar(c, x => x.materiaId === id));
        anular('sesiones', 'materiaId', x => x.materiaId === id);
        const hm = db.historico.materias.filter(x => x.id === id), he = db.historico.evaluaciones.filter(x => x.materiaId === id);
        db.historico.materias = db.historico.materias.filter(x => x.id !== id);
        db.historico.evaluaciones = db.historico.evaluaciones.filter(x => x.materiaId !== id);
        quitados._historico = { materias: hm, evaluaciones: he };
    }
    if (tipo === 'clase') sacar('asistencias', x => x.claseId === id);
    if (tipo === 'tarea') anular('archivos', 'tareaId', x => x.tareaId === id);
    if (tipo === 'evaluacion') {
        quitados._historico = { materias: [], evaluaciones: db.historico.evaluaciones.filter(x => x.id === id) };
        db.historico.evaluaciones = db.historico.evaluaciones.filter(x => x.id !== id);
    }

    return () => {
        Object.entries(quitados).forEach(([col, items]) => {
            if (col === '_historico') {
                db.historico.materias.push(...items.materias);
                db.historico.evaluaciones.push(...items.evaluaciones);
                return;
            }
            db[col].push(...items);
            db[col].sort((a, b) => a.id - b.id);
        });
        cambios.forEach(([obj, campo, v]) => { obj[campo] = v; });
    };
}

export function eliminar(tipo, id, { nombre = '', silencioso = false } = {}) {
    const t = TIPOS[tipo];
    if (!porId(t.col, id)) return;
    const restaurar = quitarLocal(tipo, id);
    render();
    const clave = `${tipo}:${id}`;

    const confirmar = async () => {
        if (!pendientes.has(clave)) return;
        pendientes.delete(clave);
        try {
            await api.del(`${t.ruta}/${id}`);
            if (tipo === 'archivo' || tipo === 'materia') refrescarUso();
        } catch (e) {
            restaurar();
            render();
            toastError(e, 'No se pudo eliminar');
        }
    };
    pendientes.set(clave, confirmar);
    const temporizador = setTimeout(confirmar, 7000);

    if (silencioso) return;
    toast({
        type: 'info', title: t.etiqueta, msg: nombre, duration: 7000,
        action: {
            label: 'Deshacer',
            run: () => { clearTimeout(temporizador); pendientes.delete(clave); restaurar(); render(); },
        },
    });
}

/** Al cerrar la pestaña, confirma los borrados pendientes. */
export function confirmarPendientes() {
    pendientes.forEach((_, clave) => {
        const [tipo, id] = clave.split(':');
        api.del(`${TIPOS[tipo].ruta}/${id}`, { keepalive: true }).catch(() => {});
    });
    pendientes.clear();
}

export function eliminarMateria(m) {
    const nc = db.clases.filter(c => c.materiaId === m.id).length;
    const nt = db.tareas.filter(t => t.materiaId === m.id).length;
    const nn = db.anotaciones.filter(a => a.materiaId === m.id).length;
    const na = db.archivos.filter(a => a.materiaId === m.id).length;
    const ne = db.evaluaciones.filter(a => a.materiaId === m.id).length;
    const rel = [nc && plural(nc, 'clase', 'clases'), nt && plural(nt, 'tarea', 'tareas'), nn && plural(nn, 'nota', 'notas'),
        ne && plural(ne, 'calificación', 'calificaciones'), na && plural(na, 'archivo', 'archivos')].filter(Boolean);
    confirmDialog({
        title: `¿Eliminar «${m.nombre.replace(/[<>&"]/g, '')}»?`,
        desc: rel.length ? `También se eliminarán ${rel.join(', ')}. Podrás deshacerlo durante unos segundos.` : 'Esta materia no tiene nada asociado.',
        confirm: 'Eliminar materia',
        onConfirm: () => eliminar('materia', m.id, { nombre: m.nombre }),
    });
}

/* ---------- Tareas ---------- */
export async function alternarTarea(id, fila) {
    const t = porId('tareas', id);
    if (!t) return;
    const antes = t.completada;
    const aplicar = async () => {
        t.completada = !antes;
        render();
        try {
            const r = await api.post(`tareas/${id}/toggle`);
            reemplazar('tareas', r.tarea);
            if (r.siguiente) reemplazar('tareas', r.siguiente);
            render();
            if (!antes) {
                const quedan = pendingTasks().length;
                toast({
                    type: 'success',
                    title: r.siguiente ? 'Hecho. Programé la siguiente' : quedan ? '¡Tarea completada!' : '¡Todo entregado!',
                    msg: r.siguiente ? `Próxima: ${r.siguiente.fecha.split('-').reverse().slice(0, 2).join('/')}` : quedan ? `Te quedan ${plural(quedan, 'pendiente', 'pendientes')}.` : 'No tienes tareas pendientes. Buen trabajo.',
                    action: { label: 'Deshacer', run: () => alternarTarea(id) },
                });
            }
        } catch (e) {
            t.completada = antes;
            render();
            toastError(e);
        }
    };
    if (fila && !antes) {
        fila.classList.add('is-completing');
        setTimeout(aplicar, 280);
    } else aplicar();
}

export async function alternarSubtarea(tareaId, subId) {
    const t = porId('tareas', tareaId);
    const s = t?.subtareas.find(x => x.id === subId);
    if (!s) return;
    s.hecha = !s.hecha;
    render();
    try {
        reemplazar('tareas', await api.patch(`subtareas/${subId}`, { hecha: s.hecha }));
        render();
    } catch (e) {
        s.hecha = !s.hecha;
        render();
        toastError(e);
    }
}

/* ---------- Archivos ---------- */
export async function refrescarUso() {
    try {
        const e = await api.get('estado');
        db.usoAlmacenamiento = e.usoAlmacenamiento;
        render();
    } catch { /* no crítico */ }
}

/**
 * Sube varios archivos mostrando el progreso en `onProgreso(i, fraccion)`.
 * Devuelve los archivos subidos correctamente.
 */
export async function subirArchivos(archivos, campos, onProgreso = () => {}) {
    const ok = [];
    for (let i = 0; i < archivos.length; i++) {
        const f = archivos[i];
        if (f.size > app.maxSubida) {
            toast({ type: 'error', title: `«${f.name}» es demasiado grande`, msg: `El máximo es ${Math.round(app.maxSubida / 1048576)} MB por archivo.` });
            continue;
        }
        try {
            const { promesa } = subir(campos, f, (p) => onProgreso(i, p));
            const a = await promesa;
            db.archivos.unshift(a);
            db.usoAlmacenamiento += a.tamano;
            ok.push(a);
        } catch (e) {
            toastError(e, `No se pudo subir «${f.name}»`);
        }
    }
    render();
    return ok;
}

/* ---------- Respaldo, ejemplo, semestres ---------- */
export async function recargar() {
    cargarEstado(await api.get('estado'));
    render();
}

export async function exportarRespaldo() {
    try {
        const d = await api.get('exportar');
        descargar(`edugestor-respaldo-${hoyISO()}.json`, JSON.stringify(d, null, 2), 'application/json');
        toast({ type: 'success', title: 'Respaldo descargado', msg: 'Contiene el semestre activo completo.' });
    } catch (e) { toastError(e); }
}

/** Reemplaza el semestre activo con `datos` y ofrece deshacer restaurando el estado anterior. */
export async function reemplazarSemestre(datos, { titulo, msg = '' }) {
    const anterior = await api.get('exportar');
    cargarEstado(await api.post('importar', { ...datos, modo: 'reemplazar' }));
    render({ enter: true });
    toast({
        type: 'success', title: titulo, msg, duration: 9000,
        action: {
            label: 'Deshacer',
            run: async () => {
                try { cargarEstado(await api.post('importar', { ...anterior, modo: 'reemplazar' })); render(); toast({ type: 'success', title: 'Restaurado' }); } catch (e) { toastError(e); }
            },
        },
    });
}

export function importarArchivo(file) {
    const lector = new FileReader();
    lector.onload = () => {
        let d;
        try { d = JSON.parse(lector.result); } catch { d = null; }
        if (!d || typeof d !== 'object' || !['materias', 'clases', 'tareas', 'anotaciones'].some(k => Array.isArray(d[k]))) {
            toast({ type: 'error', title: 'Archivo no válido', msg: 'Selecciona un respaldo .json exportado desde EduGestor.' });
            return;
        }
        const n = (k) => (Array.isArray(d[k]) ? d[k].length : 0);
        confirmDialog({
            title: '¿Reemplazar el semestre activo?',
            desc: `El respaldo trae ${plural(n('materias'), 'materia', 'materias')}, ${plural(n('clases'), 'clase', 'clases')}, ${plural(n('tareas'), 'tarea', 'tareas')} y ${plural(n('anotaciones'), 'nota', 'notas')}. Lo que hay ahora en «${db.semestre?.nombre || 'este semestre'}» se reemplazará.`,
            confirm: 'Importar',
            danger: false,
            onConfirm: () => reemplazarSemestre(d, { titulo: 'Respaldo importado' }),
        });
    };
    lector.readAsText(file);
}

export async function cargarDemo() {
    const { construirDemo } = await import('./datos-ejemplo.js');
    const aplicar = () => reemplazarSemestre(construirDemo(new Date()), { titulo: 'Semestre de ejemplo cargado', msg: 'Ingeniería de Sistemas · UNAD. Explora y edita libremente.' });
    if (['materias', 'tareas', 'anotaciones'].some(k => db[k].length)) {
        confirmDialog({
            title: '¿Reemplazar con datos de ejemplo?',
            desc: `Se cargará un semestre ficticio de la UNAD en «${db.semestre?.nombre}» y se reemplazará lo que tiene ahora. Podrás deshacerlo durante unos segundos.`,
            confirm: 'Cargar ejemplo', danger: false, onConfirm: aplicar,
        });
    } else {
        try { await aplicar(); } catch (e) { toastError(e); }
    }
}

export function borrarSemestre() {
    const total = ['materias', 'tareas', 'anotaciones', 'flashcards'].reduce((s, k) => s + db[k].length, 0);
    confirmDialog({
        title: `¿Vaciar «${db.semestre?.nombre}»?`,
        desc: `Se eliminarán ${plural(total, 'registro', 'registros')} de este semestre (materias con sus clases, calificaciones y archivos; tareas, notas y tarjetas). Podrás deshacerlo durante unos segundos, salvo los archivos.`,
        confirm: 'Vaciar semestre',
        onConfirm: () => reemplazarSemestre({ materias: [], clases: [], tareas: [], anotaciones: [] }, { titulo: 'Semestre vaciado' }),
    });
}

/** Tareas de hoy y vencidas (para el resumen del día). */
export const urgentes = () => pendingTasks().filter(t => daysUntil(t.fecha) <= 0);
