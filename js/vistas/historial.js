/* Vista: Historial — semestres, récord académico (notas de semestres cursados) y logros. */
import { $, $$, esc, plural, fmtNota, fmtHours, fmtDate, WEEK, DIAS } from '../util.js';
import { icon } from '../iconos.js';
import { db, cargarEstado, P, perfil, TRAMOS, indice, indiceAcumulado, notaMateria, letraDe, escala, sortTasks, classesOnDay, classStatus, durOf } from '../estado.js';
import { pageHead, emptyState, render, toast, toastError, confirmDialog, openForm, field } from '../ui.js';
import { taskRow, agendaItem, notaChip } from '../componentes.js';
import { accion, idDe } from '../acciones.js';
import { api } from '../api.js';
import { openSemestreForm } from '../formularios.js';

export default { titulo: 'Historial', render: renderHistorial };

/* ---------- Totales del récord ---------- */
function resumenRecord() {
    let cursados = 0, aprobados = 0, conNota = 0;
    db.historico.materias.forEach(m => {
        const r = notaMateria(m.id, db.historico.evaluaciones);
        const c = Number(m.creditos) || 0;
        if (r.final == null || !r.completa) return;
        conNota++;
        cursados += c;
        if (r.letra?.puntos > 0) aprobados += c;
    });
    return { cursados, aprobados, conNota };
}

function renderHistorial() {
    const acu = indiceAcumulado();
    const rec = resumenRecord();
    const pasadosSem = db.semestres.filter(s => !s.activo);
    const hechas = sortTasks(db.tareas.filter(t => t.completada));
    const hoy = new Date().getDay();
    const pasados = WEEK.slice(0, WEEK.indexOf(hoy) + 1).map(d => ({ d, lista: classesOnDay(d).filter(c => d !== hoy || classStatus(c, d) === 'past') })).filter(x => x.lista.length).reverse();
    const nClases = pasados.reduce((s, x) => s + x.lista.length, 0);
    const minClases = pasados.reduce((s, x) => s + x.lista.reduce((a, c) => a + durOf(c), 0), 0);

    return pageHead({
        eyebrow: 'Historial académico',
        title: 'Lo que ya <em>lograste</em>',
        lead: `Tu récord de notas por ${P().uno} y tu índice acumulado de toda la carrera.`,
        actions: `<button class="btn btn-ghost" type="button" data-action="semestre-nuevo">${icon('plus')}Nuevo ${P().uno}</button>
            <button class="btn btn-primary" type="button" data-action="record-nuevo">${icon('history')}Agregar ${P().uno} cursado</button>`,
    }) + `
    <section class="mini-stats four rise" style="--i:1">
        <div class="mini-stat"><b>${acu.valor == null ? '—' : fmtNota(acu.valor, 2)}</b><span>Índice acumulado${acu.proyectado ? ' (con proyección)' : ''}</span></div>
        <div class="mini-stat"><b>${rec.aprobados}${perfil().creditosCarrera ? `<small> / ${perfil().creditosCarrera}</small>` : ''}</b><span>Créditos aprobados${perfil().creditosCarrera ? ` · ${Math.min(100, Math.round(rec.aprobados / perfil().creditosCarrera * 100))}% de la carrera` : ''}</span></div>
        <div class="mini-stat"><b>${rec.conNota}</b><span>Materias con nota final</span></div>
        <div class="mini-stat"><b>${db.semestres.length}</b><span>${db.semestres.length === 1 ? P().Uno : P().Varios}</span></div>
    </section>

    ${!pasadosSem.length ? `
    <section class="panel callout rise" style="--i:2">
        <span class="review-ic">${icon('history')}</span>
        <div><strong>¿Ya llevas ${P().varios} cursados?</strong>
            <p>Agrega tus materias anteriores con su nota final y la app calculará tu índice acumulado de toda la carrera. Puedes pegarlas desde una hoja de cálculo o del portal.</p></div>
        <button class="btn btn-primary" type="button" data-action="record-nuevo">${icon('plus')}Agregar ${P().uno} cursado</button>
    </section>` : ''}

    <section class="panel rise" style="--i:2" aria-labelledby="semTitle">
        <div class="panel-head"><h2 id="semTitle">Récord académico</h2><span class="muted small">Del más reciente al más antiguo</span></div>
        <div class="record">${db.semestres.map((s, i) => semestreRecord(s, i === 0)).join('')}</div>
    </section>

    <div class="mini-stats rise" style="--i:3">
        <div class="mini-stat"><b>${hechas.length}</b><span>Tareas completadas este ${P().uno}</span></div>
        <div class="mini-stat"><b>${nClases}</b><span>Clases esta semana</span></div>
        <div class="mini-stat"><b>${fmtHours(minClases)}</b><span>Horas de clase esta semana</span></div>
    </div>
    <div class="hist-grid">
        <section class="panel rise" style="--i:4" aria-labelledby="hT">
            <div class="panel-head"><h2 id="hT">Tareas completadas <span class="count">${hechas.length}</span></h2></div>
            ${hechas.length ? `<ul class="task-list">${hechas.map(t => taskRow(t)).join('')}</ul>` : emptyState({ ic: 'checkCircle', title: 'Aún no hay tareas completadas' })}
        </section>
        <section class="panel rise" style="--i:5" aria-labelledby="hC">
            <div class="panel-head"><h2 id="hC">Clases impartidas esta semana <span class="count">${nClases}</span></h2></div>
            ${pasados.length ? pasados.map(x => `<div class="day-group"><h3 class="group-title"><span>${x.d === hoy ? 'Hoy' : DIAS[x.d]}</span><span class="count">${x.lista.length}</span></h3>
                <ul class="agenda">${x.lista.map(c => agendaItem(c, x.d, { showStatus: false })).join('')}</ul></div>`).join('')
                : emptyState({ ic: 'history', title: 'Sin clases pasadas esta semana' })}
        </section>
    </div>`;
}

