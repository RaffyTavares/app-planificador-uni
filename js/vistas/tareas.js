/* Vista: Tareas y exámenes. */
import { $, esc, norm, plural, daysUntil, toISO, addDays, reducedMotion } from '../util.js';
import { icon } from '../iconos.js';
import { db, ui, materiaName, sortTasks, bucketOf, BUCKETS, pendingTasks, overdueCount, PRIO_LABEL, reemplazar } from '../estado.js';
import { emptyState, pageHead, toast, toastError, render } from '../ui.js';
import { taskRow, materiaOptions, filtroMateria } from '../componentes.js';
import { accion } from '../acciones.js';
import { crear } from '../datos.js';

const FILTROS = [
    { id: 'pendientes', label: 'Pendientes', test: t => !t.completada },
    { id: 'hoy', label: 'Hoy', test: t => !t.completada && daysUntil(t.fecha) <= 0 },
    { id: 'semana', label: 'Esta semana', test: t => !t.completada && daysUntil(t.fecha) <= 7 },
    { id: 'examenes', label: 'Exámenes', test: t => t.tipo === 'examen' && !t.completada },
    { id: 'vencidas', label: 'Vencidas', test: t => !t.completada && daysUntil(t.fecha) < 0 },
    { id: 'completadas', label: 'Completadas', test: t => t.completada },
    { id: 'todas', label: 'Todas', test: () => true },
];

export default {
    titulo: 'Tareas',
    render: renderTareas,
    parcial: { taskQuery: () => ['#taskList', listaHTML], taskMateria: () => ['#taskList', listaHTML] },
};

function renderTareas() {
    const pend = pendingTasks().length;
    const venc = overdueCount();
    const manana = toISO(addDays(new Date(), 1));
    return pageHead({
        eyebrow: 'Tareas y exámenes',
        title: 'Lo que tienes <em>por entregar</em>',
        lead: `${plural(pend, 'pendiente', 'pendientes')}${venc ? ` · <span class="tone-danger-text">${plural(venc, 'vencida', 'vencidas')}</span>` : ''}`,
        actions: `<button class="btn btn-ghost" type="button" data-action="new" data-type="examen">${icon('target')}Examen</button>
            <button class="btn btn-primary" type="button" data-action="new" data-type="tarea">${icon('plus')}Tarea detallada</button>`,
    }) + `
    <form class="quick-add rise" style="--i:1" id="quickTask" autocomplete="off" aria-label="Agregar tarea rápida">
        <label class="qa-main">${icon('plus')}<span class="sr-only">Descripción</span>
            <input class="input" name="descripcion" required maxlength="255" placeholder="Agrega una tarea y pulsa Enter…">
        </label>
        <label><span class="sr-only">Materia</span><select class="select" name="materiaId">${materiaOptions(ui.taskMateria && ui.taskMateria !== 'general' ? ui.taskMateria : ui.qa.materiaId)}</select></label>
        <label><span class="sr-only">Fecha de entrega</span><input class="input" type="date" name="fecha" required value="${ui.qa.fecha || manana}"></label>
        <label><span class="sr-only">Prioridad</span><select class="select" name="prioridad">
            ${['alta', 'media', 'baja'].map(p => `<option value="${p}" ${ui.qa.prioridad === p ? 'selected' : ''}>${PRIO_LABEL[p]}</option>`).join('')}
        </select></label>
        <button class="btn btn-primary" type="submit">Agregar</button>
    </form>

    <div class="toolbar rise" style="--i:2">
        <div class="chips" role="group" aria-label="Filtrar tareas">
            ${FILTROS.map(f => {
                const n = db.tareas.filter(f.test).length;
                return `<button class="chip" type="button" aria-pressed="${ui.taskFilter === f.id}" data-action="task-filter" data-filter="${f.id}">${f.label}<span class="n ${f.id === 'vencidas' && n ? 'tone-danger' : ''}">${n}</span></button>`;
            }).join('')}
        </div>
        <div class="toolbar-right">
            <label class="search">${icon('search')}<span class="sr-only">Buscar tareas</span>
                <input class="input sm" type="search" placeholder="Buscar tareas…" data-bind="taskQuery" value="${esc(ui.taskQuery)}">
            </label>
            ${filtroMateria('taskMateria', ui.taskMateria)}
        </div>
    </div>
    <div id="taskList" class="rise" style="--i:3">${listaHTML()}</div>`;
}

