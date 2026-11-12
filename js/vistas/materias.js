/* Vista: Materias (lista) y detalle de una materia (archivos, notas, asistencia…). */
import { $, $$, esc, plural, fmtHours, fmtBytes, fmtNota, fmtDate, fmtDuration, fmtCorto, DIAS } from '../util.js';
import { icon } from '../iconos.js';
import {
    db, ui, app, mc, materiaById, durOf, fmtRange, notaMateria, asistenciaMateria, fechasDeClase, marcaAsistencia,
    sortTasks, letraDe, minutosSemanaPorMateria,
} from '../estado.js';
import { emptyState, newBtn, pageHead, render } from '../ui.js';
import { taskRow, archivoRow, zonaSubida, CATEGORIAS, notaChip, botonesAsistencia } from '../componentes.js';
import { accion } from '../acciones.js';
import { subirArchivos } from '../datos.js';
import { tablaEvaluaciones, calculadora } from './calificaciones.js';

export default {
    titulo: 'Materias',
    render: () => (ui.param ? detalle(Number(ui.param)) : lista()),
    alMontar: prepararSubidas,
};

/* =====================================================================
   LISTA
   ===================================================================== */
function lista() {
    const creditos = db.materias.reduce((s, m) => s + (Number(m.creditos) || 0), 0);
    const head = pageHead({
        eyebrow: 'Materias del semestre',
        title: 'Tus materias, <em>en orden</em>',
        lead: `${plural(db.materias.length, 'materia', 'materias')}${creditos ? ` · ${creditos} créditos` : ''}`,
        actions: newBtn('materia', 'Materia'),
    });
    if (!db.materias.length) {
        return head + `<section class="panel rise" style="--i:1">${emptyState({
            ic: 'book', size: 'lg', title: 'Aún no tienes materias',
            text: 'Las materias agrupan tus clases, tareas, notas, calificaciones y archivos.',
            action: `${newBtn('materia', 'Agregar primera materia')}<button class="btn btn-ghost" type="button" data-action="demo">${icon('sparkles')}Ver datos de ejemplo</button>`,
        })}</section>`;
    }
    return head + `<div class="mat-grid">${db.materias.map((m, i) => {
        const cls = db.clases.filter(c => c.materiaId === m.id);
        const tk = db.tareas.filter(t => t.materiaId === m.id);
        const hechas = tk.filter(t => t.completada).length;
        const n = notaMateria(m.id);
        const as = asistenciaMateria(m.id);
        const arch = db.archivos.filter(a => a.materiaId === m.id).length;
        return `<article class="mat-card rise" style="--i:${Math.min(i + 1, 10)};${mc(m.id)}">
            <div class="mat-top">
                <span class="mat-swatch">${icon('book')}</span>
                ${notaChip(n.final, n.letra)}
            </div>
            <div>
                <h2 class="mat-name"><a href="#/materias/${m.id}">${esc(m.nombre)}</a></h2>
                <p class="mat-prof">${icon('user')}${m.profesor ? esc(m.profesor) : '<span class="muted">Profesor sin asignar</span>'}</p>
            </div>
            <dl class="mat-stats">
                <div><dt>Créditos</dt><dd>${m.creditos ?? '—'}</dd></div>
                <div><dt>Horas/sem</dt><dd>${fmtHours(cls.reduce((s, c) => s + durOf(c), 0))}</dd></div>
                <div><dt>Asistencia</dt><dd class="${as.riesgo ? 'tone-danger-text' : ''}">${as.porcentaje == null ? '—' : as.porcentaje + '%'}</dd></div>
            </dl>
            <div class="mat-progress">
                <div class="mat-progress-label"><span>Tareas completadas</span><span class="mono">${hechas}/${tk.length}</span></div>
                <div class="bar"><span style="width:${tk.length ? Math.round((hechas / tk.length) * 100) : 0}%"></span></div>
            </div>
            <div class="mat-foot">
                <a class="link-btn" href="#/materias/${m.id}">Abrir ${icon('arrow')}</a>
                <span>${icon('paperclip')}${arch}</span>
            </div>
        </article>`;
    }).join('')}
        <button class="mat-card mat-add rise" style="--i:${Math.min(db.materias.length + 1, 10)}" type="button" data-action="new" data-type="materia">
            <span class="mat-swatch">${icon('plus')}</span><strong>Nueva materia</strong><p>Agrega otra asignatura a tu semestre</p>
        </button>
    </div>`;
}

/* =====================================================================
   DETALLE
   ===================================================================== */