function semestreRecord(s, abierto) {
    const mats = db.historico.materias.filter(m => m.semestreId === s.id);
    const idx = indice(mats, db.historico.evaluaciones);
    const creditos = mats.reduce((a, m) => a + (Number(m.creditos) || 0), 0);
    return `<details class="sem-record ${s.activo ? 'is-active' : ''}" ${abierto || s.activo ? 'open' : ''}>
        <summary>
            <span class="sem-main"><strong>${esc(s.nombre)}</strong>
                <small>${plural(mats.length, 'materia', 'materias')} · ${creditos} créditos${s.inicio ? ` · ${fmtDate(s.inicio, { month: 'short', year: 'numeric' })}` : ''}</small></span>
            <span class="sem-gpa"><b>${idx.valor == null ? '—' : fmtNota(idx.valor, 2)}</b><small>${idx.valor == null ? 'sin notas' : idx.proyectado ? 'proyectado' : 'índice'}</small></span>
            ${s.activo ? '<span class="pill tone-accent">Actual</span>' : ''}
            ${icon('chevronDown', 'sem-chevron')}
        </summary>
        ${mats.length ? `<table class="record-table">
            <thead><tr><th>Materia</th><th>Créditos</th><th>Nota</th><th>Letra</th></tr></thead>
            <tbody>${mats.map(m => {
                const r = notaMateria(m.id, db.historico.evaluaciones);
                return `<tr><td>${esc(m.nombre)}</td><td class="mono">${m.creditos ?? '—'}</td>
                    <td class="mono">${r.final == null ? '<span class="muted">—</span>' : `${fmtNota(r.final)}${r.completa ? '' : ' <small class="muted">proy.</small>'}`}</td>
                    <td>${notaChip(r.final, r.letra)}</td></tr>`;
            }).join('')}</tbody></table>` : `<p class="muted small record-empty">Este ${P().uno} aún no tiene materias.</p>`}
        <div class="sem-actions">
            ${s.activo
                ? `<a class="btn btn-ghost btn-sm" href="#/calificaciones">${icon('award')}Ver calificaciones</a>`
                : `<button class="btn btn-primary btn-sm" type="button" data-action="record-editar" data-id="${s.id}">${icon('pencil')}Editar notas</button>
                   <button class="btn btn-ghost btn-sm" type="button" data-action="semestre-activar" data-id="${s.id}">Abrir ${P().uno}</button>`}
            <button class="icon-btn sm" type="button" data-action="semestre-editar" data-id="${s.id}" aria-label="Renombrar ${P().uno}" title="Renombrar">${icon('settings')}</button>
            ${db.semestres.length > 1 ? `<button class="icon-btn sm danger" type="button" data-action="semestre-borrar" data-id="${s.id}" aria-label="Eliminar ${P().uno}">${icon('trash')}</button>` : ''}
        </div>
    </details>`;
}

