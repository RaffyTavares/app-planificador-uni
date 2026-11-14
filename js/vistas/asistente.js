/*
 * Vista: Asistente — chat estilo Claude con tus datos académicos.
 * Conversaciones guardadas, respuesta en streaming, adjuntos PDF/imagen y
 * propuestas (tareas, tarjetas, notas) que se crean solo al confirmarlas.
 */
import { $, $$, esc, plural, fmtRelativo, fmtDate, fmtBytes } from '../util.js';
import { icon, iconoArchivo } from '../iconos.js';
import { db, app, ui, mc, materiaName, reemplazar } from '../estado.js';
import { pageHead, emptyState, render, toast, toastError, openForm, confirmDialog, field } from '../ui.js';
import { accion, idDe } from '../acciones.js';
import { api, chatStream } from '../api.js';
import { markdown } from '../markdown.js';

/** Estado del chat (en memoria). */
const chat = {
    lista: null,          // conversaciones
    activa: null,         // id de la conversación abierta
    mensajes: [],         // mensajes de la conversación abierta
    cargando: false,
    enviando: null,       // { texto, herramientas, propuestas, aviso, error, controlador }
    borrador: '',
    adjuntos: [],         // ids de archivos
    modo: 'general',      // modo de trabajo elegido
};

/** Modos de trabajo: [clave, icono, nombre, texto de ayuda, placeholder]. */
const MODOS = [
    ['general', 'sparkles', 'Asistente', 'Respuestas directas sobre tus materias, tareas y notas.', 'Pregúntale lo que quieras…'],
    ['profesor', 'cap', 'Profesor', 'Te guía paso a paso con preguntas y pistas, sin darte la respuesta de una vez.', '¿Qué quieres aprender hoy?'],
    ['investigar', 'globe', 'Investigar', 'Busca en internet varias fuentes y te arma un informe con referencias APA.', '¿Qué tema investigo?'],
    ['trabajos', 'pencil', 'Trabajos', 'Esquemas, borradores, revisión de redacción y citas para tus trabajos.', 'Consigna del trabajo o tu texto…'],
    ['examen', 'target', 'Examen', 'Te hace preguntas de práctica una a una, te corrige y te dice qué reforzar.', '¿De qué es tu examen?'],
];
const modoDe = (k) => MODOS.find(m => m[0] === k) || MODOS[0];

// [icono, texto, modo]
const SUGERENCIAS = [
    ['tasks', '¿Qué tengo pendiente esta semana y qué debería hacer primero?', 'general'],
    ['award', '¿Cuánto necesito en lo que queda de cada materia para sacar B?', 'general'],
    ['cap', 'Enséñame paso a paso el tema que más me cuesta de mis materias.', 'profesor'],
    ['globe', 'Investiga un tema de mi carrera y dame un resumen con fuentes en APA.', 'investigar'],
    ['pencil', 'Ayúdame a hacer el esquema de mi próximo trabajo escrito.', 'trabajos'],
    ['target', 'Hazme un simulacro de mi próximo examen.', 'examen'],
];

export default {
    titulo: 'Asistente',
    render: renderChat,
    alMontar: montar,
    async alEntrar() {
        aplicarParametros();
        if (!chat.lista) await cargarLista(); else render();
    },
    alRenderizar() {
        const area = $('#chatInput');
        if (area) { area.value = chat.borrador; autoajustar(area); }
        if (chat.mensajes.length || chat.enviando) bajar(false);
    },
};

/* =====================================================================
   CARGA
   ===================================================================== */
async function cargarLista() {
    try {
        chat.lista = (await api.get('chat')).conversaciones;
    } catch (e) { toastError(e); chat.lista = []; }
    render();
}

async function abrir(id) {
    if (chat.enviando) return;
    chat.activa = id;
    chat.mensajes = [];
    if (!id) { render(); return; }
    chat.cargando = true;
    render();
    try {
        const r = await api.get(`chat/${id}`);
        chat.mensajes = r.mensajes;
    } catch (e) { toastError(e); chat.activa = null; }
    chat.cargando = false;
    render();
    bajar(false);
    $('#chatInput')?.focus();
}

