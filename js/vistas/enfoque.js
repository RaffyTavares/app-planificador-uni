/* Vista: Enfoque — temporizador Pomodoro y estadísticas de estudio. */
import { esc, plural, fmtDuration, fmtCorto, toISO, addDays, startOfDay, fromDateTime, DIAS_CORTO, MESES, fmtRelativo } from '../util.js';
import { icon } from '../iconos.js';
import { db, mc, materiaName, minutosPorDia, minutosHoy, minutosSemanaPorMateria, racha, pomodoroConfig } from '../estado.js';
import { pageHead, emptyState, render } from '../ui.js';
import { materiaOptions } from '../componentes.js';
import { accion } from '../acciones.js';
import { pomo, MODOS, segundosRestantes, totalModo, fmtReloj, iniciar, pausar, reiniciar, cambiarModo, setMateria, terminarAhora, tick } from '../pomodoro.js';

export default { titulo: 'Enfoque', render: renderEnfoque, alRenderizar: () => tick() };

function renderEnfoque() {
    const cfg = pomodoroConfig();
    const s = segundosRestantes();
    const L = 2 * Math.PI * 120;
    const hoy = minutosHoy();
    const semana = minutosPorDia(7).reduce((a, d) => a + d.min, 0);
    const r = racha();

    return pageHead({
        eyebrow: 'Enfoque',
        title: 'Un bloque a la vez, <em>sin distracciones</em>',
        lead: `Técnica Pomodoro: ${cfg.trabajo} min de enfoque y ${cfg.descanso} de descanso. Cada bloque se guarda en tus estadísticas.`,
        actions: `<a class="btn btn-ghost" href="#/ajustes">${icon('settings')}Ajustar tiempos</a>`,
    }) + `
    <div class="focus-layout">
        <section class="panel timer-panel rise ${pomo.modo !== 'trabajo' ? 'is-break' : ''}" style="--i:1;${mc(pomo.materiaId)}" aria-label="Temporizador">
            <div class="chips timer-modes" role="tablist" aria-label="Modo">
                ${Object.entries(MODOS).map(([k, m]) => `<button class="chip" type="button" role="tab" aria-selected="${pomo.modo === k}" data-action="pomo-modo" data-modo="${k}">${m.label}</button>`).join('')}
            </div>
            <div class="timer-ring">
                <svg viewBox="0 0 260 260" aria-hidden="true">
                    <circle class="ring-bg" cx="130" cy="130" r="120"/>
                    <circle class="ring-fg" id="pomoAnillo" cx="130" cy="130" r="120" data-len="${L}" style="stroke-dasharray:${L};stroke-dashoffset:${L * (1 - s / totalModo())}"/>
                </svg>
                <div class="timer-center">
                    <span class="timer-mode">${MODOS[pomo.modo].label}</span>
                    <span class="timer-clock" id="pomoReloj" role="timer" aria-live="off">${fmtReloj(s)}</span>
                    <span class="timer-cycle">${Array.from({ length: cfg.ciclos }, (_, i) => `<i class="${i < pomo.ciclo % cfg.ciclos ? 'is-done' : ''}"></i>`).join('')}</span>
                </div>
            </div>
            <label class="field timer-subject"><span class="field-label">Estudiando</span>
                <select class="select" data-action-change="pomo-materia">${materiaOptions(pomo.materiaId, { general: false, placeholder: 'Sin materia' })}</select>
            </label>
            <div class="timer-controls">
                <button class="icon-btn bordered lg" type="button" data-action="pomo-reset" aria-label="Reiniciar" title="Reiniciar">${icon('reset')}</button>
                ${pomo.corriendo
                    ? `<button class="btn btn-primary btn-xl" type="button" data-action="pomo-pausa">${icon('pause')}Pausar</button>`
                    : `<button class="btn btn-primary btn-xl" type="button" data-action="pomo-iniciar">${icon('play')}${pomo.restante != null && pomo.restante < totalModo() ? 'Continuar' : 'Empezar'}</button>`}
                <button class="icon-btn bordered lg" type="button" data-action="pomo-terminar" aria-label="${pomo.modo === 'trabajo' ? 'Terminar y guardar' : 'Saltar descanso'}" title="${pomo.modo === 'trabajo' ? 'Terminar y guardar lo estudiado' : 'Saltar descanso'}">${icon('skip')}</button>
            </div>
            <div class="goal">
                <div class="goal-label"><span>Meta de hoy</span><span class="mono">${fmtDuration(hoy)} / ${fmtDuration(cfg.metaDiaria)}</span></div>
                <div class="bar"><span style="width:${Math.min(100, (hoy / cfg.metaDiaria) * 100)}%"></span></div>
            </div>
        </section>

        <div class="dash-col">
            <section class="mini-stats four rise" style="--i:2">
                <div class="mini-stat"><b>${fmtCorto(hoy)}</b><span>Hoy</span></div>
                <div class="mini-stat"><b>${fmtCorto(semana)}</b><span>Últimos 7 días</span></div>
                <div class="mini-stat"><b>${r}</b><span>${icon('flame')}Días seguidos</span></div>
                <div class="mini-stat"><b>${db.sesiones.length}</b><span>Sesiones en total</span></div>
            </section>
            <section class="panel rise" style="--i:3" aria-labelledby="chDias">
                <div class="panel-head"><h2 id="chDias">Minutos por día</h2><span class="muted small">Últimas 2 semanas</span></div>
                ${graficoDias()}
            </section>
            <section class="panel rise" style="--i:4" aria-labelledby="chMat">
                <div class="panel-head"><h2 id="chMat">Esta semana por materia</h2></div>
                ${graficoMaterias()}
            </section>
        </div>
    </div>

    <section class="panel rise" style="--i:5" aria-labelledby="chHeat">
        <div class="panel-head"><h2 id="chHeat">Constancia</h2><span class="muted small">Últimas 15 semanas</span></div>
        ${mapaCalor()}
    </section>

    <section class="panel rise" style="--i:6" aria-labelledby="sesTitle">
        <div class="panel-head"><h2 id="sesTitle">Sesiones recientes</h2></div>
        ${db.sesiones.length ? `<ul class="session-list">${[...db.sesiones].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio))).slice(0, 8).map(x => `
            <li style="${mc(x.materiaId)}"><i class="dot"></i><span>${esc(materiaName(x.materiaId, 'Sin materia'))}</span><span class="mono">${fmtDuration(x.minutos)}</span><small>${fmtRelativo(x.inicio)}</small>
                <button class="icon-btn sm danger" type="button" data-action="delete" data-type="sesion" data-id="${x.id}" aria-label="Eliminar sesión">${icon('trash')}</button></li>`).join('')}</ul>`
            : emptyState({ ic: 'timer', title: 'Aún no hay sesiones', text: 'Empieza tu primer bloque de enfoque arriba.' })}
    </section>`;
}

