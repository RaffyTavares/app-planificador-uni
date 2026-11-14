/*
 * EduGestor Pro — punto de entrada.
 * Arranque, sesión, enrutado, render, eventos globales y tareas periódicas.
 */
import { iniciarActualizaciones } from './actualizacion.js';
import { $, $$, esc, plural, toISO, nowMin, toMin, fmtDuration, reducedMotion } from './util.js';
import { icon, hydrateIcons } from './iconos.js';
import { api, on as onApi, setCsrf, refrescarCsrf } from './api.js';
import { db, app, ui, cargarEstado, P, mc, materiaName, upcomingClass, whenText, durOf, overdueCount, pendingTasks, tarjetasPendientes, classesOnDay } from './estado.js';
import { hooks, toast, toastError, prepararDialogos, showDialog, closeDialog } from './ui.js';
import { accion, ejecutar, idDe } from './acciones.js';
import { RUTAS, RUTAS_MOVIL, rutaActual } from './rutas.js';
import { mostrarAcceso, ofrecerMigracion } from './acceso.js';
import { abrirPaleta, prepararPaleta, setAccionesPaleta } from './paleta.js';
import { tick as tickPomodoro, setTituloBase } from './pomodoro.js';
import {
    eliminar, eliminarMateria, alternarTarea, alternarSubtarea, confirmarPendientes, exportarRespaldo, importarArchivo, cargarDemo,
} from './datos.js';
import {
    openMateriaForm, openClaseForm, openTareaForm, openNotaForm, openEvaluacionForm, openArchivoForm, openTarjetaForm, openCompartir, crearPlanRepaso,
} from './formularios.js';

import inicio from './vistas/inicio.js';
import calendario from './vistas/calendario.js';
import horario, { slotClick } from './vistas/horario.js';
import tareas, { enviarRapida } from './vistas/tareas.js';
import materias from './vistas/materias.js';
import calificaciones from './vistas/calificaciones.js';
import notas from './vistas/notas.js';
import enfoque from './vistas/enfoque.js';
import repaso, { teclaRepaso } from './vistas/repaso.js';
import asistente from './vistas/asistente.js';
import grupos, { enviarMensaje } from './vistas/grupos.js';
import historial from './vistas/historial.js';
import ajustes, { enviarAjustes } from './vistas/ajustes.js';

const VISTAS = { inicio, calendario, horario, tareas, materias, calificaciones, notas, enfoque, repaso, asistente, grupos, historial, ajustes };
const montadas = new Set();
const vista = () => $('#vista');

/* =====================================================================
   RENDER
   ===================================================================== */
let diaRender = toISO(new Date());

function render({ enter = false } = {}) {
    if (!app.cargado) return;
    const { ruta, param } = rutaActual();
    const cambio = ruta !== ui.route || param !== ui.param;
    ui.route = ruta;
    ui.param = param;
    diaRender = toISO(new Date());

    navActiva(ruta);
    contadores();
    const titulo = ruta === 'materias' && param ? (db.materias.find(m => m.id === Number(param))?.nombre || 'Materia') : RUTAS[ruta].titulo;
    $('#crumb').textContent = RUTAS[ruta].titulo;
    $('#semChip').textContent = db.semestre?.nombre || '';
    $('#semChip').parentElement.title = `Cambiar de ${P().uno}`;
    document.title = `${titulo} · EduGestor Pro`;
    setTituloBase(document.title);

    const v = VISTAS[ruta];
    const el = vista();
    if (!montadas.has(ruta)) { v.alMontar?.(el); montadas.add(ruta); }

    // Conserva el foco en búsquedas y en el formulario rápido al re-renderizar
    const activo = document.activeElement;
    const foco = activo && el.contains(activo)
        ? (activo.dataset.bind ? `[data-bind="${activo.dataset.bind}"]`
            : activo.closest('#quickTask') && activo.name ? `#quickTask [name="${activo.name}"]`
            : activo.id && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName) ? `#${activo.id}` : null)
        : null;
    const scroll = window.scrollY;

    el.innerHTML = v.render();
    hydrateIcons(el);
    v.alRenderizar?.();

    if (foco) {
        const f = $(foco, el);
        if (f) { f.focus({ preventScroll: true }); if (f.setSelectionRange && f.type !== 'date' && f.type !== 'number') { const l = f.value.length; try { f.setSelectionRange(l, l); } catch { /* no aplica */ } } }
    }
    if (!cambio && !enter) window.scrollTo(0, scroll);

    if (enter || cambio) {
        el.classList.remove('is-entering');
        void el.offsetWidth;
        el.classList.add('is-entering');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('is-entering'), 1400);
        contar(el);
    }
    renderVivo();
}
hooks.render = render;

