/* Piezas de interfaz reutilizadas por varias vistas. */
import { esc, fmtDuration, toMin, nowMin, fmtBytes, fmtRelativo, fmtNota, hoyISO, DIAS } from './util.js';
import { icon, iconoArchivo } from './iconos.js';
import {
    db, mc, materiaName, classStatus, durOf, dueLabel, PRIO_LABEL, REC_LABEL, archivosDeTarea, marcaAsistencia,
} from './estado.js';
import { urlArchivo } from './api.js';

/* ---------- Tareas ---------- */
export function taskRow(t, { compact = false } = {}) {
    const due = dueLabel(t);
    const prio = PRIO_LABEL[t.prioridad] ? t.prioridad : 'media';
    const subs = t.subtareas || [];
    const hechas = subs.filter(s => s.hecha).length;
    const adj = archivosDeTarea(t.id).length;
    const examen = t.tipo === 'examen';
    return `<li class="task ${t.completada ? 'is-done' : ''} ${examen ? 'is-exam' : ''}" data-task="${t.id}" style="${mc(t.materiaId)}">
        <button class="check" type="button" data-action="toggle-task" data-id="${t.id}" aria-pressed="${!!t.completada}"
            aria-label="${t.completada ? 'Marcar como pendiente' : 'Marcar como completada'}: ${esc(t.descripcion)}">${icon('check')}</button>
        <div class="task-body">
            <p class="task-title">${examen ? `<span class="badge-exam">${icon('target')}Examen</span>` : ''}${esc(t.descripcion)}</p>
            <div class="task-meta">
                <span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(t.materiaId, t.materiaNombre))}</span></span>
                <span class="due tone-${due.tone}">${icon('clock')}${esc(due.text)}</span>
                ${t.completada ? '' : `<span class="prio prio-${prio}">${icon('flag')}${PRIO_LABEL[prio]}</span>`}
                ${subs.length ? `<span class="meta-chip ${hechas === subs.length ? 'is-full' : ''}" title="Subtareas">${icon('tasks')}${hechas}/${subs.length}</span>` : ''}
                ${t.recurrencia ? `<span class="meta-chip" title="${REC_LABEL[t.recurrencia]}">${icon('repeat')}${REC_LABEL[t.recurrencia]}</span>` : ''}
                ${adj ? `<span class="meta-chip" title="Archivos adjuntos">${icon('paperclip')}${adj}</span>` : ''}
            </div>
            ${!compact && subs.length && !t.completada ? `<ul class="subtasks">${subs.map(s => `
                <li><button type="button" class="subtask ${s.hecha ? 'is-done' : ''}" data-action="toggle-sub" data-id="${t.id}" data-sub="${s.id}" aria-pressed="${s.hecha}">
                    <span class="mini-check">${icon('check')}</span><span>${esc(s.texto)}</span></button></li>`).join('')}
            </ul>` : ''}
        </div>
        ${compact ? '' : `<div class="row-actions">
            ${examen && !t.completada ? `<button class="icon-btn sm" type="button" data-action="plan-repaso" data-id="${t.id}" aria-label="Crear plan de repaso" title="Crear plan de repaso">${icon('layers')}</button>` : ''}
            <button class="icon-btn sm" type="button" data-action="edit" data-type="tarea" data-id="${t.id}" aria-label="Editar tarea">${icon('pencil')}</button>
            <button class="icon-btn sm danger" type="button" data-action="delete" data-type="tarea" data-id="${t.id}" aria-label="Eliminar tarea">${icon('trash')}</button>
        </div>`}
    </li>`;
}

/* ---------- Agenda (con asistencia rápida) ---------- */
const ASIS = [
    ['presente', 'check', 'Presente'],
    ['tarde', 'clock', 'Tarde'],
    ['ausente', 'x', 'Ausente'],
];

export function botonesAsistencia(c, fecha) {
    const marca = marcaAsistencia(c.id, fecha);
    return `<div class="att" role="group" aria-label="Asistencia">
        ${ASIS.map(([estado, ic, label]) => `<button type="button" class="att-btn att-${estado}" data-action="asistencia" data-clase="${c.id}" data-fecha="${fecha}" data-estado="${estado}"
            aria-pressed="${marca?.estado === estado}" title="${label}" aria-label="${label}">${icon(ic)}</button>`).join('')}
    </div>`;
}

export function agendaItem(c, dayIdx, { showStatus = true, asistencia = false } = {}) {
    const st = classStatus(c, dayIdx);
    const pill = !showStatus ? '' :
        st === 'live' ? '<span class="pill tone-live">En curso</span>' :
        st === 'past' ? '<span class="pill tone-muted">Terminó</span>' :
        st === 'next' ? `<span class="pill">${esc(fmtDuration(toMin(c.hora) - nowMin()))}</span>` : '';
    const nombre = esc(materiaName(c.materiaId, c.materiaNombre));
    const marcar = asistencia && (st === 'live' || st === 'past');
    return `<li class="agenda-item ${st === 'live' ? 'is-live' : ''} ${st === 'past' && !marcar ? 'is-past' : ''}" style="${mc(c.materiaId)}">
        <span class="agenda-time">${fmtTime12(c.hora)}</span>
        <span class="agenda-rail"><i class="dot"></i></span>
        <button type="button" class="agenda-body" data-action="edit" data-type="clase" data-id="${c.id}" aria-label="Editar clase de ${nombre}">
            <h4>${nombre}</h4>
            <p>${fmtDuration(durOf(c))}${c.aula ? ` · ${esc(c.aula)}` : ''}</p>
        </button>
        ${marcar ? botonesAsistencia(c, hoyISO()) : pill}
    </li>`;
}

