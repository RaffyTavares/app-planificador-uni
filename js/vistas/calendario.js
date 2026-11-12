/* Vista: Calendario mensual con tareas, exámenes y clases. */
import { esc, toISO, fromISO, addDays, hoyISO, DIAS, MESES, plural, fmtTime } from '../util.js';
import { icon } from '../iconos.js';
import { db, ui, mc, materiaName, classesOnDay, sortTasks } from '../estado.js';
import { pageHead, emptyState } from '../ui.js';
import { taskRow } from '../componentes.js';
import { accion } from '../acciones.js';
import { render } from '../ui.js';

export default { titulo: 'Calendario', render: renderCal };

function renderCal() {
    const mes = ui.calMes;
    const hoy = hoyISO();
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const inicio = addDays(primero, -((primero.getDay() + 6) % 7));
    const porFecha = new Map();
    db.tareas.forEach(t => { (porFecha.get(t.fecha) || porFecha.set(t.fecha, []).get(t.fecha)).push(t); });

    const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const totalCeldas = Math.ceil((((primero.getDay() + 6) % 7) + diasMes) / 7) * 7;
    const celdas = [];
    for (let i = 0; i < totalCeldas; i++) {
        const d = addDays(inicio, i);
        const iso = toISO(d);
        const fuera = d.getMonth() !== mes.getMonth();
        const items = sortTasks(porFecha.get(iso) || []);
        const clases = classesOnDay(d.getDay()).length;
        celdas.push(`<button type="button" class="cal-cell ${fuera ? 'is-out' : ''} ${iso === hoy ? 'is-today' : ''} ${iso === ui.calDia ? 'is-selected' : ''}"
            data-action="cal-dia" data-fecha="${iso}" aria-label="${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}: ${plural(items.length, 'entrega', 'entregas')}">
            <span class="cal-num">${d.getDate()}</span>
            ${clases ? `<span class="cal-classes" title="${plural(clases, 'clase', 'clases')}">${'•'.repeat(Math.min(clases, 4))}</span>` : ''}
            <span class="cal-items">${items.slice(0, 3).map(t => `<span class="cal-item ${t.tipo === 'examen' ? 'is-exam' : ''} ${t.completada ? 'is-done' : ''}" style="${mc(t.materiaId)}">${esc(t.descripcion)}</span>`).join('')}
            ${items.length > 3 ? `<span class="cal-more">+${items.length - 3} más</span>` : ''}</span>
        </button>`);
    }
    const filas = totalCeldas / 7;

    const sel = ui.calDia;
    const selDate = fromISO(sel);
    const delDia = sortTasks(porFecha.get(sel) || []);
    const clasesDia = classesOnDay(selDate.getDay());

    return pageHead({
        eyebrow: 'Calendario',
        title: `${MESES[mes.getMonth()].replace(/^./, c => c.toUpperCase())} <em>${mes.getFullYear()}</em>`,
        lead: 'Entregas, exámenes y clases del mes.',
        actions: `<div class="btn-group">
            <button class="icon-btn bordered" type="button" data-action="cal-mover" data-delta="-1" aria-label="Mes anterior">${icon('chevronLeft')}</button>
            <button class="btn btn-ghost" type="button" data-action="cal-hoy">Hoy</button>
            <button class="icon-btn bordered" type="button" data-action="cal-mover" data-delta="1" aria-label="Mes siguiente">${icon('chevron')}</button>
        </div>`,
    }) + `
    <div class="cal-layout">
        <section class="panel cal-panel rise" style="--i:1">
            <div class="cal-head">${[1, 2, 3, 4, 5, 6, 0].map(d => `<span>${DIAS[d].slice(0, 3)}</span>`).join('')}</div>
            <div class="cal-grid" style="--filas:${filas}">${celdas.join('')}</div>
            <div class="cal-legend"><span><i class="lg-task"></i>Tarea</span><span><i class="lg-exam"></i>Examen</span><span><i class="lg-class">•</i>Clases ese día</span></div>
        </section>
        <section class="panel cal-side rise" style="--i:2" aria-live="polite">
            <p class="eyebrow">${esc(selDate.toLocaleDateString('es', { weekday: 'long' }))}</p>
            <h2 class="cal-side-title">${selDate.getDate()} de ${MESES[selDate.getMonth()]}</h2>
            ${clasesDia.length ? `<h3 class="group-title"><span>Clases</span><span class="count">${clasesDia.length}</span></h3>
                <ul class="mini-classes">${clasesDia.map(c => `<li style="${mc(c.materiaId)}"><i class="dot"></i><span>${esc(materiaName(c.materiaId))}</span><small>${fmtTime(c.hora)}</small></li>`).join('')}</ul>` : ''}
            <h3 class="group-title"><span>Entregas y exámenes</span><span class="count">${delDia.length}</span></h3>
            ${delDia.length ? `<ul class="task-list">${delDia.map(t => taskRow(t)).join('')}</ul>` : emptyState({ ic: 'checkCircle', title: 'Nada para este día' })}
            <div class="cal-side-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="new" data-type="tarea" data-fecha="${sel}">${icon('plus')}Tarea</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="new" data-type="examen" data-fecha="${sel}">${icon('target')}Examen</button>
            </div>
        </section>
    </div>`;
}

accion({
    'cal-dia': (el) => { ui.calDia = el.dataset.fecha; const d = fromISO(ui.calDia); if (d.getMonth() !== ui.calMes.getMonth()) ui.calMes = new Date(d.getFullYear(), d.getMonth(), 1); render(); },
    'cal-mover': (el) => { const m = ui.calMes; ui.calMes = new Date(m.getFullYear(), m.getMonth() + Number(el.dataset.delta), 1); render({ enter: true }); },
    'cal-hoy': () => { const d = new Date(); ui.calMes = new Date(d.getFullYear(), d.getMonth(), 1); ui.calDia = hoyISO(); render(); },
});