/** Atajos desde otras vistas: #/asistente?nota=12 o ?materia=3 */
function aplicarParametros() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const nota = q.get('nota') && db.anotaciones.find(n => n.id === Number(q.get('nota')));
    const materia = q.get('materia') && db.materias.find(m => m.id === Number(q.get('materia')));
    if (nota) chat.borrador = `Resume mi nota «${nota.titulo}» con los puntos clave y propón tarjetas de repaso.`;
    else if (materia) chat.borrador = `Hazme un plan de estudio para ${materia.nombre} hasta mi próxima evaluación.`;
    if (nota || materia) {
        chat.activa = null;
        chat.mensajes = [];
        history.replaceState(null, '', '#/asistente');
    }
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderChat() {
    if (!app.ia) {
        return pageHead({ eyebrow: 'Asistente con IA', title: 'Tu tutor, <em>con tus datos</em>' }) + `<section class="panel">${emptyState({
            ic: 'sparkles', size: 'lg', title: 'El asistente no está activado',
            text: 'Hay que añadir una clave de la API de Anthropic en <code>config.local.php</code> (<code>\'ia\' => [\'api_key\' => \'…\']</code>).',
        })}</section>`;
    }
    const conv = chat.lista?.find(c => c.id === chat.activa);
    return `<div class="chat-layout">
        <aside class="chat-side" aria-label="Conversaciones">
            <button class="btn btn-primary btn-block" type="button" data-action="chat-nueva">${icon('plus')}Nueva conversación</button>
            ${chat.lista === null ? '<div class="ai-loading sm"><span class="spinner"></span></div>'
                : chat.lista.length ? `<ul class="chat-convs">${chat.lista.map(c => `<li>
                    <button type="button" class="chat-conv" aria-current="${c.id === chat.activa}" data-action="chat-abrir" data-id="${c.id}">
                        <strong>${esc(c.titulo)}</strong><small>${fmtRelativo(c.actualizadoEn)}</small>
                    </button>
                </li>`).join('')}</ul>`
                : '<p class="muted small chat-side-empty">Tus conversaciones aparecerán aquí.</p>'}
        </aside>

        <section class="chat-main" aria-label="Chat">
            <header class="chat-head">
                <div>
                    <p class="eyebrow">${icon('sparkles')}Asistente</p>
                    <h1>${conv ? esc(conv.titulo) : 'Nueva conversación'}</h1>
                </div>
                ${conv ? `<div class="chat-head-actions">
                    <button class="icon-btn sm" type="button" data-action="chat-renombrar" aria-label="Renombrar conversación" title="Renombrar">${icon('pencil')}</button>
                    <button class="icon-btn sm danger" type="button" data-action="chat-borrar" aria-label="Eliminar conversación" title="Eliminar">${icon('trash')}</button>
                </div>` : ''}
            </header>

            <div class="chat-scroll" id="chatScroll" aria-live="polite">
                ${chat.cargando ? '<div class="ai-loading"><span class="spinner"></span></div>'
                    : !chat.mensajes.length && !chat.enviando ? bienvenida()
                    : chat.mensajes.map(burbuja).join('') + (chat.enviando ? burbujaEnCurso() : '')}
            </div>

            <form class="chat-composer" id="chatForm" autocomplete="off">
                ${chat.adjuntos.length ? `<div class="chat-attachments">${chat.adjuntos.map(id => {
                    const a = db.archivos.find(x => x.id === id);
                    return a ? `<span class="att-chip">${icon(iconoArchivo(a.nombre, a.mime))}<span>${esc(a.nombre)}</span>
                        <button type="button" class="icon-btn sm" data-action="chat-quitar-adjunto" data-id="${id}" aria-label="Quitar ${esc(a.nombre)}">${icon('x')}</button></span>` : '';
                }).join('')}</div>` : ''}
                <div class="chat-modes" role="radiogroup" aria-label="Modo del asistente">
                    ${MODOS.map(([k, ic, nombre, ayuda]) => `<button type="button" class="chat-mode ${chat.modo === k ? 'is-active' : ''}" role="radio" aria-checked="${chat.modo === k}" data-action="chat-modo" data-modo="${k}" title="${esc(ayuda)}">${icon(ic)}<span>${nombre}</span></button>`).join('')}
                </div>
                ${chat.modo !== 'general' ? `<p class="chat-mode-help">${icon(modoDe(chat.modo)[1])}<span>${esc(modoDe(chat.modo)[3])}</span></p>` : ''}
                <div class="chat-input-row">
                    <button class="icon-btn" type="button" data-action="chat-adjuntar" aria-label="Adjuntar PDF o imagen de tus materias" title="Adjuntar PDF o imagen">${icon('paperclip')}</button>
                    <label class="sr-only" for="chatInput">Escribe tu mensaje</label>
                    <textarea id="chatInput" rows="1" maxlength="8000" placeholder="${esc(modoDe(chat.modo)[4])}"></textarea>
                    ${chat.enviando
                        ? `<button class="icon-btn send-btn is-stop" type="button" data-action="chat-detener" aria-label="Detener respuesta" title="Detener">${icon('pause')}</button>`
                        : `<button class="icon-btn send-btn" type="submit" aria-label="Enviar" title="Enviar (Enter)">${icon('send')}</button>`}
                </div>
                <p class="chat-note">Enter para enviar · Shift + Enter para salto de línea · El asistente puede equivocarse: revisa fechas y cálculos importantes.</p>
            </form>
        </section>
    </div>`;
}