const TABS = [
    ['resumen', 'Resumen', 'grid'],
    ['archivos', 'Archivos', 'paperclip'],
    ['calificaciones', 'Calificaciones', 'award'],
    ['asistencia', 'Asistencia', 'checkCircle'],
    ['notas', 'Notas', 'note'],
];

function detalle(id) {
    const m = db.materias.find(x => x.id === id);
    if (!m) return emptyState({ ic: 'book', size: 'lg', title: 'Esta materia no existe', text: 'Puede que la hayas eliminado o pertenezca a otro semestre.', action: '<a class="btn btn-primary" href="#/materias">Ver materias</a>' });
    const nArch = db.archivos.filter(a => a.materiaId === id).length;
    const nNotas = db.anotaciones.filter(a => a.materiaId === id).length;
    const cuenta = { archivos: nArch, notas: nNotas, calificaciones: db.evaluaciones.filter(e => e.materiaId === id).length };
    const tab = TABS.some(t => t[0] === ui.materiaTab) ? ui.materiaTab : 'resumen';

    const contenido = { resumen, archivos, calificaciones: (m) => tablaEvaluaciones(m) + calculadora(m), asistencia, notas }[tab](m);

    return `<div class="detail" style="${mc(id)}">
        <a class="back-link rise" style="--i:0" href="#/materias">${icon('arrowLeft')}Materias</a>
        <header class="detail-head rise" style="--i:0">
            <span class="detail-swatch">${icon('book')}</span>
            <div class="detail-title">
                <h1 class="display">${esc(m.nombre)}</h1>
                <p class="lead">${[m.profesor && `${icon('user')}${esc(m.profesor)}`, m.creditos != null && `${m.creditos} créditos`].filter(Boolean).join(' · ') || 'Sin profesor ni créditos registrados'}</p>
            </div>
            <div class="page-actions">
                ${app.ia ? `<a class="btn btn-ghost" href="#/asistente?materia=${id}">${icon('sparkles')}Plan con IA</a>` : ''}
                <button class="btn btn-ghost" type="button" data-action="edit" data-type="materia" data-id="${id}">${icon('pencil')}Editar</button>
            </div>
        </header>
        <nav class="tabs rise" style="--i:1" role="tablist" aria-label="Secciones de la materia">
            ${TABS.map(([k, l, ic]) => `<button class="tab" type="button" role="tab" aria-selected="${tab === k}" data-action="materia-tab" data-tab="${k}">${icon(ic)}${l}${cuenta[k] ? `<span class="n">${cuenta[k]}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="tab-panel rise" style="--i:2" role="tabpanel">${contenido}</div>
    </div>`;
}

function resumen(m) {
    const n = notaMateria(m.id);
    const as = asistenciaMateria(m.id);
    const cls = db.clases.filter(c => c.materiaId === m.id).sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia));
    const pend = sortTasks(db.tareas.filter(t => t.materiaId === m.id && !t.completada)).slice(0, 5);
    const estudio = minutosSemanaPorMateria().find(x => x.materiaId === m.id)?.min || 0;
    const recientes = db.archivos.filter(a => a.materiaId === m.id).slice(0, 3);
    return `
    <div class="mini-stats four">
        <div class="mini-stat"><b>${n.final == null ? '—' : fmtNota(n.final)}</b><span>${n.final == null ? 'Sin calificaciones' : `${n.completa ? 'Nota final' : 'Promedio actual'} · ${esc(n.letra.letra)}`}</span></div>
        <div class="mini-stat"><b>${fmtNota(n.acumulado)}</b><span>Puntos acumulados de 100</span></div>
        <div class="mini-stat ${as.riesgo ? 'is-alert' : ''}"><b>${as.porcentaje == null ? '—' : as.porcentaje + '%'}</b><span>Asistencia${as.max != null ? ` · ${as.ausente}/${as.max} ausencias` : ''}</span></div>
        <div class="mini-stat"><b>${fmtCorto(estudio)}</b><span>Estudiado esta semana</span></div>
    </div>
    ${as.excedido ? `<p class="form-alert is-danger">${icon('alert')}<span>Superaste el máximo de ausencias permitidas (${as.max}). Habla con tu profesor.</span></p>`
        : as.riesgo ? `<p class="form-alert">${icon('alert')}<span>Te queda ${as.max - as.ausente <= 0 ? 'ninguna ausencia' : plural(as.max - as.ausente, 'ausencia', 'ausencias')} antes del límite.</span></p>` : ''}
    <div class="dash-grid">
        <section class="panel">
            <div class="panel-head"><h2>Pendientes</h2><button class="link-btn" type="button" data-action="new" data-type="tarea">${icon('plus')}Tarea</button></div>
            ${pend.length ? `<ul class="task-list">${pend.map(t => taskRow(t)).join('')}</ul>` : emptyState({ ic: 'checkCircle', title: 'Nada pendiente en esta materia' })}
        </section>
        <div class="dash-col">
            <section class="panel">
                <div class="panel-head"><h2>Horario</h2><button class="link-btn" type="button" data-action="new" data-type="clase">${icon('plus')}Clase</button></div>
                ${cls.length ? `<ul class="mini-classes">${cls.map(c => `<li><i class="dot"></i><span>${c.dia}</span><small>${fmtRange(c)}${c.aula ? ` · ${esc(c.aula)}` : ''}</small>
                    <button class="icon-btn sm" type="button" data-action="edit" data-type="clase" data-id="${c.id}" aria-label="Editar clase">${icon('pencil')}</button></li>`).join('')}</ul>`
                    : emptyState({ ic: 'calendar', title: 'Sin clases registradas' })}
            </section>
            <section class="panel">
                <div class="panel-head"><h2>Archivos recientes</h2><button class="link-btn" type="button" data-action="materia-tab" data-tab="archivos">Ver todos ${icon('arrow')}</button></div>
                ${recientes.length ? `<ul class="file-list compact">${recientes.map(a => archivoRow(a)).join('')}</ul>` : emptyState({ ic: 'paperclip', title: 'Sin archivos', text: 'Sube tus tareas, guías y documentos de esta materia.' })}
            </section>
        </div>
    </div>`;
}