function navActiva(ruta) {
    $$('[data-route]').forEach(a => {
        if (a.dataset.route === ruta) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    const mas = $('#btnMas');
    if (mas) mas.toggleAttribute('aria-current', !RUTAS_MOVIL.includes(ruta));
}

function contadores() {
    const venc = overdueCount();
    const set = (k, v, alerta = false) => {
        const el = $(`[data-count-for="${k}"]`);
        if (!el) return;
        el.textContent = v || '';
        el.classList.toggle('is-alert', alerta && !!v);
    };
    set('tareas', venc || pendingTasks().length, !!venc);
    set('materias', db.materias.length);
    set('notas', db.anotaciones.length);
    set('repaso', tarjetasPendientes().length, true);
    set('horario', db.clases.length);
}

/** Lo que depende de la hora: widget lateral y partes "en vivo" de la vista. */
function renderVivo() {
    if (toISO(new Date()) !== diaRender) { render(); return; }
    const side = $('#sideNext');
    const up = upcomingClass();
    if (side) {
        if (!up) side.innerHTML = '';
        else {
            const c = up.clase;
            side.setAttribute('style', mc(c.materiaId));
            side.innerHTML = up.live
                ? `<p class="eyebrow"><span class="live-dot" aria-hidden="true"></span>En curso</p><h3>${esc(materiaName(c.materiaId))}</h3>
                   <p>Termina en ${fmtDuration(up.remaining)}${c.aula ? ` · ${esc(c.aula)}` : ''}</p>
                   <div class="bar"><span style="width:${Math.round((up.elapsed / durOf(c)) * 100)}%"></span></div>`
                : `<p class="eyebrow">${icon('clock')}Próxima clase</p><h3>${esc(materiaName(c.materiaId))}</h3>
                   <p>Empieza ${esc(whenText(up))}${c.aula ? ` · ${esc(c.aula)}` : ''}</p>`;
        }
    }
    VISTAS[ui.route]?.live?.();
    tickPomodoro();
}

function contar(root) {
    if (reducedMotion()) return;
    $$('[data-count]', root).forEach(el => {
        const fin = Number(el.dataset.count) || 0;
        if (!fin) return;
        const t0 = performance.now();
        const paso = (t) => {
            const p = Math.min(1, (t - t0) / 700);
            el.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(paso);
        };
        el.textContent = '0';
        requestAnimationFrame(paso);
    });
}

/* =====================================================================
   NAVEGACIÓN LATERAL (se genera desde RUTAS)
   ===================================================================== */
function construirNav() {
    let grupo = '';
    let html = '';
    Object.entries(RUTAS).forEach(([r, v]) => {
        if (r === 'ajustes') return;
        if (v.grupo !== grupo) { grupo = v.grupo; html += `<p class="nav-label">${grupo}</p>`; }
        html += `<a class="nav-item" href="#/${r}" data-route="${r}">${icon(v.icono)}<span>${v.titulo}</span><span class="nav-count" data-count-for="${r}"></span></a>`;
    });
    $('#nav').innerHTML = html;
}

function pintarUsuario() {
    const u = db.usuario;
    if (!u) return;
    $('#userName').textContent = u.nombre;
    $('#userMeta').textContent = u.carrera || u.email;
    $('#userAvatar').textContent = u.nombre.trim().charAt(0).toUpperCase();
}

/* =====================================================================
   HOJAS (MÓVIL), MENÚ "NUEVO", TEMA
   ===================================================================== */
function abrirHoja(tipo) {
    const dlg = $('#sheetDialog');
    const ruta = ui.route;
    const items = tipo === 'new'
        ? [['tarea', 'tasks', 'Tarea'], ['examen', 'target', 'Examen'], ['clase', 'calendar', 'Clase'], ['materia', 'book', 'Materia'], ['nota', 'note', 'Nota'], ['evaluacion', 'award', 'Calificación']]
            .map(([t, ic, l]) => `<li><button class="sheet-item" type="button" data-action="new" data-type="${t}">${icon(ic)}${l}</button></li>`).join('')
        : Object.entries(RUTAS).filter(([r]) => !RUTAS_MOVIL.includes(r)).map(([r, v]) => `<li><a class="sheet-item" href="#/${r}" ${ruta === r ? 'aria-current="page"' : ''}>${icon(v.icono)}${v.titulo}</a></li>`).join('')
            + `<li><button class="sheet-item" type="button" data-action="theme">${icon('moon')}Cambiar tema</button></li>`;
    dlg.innerHTML = `<div class="dlg">
        <header class="dlg-head">
            <div><p class="eyebrow">${tipo === 'new' ? 'Crear' : esc(db.semestre?.nombre || 'Menú')}</p><h2>${tipo === 'new' ? '¿Qué quieres agregar?' : 'Explorar'}</h2></div>
            <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button>
        </header>
        <div class="dlg-body"><ul class="sheet-list">${items}</ul></div>
    </div>`;
    $('[data-close]', dlg).addEventListener('click', () => closeDialog(dlg));
    $$('a', dlg).forEach(a => a.addEventListener('click', () => closeDialog(dlg)));
    showDialog(dlg);
}

const menuNuevo = () => $('#newMenu');
function abrirMenu() { menuNuevo().hidden = false; $('#newBtn').setAttribute('aria-expanded', 'true'); $('button', menuNuevo()).focus(); }
function cerrarMenu() { if (menuNuevo().hidden) return; menuNuevo().hidden = true; $('#newBtn').setAttribute('aria-expanded', 'false'); }

const temaActual = () => document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
function cambiarTema() {
    const sig = temaActual() === 'dark' ? 'light' : 'dark';
    const aplicar = () => {
        document.documentElement.setAttribute('data-theme', sig);
        try { localStorage.setItem('theme', sig); } catch { /* preferencia de este dispositivo */ }
        $('meta[name="theme-color"]').content = sig === 'dark' ? '#0b1215' : '#f2f7f6';
        // En iPhone la barra de estado se aplica al volver a abrir la app instalada
        $('meta[name="apple-mobile-web-app-status-bar-style"]').content = sig === 'dark' ? 'black-translucent' : 'default';
    };
    if (document.startViewTransition && !reducedMotion()) document.startViewTransition(aplicar); else aplicar();
}

/* =====================================================================
   ACCIONES GLOBALES
   ===================================================================== */
const ABRIR = { materia: openMateriaForm, clase: openClaseForm, tarea: openTareaForm, nota: openNotaForm, evaluacion: openEvaluacionForm, archivo: openArchivoForm, flashcard: openTarjetaForm };
const COL = { materia: 'materias', clase: 'clases', tarea: 'tareas', nota: 'anotaciones', evaluacion: 'evaluaciones', archivo: 'archivos', flashcard: 'flashcards', sesion: 'sesiones' };

function desdeHoja(fn) {
    const dlg = $('#sheetDialog');
    if (dlg.open) { closeDialog(dlg); setTimeout(fn, 200); } else fn();
}

accion({
    new: (el) => {
        cerrarMenu();
        const t = el.dataset.type;
        const preset = {};
        if (el.dataset.day != null) preset.day = Number(el.dataset.day);
        if (el.dataset.fecha) preset.fecha = el.dataset.fecha;
        if (el.dataset.materia) preset.materiaId = Number(el.dataset.materia);
        if (t === 'examen') return desdeHoja(() => openTareaForm(null, { ...preset, tipo: 'examen' }));
        desdeHoja(() => ABRIR[t]?.(null, preset));
    },
    edit: (el) => {
        const t = el.dataset.type;
        const item = db[COL[t]]?.find(x => x.id === idDe(el));
        if (item) ABRIR[t](item);
    },
    delete: (el) => {
        const t = el.dataset.type, id = idDe(el);
        const dlg = $('#formDialog');
        if (dlg.open) closeDialog(dlg);
        if (t === 'materia') {
            const m = db.materias.find(x => x.id === id);
            if (m) setTimeout(() => eliminarMateria(m), dlg.open ? 200 : 0);
            return;
        }
        const item = db[COL[t]]?.find(x => x.id === id);
        eliminar(t, id, { nombre: item?.nombre || item?.descripcion || item?.titulo || item?.frente || '' });
    },
    'toggle-task': (el) => alternarTarea(idDe(el), el.closest('.task')),
    'toggle-sub': (el) => alternarSubtarea(idDe(el), idDe(el, 'sub')),
    'plan-repaso': (el) => crearPlanRepaso(idDe(el)),
    asistencia: async (el) => {
        const claseId = Number(el.dataset.clase), fecha = el.dataset.fecha, estado = el.dataset.estado;
        const previa = db.asistencias.find(a => a.claseId === claseId && a.fecha === fecha);
        try {
            if (previa && previa.estado === estado) {
                await api.del(`asistencias/${previa.id}`);
                db.asistencias = db.asistencias.filter(a => a.id !== previa.id);
            } else {
                const a = await api.post('asistencias', { claseId, fecha, estado });
                db.asistencias = db.asistencias.filter(x => x.id !== a.id).concat(a);
                if (estado === 'ausente') {
                    const { asistenciaMateria } = await import('./estado.js');
                    const r = asistenciaMateria(a.materiaId);
                    if (r.riesgo) toast({ type: 'warn', title: r.excedido ? 'Superaste el límite de ausencias' : 'Cerca del límite de ausencias', msg: `${materiaName(a.materiaId)}: ${r.ausente} de ${r.max} permitidas.` });
                }
            }
            render();
        } catch (e) { toastError(e); }
    },
    share: (el) => openCompartir(el.dataset.tipo, idDe(el)),
    slot: (el, e) => { const p = slotClick(el, e); if (p) openClaseForm(null, p); },
    palette: () => abrirPaleta(),
    theme: () => desdeHoja(cambiarTema),
    export: () => desdeHoja(exportarRespaldo),
    import: () => desdeHoja(() => $('#importInput').click()),
    demo: () => desdeHoja(cargarDemo),
    sheet: (el) => abrirHoja(el.dataset.sheet),
    recargar: () => location.reload(),
    logout: async () => {
        try {
            const r = await api.post('logout');
            setCsrf(r.csrf);
            location.hash = '#/inicio';
            location.reload();
        } catch (e) { toastError(e); }
    },
});

/* =====================================================================
   EVENTOS GLOBALES
   ===================================================================== */
function eventos() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-wrap')) cerrarMenu();
        const set = e.target.closest('[data-set]');
        if (set) {
            const input = set.closest('form')?.elements[set.dataset.set];
            if (input) { input.value = set.dataset.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
            return;
        }
        const el = e.target.closest('[data-action]');
        if (!el || el.tagName === 'SELECT') return;
        ejecutar(el.dataset.action, el, e);
    });

    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-action-change]');
        if (el) ejecutar(el.dataset.actionChange, el, e);
    });

    // Búsquedas y filtros: re-render parcial para no perder el foco
    document.addEventListener('input', (e) => {
        const k = e.target.dataset?.bind;
        if (!k) return;
        ui[k] = e.target.value;
        const parcial = VISTAS[ui.route]?.parcial?.[k];
        if (parcial) {
            const [sel, fn] = parcial();
            const cont = $(sel);
            if (cont) { cont.innerHTML = fn(); hydrateIcons(cont); return; }
        }
        render();
    });

    document.addEventListener('submit', (e) => {
        const f = e.target;
        const manejadores = { quickTask: enviarRapida, grupoMensaje: enviarMensaje };
        if (manejadores[f.id]) { e.preventDefault(); manejadores[f.id](f); return; }
        if (f.dataset.form) { e.preventDefault(); enviarAjustes(f); }
    });

    $('#importInput').addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) importarArchivo(f);
        e.target.value = '';
    });

    $('#newBtn').addEventListener('click', (e) => { e.stopPropagation(); if (menuNuevo().hidden) abrirMenu(); else cerrarMenu(); });
    menuNuevo().addEventListener('keydown', (e) => {
        const b = $$('button', menuNuevo()), i = b.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); }
        else if (e.key === 'Escape') { cerrarMenu(); $('#newBtn').focus(); }
        else if (e.key === 'Tab') cerrarMenu();
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirPaleta(); return; }
        if (e.key === 'Escape') cerrarMenu();
        const escribiendo = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
        if (escribiendo || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]') || !app.cargado) return;
        if (ui.route === 'repaso' && teclaRepaso(e)) return;
        if (e.key === '/') { e.preventDefault(); abrirPaleta(); }
        else if (e.key.toLowerCase() === 'n') { e.preventDefault(); openTareaForm(); }
    });

    // Atributo role="button" en elementos que no son botones
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
    });

    window.addEventListener('hashchange', () => {
        cerrarMenu();
        const { ruta } = rutaActual();
        if (ruta !== 'materias') { ui.materiaTab = 'resumen'; ui.archivoCategoria = ''; }
        render({ enter: true });
        window.scrollTo(0, 0);
        $('#main').focus({ preventScroll: true });
        VISTAS[ruta]?.alEntrar?.();
    });

    window.addEventListener('scroll', () => $('.topbar').classList.toggle('is-scrolled', window.scrollY > 4), { passive: true });
    window.addEventListener('pagehide', confirmarPendientes);
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden || !app.cargado) return;
        renderVivo();
        recordatorios();
        // Al volver a la pestaña, trae cambios hechos desde otro dispositivo
        try { cargarEstado(await api.get('estado')); render(); } catch { /* sin conexión */ }
    });

    // Conexión
    const banner = (enLinea) => {
        app.enLinea = enLinea;
        $('#offline').hidden = enLinea;
    };
    window.addEventListener('online', () => banner(true));
    window.addEventListener('offline', () => banner(false));
    onApi('conexion', banner);
    onApi('sesion', () => {
        if (!app.cargado) return;
        app.cargado = false;
        toast({ type: 'warn', title: 'Tu sesión expiró', msg: 'Vuelve a iniciar sesión para continuar.' });
        mostrarAcceso(entrar);
    });

    tooltips();
}

