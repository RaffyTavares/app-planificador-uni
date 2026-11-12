/* Vista: Notas (anotaciones). */
import { esc, norm, plural, fmtRelativo } from '../util.js';
import { icon } from '../iconos.js';
import { db, ui, app, mc, materiaName } from '../estado.js';
import { emptyState, newBtn, pageHead } from '../ui.js';
import { filtroMateria } from '../componentes.js';
import { accion } from '../acciones.js';
import { render } from '../ui.js';
import { tarjetasDeNota } from '../formularios.js';

export default {
    titulo: 'Notas',
    render: renderNotas,
    parcial: { noteQuery: () => ['#noteList', listaHTML], noteMateria: () => ['#noteList', listaHTML] },
};

function renderNotas() {
    return pageHead({
        eyebrow: 'Anotaciones',
        title: 'Ideas que <em>no quieres olvidar</em>',
        lead: plural(db.anotaciones.length, 'nota guardada', 'notas guardadas'),
        actions: newBtn('nota', 'Nota'),
    }) + (db.anotaciones.length ? `
    <div class="toolbar rise" style="--i:1">
        <div class="toolbar-right grow">
            <label class="search grow">${icon('search')}<span class="sr-only">Buscar notas</span>
                <input class="input sm" type="search" placeholder="Buscar en títulos y contenido…" data-bind="noteQuery" value="${esc(ui.noteQuery)}">
            </label>
            ${filtroMateria('noteMateria', ui.noteMateria)}
        </div>
    </div>` : '') + `<div id="noteList" class="rise" style="--i:2">${listaHTML()}</div>`;
}

function listaHTML() {
    if (!db.anotaciones.length) {
        return `<section class="panel">${emptyState({ ic: 'note', size: 'lg', title: 'Tu libreta está vacía', text: 'Guarda fórmulas, ideas para un ensayo o lo que dijo el profe en clase.', action: newBtn('nota', 'Escribir primera nota') })}</section>`;
    }
    const q = norm(ui.noteQuery.trim());
    let lista = [...db.anotaciones].sort((a, b) => String(b.actualizadoEn || b.creadoEn).localeCompare(String(a.actualizadoEn || a.creadoEn)));
    if (ui.noteMateria === 'general') lista = lista.filter(n => n.materiaId == null);
    else if (ui.noteMateria) lista = lista.filter(n => String(n.materiaId) === ui.noteMateria);
    if (q) lista = lista.filter(n => norm(`${n.titulo} ${n.contenido}`).includes(q));
    if (!lista.length) {
        return `<section class="panel">${emptyState({ ic: 'search', title: 'Sin resultados', text: 'Ninguna nota coincide con tu búsqueda.', action: '<button class="btn btn-ghost btn-sm" type="button" data-action="clear-note-filters">Quitar filtros</button>' })}</section>`;
    }
    return `<div class="notes">${lista.map(n => {
        const tarjetas = tarjetasDeNota(n).length;
        return `<article class="note" style="${mc(n.materiaId)}">
            <div class="note-head">
                <span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(n.materiaId))}</span></span>
                <div class="row-actions">
                    <button class="icon-btn sm" type="button" data-action="share" data-tipo="nota" data-id="${n.id}" aria-label="Compartir en un grupo" title="Compartir">${icon('share')}</button>
                    <button class="icon-btn sm" type="button" data-action="edit" data-type="nota" data-id="${n.id}" aria-label="Editar nota">${icon('pencil')}</button>
                    <button class="icon-btn sm danger" type="button" data-action="delete" data-type="nota" data-id="${n.id}" aria-label="Eliminar nota">${icon('trash')}</button>
                </div>
            </div>
            <h3>${esc(n.titulo)}</h3>
            <p class="note-body">${esc(n.contenido)}</p>
            <div class="note-foot">
                <span class="note-date">${n.actualizadoEn ? 'Editada' : 'Creada'} ${fmtRelativo(n.actualizadoEn || n.creadoEn)}</span>
                <div class="note-tools">
                    ${tarjetas ? `<button class="chip-btn" type="button" data-action="nota-tarjetas" data-id="${n.id}" title="Crear tarjetas con las líneas «pregunta :: respuesta»">${icon('layers')}${plural(tarjetas, 'tarjeta', 'tarjetas')}</button>` : ''}
                    ${app.ia ? `<a class="chip-btn" href="#/asistente?nota=${n.id}" title="Resumir o crear tarjetas con IA">${icon('sparkles')}IA</a>` : ''}
                </div>
            </div>
        </article>`;
    }).join('')}</div>`;
}

accion({
    'clear-note-filters': () => { ui.noteQuery = ''; ui.noteMateria = ''; render(); },
});
