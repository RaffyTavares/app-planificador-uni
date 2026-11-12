/* Vista: Inicio — resumen del día. */
import { $, esc, plural, daysUntil, fmtDuration, fmtNota, fmtDate } from '../util.js';
import { icon } from '../iconos.js';
import { P,
    db, mc, materiaName, classesOnDay, classStatus, upcomingClass, whenText, countdownParts, durOf, fmtRange,
    pendingTasks, overdueCount, sortTasks, proximosExamenes, indiceSemestre, minutosHoy, pomodoroConfig, tarjetasPendientes, racha,
} from '../estado.js';
import { emptyState, newBtn } from '../ui.js';
import { taskRow, agendaItem } from '../componentes.js';

export default {
    titulo: 'Inicio',
    render,
    live() {
        const card = $('#nowCard');
        if (card) card.innerHTML = nowCardHTML(card);
        const ag = $('#agendaToday');
        if (ag) ag.innerHTML = agendaTodayHTML();
    },
};

function render() {
    const now = new Date();
    const h = now.getHours();
    const nombre = (db.usuario?.nombre || '').split(' ')[0];
    const saludo = (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches') + (nombre ? `, ${nombre}` : '');
    const hoyCls = classesOnDay(now.getDay());
    const pend = pendingTasks();
    const dueToday = pend.filter(t => daysUntil(t.fecha) === 0).length;
    const overdue = overdueCount();
    const examenes = proximosExamenes().slice(0, 3);
    const idx = indiceSemestre();
    const estudio = minutosHoy();
    const meta = pomodoroConfig().metaDiaria;
    const pctEstudio = Math.min(100, Math.round((estudio / meta) * 100));
    const repasar = tarjetasPendientes().length;
    const r = racha();

    let resumen;
    if (!db.materias.length) resumen = `empecemos a organizar tu ${P().uno}.`;
    else if (!hoyCls.length && !dueToday) resumen = 'hoy tienes el día libre.';
    else {
        const partes = [];
        if (hoyCls.length) partes.push(plural(hoyCls.length, 'clase', 'clases'));
        if (dueToday) partes.push(plural(dueToday, 'entrega', 'entregas'));
        resumen = `hoy tienes ${partes.join(' y ')}.`;
    }

    const pasos = [
        { hecho: db.materias.length > 0, titulo: 'Agrega tus materias', texto: 'Nombre, profesor y créditos. Cada una recibe un color propio.', tipo: 'materia', cta: 'Agregar materia' },
        { hecho: db.clases.length > 0, titulo: 'Arma tu horario', texto: 'Registra el día, la hora y el aula de cada clase.', tipo: 'clase', cta: 'Agregar clase' },
        { hecho: db.tareas.length > 0, titulo: 'Anota tus entregas', texto: 'Tareas y exámenes con fecha, para que nada te sorprenda.', tipo: 'tarea', cta: 'Agregar tarea' },
    ];
    const primero = pasos.findIndex(p => !p.hecho);
    const L = 2 * Math.PI * 34;

    return `
    <header class="hero rise" style="--i:0">
        <p class="eyebrow"><span class="live-dot" aria-hidden="true"></span>${esc(now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(db.semestre?.nombre || '')}</p>
        <h1 class="display">${esc(saludo)},<br><em>${esc(resumen)}</em></h1>
        <div class="hero-cta">
            ${newBtn('tarea', 'Nueva tarea')}
            <a class="btn btn-ghost" href="#/enfoque">${icon('timer')}Empezar a estudiar</a>
        </div>
    </header>

    ${primero >= 0 ? `
    <section class="panel onboarding rise" style="--i:1" aria-labelledby="obTitle">
        <p class="eyebrow">Ruta de inicio</p>
        <h2 id="obTitle">Configura tu ${P().uno} en tres pasos</h2>
        <ol class="steps">
            ${pasos.map((p, i) => `<li class="step ${p.hecho ? 'is-done' : ''}">
                <span class="step-n">0${i + 1}</span>
                <h3>${p.titulo}</h3><p>${p.texto}</p>
                ${p.hecho ? `<span class="step-done">${icon('checkCircle')}Listo</span>`
                    : `<button class="btn btn-sm ${primero === i ? 'btn-primary' : 'btn-ghost'}" type="button" data-action="new" data-type="${p.tipo}">${icon('plus')}${p.cta}</button>`}
            </li>`).join('')}
        </ol>
        ${!db.materias.length ? `<p class="ob-demo">¿Solo quieres explorar? <button class="link-btn" type="button" data-action="demo">Carga un ${P().uno} de ejemplo ${icon('arrow')}</button></p>` : ''}
    </section>` : ''}

    <section class="stats" aria-label="Resumen">
        <a class="stat rise" style="--i:2" href="#/tareas">
            <div class="stat-top"><span class="eyebrow">Pendientes</span>${icon('tasks')}</div>
            <span class="stat-num" data-count="${pend.length}">${pend.length}</span>
            <span class="stat-sub ${overdue ? 'tone-danger' : 'tone-ok'}">${overdue ? plural(overdue, 'tarea vencida', 'tareas vencidas') : 'Todo al día'}</span>
        </a>
        <a class="stat rise" style="--i:3" href="#/horario">
            <div class="stat-top"><span class="eyebrow">Clases hoy</span>${icon('calendar')}</div>
            <span class="stat-num" data-count="${hoyCls.length}">${hoyCls.length}</span>
            <span class="stat-sub">${hoyCls.length ? (() => { const q = hoyCls.filter(c => classStatus(c) !== 'past').length; return q ? plural(q, 'restante', 'restantes') : 'Ya terminaron'; })() : 'Sin clases'}</span>
        </a>
        <a class="stat rise" style="--i:4" href="#/calificaciones">
            <div class="stat-top"><span class="eyebrow">Índice</span>${icon('award')}</div>
            <span class="stat-num">${idx.valor == null ? '—' : fmtNota(idx.valor, 2)}</span>
            <span class="stat-sub">${idx.valor == null ? 'Registra tus calificaciones' : `${idx.proyectado ? 'Proyectado · ' : ''}${idx.creditos} créditos`}</span>
        </a>
        <a class="stat stat--ring rise" style="--i:5" href="#/enfoque">
            <div class="ring-wrap">
                <svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
                    <circle class="ring-bg" cx="40" cy="40" r="34"/>
                    <circle class="ring-fg" cx="40" cy="40" r="34" style="--len:${L}; stroke-dasharray:${L}; stroke-dashoffset:${L * (1 - pctEstudio / 100)}"/>
                </svg>
                <span>${pctEstudio}%</span>
            </div>
            <div>
                <span class="stat-label">Estudio de hoy</span>
                <p class="stat-sub">${fmtDuration(estudio)} de ${fmtDuration(meta)}${r ? ` · ${icon('flame')} ${plural(r, 'día', 'días')}` : ''}</p>
            </div>
        </a>
    </section>

    <div class="dash-grid">
        <div class="dash-col">
            <section class="panel now-card rise" style="--i:6;${upcomingClass() ? mc(upcomingClass().clase.materiaId) : ''}" id="nowCard" aria-live="polite">${nowCardHTML()}</section>
            <section class="panel rise" style="--i:7" aria-labelledby="agTitle">
                <div class="panel-head">
                    <h2 id="agTitle">Agenda de hoy <span class="count">${hoyCls.length}</span></h2>
                    <a class="link-btn" href="#/horario">Horario ${icon('arrow')}</a>
                </div>
                <div id="agendaToday">${agendaTodayHTML()}</div>
            </section>
            ${examenes.length ? `
            <section class="panel rise" style="--i:8" aria-labelledby="exTitle">
                <div class="panel-head"><h2 id="exTitle">Próximos exámenes</h2><a class="link-btn" href="#/calendario">Calendario ${icon('arrow')}</a></div>
                <ul class="exam-list">${examenes.map(t => {
                    const d = daysUntil(t.fecha);
                    return `<li class="exam-item" style="${mc(t.materiaId)}">
                        <div class="exam-count"><b>${d === 0 ? 'Hoy' : d}</b>${d === 0 ? '' : `<small>${d === 1 ? 'día' : 'días'}</small>`}</div>
                        <div class="exam-body"><strong>${esc(t.descripcion)}</strong><p><span class="mat-tag"><i class="dot"></i><span>${esc(materiaName(t.materiaId))}</span></span> · ${fmtDate(t.fecha, { weekday: 'long', day: 'numeric', month: 'short' })}</p></div>
                        <button class="btn btn-ghost btn-sm" type="button" data-action="plan-repaso" data-id="${t.id}">${icon('layers')}Plan</button>
                    </li>`;
                }).join('')}</ul>
            </section>` : ''}
        </div>
        <div class="dash-col">
            <section class="panel rise" style="--i:7" aria-labelledby="dueTitle">
                <div class="panel-head">
                    <h2 id="dueTitle">Próximas entregas <span class="count">${pend.length}</span></h2>
                    <a class="link-btn" href="#/tareas">Ver todas ${icon('arrow')}</a>
                </div>
                ${pend.length
                    ? `<ul class="task-list">${sortTasks(pend).slice(0, 6).map(t => taskRow(t, { compact: true })).join('')}</ul>`
                    : emptyState({ ic: 'checkCircle', title: db.tareas.length ? '¡Todo entregado!' : 'Sin tareas por ahora', text: db.tareas.length ? 'No tienes entregas pendientes. Buen trabajo.' : 'Agrega tu primera tarea para verla aquí.', action: newBtn('tarea', 'Agregar tarea', 'btn btn-ghost btn-sm') })}
            </section>
            ${repasar ? `
            <a class="panel review-cta rise" style="--i:8" href="#/repaso">
                <span class="review-ic">${icon('layers')}</span>
                <div><strong>${plural(repasar, 'tarjeta lista', 'tarjetas listas')} para repasar</strong><p>Unos minutos hoy fijan lo aprendido para el examen.</p></div>
                ${icon('arrow')}
            </a>` : ''}
            <section class="panel rise" style="--i:9" aria-labelledby="ntTitle">
                <div class="panel-head">
                    <h2 id="ntTitle">Notas recientes <span class="count">${db.anotaciones.length}</span></h2>
                    <a class="link-btn" href="#/notas">Ver todas ${icon('arrow')}</a>
                </div>
                ${db.anotaciones.length
                    ? `<ul class="note-list-compact">${[...db.anotaciones].sort((a, b) => b.id - a.id).slice(0, 3).map(n => `<li><button class="note-mini" type="button" style="${mc(n.materiaId)}" data-action="edit" data-type="nota" data-id="${n.id}">
                        <strong>${esc(n.titulo)}</strong><p>${esc(n.contenido)}</p></button></li>`).join('')}</ul>`
                    : emptyState({ ic: 'note', title: 'Sin notas todavía', text: 'Guarda ideas, fórmulas o recordatorios.', action: newBtn('nota', 'Nueva nota', 'btn btn-ghost btn-sm') })}
            </section>
        </div>
    </div>`;
}

function nowCardHTML(card = null) {
    const up = upcomingClass();
    if (!up) {
        card?.style.removeProperty('--mc');
        return emptyState({
            ic: 'calendar',
            title: 'Sin clases en tu horario',
            text: db.materias.length ? 'Registra tus clases para ver aquí la siguiente y cuánto falta.' : 'Primero agrega una materia y luego sus clases.',
            action: newBtn(db.materias.length ? 'clase' : 'materia', db.materias.length ? 'Agregar clase' : 'Agregar materia', 'btn btn-ghost btn-sm'),
        });
    }
    const c = up.clase;
    card?.setAttribute('style', `--i:6;${mc(c.materiaId)}`);
    const nombre = esc(materiaName(c.materiaId));
    const meta = `<div class="now-meta">
        <span>${icon('clock')}${fmtRange(c)}</span>
        ${c.aula ? `<span>${icon('pin')}${esc(c.aula)}</span>` : ''}
        ${!up.live && up.dayOffset > 0 ? `<span>${icon('calendar')}${esc(c.dia)}</span>` : ''}
    </div>`;
    if (up.live) {
        const pct = Math.min(100, Math.round((up.elapsed / durOf(c)) * 100));
        return `<span class="pill tone-live">En curso ahora</span>
            <h3>${nombre}</h3>${meta}
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso de la clase"><span style="width:${pct}%"></span></div>
            <div class="now-foot">
                <p>Termina en <strong>${fmtDuration(up.remaining)}</strong></p>
                <a class="link-btn" href="#/materias/${c.materiaId}">Abrir materia ${icon('arrow')}</a>
            </div>`;
    }
    const [num, unidad] = countdownParts(up.minutesTo);
    return `<span class="pill tone-accent">Próxima clase</span>
        <h3>${nombre}</h3>${meta}
        <div class="now-foot">
            <div class="countdown">${esc(num)}<small>${esc(unidad)}</small></div>
            <p>Empieza ${esc(whenText(up))}</p>
        </div>`;
}

function agendaTodayHTML() {
    const d = new Date().getDay();
    const lista = classesOnDay(d);
    if (!lista.length) return emptyState({ ic: 'sun', title: 'Sin clases hoy', text: 'Aprovecha para adelantar tareas o repasar tus notas.' });
    return `<ul class="agenda">${lista.map(c => agendaItem(c, d, { asistencia: true })).join('')}</ul>
        <p class="hint-line">${icon('info')}Marca tu asistencia cuando la clase empiece.</p>`;
}