function fmtTime12(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/* ---------- Selects ---------- */
export function materiaOptions(selected, { general = true, placeholder = '' } = {}) {
    let html = '';
    if (placeholder) html += `<option value="">${placeholder}</option>`;
    if (general) html += '<option value="">General</option>';
    html += db.materias.map(m => `<option value="${m.id}" ${String(m.id) === String(selected ?? '') ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('');
    return html;
}

export function filtroMateria(bind, valor, etiqueta = 'Todas las materias') {
    return `<label><span class="sr-only">Filtrar por materia</span>
        <select class="select sm" data-bind="${bind}">
            <option value="">${etiqueta}</option>
            <option value="general" ${valor === 'general' ? 'selected' : ''}>General</option>
            ${db.materias.map(m => `<option value="${m.id}" ${String(m.id) === valor ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
        </select></label>`;
}

/* ---------- Archivos ---------- */
export const CATEGORIAS = {
    tarea: { label: 'Tareas', singular: 'Tarea entregada', ic: 'tasks' },
    material: { label: 'Material de apoyo', singular: 'Material de apoyo', ic: 'book' },
    documento: { label: 'Documentos', singular: 'Documento', ic: 'fileText' },
    otro: { label: 'Otros', singular: 'Otro', ic: 'file' },
};

export const visibleEnLinea = (mime) => /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain|audio\/|video\/(mp4|webm|quicktime))/.test(mime || '');

export function archivoRow(a, { mostrarMateria = false } = {}) {
    const tarea = a.tareaId ? db.tareas.find(t => t.id === a.tareaId) : null;
    return `<li class="file-row" style="${mc(a.materiaId)}">
        <span class="file-ic">${icon(iconoArchivo(a.nombre, a.mime))}</span>
        <div class="file-info">
            <a class="file-name" href="${urlArchivo(a.id, visibleEnLinea(a.mime))}" target="_blank" rel="noopener">${esc(a.nombre)}</a>
            <p class="file-meta">
                <span>${fmtBytes(a.tamano)}</span>
                <span>${fmtRelativo(a.creadoEn)}</span>
                <span>${CATEGORIAS[a.categoria]?.singular || 'Documento'}</span>
                ${mostrarMateria ? `<span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(a.materiaId))}</span></span>` : ''}
                ${tarea ? `<span class="meta-chip">${icon('paperclip')}${esc(tarea.descripcion)}</span>` : ''}
            </p>
        </div>
        <div class="row-actions">
            <a class="icon-btn sm" href="${urlArchivo(a.id)}" download aria-label="Descargar ${esc(a.nombre)}" title="Descargar">${icon('download')}</a>
            <button class="icon-btn sm" type="button" data-action="share" data-tipo="archivo" data-id="${a.id}" aria-label="Compartir en un grupo" title="Compartir en un grupo">${icon('share')}</button>
            <button class="icon-btn sm" type="button" data-action="edit" data-type="archivo" data-id="${a.id}" aria-label="Editar" title="Cambiar nombre o categoría">${icon('pencil')}</button>
            <button class="icon-btn sm danger" type="button" data-action="delete" data-type="archivo" data-id="${a.id}" aria-label="Eliminar ${esc(a.nombre)}">${icon('trash')}</button>
        </div>
    </li>`;
}

export function zonaSubida({ materiaId, tareaId = '', texto = 'Arrastra archivos aquí o haz clic para elegirlos' }) {
    return `<label class="dropzone" data-dropzone data-materia="${materiaId}" data-tarea="${tareaId}">
        <input type="file" multiple class="sr-only" data-subir>
        <span class="dropzone-ic">${icon('upload')}</span>
        <strong>${texto}</strong>
        <span class="dropzone-hint">PDF, Word, Excel, PowerPoint, imágenes, código o comprimidos · hasta ${Math.round((window.__maxSubida || 25 * 1048576) / 1048576)} MB por archivo</span>
        <div class="upload-progress" hidden></div>
    </label>`;
}

/* ---------- Calificaciones ---------- */
export function notaChip(final, letra) {
    if (final == null) return '<span class="grade-chip is-empty">—</span>';
    return `<span class="grade-chip grade-${(letra?.letra || 'F').charAt(0).toLowerCase()}" title="${fmtNota(final)} / 100">${esc(letra?.letra || '')}<small>${fmtNota(final, 0)}</small></span>`;
}

export const nombreDia = (fecha) => DIAS[new Date(fecha + 'T12:00').getDay()];
