/* Vista: Horario semanal (con arrastrar y soltar) y vista por día. */
import { $, $$, esc, plural, fmtTime, fmtHours, minToHHMM, toMin, nowMin, addDays, startOfDay, lunesDe, DIAS, DIAS_CORTO, WEEK, pad, descargar, clamp } from '../util.js';
import { icon } from '../iconos.js';
import { db, ui, mc, materiaName, materiaById, classesOnDay, classStatus, durOf, fmtRange } from '../estado.js';
import { emptyState, newBtn, pageHead, toast, toastError, render } from '../ui.js';
import { accion } from '../acciones.js';
import { actualizar } from '../datos.js';

const HORA_PX = 64;

export default {
    titulo: 'Horario',
    render: renderHorario,
    live() {
        const line = $('#nowLine');
        if (!line) return;
        const minH = Number(line.dataset.minH), maxH = Number(line.dataset.maxH), n = nowMin();
        line.hidden = !(n >= minH * 60 && n <= maxH * 60);
        line.style.top = `${((n - minH * 60) / 60) * HORA_PX}px`;
    },
    alMontar: prepararArrastre,
};

function renderHorario() {
    const totalMin = db.clases.reduce((s, c) => s + durOf(c), 0);
    const head = pageHead({
        eyebrow: 'Horario semanal',
        title: 'Tu semana, <em>de un vistazo</em>',
        lead: `${plural(db.clases.length, 'clase', 'clases')} · ${fmtHours(totalMin)} horas semanales`,
        actions: `
            <div class="chips" role="tablist" aria-label="Modo de vista">
                <button class="chip" type="button" role="tab" aria-selected="${ui.schedMode === 'semana'}" data-action="sched-mode" data-mode="semana">${icon('grid')}Semana</button>
                <button class="chip" type="button" role="tab" aria-selected="${ui.schedMode === 'dia'}" data-action="sched-mode" data-mode="dia">${icon('list')}Día</button>
            </div>
            ${db.clases.length ? `<button class="btn btn-ghost" type="button" data-action="export-ics" title="Para Google Calendar, Outlook o Apple Calendar">${icon('download')}<span class="hide-sm">Exportar .ics</span></button>` : ''}
            ${newBtn('clase', 'Clase')}`,
    });

    if (!db.clases.length) {
        return head + `<section class="panel rise" style="--i:1">${emptyState({
            ic: 'calendar', size: 'lg', title: 'Tu horario está vacío',
            text: db.materias.length ? 'Agrega tus clases y verás tu semana organizada por colores.' : 'Empieza agregando una materia; después podrás registrar sus clases.',
            action: newBtn(db.materias.length ? 'clase' : 'materia', db.materias.length ? 'Agregar primera clase' : 'Agregar materia'),
        })}</section>`;
    }
    return head + (ui.schedMode === 'semana' ? semanaHTML() : diaHTML());
}

function semanaHTML() {
    const hoy = new Date().getDay();
    const dias = [1, 2, 3, 4, 5, 6].concat(db.clases.some(c => c.dia === 'Domingo') || hoy === 0 ? [0] : []);
    let minH = 7, maxH = 19;
    db.clases.forEach(c => {
        const s = toMin(c.hora);
        minH = Math.min(minH, Math.floor(s / 60));
        maxH = Math.max(maxH, Math.ceil((s + durOf(c)) / 60));
    });
    minH = Math.max(0, minH);
    maxH = Math.min(24, maxH);
    const lunes = lunesDe(new Date());

    const cabeceras = dias.map(d => `<div class="week-day ${d === hoy ? 'is-today' : ''}"><span>${DIAS_CORTO[d]}</span><b>${addDays(lunes, (d + 6) % 7).getDate()}</b></div>`).join('');
    const horas = Array.from({ length: maxH - minH }, (_, i) => `<span>${fmtTime(minToHHMM((minH + i) * 60)).replace(':00', '')}</span>`).join('');
    const columnas = dias.map(d => {
        const bloques = layoutDia(classesOnDay(d)).map(({ c, s, e, lane, lanes }) => {
            const nombre = esc(materiaName(c.materiaId));
            const alto = (e - s) / 60;
            return `<button type="button" class="block ${alto < .8 ? 'is-short' : ''} ${classStatus(c, d) === 'live' ? 'is-live' : ''}"
                style="${mc(c.materiaId)};top:${((s - minH * 60) / 60) * HORA_PX}px;height:${alto * HORA_PX - 4}px;left:${(lane / lanes) * 100}%;width:calc(${100 / lanes}% - 6px)"
                data-action="edit" data-type="clase" data-id="${c.id}" data-drag="${c.id}"
                aria-label="${nombre}, ${DIAS[d]} ${fmtRange(c)}. Arrastra para mover.">
                <strong>${nombre}</strong><small>${fmtTime(c.hora)}</small>${c.aula ? `<small>${esc(c.aula)}</small>` : ''}
            </button>`;
        }).join('');
        const linea = d === hoy ? `<div class="now-line" id="nowLine" data-min-h="${minH}" data-max-h="${maxH}" hidden></div>` : '';
        return `<div class="week-col ${d === hoy ? 'is-today' : ''}" data-action="slot" data-day="${d}" data-min-h="${minH}">${bloques}${linea}</div>`;
    }).join('');

    return `<section class="panel sched-panel rise" style="--i:1" aria-label="Horario semanal">
        <div class="week-scroll">
            <div class="week" style="--cols:${dias.length};--rows:${maxH - minH}">
                <div class="week-corner"></div>${cabeceras}
                <div class="week-times">${horas}</div>${columnas}
            </div>
        </div>
    </section>
    <p class="hint-line rise" style="--i:2">${icon('info')}Arrastra una clase para cambiar su día u hora. Haz clic en un espacio libre para crear una.</p>`;
}