function bienvenida() {
    const nombre = (db.usuario?.nombre || '').split(' ')[0];
    return `<div class="chat-welcome">
        <span class="chat-avatar lg">${icon('sparkles')}</span>
        <h2 class="display">Hola${nombre ? `, ${esc(nombre)}` : ''}. <em>¿En qué te ayudo?</em></h2>
        <p>Conozco tus materias, horario, tareas, calificaciones y notas. Puedo explicarte como un profesor, investigar en internet con fuentes, ayudarte con tus trabajos, prepararte para exámenes y leer los PDF que adjuntes. Elige un modo abajo o escríbeme directamente.</p>
        <div class="chat-suggestions">${SUGERENCIAS.map(([ic, t, modo]) => `<button type="button" class="suggestion" data-action="chat-sugerencia" data-texto="${esc(t)}" data-modo="${modo}">${icon(ic)}<span>${esc(t)}</span></button>`).join('')}</div>
    </div>`;
}

function burbuja(m) {
    if (m.rol === 'usuario') {
        return `<div class="msg msg-user">
            ${m.modo && m.modo !== 'general' ? `<span class="msg-mode">${icon(modoDe(m.modo)[1])}${esc(modoDe(m.modo)[2])}</span>` : ''}
            ${m.adjuntos?.length ? `<div class="msg-attachments">${m.adjuntos.map(a => `<span class="att-chip sm">${icon(iconoArchivo(a.nombre, a.mime))}<span>${esc(a.nombre)}</span></span>`).join('')}</div>` : ''}
            <div class="msg-bubble">${esc(m.texto).replace(/\n/g, '<br>')}</div>
        </div>`;
    }
    return `<div class="msg msg-ai">
        <span class="chat-avatar">${icon('sparkles')}</span>
        <div class="msg-body">
            ${herramientasHTML(m.herramientas)}
            <div class="md">${markdown(m.texto)}</div>
            ${fuentesHTML(m.fuentes)}
            ${(m.propuestas || []).map(propuestaHTML).join('')}
            ${m.aviso ? `<p class="form-alert">${icon('alert')}<span>${esc(m.aviso)}</span></p>` : ''}
        </div>
    </div>`;
}

function burbujaEnCurso() {
    const e = chat.enviando;
    return `<div class="msg msg-ai" id="msgEnCurso">
        <span class="chat-avatar is-thinking">${icon('sparkles')}</span>
        <div class="msg-body">${cuerpoEnCurso()}</div>
    </div>`;
}

function cuerpoEnCurso() {
    const e = chat.enviando;
    return `${herramientasHTML(e.herramientas, true)}
        ${e.texto ? `<div class="md">${markdown(e.texto)}</div>` : `<div class="typing" aria-label="Pensando"><span></span><span></span><span></span><em>${e.herramientas.some(t => /internet|web/i.test(t)) ? 'Investigando…' : e.herramientas.length ? 'Analizando tus datos…' : 'Pensando…'}</em></div>`}
        ${fuentesHTML(e.fuentes)}
        ${e.propuestas.map(propuestaHTML).join('')}
        ${e.aviso ? `<p class="form-alert">${icon('alert')}<span>${esc(e.aviso)}</span></p>` : ''}
        ${e.error ? `<p class="form-alert is-danger">${icon('alert')}<span>${esc(e.error)}</span></p>` : ''}`;
}

function herramientasHTML(lista = [], vivo = false) {
    if (!lista.length) return '';
    return `<ul class="tool-trace">${lista.map((t, i) => `<li class="${vivo && i === lista.length - 1 && !chat.enviando?.texto ? 'is-live' : ''}">${icon(/internet|web/i.test(t) ? 'globe' : 'database')}${esc(t)}</li>`).join('')}</ul>`;
}