/* Tooltip para gráficos y marcas con data-tip */
function tooltips() {
    const tip = $('#chartTip');
    const mostrar = (el, x, y) => {
        tip.textContent = el.dataset.tip;
        tip.hidden = false;
        const r = tip.getBoundingClientRect();
        tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
        tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
    };
    document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) mostrar(el, e.clientX, e.clientY); });
    document.addEventListener('pointermove', (e) => { const el = e.target.closest('[data-tip]'); if (el && !tip.hidden) mostrar(el, e.clientX, e.clientY); else if (!el) tip.hidden = true; });
    document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top); } });
    document.addEventListener('focusout', () => { tip.hidden = true; });
}

/* =====================================================================
   RECORDATORIOS EN LA APP (además de los push del servidor)
   ===================================================================== */
const avisados = new Set();
function recordatorios() {
    const hoy = toISO(new Date());
    classesOnDay(new Date().getDay()).forEach(c => {
        const falta = toMin(c.hora) - nowMin();
        const k = `${c.id}-${hoy}`;
        if (falta > 0 && falta <= 15 && !avisados.has(k)) {
            avisados.add(k);
            toast({ type: 'reminder', title: 'Tu clase empieza pronto', msg: `${materiaName(c.materiaId)} en ${falta} min${c.aula ? ` · ${c.aula}` : ''}`, duration: 10000 });
        }
    });
}