/** Reparte en carriles las clases que se solapan el mismo día. */
function layoutDia(lista) {
    const out = [];
    let grupo = [], fin = -1;
    const cerrar = () => {
        const finCarril = [];
        grupo.forEach(it => {
            let l = finCarril.findIndex(e => e <= it.s);
            if (l === -1) { l = finCarril.length; finCarril.push(it.e); } else finCarril[l] = it.e;
            it.lane = l;
        });
        grupo.forEach(it => { it.lanes = finCarril.length; });
        out.push(...grupo);
        grupo = []; fin = -1;
    };
    lista.forEach(c => {
        const s = toMin(c.hora), e = s + durOf(c);
        if (grupo.length && s >= fin) cerrar();
        grupo.push({ c, s, e });
        fin = Math.max(fin, e);
    });
    if (grupo.length) cerrar();
    return out;
}

function diaHTML() {
    const hoy = new Date().getDay();
    const sel = ui.schedDay;
    const tabs = WEEK.map(d => `<button class="chip ${d === hoy ? 'is-today' : ''}" type="button" role="tab" aria-selected="${d === sel}" data-action="sched-day" data-day="${d}">
        <b>${DIAS_CORTO[d]}</b><small>${classesOnDay(d).length || '·'}</small></button>`).join('');
    const lista = classesOnDay(sel);
    const cuerpo = lista.length
        ? `<ul class="class-list">${lista.map(c => {
            const m = materiaById(c.materiaId);
            return `<li class="class-card rise" style="${mc(c.materiaId)}">
                <div>
                    <h3><a href="#/materias/${c.materiaId}">${esc(materiaName(c.materiaId))}</a> ${classStatus(c, sel) === 'live' ? '<span class="pill tone-live">En curso</span>' : ''}</h3>
                    <div class="now-meta">
                        <span>${icon('clock')}${fmtRange(c)}</span>
                        ${c.aula ? `<span>${icon('pin')}${esc(c.aula)}</span>` : ''}
                        ${m?.profesor ? `<span>${icon('user')}${esc(m.profesor)}</span>` : ''}
                    </div>
                </div>
                <div class="row-actions is-visible">
                    <button class="icon-btn sm" type="button" data-action="edit" data-type="clase" data-id="${c.id}" aria-label="Editar clase">${icon('pencil')}</button>
                    <button class="icon-btn sm danger" type="button" data-action="delete" data-type="clase" data-id="${c.id}" aria-label="Eliminar clase">${icon('trash')}</button>
                </div>
            </li>`;
        }).join('')}</ul>`
        : `<section class="panel">${emptyState({ ic: 'sun', title: `Sin clases el ${DIAS[sel].toLowerCase()}`, text: 'Día libre en tu horario.', action: `<button class="btn btn-ghost btn-sm" type="button" data-action="new" data-type="clase" data-day="${sel}">${icon('plus')}Agregar clase este día</button>` })}</section>`;
    return `<div class="chips day-tabs rise" style="--i:1" role="tablist" aria-label="Día de la semana">${tabs}</div>${cuerpo}`;
}

/* ---------- Arrastrar y soltar ---------- */
let arrastrando = false;

