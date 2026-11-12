/* Vista: Repaso — tarjetas con repetición espaciada (SM-2). */
import { $, esc, norm, plural, hoyISO, fmtDate, daysUntil } from '../util.js';
import { icon } from '../iconos.js';
import { db, app, ui, mc, materiaName, tarjetasPendientes, reemplazar } from '../estado.js';
import { pageHead, emptyState, render, toast, toastError, newBtn } from '../ui.js';
import { accion, idDe } from '../acciones.js';
import { api } from '../api.js';
import { openTarjetaForm, tarjetasDeNota } from '../formularios.js';

/** Sesión de repaso en curso (solo en memoria). */
const sesion = { cola: [], i: 0, volteada: false, hechas: 0, activa: false };

export default {
    titulo: 'Repaso',
    render: () => (sesion.activa ? estudiar() : resumen()),
    parcial: { cardQuery: () => ['#cardList', listaTarjetas] },
};

function resumen() {
    const pend = tarjetasPendientes();
    const porMateria = new Map();
    db.flashcards.forEach(f => {
        const k = f.materiaId ?? 0;
        const o = porMateria.get(k) || { total: 0, pend: 0 };
        o.total++;
        if (f.proxima <= hoyISO()) o.pend++;
        porMateria.set(k, o);
    });
    const notasConTarjetas = db.anotaciones.filter(n => tarjetasDeNota(n).length);

    return pageHead({
        eyebrow: 'Repaso espaciado',
        title: 'Recuerda más, <em>estudiando menos</em>',
        lead: 'Cada tarjeta vuelve justo antes de que la olvides: las fáciles se espacian, las difíciles regresan pronto.',
        actions: `${newBtn('flashcard', 'Tarjeta', 'btn btn-ghost')}${pend.length ? `<button class="btn btn-primary" type="button" data-action="repaso-empezar">${icon('play')}Repasar ${pend.length}</button>` : ''}`,
    }) + `
    ${db.flashcards.length ? `
    <section class="decks rise" style="--i:1">
        <button class="deck deck-all" type="button" data-action="repaso-empezar" ${pend.length ? '' : 'disabled'}>
            <span class="deck-ic">${icon('layers')}</span>
            <strong>${pend.length ? plural(pend.length, 'tarjeta pendiente', 'tarjetas pendientes') : '¡Al día!'}</strong>
            <small>${plural(db.flashcards.length, 'tarjeta', 'tarjetas')} en total</small>
        </button>
        ${[...porMateria.entries()].map(([mid, o]) => `<button class="deck" type="button" style="${mc(mid || null)}" data-action="repaso-empezar" data-materia="${mid}" ${o.pend ? '' : 'disabled'}>
            <span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(mid || null))}</span></span>
            <strong>${o.pend ? `${o.pend} para hoy` : 'Al día'}</strong>
            <small>${plural(o.total, 'tarjeta', 'tarjetas')}</small>
        </button>`).join('')}
    </section>` : ''}

    ${notasConTarjetas.length || app.ia ? `
    <section class="panel rise" style="--i:2">
        <div class="panel-head"><h2>Crear tarjetas desde tus notas</h2></div>
        ${notasConTarjetas.length ? `<p class="muted small">Estas notas tienen líneas «pregunta :: respuesta»:</p>
            <ul class="from-notes">${notasConTarjetas.map(n => `<li style="${mc(n.materiaId)}"><i class="dot"></i><span>${esc(n.titulo)}</span>
                <button class="btn btn-ghost btn-sm" type="button" data-action="nota-tarjetas" data-id="${n.id}">${icon('layers')}Crear ${plural(tarjetasDeNota(n).length, 'tarjeta', 'tarjetas')}</button></li>`).join('')}</ul>` : ''}
        ${app.ia ? `<p class="hint-line">${icon('sparkles')}También puedes generarlas desde cualquier nota con el <a class="link-btn" href="#/asistente">asistente con IA</a>.</p>` : ''}
    </section>` : ''}

    <section class="panel rise" style="--i:3">
        <div class="panel-head"><h2>Todas las tarjetas <span class="count">${db.flashcards.length}</span></h2>
            ${db.flashcards.length ? `<label class="search">${icon('search')}<span class="sr-only">Buscar tarjetas</span><input class="input sm" type="search" placeholder="Buscar…" data-bind="cardQuery" value="${esc(ui.cardQuery || '')}"></label>` : ''}
        </div>
        <div id="cardList">${listaTarjetas()}</div>
    </section>`;
}