function listaHTML() {
    const f = FILTROS.find(x => x.id === ui.taskFilter) || FILTROS[0];
    const q = norm(ui.taskQuery.trim());
    let lista = db.tareas.filter(f.test);
    if (ui.taskMateria === 'general') lista = lista.filter(t => t.materiaId == null);
    else if (ui.taskMateria) lista = lista.filter(t => String(t.materiaId) === ui.taskMateria);
    if (q) lista = lista.filter(t => norm(`${t.descripcion} ${materiaName(t.materiaId)} ${(t.subtareas || []).map(s => s.texto).join(' ')}`).includes(q));
    lista = sortTasks(lista);

    if (!db.tareas.length) return `<section class="panel">${emptyState({ ic: 'tasks', size: 'lg', title: 'Aún no tienes tareas', text: 'Escribe arriba tu primera entrega y pulsa Enter. Así de rápido.' })}</section>`;
    if (!lista.length) {
        const filtrando = q || ui.taskMateria;
        const textos = {
            hoy: ['Nada para hoy', 'No tienes entregas para hoy. Respira.'],
            vencidas: ['Sin tareas vencidas', 'Vas al día con todas tus entregas.'],
            examenes: ['Sin exámenes próximos', 'Agrega tus parciales para ver la cuenta regresiva.'],
            completadas: ['Aún no completas tareas', 'Marca una tarea con el círculo para verla aquí.'],
        };
        const [t, x] = filtrando ? ['Sin resultados', 'Ninguna tarea coincide con la búsqueda o el filtro.'] : (textos[f.id] || ['Todo al día', 'No hay tareas pendientes en esta vista.']);
        return `<section class="panel">${emptyState({ ic: filtrando ? 'search' : 'checkCircle', title: t, text: x, action: filtrando ? '<button class="btn btn-ghost btn-sm" type="button" data-action="clear-task-filters">Quitar filtros</button>' : '' })}</section>`;
    }
    if (f.id === 'pendientes' || f.id === 'todas') {
        const grupos = {};
        lista.forEach(t => { (grupos[bucketOf(t)] ||= []).push(t); });
        return `<section class="panel">${Object.keys(BUCKETS).filter(k => grupos[k]).map(k => `<div class="task-group">
            <h2 class="group-title tone-${BUCKETS[k].tone}"><span>${BUCKETS[k].label}</span><span class="count">${grupos[k].length}</span></h2>
            <ul class="task-list">${grupos[k].map(t => taskRow(t)).join('')}</ul>
        </div>`).join('')}</section>`;
    }
    return `<section class="panel"><ul class="task-list">${lista.map(t => taskRow(t)).join('')}</ul></section>`;
}

accion({
    'task-filter': (el) => { ui.taskFilter = el.dataset.filter; render(); },
    'clear-task-filters': () => { ui.taskQuery = ''; ui.taskMateria = ''; render(); },
});

/** Envío del formulario de tarea rápida. */
export async function enviarRapida(form) {
    const descripcion = form.elements.descripcion.value.trim();
    if (!descripcion) { form.elements.descripcion.focus(); return; }
    if (!form.elements.fecha.value) { form.elements.fecha.focus(); return; }
    const btn = $('[type="submit"]', form);
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
        const materiaId = form.elements.materiaId.value ? Number(form.elements.materiaId.value) : null;
        ui.qa = { materiaId: form.elements.materiaId.value, fecha: form.elements.fecha.value, prioridad: form.elements.prioridad.value };
        if (ui.taskFilter === 'completadas' || ui.taskFilter === 'vencidas') ui.taskFilter = 'pendientes';
        const t = await crear('tarea', { descripcion, materiaId, fecha: ui.qa.fecha, prioridad: ui.qa.prioridad });
        $('#quickTask [name="descripcion"]')?.focus();
        const fila = $(`[data-task="${t.id}"]`);
        if (fila && !reducedMotion()) fila.animate([{ background: 'var(--accent-soft)' }, { background: 'transparent' }], { duration: 1400, easing: 'ease-out' });
        toast({ type: 'success', title: 'Tarea agregada', msg: descripcion });
    } catch (e) { toastError(e); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}