function prepararArrastre(vista) {
    vista.addEventListener('pointerdown', (e) => {
        const bloque = e.target.closest('[data-drag]');
        if (!bloque || e.button !== 0 || e.pointerType === 'touch') return;
        const clase = db.clases.find(c => c.id === Number(bloque.dataset.drag));
        const cols = $$('.week-col', vista);
        const x0 = e.clientX, y0 = e.clientY;
        const top0 = parseFloat(bloque.style.top);
        const minH = Number(bloque.closest('.week-col').dataset.minH);
        let destino = null, activo = false;

        const mover = (ev) => {
            const dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (!activo && Math.hypot(dx, dy) < 6) return;
            if (!activo) { activo = true; arrastrando = true; bloque.classList.add('is-dragging'); document.body.classList.add('is-dragging-block'); }
            const col = cols.find(c => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; }) || bloque.closest('.week-col');
            const min = clamp(Math.round(((top0 + dy) / HORA_PX) * 4) * 15 + minH * 60, 0, 24 * 60 - durOf(clase));
            if (col !== bloque.parentElement) col.appendChild(bloque);
            bloque.style.top = `${((min - minH * 60) / 60) * HORA_PX}px`;
            bloque.style.left = '0%';
            bloque.style.width = 'calc(100% - 6px)';
            bloque.querySelector('small').textContent = fmtTime(minToHHMM(min));
            destino = { dia: DIAS[Number(col.dataset.day)], hora: minToHHMM(min) };
        };
        const soltar = async () => {
            document.removeEventListener('pointermove', mover);
            document.removeEventListener('pointerup', soltar);
            bloque.classList.remove('is-dragging');
            document.body.classList.remove('is-dragging-block');
            setTimeout(() => { arrastrando = false; }, 0);
            if (!activo || !destino || (destino.dia === clase.dia && destino.hora === clase.hora)) { if (activo) render(); return; }
            const antes = { dia: clase.dia, hora: clase.hora };
            try {
                await actualizar('clase', clase.id, destino);
                toast({ type: 'success', title: 'Clase movida', msg: `${materiaName(clase.materiaId)} · ${destino.dia} ${fmtTime(destino.hora)}`, action: { label: 'Deshacer', run: () => actualizar('clase', clase.id, antes).catch(toastError) } });
            } catch (err) { render(); toastError(err); }
        };
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
    });
    // Evita que el clic final del arrastre abra el formulario
    vista.addEventListener('click', (e) => { if (arrastrando) { e.stopPropagation(); e.preventDefault(); } }, true);
}

/* ---------- Acciones ---------- */
accion({
    'sched-mode': (el) => { ui.schedMode = el.dataset.mode; render({ enter: true }); },
    'sched-day': (el) => { ui.schedDay = Number(el.dataset.day); render(); },
    'export-ics': exportarICS,
});

export function slotClick(el, e) {
    if (e.target.closest('.block')) return null;
    const r = el.getBoundingClientRect();
    const min = Number(el.dataset.minH) * 60 + Math.floor(((e.clientY - r.top) / HORA_PX) * 2) * 30;
    return { day: Number(el.dataset.day), hora: minToHHMM(clamp(min, 0, 23 * 60 + 30)) };
}

function exportarICS() {
    const ahora = new Date();
    const stamp = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}T${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}00Z`;
    const e = (s) => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const fin = db.semestre?.fin ? `;UNTIL=${db.semestre.fin.replace(/-/g, '')}T235959` : '';
    const eventos = db.clases.map(c => {
        const base = addDays(startOfDay(ahora), (DIAS.indexOf(c.dia) - ahora.getDay() + 7) % 7);
        const ini = new Date(base); ini.setMinutes(toMin(c.hora));
        const fi = new Date(base); fi.setMinutes(toMin(c.hora) + durOf(c));
        const prof = materiaById(c.materiaId)?.profesor;
        return ['BEGIN:VEVENT', `UID:clase-${c.id}@edugestor`, `DTSTAMP:${stamp}`, `DTSTART:${f(ini)}`, `DTEND:${f(fi)}`, `RRULE:FREQ=WEEKLY${fin}`,
            `SUMMARY:${e(materiaName(c.materiaId))}`, c.aula ? `LOCATION:${e(c.aula)}` : '', prof ? `DESCRIPTION:${e('Profesor: ' + prof)}` : '', 'END:VEVENT'].filter(Boolean).join('\r\n');
    });
    descargar('horario-edugestor.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduGestor Pro//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
    toast({ type: 'success', title: 'Horario exportado', msg: 'Ábrelo con Google Calendar, Outlook o Apple Calendar.' });
}