/* =====================================================================
   ARRANQUE
   ===================================================================== */
async function entrar(respuesta, esNuevo = false) {
    try {
        cargarEstado(await api.get('estado'));
    } catch (e) {
        toastError(e, 'No se pudo cargar tu información');
        return;
    }
    $('#app').hidden = false;
    pintarUsuario();
    if (!location.hash) history.replaceState(null, '', '#/inicio');
    render({ enter: true });
    VISTAS[ui.route]?.alEntrar?.();
    recordatorios();
    if (esNuevo) toast({ type: 'success', title: `¡Bienvenido, ${db.usuario.nombre.split(' ')[0]}!`, msg: `Empieza por agregar tus materias o carga un ${P().uno} de ejemplo.` });
    ofrecerMigracion((estado) => { cargarEstado(estado); render({ enter: true }); });
}

async function arrancar() {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $('#kbdHint').textContent = '⌘ K';
    hydrateIcons();
    construirNav();
    prepararDialogos();
    prepararPaleta();
    setAccionesPaleta({ tema: cambiarTema, importar: () => $('#importInput').click() });
    eventos();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        iniciarActualizaciones();
        navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data?.tipo === 'navegar' && e.data.url) location.hash = e.data.url.replace(/^.*#/, '#');
        });
    }

    try {
        const s = await refrescarCsrf();
        app.ia = s.ia; app.pushKey = s.pushKey; app.maxSubida = s.maxSubida || app.maxSubida;
        app.registroAbierto = s.registroAbierto !== false;
        window.__maxSubida = app.maxSubida;
        $('#cargando').hidden = true;
        if (s.usuario) await entrar(s);
        else mostrarAcceso(entrar);
    } catch {
        $('#cargando').innerHTML = `<div class="empty lg"><span class="empty-ic">${icon('wifiOff')}</span><h3>No se pudo conectar con el servidor</h3>
            <p>Comprueba tu conexión a internet y vuelve a intentarlo en unos segundos.</p><button class="btn btn-primary" type="button" data-action="recargar">Reintentar</button></div>`;
    }

    setInterval(() => { if (app.cargado) { renderVivo(); recordatorios(); } }, 30000);
}

arrancar();