function archivos(m) {
    const todos = db.archivos.filter(a => a.materiaId === m.id);
    const cat = ui.archivoCategoria;
    const lista = cat ? todos.filter(a => a.categoria === cat) : todos;
    const pct = db.cuotaAlmacenamiento ? Math.min(100, (db.usoAlmacenamiento / db.cuotaAlmacenamiento) * 100) : 0;
    return `
    ${zonaSubida({ materiaId: m.id })}
    <div class="toolbar">
        <div class="chips" role="group" aria-label="Categoría">
            <button class="chip" type="button" aria-pressed="${!cat}" data-action="archivo-cat" data-cat="">Todos<span class="n">${todos.length}</span></button>
            ${Object.entries(CATEGORIAS).map(([k, c]) => `<button class="chip" type="button" aria-pressed="${cat === k}" data-action="archivo-cat" data-cat="${k}">${icon(c.ic)}${c.label}<span class="n">${todos.filter(a => a.categoria === k).length}</span></button>`).join('')}
        </div>
        <label class="field inline-field"><span class="field-label">Subir como</span>
            <select class="select sm" id="subirCategoria">${Object.entries(CATEGORIAS).map(([k, c]) => `<option value="${k}" ${(cat || 'material') === k ? 'selected' : ''}>${c.singular}</option>`).join('')}</select>
        </label>
    </div>
    <section class="panel">
        ${lista.length ? `<ul class="file-list">${lista.map(a => archivoRow(a)).join('')}</ul>`
            : emptyState({ ic: 'paperclip', title: cat ? `Sin ${CATEGORIAS[cat].label.toLowerCase()}` : 'Aún no hay archivos', text: 'Arrastra archivos al recuadro de arriba para subirlos.' })}
    </section>
    <p class="storage-line">${icon('database')}<span>${fmtBytes(db.usoAlmacenamiento)} de ${fmtBytes(db.cuotaAlmacenamiento)} usados</span>
        <span class="bar storage-bar"><span style="width:${pct}%"></span></span></p>`;
}

