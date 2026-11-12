/* Paleta de comandos (Ctrl/⌘ K): buscar en todo y ejecutar acciones. */
import { $, $$, esc, norm } from './util.js';
import { icon } from './iconos.js';
import { db, app, P, mc, materiaName, dueLabel, fmtRange, sortTasks } from './estado.js';
import { showDialog, closeDialog } from './ui.js';
import { RUTAS } from './rutas.js';
import { openTareaForm, openClaseForm, openMateriaForm, openNotaForm, openEvaluacionForm, openTarjetaForm } from './formularios.js';
import { exportarRespaldo, cargarDemo } from './datos.js';

let items = [];
let indice = 0;
let acciones = {};

/** main.js inyecta acciones que dependen de él (tema, importar…). */
export const setAccionesPaleta = (a) => { acciones = a; };

function fuente() {
    const ir = (r) => () => { location.hash = `#/${r}`; };
    const base = [
        { g: 'Acciones', l: 'Nueva tarea', ic: 'plus', kbd: 'N', run: () => openTareaForm() },
        { g: 'Acciones', l: 'Nuevo examen', ic: 'target', run: () => openTareaForm(null, { tipo: 'examen' }) },
        { g: 'Acciones', l: 'Nueva clase', ic: 'plus', run: () => openClaseForm() },
        { g: 'Acciones', l: 'Nueva materia', ic: 'plus', run: () => openMateriaForm() },
        { g: 'Acciones', l: 'Nueva nota', ic: 'plus', run: () => openNotaForm() },
        { g: 'Acciones', l: 'Registrar calificación', ic: 'award', run: () => openEvaluacionForm() },
        { g: 'Acciones', l: 'Nueva tarjeta de repaso', ic: 'layers', run: () => openTarjetaForm() },
        { g: 'Acciones', l: 'Empezar a estudiar (Pomodoro)', ic: 'timer', run: ir('enfoque') },
        { g: 'Acciones', l: `Agregar ${P().uno} cursado (récord de notas)`, ic: 'history', run: () => import('./vistas/historial.js').then(m => m.openRecordForm()) },
        { g: 'Acciones', l: 'Cambiar tema claro/oscuro', ic: 'sun', run: () => acciones.tema?.() },
        { g: 'Acciones', l: 'Exportar respaldo', ic: 'download', run: exportarRespaldo },
        { g: 'Acciones', l: 'Importar respaldo', ic: 'upload', run: () => acciones.importar?.() },
        { g: 'Acciones', l: 'Cargar datos de ejemplo (UNAD)', ic: 'sparkles', run: cargarDemo },
    ];
    if (app.ia) base.push({ g: 'Acciones', l: 'Plan de estudio con IA', ic: 'sparkles', run: ir('asistente') });
    const nav = Object.entries(RUTAS).filter(([, v]) => !v.oculta).map(([r, v]) => ({ g: 'Ir a', l: v.titulo, ic: v.icono, run: ir(r) }));
    const datos = [
        ...db.materias.map(m => ({ g: 'Materias', l: m.nombre, s: m.profesor || 'Materia', dot: m.id, run: () => { location.hash = `#/materias/${m.id}`; } })),
        ...sortTasks(db.tareas).map(t => ({ g: t.tipo === 'examen' ? 'Exámenes' : 'Tareas', l: t.descripcion, s: `${materiaName(t.materiaId)} · ${dueLabel(t).text}${t.completada ? ' · completada' : ''}`, dot: t.materiaId, run: () => openTareaForm(t) })),
        ...db.clases.map(c => ({ g: 'Clases', l: materiaName(c.materiaId), s: `${c.dia} · ${fmtRange(c)}${c.aula ? ' · ' + c.aula : ''}`, dot: c.materiaId, run: () => openClaseForm(c) })),
        ...db.anotaciones.map(n => ({ g: 'Notas', l: n.titulo, s: n.contenido.slice(0, 80), dot: n.materiaId, h: n.contenido, run: () => openNotaForm(n) })),
        ...db.archivos.map(a => ({ g: 'Archivos', l: a.nombre, s: materiaName(a.materiaId), dot: a.materiaId, run: () => { location.hash = `#/materias/${a.materiaId}`; } })),
    ];
    return { base, nav, datos };
}

function resaltar(texto, q) {
    if (!q) return esc(texto);
    const i = norm(texto).indexOf(q);
    if (i < 0) return esc(texto);
    return esc(texto.slice(0, i)) + '<mark>' + esc(texto.slice(i, i + q.length)) + '</mark>' + esc(texto.slice(i + q.length));
}

function pintar() {
    const input = $('#palInput'), lista = $('#palList');
    const crudo = input.value.trim();
    const q = norm(crudo);
    const { base, nav, datos } = fuente();
    if (!q) items = [...base.slice(0, 6), ...nav];
    else {
        const t = q.split(/\s+/);
        const ok = (it) => { const h = norm(`${it.l} ${it.s || ''} ${it.h || ''} ${it.g}`); return t.every(x => h.includes(x)); };
        items = [...datos.filter(ok), ...base.filter(ok), ...nav.filter(ok)].slice(0, 40);
    }
    indice = Math.min(indice, Math.max(0, items.length - 1));
    if (!items.length) { lista.innerHTML = `<li class="pal-empty">Sin resultados para «${esc(crudo)}»</li>`; input.removeAttribute('aria-activedescendant'); return; }
    let html = '', g = '';
    items.forEach((it, i) => {
        if (it.g !== g) { g = it.g; html += `<li class="pal-group" role="presentation">${esc(g)}</li>`; }
        html += `<li class="pal-item" role="option" id="pal-${i}" data-index="${i}" aria-selected="${i === indice}">
            ${it.dot !== undefined ? `<i class="dot" style="${mc(it.dot)}"></i>` : icon(it.ic || 'arrow')}
            <span class="pal-item-text"><strong>${resaltar(it.l, q.split(/\s+/)[0])}</strong>${it.s ? `<small>${esc(it.s)}</small>` : ''}</span>
            ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}
        </li>`;
    });
    lista.innerHTML = html;
    input.setAttribute('aria-activedescendant', `pal-${indice}`);
}

function mover(d) {
    if (!items.length) return;
    indice = (indice + d + items.length) % items.length;
    $$('.pal-item').forEach(li => li.setAttribute('aria-selected', String(Number(li.dataset.index) === indice)));
    $('#palInput').setAttribute('aria-activedescendant', `pal-${indice}`);
    $(`#pal-${indice}`)?.scrollIntoView({ block: 'nearest' });
}

function ejecutar(i) {
    const it = items[i];
    if (!it) return;
    closeDialog($('#palette'));
    setTimeout(it.run, 180);
}

export function abrirPaleta() {
    const dlg = $('#palette');
    if (dlg.open) { closeDialog(dlg); return; }
    $('#palInput').value = '';
    indice = 0;
    pintar();
    showDialog(dlg);
    $('#palInput').focus();
}

export function prepararPaleta() {
    const input = $('#palInput'), lista = $('#palList');
    input.addEventListener('input', () => { indice = 0; pintar(); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); ejecutar(indice); }
    });
    lista.addEventListener('click', (e) => { const li = e.target.closest('.pal-item'); if (li) ejecutar(Number(li.dataset.index)); });
    lista.addEventListener('mousemove', (e) => { const li = e.target.closest('.pal-item'); if (li && Number(li.dataset.index) !== indice) mover(Number(li.dataset.index) - indice); });
}