/** Fuentes web citadas en la respuesta. */
function fuentesHTML(lista = []) {
    if (!lista?.length) return '';
    const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
    return `<details class="sources" ${lista.length <= 4 ? 'open' : ''}>
        <summary>${icon('globe')}${lista.length === 1 ? '1 fuente' : `${lista.length} fuentes`}</summary>
        <ol>${lista.map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(f.titulo || dominio(f.url))}</strong><small>${esc(dominio(f.url))}</small></a></li>`).join('')}</ol>
    </details>`;
}

function propuestaHTML(p) {
    const estado = p.estado;
    const titulo = { tareas: plural(p.items.length, 'tarea propuesta', 'tareas propuestas'), tarjetas: plural(p.items.length, 'tarjeta de repaso', 'tarjetas de repaso'), nota: 'Nota propuesta' }[p.tipo];
    const icono = { tareas: 'tasks', tarjetas: 'layers', nota: 'note' }[p.tipo];
    let cuerpo = '';
    if (p.tipo === 'tareas') {
        cuerpo = `<ul class="prop-list">${p.items.map(t => `<li>
            <strong>${t.tipo === 'examen' ? `<span class="badge-exam">${icon('target')}Examen</span>` : ''}${esc(t.descripcion)}</strong>
            <small><span class="mat-tag" style="${mc(t.materiaId)}"><i class="dot"></i><span>${esc(t.materia || 'General')}</span></span> · ${fmtDate(t.fecha, { weekday: 'short', day: 'numeric', month: 'short' })} · prioridad ${esc(t.prioridad)}</small>
            ${t.subtareas?.length ? `<ul class="prop-subs">${t.subtareas.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        </li>`).join('')}</ul>`;
    } else if (p.tipo === 'tarjetas') {
        cuerpo = `<p class="muted small">${esc(p.materia || 'General')}</p><ul class="prop-cards">${p.items.slice(0, 30).map(t => `<li><strong>${esc(t.frente)}</strong><span>${esc(t.reverso)}</span></li>`).join('')}</ul>`;
    } else {
        cuerpo = `<p class="muted small">${esc(p.materia || 'General')}</p><div class="prop-note"><strong>${esc(p.items[0].titulo)}</strong><div class="md">${markdown(p.items[0].contenido)}</div></div>`;
    }
    const acciones = p.mensajeId == null ? '<span class="muted small">Preparando…</span>'
        : estado === 'pendiente' ? `<button class="btn btn-ghost btn-sm" type="button" data-action="chat-propuesta" data-accion="descartar" data-mensaje="${p.mensajeId}" data-indice="${p.indice}">Descartar</button>
            <button class="btn btn-primary btn-sm" type="button" data-action="chat-propuesta" data-accion="aceptar" data-mensaje="${p.mensajeId}" data-indice="${p.indice}">${icon('check')}Crear ${p.tipo === 'nota' ? 'nota' : p.items.length > 1 ? `las ${p.items.length}` : ''}</button>`
        : estado === 'aceptada' ? `<span class="pill tone-live">Creado</span><a class="link-btn" href="#/${{ tareas: 'tareas', tarjetas: 'repaso', nota: 'notas' }[p.tipo]}">Ver ${icon('arrow')}</a>`
        : '<span class="pill tone-muted">Descartado</span>';
    return `<div class="proposal is-${estado}">
        <div class="proposal-head">${icon(icono)}<strong>${titulo}</strong></div>
        ${cuerpo}
        <div class="proposal-actions">${acciones}</div>
    </div>`;
}

/* =====================================================================
   ENVIAR Y RECIBIR
   ===================================================================== */
function bajar(suave = true) {
    const s = $('#chatScroll');
    if (s) s.scrollTo({ top: s.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
}

let pintarPendiente = false;
function pintarEnCurso() {
    if (pintarPendiente) return;
    pintarPendiente = true;
    requestAnimationFrame(() => {
        pintarPendiente = false;
        const cuerpo = $('#msgEnCurso .msg-body');
        if (!cuerpo || !chat.enviando) return;
        const s = $('#chatScroll');
        const pegado = s && s.scrollHeight - s.scrollTop - s.clientHeight < 80;
        cuerpo.innerHTML = cuerpoEnCurso();
        if (pegado) s.scrollTop = s.scrollHeight;
    });
}

async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || chat.enviando) return;

    // La conversación se crea al enviar el primer mensaje
    if (!chat.activa) {
        try {
            const c = await api.post('chat', {});
            chat.lista = [c, ...(chat.lista || [])];
            chat.activa = c.id;
        } catch (e) { toastError(e); return; }
    }
    const conv = chat.activa;
    const adjuntos = chat.adjuntos.map(id => db.archivos.find(a => a.id === id)).filter(Boolean);
    const modo = chat.modo;
    chat.mensajes.push({ rol: 'usuario', texto, modo, adjuntos: adjuntos.map(a => ({ archivoId: a.id, nombre: a.nombre, mime: a.mime })) });
    const controlador = new AbortController();
    chat.enviando = { texto: '', herramientas: [], propuestas: [], fuentes: [], aviso: null, error: null, controlador };
    const ids = [...chat.adjuntos];
    chat.borrador = '';
    chat.adjuntos = [];
    render();
    bajar();

    let fallo = null;
    try {
        await chatStream(conv, { texto, archivos: ids, modo }, (ev, d) => {
            const e = chat.enviando;
            if (!e) return;
            if (ev === 'texto') e.texto += d.delta;
            else if (ev === 'herramienta') { if (!e.herramientas.includes(d.etiqueta)) e.herramientas.push(d.etiqueta); }
            else if (ev === 'propuesta') e.propuestas.push(d);
            else if (ev === 'fuentes') (d.fuentes || []).forEach(f => { if (!e.fuentes.some(x => x.url === f.url)) e.fuentes.push(f); });
            else if (ev === 'aviso') e.aviso = d.mensaje;
            else if (ev === 'error') e.error = d.mensaje;
            else if (ev === 'fin') {
                const c = chat.lista?.find(x => x.id === conv);
                if (c && d.titulo) c.titulo = d.titulo;
            }
            if (chat.activa === conv && ui.route === 'asistente') pintarEnCurso();
        }, controlador.signal);
    } catch (e) {
        if (e.name !== 'AbortError') fallo = e;
    }

    const fin = chat.enviando;
    chat.enviando = null;
    if (fallo) {
        // El mensaje no llegó al servidor (p. ej. sin conexión): se devuelve al cuadro de texto
        chat.mensajes.pop();
        chat.borrador = texto;
        chat.adjuntos = ids;
        toastError(fallo, 'No se pudo enviar');
    } else if (fin?.error && !fin.texto) {
        toast({ type: 'error', title: 'El asistente no pudo responder', msg: fin.error });
    }
    // Recarga desde el servidor para tener ids de propuestas y el historial exacto
    const c = chat.lista?.find(x => x.id === conv);
    if (c) { c.actualizadoEn = new Date().toISOString().slice(0, 19).replace('T', ' '); chat.lista = [c, ...chat.lista.filter(x => x.id !== conv)]; }
    if (chat.activa === conv) {
        try { chat.mensajes = (await api.get(`chat/${conv}`)).mensajes; } catch { /* se queda lo local */ }
    }
    render();
    bajar();
    if (ui.route === 'asistente') $('#chatInput')?.focus();
}

/* =====================================================================
   ADJUNTOS
   ===================================================================== */
const legible = (a) => a.mime === 'application/pdf' || /^image\/(png|jpeg|gif|webp)$/.test(a.mime);

function elegirAdjuntos() {
    const archivos = db.archivos.filter(legible);
    if (!archivos.length) {
        openForm({
            eyebrow: 'Adjuntar', title: 'No tienes PDF ni imágenes',
            desc: 'Sube tus guías, libros o presentaciones en PDF desde la pestaña Archivos de cada materia y luego adjúntalas aquí.',
            body: '', submit: 'Ir a materias', onSubmit: () => { location.hash = '#/materias'; },
        });
        return;
    }
    const porMateria = db.materias.map(m => ({ m, lista: archivos.filter(a => a.materiaId === m.id) })).filter(x => x.lista.length);
    openForm({
        eyebrow: 'Adjuntar al chat',
        title: 'Elige PDF o imágenes',
        desc: 'El asistente podrá leerlos para responder. Se envían a Anthropic (el proveedor de la IA) para analizarlos. Máximo 5 por mensaje.',
        submit: 'Adjuntar',
        body: porMateria.map(({ m, lista }) => `<fieldset class="field pick-group" data-sin-validar>
            <legend class="field-label"><span class="mat-tag" style="${mc(m.id)}"><i class="dot"></i><span>${esc(m.nombre)}</span></span></legend>
            ${lista.map(a => `<label class="pick-file"><input type="checkbox" name="a${a.id}" value="${a.id}" ${chat.adjuntos.includes(a.id) ? 'checked' : ''}>
                ${icon(iconoArchivo(a.nombre, a.mime))}<span>${esc(a.nombre)}</span><small>${fmtBytes(a.tamano)}</small></label>`).join('')}
        </fieldset>`).join(''),
        onSubmit(d, form) {
            const ids = $$('input[type="checkbox"]:checked', form).map(i => Number(i.value));
            if (ids.length > 5) throw new Error('Puedes adjuntar como máximo 5 archivos por mensaje.');
            chat.adjuntos = ids;
            render();
            $('#chatInput')?.focus();
        },
    });
}

/* =====================================================================
   EVENTOS
   ===================================================================== */
function autoajustar(area) {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
}

function montar(vista) {
    vista.addEventListener('input', (e) => {
        if (e.target.id !== 'chatInput') return;
        chat.borrador = e.target.value;
        autoajustar(e.target);
    });
    vista.addEventListener('keydown', (e) => {
        if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            enviar(e.target.value);
        }
    });
    vista.addEventListener('submit', (e) => {
        if (e.target.id !== 'chatForm') return;
        e.preventDefault();
        enviar($('#chatInput')?.value);
    });
}