function asistencia(m) {
    const as = asistenciaMateria(m.id);
    const cls = db.clases.filter(c => c.materiaId === m.id);
    if (!cls.length) return `<section class="panel">${emptyState({ ic: 'calendar', title: 'Sin clases registradas', text: 'Agrega el horario de esta materia para llevar tu asistencia.', action: newBtn('clase', 'Agregar clase', 'btn btn-ghost btn-sm') })}</section>`;
    const sesiones = cls.flatMap(c => fechasDeClase(c).map(f => ({ c, f }))).sort((a, b) => b.f.localeCompare(a.f));
    return `
    <div class="mini-stats four">
        <div class="mini-stat"><b>${as.porcentaje == null ? '—' : as.porcentaje + '%'}</b><span>Asistencia</span></div>
        <div class="mini-stat"><b>${as.presente}</b><span>Presente</span></div>
        <div class="mini-stat"><b>${as.tarde}</b><span>Tarde</span></div>
        <div class="mini-stat ${as.riesgo ? 'is-alert' : ''}"><b>${as.ausente}${as.max != null ? `<small>/${as.max}</small>` : ''}</b><span>Ausencias${as.max == null ? '' : ' permitidas'}</span></div>
    </div>
    ${as.max == null ? `<p class="hint-line">${icon('info')}Define las ausencias permitidas en <button class="link-btn" type="button" data-action="edit" data-type="materia" data-id="${m.id}">Editar materia</button> para recibir avisos.</p>` : ''}
    <section class="panel">
        <div class="panel-head"><h2>Clases impartidas</h2><span class="muted small">${plural(sesiones.length, 'sesión', 'sesiones')} · marca cada una</span></div>
        ${sesiones.length ? `<ul class="att-list">${sesiones.map(({ c, f }) => {
            const marca = marcaAsistencia(c.id, f);
            return `<li class="att-row ${marca ? `is-${marca.estado}` : ''}">
                <div><strong>${fmtDate(f, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><small>${fmtRange(c)}${c.aula ? ` · ${esc(c.aula)}` : ''}</small></div>
                ${botonesAsistencia(c, f)}
            </li>`;
        }).join('')}</ul>` : emptyState({ ic: 'calendar', title: 'Aún no hay clases pasadas' })}
    </section>`;
}

function notas(m) {
    const ns = db.anotaciones.filter(n => n.materiaId === m.id);
    return `<div class="panel-head"><span></span><button class="btn btn-primary btn-sm" type="button" data-action="new" data-type="nota">${icon('plus')}Nota</button></div>
    ${ns.length ? `<div class="notes">${ns.map(n => `<article class="note" style="${mc(n.materiaId)}">
        <div class="note-head"><span></span><div class="row-actions">
            <button class="icon-btn sm" type="button" data-action="edit" data-type="nota" data-id="${n.id}" aria-label="Editar nota">${icon('pencil')}</button>
            <button class="icon-btn sm danger" type="button" data-action="delete" data-type="nota" data-id="${n.id}" aria-label="Eliminar nota">${icon('trash')}</button>
        </div></div>
        <h3>${esc(n.titulo)}</h3><p class="note-body">${esc(n.contenido)}</p></article>`).join('')}</div>`
        : `<section class="panel">${emptyState({ ic: 'note', title: 'Sin notas en esta materia' })}</section>`}`;
}

/* =====================================================================
   SUBIDA DE ARCHIVOS (arrastrar y soltar con progreso)
   ===================================================================== */
function prepararSubidas(vista) {
    const zona = (el) => el.closest?.('[data-dropzone]');
    vista.addEventListener('dragover', (e) => { const z = zona(e.target); if (!z) return; e.preventDefault(); z.classList.add('is-over'); });
    vista.addEventListener('dragleave', (e) => { const z = zona(e.target); if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over'); });
    vista.addEventListener('drop', (e) => {
        const z = zona(e.target);
        if (!z) return;
        e.preventDefault();
        z.classList.remove('is-over');
        if (e.dataTransfer.files.length) subirEnZona(z, [...e.dataTransfer.files]);
    });
    vista.addEventListener('change', (e) => {
        if (!e.target.matches('[data-subir]')) return;
        const z = zona(e.target);
        if (e.target.files.length) subirEnZona(z, [...e.target.files]);
    });
}

async function subirEnZona(z, files) {
    const prog = $('.upload-progress', z);
    prog.hidden = false;
    prog.innerHTML = files.map((f, i) => `<div class="up-item" data-i="${i}"><span>${esc(f.name)}</span><span class="bar"><span style="width:0%"></span></span></div>`).join('');
    z.classList.add('is-uploading');
    const categoria = $('#subirCategoria')?.value || 'material';
    const ok = await subirArchivos(files, { materiaId: z.dataset.materia, categoria, tareaId: z.dataset.tarea || '' }, (i, p) => {
        const b = $(`.up-item[data-i="${i}"] .bar > span`, prog);
        if (b) b.style.width = `${Math.round(p * 100)}%`;
    });
    z.classList.remove('is-uploading');
    if (ok.length) {
        const { toast } = await import('../ui.js');
        toast({ type: 'success', title: ok.length === 1 ? 'Archivo subido' : `${ok.length} archivos subidos`, msg: ok.map(a => a.nombre).join(', ') });
    }
}

/* ---------- Acciones ---------- */
accion({
    'materia-tab': (el) => { ui.materiaTab = el.dataset.tab; render(); },
    'archivo-cat': (el) => { ui.archivoCategoria = el.dataset.cat; render(); },
});