/* =====================================================================
   FORMULARIO: SEMESTRE CURSADO CON SUS NOTAS
   ===================================================================== */
/** Tramos del año según el tipo de período del estudiante: { clave: [nombre, inicio, fin] }. */
const periodos = () => Object.fromEntries((TRAMOS[perfil().periodo] || TRAMOS.semestre).map(([k, ...r]) => [k, r]));

/** Tramo anterior al actual (el último que ya terminó) y su año. */
function tramoAnterior() {
    const hoy = new Date(), mmdd = `${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const lista = (TRAMOS[perfil().periodo] || TRAMOS.semestre).filter(t => t[0] !== 'verano');
    const terminados = lista.filter(t => t[3] < mmdd);
    return terminados.length ? { clave: terminados.at(-1)[0], anio: hoy.getFullYear() } : { clave: lista.at(-1)[0], anio: hoy.getFullYear() - 1 };
}

/** "92", "92,5", "A", "b+" → nota sobre 100 (las letras usan el mínimo de su rango). */
export function interpretarNota(txt) {
    const v = String(txt ?? '').trim();
    if (!v) return { nota: null, ok: true };
    const num = Number(v.replace(',', '.'));
    if (!Number.isNaN(num)) return num >= 0 && num <= 100 ? { nota: num, ok: true } : { ok: false, error: 'Entre 0 y 100' };
    const n = escala().find(x => x.letra.toUpperCase() === v.toUpperCase());
    return n ? { nota: n.min, ok: true, letra: n.letra } : { ok: false, error: `Usa un número o ${escala().map(x => x.letra).join(', ')}` };
}

const filaMateria = (m = {}) => `<tr class="rec-row" data-mid="${m.id || ''}">
    <td><input class="input sm" data-k="nombre" maxlength="120" placeholder="Ej. Cálculo I" value="${esc(m.nombre)}" aria-label="Materia"></td>
    <td><input class="input sm" data-k="creditos" type="number" min="0" max="30" inputmode="numeric" placeholder="4" value="${esc(m.creditos ?? '')}" aria-label="Créditos"></td>
    <td><input class="input sm" data-k="nota" maxlength="6" placeholder="92 o A" value="${esc(m.notaFinal ?? '')}" aria-label="Nota final"></td>
    <td class="rec-letra" aria-live="polite"></td>
    <td><button class="icon-btn sm" type="button" data-quitar-materia aria-label="Quitar materia">${icon('x')}</button></td>
</tr>`;

/** Convierte texto pegado (Excel, Sheets o el portal) en filas: materia, créditos, nota. */
function interpretarPegado(texto) {
    return String(texto).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
        let p = l.split(/\t|;|\|/).map(x => x.trim()).filter(x => x !== '');
        if (p.length === 1) p = l.split(/\s*,\s*/);
        if (p.length === 1) {
            // "Física I 4 92" → los dos últimos números son créditos y nota
            const m = l.match(/^(.*?)\s+(\d{1,2})\s+(\d{1,3}(?:[.,]\d+)?|[A-Za-z][+-]?)$/);
            if (m) p = [m[1], m[2], m[3]];
        }
        const [nombre, a = '', b = ''] = p;
        // Si solo hay dos columnas y la segunda no parece créditos, es la nota
        if (p.length === 2 && !/^\d{1,2}$/.test(a)) return { nombre, creditos: '', notaFinal: a };
        return { nombre, creditos: a, notaFinal: b };
    }).filter(f => f.nombre && !/^(materia|asignatura|nombre)$/i.test(f.nombre));
}

export function openRecordForm(s = null) {
    const anio = new Date().getFullYear();
    const mats = s ? db.historico.materias.filter(m => m.semestreId === s.id) : [];
    const filas = mats.length ? mats.map(m => ({ ...m, notaFinal: m.notaFinal ?? (notaMateria(m.id, db.historico.evaluaciones).completa ? Math.round(notaMateria(m.id, db.historico.evaluaciones).final * 100) / 100 : '') })) : [{}, {}, {}, {}, {}];

    openForm({
        eyebrow: s ? 'Récord académico' : `${P().Uno} cursado`,
        title: s ? esc(s.nombre) : `Agrega un ${P().uno} que ya terminaste`,
        desc: 'Escribe cada materia con sus créditos y la nota final (un número de 0 a 100 o la letra). Las filas vacías se ignoran.',
        submit: s ? 'Guardar notas' : 'Agregar al récord',
        wide: true,
        body: `
            ${s ? field({ label: `Nombre del ${P().uno}`, control: `<input class="input" name="nombre" required maxlength="80" value="${esc(s.nombre)}">` }) : `
            <div class="form-row three">
                ${field({ label: 'Período', control: `<select class="select" name="periodo">${Object.entries(periodos()).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>` })}
                ${field({ label: 'Año', control: `<input class="input" type="number" name="anio" required min="1990" max="${anio}" value="${anio - 1}">` })}
                ${field({ label: 'Nombre', hint: 'Se completa solo; puedes cambiarlo.', control: '<input class="input" name="nombre" required maxlength="80">' })}
            </div>`}
            <div class="field" data-sin-validar>
                <span class="field-label">Materias</span>
                <div class="table-wrap"><table class="rec-table">
                    <thead><tr><th>Materia</th><th>Créditos</th><th>Nota final</th><th></th><th></th></tr></thead>
                    <tbody id="recFilas">${filas.map(filaMateria).join('')}</tbody>
                </table></div>
                <div class="rec-tools">
                    <button class="btn btn-ghost btn-sm" type="button" id="recAgregar">${icon('plus')}Agregar materia</button>
                    <details class="rec-paste">
                        <summary>${icon('copy')}Pegar una lista</summary>
                        <p class="field-hint">Una materia por línea: <code>Materia ; créditos ; nota</code>. También sirve copiar tres columnas desde Excel o Google Sheets.</p>
                        <textarea class="textarea sm" id="recPegar" rows="4" placeholder="Física I ; 4 ; 88&#10;Química General ; 4 ; B&#10;Orientación Universitaria ; 2 ; 95"></textarea>
                        <button class="btn btn-ghost btn-sm" type="button" id="recPegarBtn">Agregar a la tabla</button>
                    </details>
                </div>
            </div>
            <p class="rec-summary" id="recResumen" aria-live="polite"></p>`,
        onOpen(form) {
            const tbody = $('#recFilas', form);
            const nombre = form.elements.nombre;
            let nombreManual = !!s;
            const sugerir = () => {
                if (s || nombreManual) return;
                nombre.value = `${periodos()[form.elements.periodo.value][0]} ${form.elements.anio.value}`;
            };
            if (!s) {
                const previo = tramoAnterior();
                form.elements.periodo.value = previo.clave;
                form.elements.anio.value = previo.anio;
                form.elements.periodo.addEventListener('change', sugerir);
                form.elements.anio.addEventListener('input', sugerir);
                nombre.addEventListener('input', () => { nombreManual = true; });
                sugerir();
            }

            const actualizar = () => {
                let cred = 0, pts = 0, credNota = 0, n = 0;
                $$('.rec-row', tbody).forEach(tr => {
                    const notaIn = $('[data-k="nota"]', tr);
                    const r = interpretarNota(notaIn.value);
                    const celda = $('.rec-letra', tr);
                    notaIn.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
                    celda.innerHTML = !r.ok ? `<small class="tone-danger-text">${esc(r.error)}</small>` : r.nota == null ? '' : notaChip(r.nota, letraDe(r.nota));
                    const nom = $('[data-k="nombre"]', tr).value.trim();
                    const c = Number($('[data-k="creditos"]', tr).value) || 0;
                    if (!nom) return;
                    n++;
                    cred += c;
                    if (r.ok && r.nota != null && c) { pts += letraDe(r.nota).puntos * c; credNota += c; }
                });
                $('#recResumen', form).innerHTML = n
                    ? `${plural(n, 'materia', 'materias')} · ${cred} créditos · índice del ${P().uno} <strong>${credNota ? fmtNota(pts / credNota, 2) : '—'}</strong>`
                    : '';
            };
            tbody.addEventListener('input', actualizar);
            tbody.addEventListener('click', (e) => {
                if (!e.target.closest('[data-quitar-materia]')) return;
                e.target.closest('tr').remove();
                if (!$('.rec-row', tbody)) tbody.insertAdjacentHTML('beforeend', filaMateria());
                actualizar();
            });
            $('#recAgregar', form).addEventListener('click', () => {
                tbody.insertAdjacentHTML('beforeend', filaMateria());
                $('.rec-row:last-child [data-k="nombre"]', tbody).focus();
            });
            $('#recPegarBtn', form).addEventListener('click', () => {
                const nuevas = interpretarPegado($('#recPegar', form).value);
                if (!nuevas.length) { toast({ type: 'warn', title: 'No reconocí ninguna materia', msg: 'Usa una línea por materia: Materia ; créditos ; nota' }); return; }
                // Sustituye las filas vacías antes de añadir
                $$('.rec-row', tbody).forEach(tr => { if (!$$('input', tr).some(i => i.value.trim())) tr.remove(); });
                tbody.insertAdjacentHTML('beforeend', nuevas.map(filaMateria).join(''));
                $('#recPegar', form).value = '';
                $('.rec-paste', form).open = false;
                actualizar();
                toast({ type: 'success', title: `${plural(nuevas.length, 'materia agregada', 'materias agregadas')} a la tabla`, msg: 'Revisa los créditos y las notas antes de guardar.' });
            });
            actualizar();
        },
        async onSubmit(d, form) {
            const materias = [];
            for (const tr of $$('.rec-row', form)) {
                const nombreM = $('[data-k="nombre"]', tr).value.trim();
                const cred = $('[data-k="creditos"]', tr).value.trim();
                const notaTxt = $('[data-k="nota"]', tr).value;
                if (!nombreM && !cred && !notaTxt.trim()) continue;
                if (!nombreM) { $('[data-k="nombre"]', tr).focus(); throw new Error('A una fila le falta el nombre de la materia.'); }
                const r = interpretarNota(notaTxt);
                if (!r.ok) { $('[data-k="nota"]', tr).focus(); throw new Error(`La nota de «${nombreM}» no es válida: ${r.error}.`); }
                materias.push({ id: tr.dataset.mid ? Number(tr.dataset.mid) : undefined, nombre: nombreM, creditos: cred === '' ? null : Number(cred), notaFinal: r.nota });
            }
            if (!s && !materias.length) throw new Error('Agrega al menos una materia.');
            let estado;
            if (s) {
                estado = await api.post(`semestres/${s.id}/record`, { nombre: d.nombre, materias });
            } else {
                const [, ini, fin] = periodos()[d.periodo];
                estado = await api.post('semestres', { nombre: d.nombre, inicio: `${d.anio}-${ini}`, fin: `${d.anio}-${fin}`, pasado: true, materias });
            }
            cargarEstado(estado);
            render();
            const acu = indiceAcumulado();
            toast({
                type: 'success',
                title: s ? 'Notas actualizadas' : `${P().Uno} agregado al récord`,
                msg: `${plural(materias.length, 'materia', 'materias')} · índice acumulado ${acu.valor == null ? '—' : fmtNota(acu.valor, 2)}`,
                action: !s ? { label: 'Agregar otro', run: () => openRecordForm() } : null,
            });
        },
    });
}

accion({
    'record-nuevo': () => openRecordForm(),
    'record-editar': (el) => openRecordForm(db.semestres.find(s => s.id === idDe(el))),
    'semestre-nuevo': () => openSemestreForm(),
    'semestre-editar': (el) => openSemestreForm(db.semestres.find(s => s.id === idDe(el))),
    'semestre-activar': async (el) => {
        try {
            cargarEstado(await api.post(`semestres/${idDe(el)}/activar`));
            render({ enter: true });
            toast({ type: 'success', title: `${P().Uno} abierto`, msg: `${db.semestre.nombre}. Vuelve al actual desde Historial.` });
        } catch (e) { toastError(e); }
    },
    'semestre-borrar': (el) => {
        const s = db.semestres.find(x => x.id === idDe(el));
        confirmDialog({
            title: `¿Eliminar «${s.nombre.replace(/[<>&"]/g, '')}»?`,
            desc: 'Se borrarán para siempre sus materias y notas (y, si las tiene, clases, tareas, apuntes y archivos). Esta acción no se puede deshacer.',
            confirm: `Eliminar ${P().uno}`,
            async onConfirm() {
                cargarEstado(await api.del(`semestres/${s.id}`));
                render({ enter: true });
                toast({ type: 'info', title: `${P().Uno} eliminado` });
            },
        });
    },
});