/* ---------- Gráfico de barras: minutos por día ---------- */
function graficoDias() {
    const datos = minutosPorDia(14);
    if (!datos.some(d => d.min)) return emptyState({ ic: 'chart', title: 'Sin datos todavía', text: 'Tus sesiones de estudio aparecerán aquí.' });
    const W = 560, H = 180, padL = 34, padB = 26, padT = 10;
    const max = Math.max(30, ...datos.map(d => d.min));
    const paso = max <= 60 ? 15 : max <= 180 ? 30 : max <= 360 ? 60 : 120;
    const tope = Math.ceil(max / paso) * paso;
    const anchoCol = (W - padL) / datos.length;
    const bw = Math.min(26, anchoCol - 6);
    const y = (v) => padT + (H - padB - padT) * (1 - v / tope);
    const hoy = toISO(new Date());

    const lineas = [];
    for (let v = 0; v <= tope; v += paso) {
        lineas.push(`<line class="grid" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
    }
    const barras = datos.map((d, i) => {
        const x = padL + i * anchoCol + (anchoCol - bw) / 2;
        const top = y(d.min), base = y(0), h = base - top;
        const r = Math.min(4, h / 2, bw / 2);
        const fecha = new Date(d.fecha + 'T12:00');
        const etiqueta = `${fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}: ${fmtDuration(d.min)}`;
        const barra = d.min ? `<path class="bar-mark ${d.fecha === hoy ? 'is-today' : ''}" d="M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z"/>` : '';
        return `<g class="bar-hit" data-tip="${esc(etiqueta)}" tabindex="0" role="img" aria-label="${esc(etiqueta)}">
            <rect x="${padL + i * anchoCol}" y="${padT}" width="${anchoCol}" height="${H - padB - padT}" fill="transparent"/>${barra}
            <text class="axis ${d.fecha === hoy ? 'is-strong' : ''}" x="${padL + i * anchoCol + anchoCol / 2}" y="${H - 8}" text-anchor="middle">${i % 2 === datos.length % 2 || d.fecha === hoy ? DIAS_CORTO[fecha.getDay()].charAt(0) + fecha.getDate() : ''}</text>
        </g>`;
    }).join('');
    return `<figure class="chart">
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="group" aria-label="Minutos estudiados por día en las últimas dos semanas">${lineas.join('')}${barras}</svg>
        <details class="chart-table"><summary>Ver como tabla</summary>
            <table><thead><tr><th>Día</th><th>Minutos</th></tr></thead><tbody>${datos.map(d => `<tr><td>${new Date(d.fecha + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${d.min}</td></tr>`).join('')}</tbody></table>
        </details>
    </figure>`;
}

/* ---------- Barras horizontales por materia (con etiqueta directa) ---------- */
function graficoMaterias() {
    const datos = minutosSemanaPorMateria();
    if (!datos.length) return emptyState({ ic: 'book', title: 'Nada esta semana', text: 'Elige una materia en el temporizador para ver el reparto.' });
    const max = Math.max(...datos.map(d => d.min));
    return `<ul class="hbars">${datos.map(d => `<li style="${mc(d.materiaId)}" data-tip="${esc(materiaName(d.materiaId, 'Sin materia'))}: ${fmtDuration(d.min)}">
        <span class="hbar-label"><i class="dot"></i>${esc(materiaName(d.materiaId, 'Sin materia'))}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, (d.min / max) * 100)}%"></span></span>
        <span class="hbar-value mono">${fmtDuration(d.min)}</span>
    </li>`).join('')}</ul>`;
}

/* ---------- Mapa de calor (escala secuencial de un solo tono) ---------- */
function mapaCalor() {
    const porDia = new Map();
    db.sesiones.forEach(s => { const k = String(s.inicio).slice(0, 10); porDia.set(k, (porDia.get(k) || 0) + s.minutos); });
    const hoy = startOfDay(new Date());
    const lunesActual = addDays(hoy, -((hoy.getDay() + 6) % 7));
    const inicio = addDays(lunesActual, -7 * 14);
    const nivel = (m) => (m === 0 ? 0 : m < 25 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);
    const cols = [];
    let mesPrevio = -1;
    for (let w = 0; w < 15; w++) {
        const lunes = addDays(inicio, w * 7);
        const mes = lunes.getMonth();
        const celdas = [];
        for (let d = 0; d < 7; d++) {
            const f = addDays(lunes, d);
            const iso = toISO(f);
            if (f > hoy) { celdas.push('<span class="hm-cell is-future"></span>'); continue; }
            const m = porDia.get(iso) || 0;
            const t = `${f.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}: ${m ? fmtDuration(m) : 'sin estudio'}`;
            celdas.push(`<span class="hm-cell lv-${nivel(m)}" data-tip="${esc(t)}" role="img" aria-label="${esc(t)}"></span>`);
        }
        cols.push(`<div class="hm-col"><span class="hm-month">${mes !== mesPrevio ? MESES[mes].slice(0, 3) : ''}</span>${celdas.join('')}</div>`);
        mesPrevio = mes;
    }
    return `<div class="heatmap">
        <div class="hm-days"><span></span>${[1, 2, 3, 4, 5, 6, 0].map((d, i) => `<span>${i % 2 === 0 ? DIAS_CORTO[d] : ''}</span>`).join('')}</div>
        <div class="hm-grid">${cols.join('')}</div>
    </div>
    <div class="hm-legend"><span>Menos</span>${[0, 1, 2, 3, 4].map(l => `<span class="hm-cell lv-${l}"></span>`).join('')}<span>Más</span>
        <span class="muted small">· 1–24 min, 25–59, 60–119, 2 h o más</span></div>`;
}

/* ---------- Acciones ---------- */
accion({
    'pomo-iniciar': () => { iniciar(); render(); },
    'pomo-pausa': () => { pausar(); render(); },
    'pomo-reset': () => { reiniciar(); render(); },
    'pomo-terminar': async () => { await terminarAhora(); render(); },
    'pomo-modo': (el) => { cambiarModo(el.dataset.modo); render(); },
    'pomo-materia': (el) => { setMateria(el.value ? Number(el.value) : null); render(); },
});