accion({
    'chat-nueva': () => { if (!chat.enviando) { chat.activa = null; chat.mensajes = []; render(); $('#chatInput')?.focus(); } },
    'chat-abrir': (el) => abrir(idDe(el)),
    'chat-sugerencia': (el) => { if (el.dataset.modo) chat.modo = el.dataset.modo; enviar(el.dataset.texto); },
    'chat-modo': (el) => {
        chat.borrador = $('#chatInput')?.value ?? chat.borrador;
        chat.modo = el.dataset.modo;
        render();
        $('#chatInput')?.focus();
    },
    'chat-detener': () => chat.enviando?.controlador.abort(),
    'chat-adjuntar': elegirAdjuntos,
    'chat-quitar-adjunto': (el) => { chat.adjuntos = chat.adjuntos.filter(id => id !== idDe(el)); render(); },
    'chat-renombrar': () => {
        const c = chat.lista.find(x => x.id === chat.activa);
        openForm({
            eyebrow: 'Conversación', title: 'Renombrar', submit: 'Guardar',
            body: field({ label: 'Título', control: `<input class="input" name="titulo" required maxlength="160" value="${esc(c.titulo)}">` }),
            async onSubmit(d) {
                const r = await api.patch(`chat/${c.id}`, { titulo: d.titulo });
                c.titulo = r.titulo;
                render();
            },
        });
    },
    'chat-borrar': () => {
        const c = chat.lista.find(x => x.id === chat.activa);
        confirmDialog({
            title: '¿Eliminar esta conversación?', desc: `«${c.titulo.replace(/[<>&"]/g, '')}» se borrará para siempre. Lo que ya creaste desde ella (tareas, tarjetas, notas) se mantiene.`,
            confirm: 'Eliminar',
            async onConfirm() {
                await api.del(`chat/${c.id}`);
                chat.lista = chat.lista.filter(x => x.id !== c.id);
                chat.activa = null;
                chat.mensajes = [];
                render();
            },
        });
    },
    'chat-propuesta': async (el) => {
        const cuerpo = { mensajeId: Number(el.dataset.mensaje), indice: Number(el.dataset.indice), accion: el.dataset.accion };
        el.classList.add('is-loading'); el.disabled = true;
        try {
            const r = await api.post(`chat/${chat.activa}/propuestas`, cuerpo);
            r.tareas.forEach(t => reemplazar('tareas', t));
            r.flashcards.forEach(f => reemplazar('flashcards', f));
            r.anotaciones.forEach(n => reemplazar('anotaciones', n));
            for (const m of chat.mensajes) {
                (m.propuestas || []).forEach((p, i) => { if (p.mensajeId === cuerpo.mensajeId && p.indice === cuerpo.indice) m.propuestas[i] = r.propuesta; });
            }
            render();
            if (cuerpo.accion === 'aceptar') {
                const n = r.tareas.length || r.flashcards.length || r.anotaciones.length;
                const que = r.tareas.length ? plural(n, 'tarea creada', 'tareas creadas') : r.flashcards.length ? plural(n, 'tarjeta creada', 'tarjetas creadas') : 'Nota guardada';
                toast({ type: 'success', title: que, msg: r.tareas.map(t => t.descripcion).slice(0, 2).join(' · ') || r.anotaciones[0]?.titulo || materiaName(r.flashcards[0]?.materiaId) });
            }
        } catch (e) {
            toastError(e);
            el.classList.remove('is-loading'); el.disabled = false;
        }
    },
});
