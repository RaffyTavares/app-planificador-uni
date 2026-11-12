/* Vista: Calificaciones, índice académico y calculadora de "¿cuánto necesito?". */
import { esc, fmtNota, fmtDate, plural } from '../util.js';
import { icon } from '../iconos.js';
import { db, ui, mc, escala, notaMateria, notaNecesaria, indiceSemestre, indiceAcumulado, letraDe, notaAprobatoria } from '../estado.js';
import { emptyState, pageHead, render } from '../ui.js';
import { notaChip } from '../componentes.js';
import { accion } from '../acciones.js';

/** Objetivo elegido en la calculadora, por materia. */
const objetivos = new Map();

export default { titulo: 'Calificaciones', render: renderCal };

function renderCal() {
    const sem = indiceSemestre();
    const acu = indiceAcumulado();
    const head = pageHead({
        eyebrow: 'Calificaciones',
        title: 'Cómo vas, <em>materia a materia</em>',
        lead: 'Registra cada evaluación con su peso y la app calcula tu nota, tu letra y tu índice.',
        actions: `<button class="btn btn-primary" type="button" data-action="new" data-type="evaluacion">${icon('plus')}Calificación</button>`,
    });
    const filas = db.materias.map(m => ({ m, n: notaMateria(m.id) }));
    return head + `
    <section class="gpa rise" style="--i:1">
        <div class="gpa-card">
            <p class="eyebrow">Índice del semestre</p>
            <b class="gpa-num">${sem.valor == null ? '—' : fmtNota(sem.valor, 2)}</b>
            <p>${sem.valor == null ? 'Aún no hay notas registradas' : `${sem.proyectado ? 'Proyectado con lo evaluado' : 'Final'} · ${sem.creditos} créditos`}</p>
        </div>
        <div class="gpa-card">
            <p class="eyebrow">Índice acumulado</p>
            <b class="gpa-num">${acu.valor == null ? '—' : fmtNota(acu.valor, 2)}</b>
            <p>${acu.valor == null ? 'Se calcula con todos tus semestres' : `${plural(db.semestres.length, 'semestre', 'semestres')} · ${acu.creditos} créditos`}</p>
            <a class="link-btn" href="#/historial">${icon('history')}Récord y semestres anteriores</a>
        </div>
        <div class="gpa-scale" aria-label="Escala de calificaciones">
            <p class="eyebrow">Escala <a class="link-btn" href="#/ajustes">Ajustar</a></p>
            <ul>${escala().map(n => `<li><span class="grade-chip grade-${n.letra.charAt(0).toLowerCase()}">${esc(n.letra)}</span><small>${n.min}+ · ${fmtNota(n.puntos)} pts</small></li>`).join('')}</ul>
        </div>
    </section>

    ${!db.materias.length ? `<section class="panel rise" style="--i:2">${emptyState({ ic: 'award', title: 'Aún no hay materias en este semestre', text: 'Agrega las materias que estás cursando para registrar sus evaluaciones. Las notas de semestres anteriores van en el récord.', action: `<button class="btn btn-primary" type="button" data-action="new" data-type="materia">${icon('plus')}Agregar materia</button><button class="btn btn-ghost" type="button" data-action="record-nuevo">${icon('history')}Agregar semestre cursado</button>` })}</section>` : `
    <section class="panel rise" style="--i:2">
        <div class="table-wrap">
        <table class="grades-table">
            <thead><tr><th>Materia</th><th>Créditos</th><th>Evaluado</th><th>Acumulado</th><th>Promedio</th><th>Letra</th></tr></thead>
            <tbody>${filas.map(({ m, n }) => `<tr style="${mc(m.id)}">
                <td><a class="mat-tag strong" href="#/materias/${m.id}" data-action="ir-calificaciones" data-id="${m.id}"><i class="dot"></i><span>${esc(m.nombre)}</span></a></td>
                <td class="mono">${m.creditos ?? '—'}</td>
                <td><span class="bar thin"><span style="width:${Math.min(100, n.pesoEvaluado)}%"></span></span><small class="mono">${fmtNota(n.pesoEvaluado, 0)} %</small></td>
                <td class="mono">${fmtNota(n.acumulado)}</td>
                <td class="mono">${n.promedio == null ? '—' : fmtNota(n.promedio)}</td>
                <td>${notaChip(n.final, n.letra)}</td>
            </tr>`).join('')}</tbody>
        </table>
        </div>
    </section>

    <div class="grade-cards">${filas.map(({ m }, i) => `<section class="panel rise" style="--i:${Math.min(i + 3, 10)};${mc(m.id)}">
        <div class="panel-head"><h2><i class="dot"></i>${esc(m.nombre)}</h2><a class="link-btn" href="#/materias/${m.id}">Materia ${icon('arrow')}</a></div>
        ${tablaEvaluaciones(m, { compacta: true })}
        ${calculadora(m)}
    </section>`).join('')}</div>`}`;
}