function listaTarjetas() {
    if (!db.flashcards.length) return emptyState({ ic: 'layers', size: 'lg', title: 'Aún no tienes tarjetas', text: 'Crea tarjetas con preguntas y respuestas, o conviértelas desde tus notas escribiendo «pregunta :: respuesta» en cada línea.', action: newBtn('flashcard', 'Crear primera tarjeta') });
    const q = norm(ui.cardQuery || '');
    const lista = db.flashcards.filter(f => !q || norm(`${f.frente} ${f.reverso}`).includes(q));
    if (!lista.length) return emptyState({ ic: 'search', title: 'Sin resultados' });
    return `<ul class="card-list">${lista.map(f => {
        const d = daysUntil(f.proxima);
        return `<li style="${mc(f.materiaId)}">
            <i class="dot"></i>
            <div class="card-qa"><strong>${esc(f.frente)}</strong><span>${esc(f.reverso)}</span></div>
            <span class="pill ${d <= 0 ? 'tone-accent' : 'tone-muted'}">${d <= 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`}</span>
            <div class="row-actions">
                <button class="icon-btn sm" type="button" data-action="edit" data-type="flashcard" data-id="${f.id}" aria-label="Editar tarjeta">${icon('pencil')}</button>
                <button class="icon-btn sm danger" type="button" data-action="delete" data-type="flashcard" data-id="${f.id}" aria-label="Eliminar tarjeta">${icon('trash')}</button>
            </div>
        </li>`;
    }).join('')}</ul>`;
}

/* ---------- Sesión de estudio ---------- */
const CALIF = [
    [1, 'Otra vez', 'Vuelve hoy', 'again'],
    [3, 'Difícil', 'La recordé con esfuerzo', 'hard'],
    [4, 'Bien', 'La recordé', 'good'],
    [5, 'Fácil', 'Sin pensarlo', 'easy'],
];

function estudiar() {
    const f = db.flashcards.find(x => x.id === sesion.cola[sesion.i]);
    if (!f) {
        sesion.activa = false;
        return pageHead({ eyebrow: 'Repaso terminado', title: `¡Listo! <em>${plural(sesion.hechas, 'tarjeta', 'tarjetas')}</em>` }) +
            `<section class="panel">${emptyState({ ic: 'award', size: 'lg', title: 'Buen trabajo', text: 'Las tarjetas volverán cuando toque repasarlas.', action: '<button class="btn btn-primary" type="button" data-action="repaso-salir">Volver</button>' })}</section>`;
    }
    const total = sesion.cola.length;
    return `<div class="study" style="${mc(f.materiaId)}">
        <div class="study-top">
            <button class="btn btn-ghost btn-sm" type="button" data-action="repaso-salir">${icon('x')}Terminar</button>
            <span class="mono">${sesion.i + 1} / ${total}</span>
        </div>
        <div class="bar study-bar"><span style="width:${(sesion.i / total) * 100}%"></span></div>
        <button type="button" class="flashcard ${sesion.volteada ? 'is-flipped' : ''}" data-action="repaso-voltear" aria-label="${sesion.volteada ? 'Respuesta mostrada' : 'Mostrar respuesta'}">
            <span class="fc-face fc-front"><span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(f.materiaId))}</span></span><strong>${esc(f.frente)}</strong><small>Pulsa o presiona Espacio para ver la respuesta</small></span>
            <span class="fc-face fc-back"><span class="eyebrow">Respuesta</span><strong>${esc(f.reverso)}</strong></span>
        </button>
        <div class="grade-btns ${sesion.volteada ? '' : 'is-hidden'}" role="group" aria-label="¿Qué tal la recordaste?">
            ${CALIF.map(([q, l, s, cls], i) => `<button class="grade-btn g-${cls}" type="button" data-action="repaso-calificar" data-q="${q}" ${sesion.volteada ? '' : 'tabindex="-1"'}><kbd>${i + 1}</kbd><strong>${l}</strong><small>${s}</small></button>`).join('')}
        </div>
    </div>`;
}

async function calificar(q) {
    const id = sesion.cola[sesion.i];
    try {
        const f = await api.post(`flashcards/${id}/repasar`, { calidad: q });
        reemplazar('flashcards', f);
        if (q < 3) sesion.cola.push(id); // vuelve al final de la sesión
        sesion.hechas += q >= 3 ? 1 : 0;
        sesion.i++;
        sesion.volteada = false;
        render();
    } catch (e) { toastError(e); }
}

/** Atajos de teclado durante el repaso. */
export function teclaRepaso(e) {
    if (!sesion.activa) return false;
    if (e.key === ' ' || e.key === 'Enter') { if (!sesion.volteada) { e.preventDefault(); sesion.volteada = true; render(); return true; } }
    if (sesion.volteada && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); calificar(CALIF[Number(e.key) - 1][0]); return true; }
    if (e.key === 'Escape') { sesion.activa = false; render(); return true; }
    return false;
}

accion({
    'repaso-empezar': (el) => {
        const mid = el.dataset.materia != null ? Number(el.dataset.materia) || null : undefined;
        const cola = tarjetasPendientes().filter(f => mid === undefined || (f.materiaId ?? null) === mid).map(f => f.id);
        if (!cola.length) return;
        Object.assign(sesion, { cola: cola.sort(() => Math.random() - 0.5), i: 0, volteada: false, hechas: 0, activa: true });
        location.hash = '#/repaso';
        render({ enter: true });
    },
    'repaso-voltear': () => { sesion.volteada = !sesion.volteada; render(); },
    'repaso-calificar': (el) => calificar(Number(el.dataset.q)),
    'repaso-salir': () => { sesion.activa = false; render({ enter: true }); },
    'nota-tarjetas': async (el) => {
        const n = db.anotaciones.find(x => x.id === idDe(el));
        const tarjetas = n ? tarjetasDeNota(n) : [];
        if (!tarjetas.length) return;
        try {
            const r = await api.post('flashcards', { materiaId: n.materiaId, tarjetas });
            r.tarjetas.forEach(f => reemplazar('flashcards', f));
            render();
            toast({ type: 'success', title: `${plural(r.tarjetas.length, 'tarjeta creada', 'tarjetas creadas')}`, msg: n.titulo, action: { label: 'Repasar', run: () => { location.hash = '#/repaso'; } } });
        } catch (e) { toastError(e); }
    },
});