/** Tabla de evaluaciones de una materia (usada aquí y en el detalle de la materia). */
export function tablaEvaluaciones(m, { compacta = false } = {}) {
    const n = notaMateria(m.id);
    const sinAsignar = Math.max(0, 100 - n.pesoTotal);
    return `<div class="${compacta ? '' : 'panel'}">
        ${compacta ? '' : `<div class="panel-head"><h2>Evaluaciones</h2><button class="btn btn-primary btn-sm" type="button" data-action="new" data-type="evaluacion" data-materia="${m.id}">${icon('plus')}Calificación</button></div>`}
        ${n.evs.length ? `<ul class="eval-list">${n.evs.map(e => `<li class="eval-row ${e.nota == null ? 'is-pending' : ''}">
            <button type="button" class="eval-main" data-action="edit" data-type="evaluacion" data-id="${e.id}">
                <span class="eval-name">${esc(e.nombre)}${e.fecha ? `<small>${fmtDate(e.fecha)}</small>` : ''}</span>
                <span class="eval-weight mono">${fmtNota(e.peso)} %</span>
                <span class="eval-grade mono">${e.nota == null ? '<em>Pendiente</em>' : `${fmtNota(e.nota)}<small>/${fmtNota(e.notaMax, 0)}</small>`}</span>
                <span class="eval-points mono">${e.nota == null ? '' : `+${fmtNota((e.nota / e.notaMax) * e.peso)}`}</span>
            </button>
        </li>`).join('')}</ul>` : `<p class="muted small">Sin evaluaciones. Agrega el primer parcial, las prácticas o el proyecto con su peso.</p>`}
        <div class="eval-foot">
            ${sinAsignar > 0.001 ? `<span class="muted small">${icon('info')}${fmtNota(sinAsignar)} % del curso sin asignar</span>` : '<span></span>'}
            ${compacta ? `<button class="link-btn" type="button" data-action="new" data-type="evaluacion" data-materia="${m.id}">${icon('plus')}Agregar</button>` : ''}
        </div>
    </div>`;
}

/** Calculadora: ¿qué promedio necesito en lo que falta? */
export function calculadora(m) {
    const n = notaMateria(m.id);
    if (!n.evs.length) return '';
    const opciones = escala().filter(x => x.puntos > 0);
    const obj = objetivos.get(m.id) ?? notaAprobatoria();
    const r = notaNecesaria(m.id, obj);
    const letra = letraDe(obj);
    const mensaje = {
        logrado: `${icon('checkCircle')}Ya tienes asegurada la <strong>${esc(letra.letra)}</strong> con lo evaluado.`,
        asegurado: `${icon('checkCircle')}Ya tienes asegurada la <strong>${esc(letra.letra)}</strong>, aunque saques 0 en lo que falta.`,
        imposible: `${icon('alert')}Con lo que queda (${fmtNota(n.restante)} %) ya no alcanza para la <strong>${esc(letra.letra)}</strong>${r.necesaria ? ` (necesitarías ${fmtNota(r.necesaria, 0)} de 100)` : ''}.`,
        posible: `${icon('target')}Necesitas un promedio de <strong class="big-num">${fmtNota(r.necesaria, 1)}</strong> en el ${fmtNota(n.restante)} % restante para la <strong>${esc(letra.letra)}</strong>.`,
    }[r.estado];
    return `<div class="calc calc-${r.estado}">
        <label class="calc-q">${icon('sparkles')}<span>¿Cuánto necesito para</span>
            <select class="select sm" data-action-change="calc-objetivo" data-materia="${m.id}">
                ${opciones.map(x => `<option value="${x.min}" ${x.min === obj ? 'selected' : ''}>${esc(x.letra)} (${x.min}+)</option>`).join('')}
            </select><span>?</span></label>
        <p class="calc-a">${mensaje}</p>
    </div>`;
}

accion({
    'calc-objetivo': (el) => { objetivos.set(Number(el.dataset.materia), Number(el.value)); render(); },
    'ir-calificaciones': () => { ui.materiaTab = 'calificaciones'; },
});
