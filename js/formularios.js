/* Formularios de creación y edición (se abren en el diálogo principal). */
import { $, $$, esc, fmtDuration, fmtTime, toISO, addDays, DIAS, DIAS_CORTO, WEEK, fmtBytes, fmtRelativo } from './util.js';
import { markdown } from './markdown.js';
import { accion, idDe } from './acciones.js';
import { icon, iconoArchivo } from './iconos.js';
import { api } from './api.js';
import { P,
    db, ui, app, mc, HUES, HUE_LABEL, hueOf, nextFreeHue, materiaName, overlapsFor, fmtRange, PRIO_LABEL, REC_LABEL, archivosDeTarea, reemplazar,
} from './estado.js';
import { openForm, field, toast, toastError, render } from './ui.js';
import { materiaOptions, CATEGORIAS } from './componentes.js';
import { crear, actualizar, subirArchivos } from './datos.js';

const borrarBtn = (tipo, id) =>
    `<button class="btn btn-ghost" type="button" data-action="delete" data-type="${tipo}" data-id="${id}" aria-label="Eliminar">${icon('trash')}</button>`;

const materiaPreferida = () => (ui.route === 'materias' && ui.param ? Number(ui.param) : (ui.taskMateria && ui.taskMateria !== 'general' ? Number(ui.taskMateria) : ''));

/* =====================================================================
   MATERIA
   ===================================================================== */
export function openMateriaForm(m = null) {
    const color = m ? hueOf(m.id) : nextFreeHue();
    openForm({
        eyebrow: m ? 'Editar materia' : 'Nueva materia',
        title: m ? esc(m.nombre) : 'Agrega una materia',
        submit: m ? 'Guardar cambios' : 'Agregar materia',
        body: `
            ${field({ label: 'Nombre de la materia', control: `<input class="input" name="nombre" required maxlength="120" placeholder="Ej. Cálculo Diferencial" value="${esc(m?.nombre)}">` })}
            <div class="form-row">
                ${field({ label: 'Profesor', optional: true, control: `<input class="input" name="profesor" maxlength="120" placeholder="Ej. Dra. Martínez" value="${esc(m?.profesor)}">` })}
                ${field({ label: 'Créditos', optional: true, control: `<input class="input" name="creditos" type="number" min="0" max="30" step="1" inputmode="numeric" placeholder="Ej. 4" value="${esc(m?.creditos)}">` })}
            </div>
            ${field({ label: 'Ausencias permitidas', optional: true, hint: 'Te avisaremos cuando te acerques al límite.', control: `<input class="input" name="maxAusencias" type="number" min="0" max="200" inputmode="numeric" placeholder="Ej. 3" value="${esc(m?.maxAusencias)}">` })}
            <fieldset class="field">
                <legend class="field-label">Color</legend>
                <div class="swatches">
                    ${HUES.map(h => `<label class="swatch" style="--mc:var(--h-${h})" title="${HUE_LABEL[h]}">
                        <input type="radio" name="color" value="${h}" ${h === color ? 'checked' : ''}>
                        <span aria-hidden="true"></span><span class="sr-only">${HUE_LABEL[h]}</span>
                    </label>`).join('')}
                </div>
            </fieldset>`,
        footLeft: m ? `<button class="btn btn-ghost" type="button" data-action="delete" data-type="materia" data-id="${m.id}" aria-label="Eliminar materia">${icon('trash')}</button>` : '',
        async onSubmit(d) {
            const cuerpo = { nombre: d.nombre, profesor: d.profesor, creditos: d.creditos, color: d.color, maxAusencias: d.maxAusencias };
            if (m) {
                await actualizar('materia', m.id, cuerpo);
                toast({ type: 'success', title: 'Materia actualizada', msg: d.nombre });
            } else {
                const nueva = await crear('materia', cuerpo);
                toast({ type: 'success', title: 'Materia agregada', msg: nueva.nombre, action: { label: 'Agregar clase', run: () => openClaseForm(null, { materiaId: nueva.id }) } });
            }
        },
    });
}

/* =====================================================================
   CLASE
   ===================================================================== */
export function openClaseForm(c = null, preset = {}) {
    if (!db.materias.length) return pedirMateriaPrimero('Cada clase pertenece a una materia.');
    const v = c || {
        materiaId: preset.materiaId ?? (materiaPreferida() || db.materias[0].id),
        dia: DIAS[preset.day ?? (ui.route === 'horario' && ui.schedMode === 'dia' ? ui.schedDay : new Date().getDay())],
        hora: preset.hora || '08:00',
        duracion: 90,
        aula: '',
    };
    openForm({
        eyebrow: c ? 'Editar clase' : 'Nueva clase',
        title: c ? esc(materiaName(c.materiaId, c.materiaNombre)) : 'Agrega una clase',
        submit: c ? 'Guardar cambios' : 'Agregar clase',
        body: `
            ${field({ label: 'Materia', control: `<select class="select" name="materiaId" required>${materiaOptions(v.materiaId, { general: false })}</select>` })}
            <fieldset class="field" data-campo="dia">
                <legend class="field-label">Día</legend>
                <div class="segmented days">
                    ${WEEK.map(d => `<label title="${DIAS[d]}"><input type="radio" name="dia" value="${DIAS[d]}" ${v.dia === DIAS[d] ? 'checked' : ''} required><span>${DIAS_CORTO[d]}</span></label>`).join('')}
                </div>
                <span class="field-error"></span>
            </fieldset>
            <div class="form-row">
                ${field({ label: 'Hora de inicio', control: `<input class="input" type="time" name="hora" required value="${esc(v.hora)}">` })}
                ${field({
                    label: 'Duración (minutos)',
                    control: `<input class="input" type="number" name="duracion" min="5" max="600" step="5" required inputmode="numeric" value="${esc(v.duracion)}">
                        <div class="presets">${[50, 60, 90, 120].map(n => `<button class="preset" type="button" data-set="duracion" data-value="${n}">${fmtDuration(n)}</button>`).join('')}</div>`,
                })}
            </div>
            ${field({ label: 'Aula o lugar', optional: true, control: `<input class="input" name="aula" maxlength="120" placeholder="Ej. Edificio B · Aula 204" value="${esc(v.aula)}">` })}
            <p class="form-alert" id="overlapAlert" role="status"></p>`,
        footLeft: c ? borrarBtn('clase', c.id) : '',
        onOpen(form) {
            const check = () => {
                const cand = { id: c?.id, dia: form.elements.dia.value, hora: form.elements.hora.value, duracion: form.elements.duracion.value };
                const alert = $('#overlapAlert', form);
                if (!cand.dia || !cand.hora) { alert.innerHTML = ''; return; }
                const clash = overlapsFor(cand);
                alert.innerHTML = clash.length
                    ? `${icon('alert')}<span>Se cruza con ${clash.map(x => `<strong>${esc(materiaName(x.materiaId))}</strong> (${fmtRange(x)})`).join(', ')}. Puedes guardarla igualmente.</span>`
                    : '';
            };
            form.addEventListener('input', check);
            form.addEventListener('change', check);
            check();
        },
        async onSubmit(d) {
            const cuerpo = { materiaId: Number(d.materiaId), dia: d.dia, hora: d.hora, duracion: Number(d.duracion), aula: d.aula };
            const r = c ? await actualizar('clase', c.id, cuerpo) : await crear('clase', cuerpo);
            toast({
                type: 'success', title: c ? 'Clase actualizada' : 'Clase agregada', msg: `${materiaName(r.materiaId)} · ${r.dia} ${fmtTime(r.hora)}`,
                action: !c && ui.route !== 'horario' ? { label: 'Ver horario', run: () => { location.hash = '#/horario'; } } : null,
            });
        },
    });
}

function pedirMateriaPrimero(motivo) {
    openForm({
        eyebrow: 'Antes de empezar',
        title: 'Primero necesitas una materia',
        desc: `${motivo} Crea una y vuelve a intentarlo.`,
        body: '',
        submit: 'Crear materia',
        onSubmit: () => { setTimeout(() => openMateriaForm(), 200); },
    });
}

/* =====================================================================
   TAREA / EXAMEN (subtareas, recurrencia y adjuntos)
   ===================================================================== */
const filaSub = (s = {}) => `<li class="sub-row" data-sub-id="${s.id || ''}">
    <label class="sub-check"><input type="checkbox" ${s.hecha ? 'checked' : ''} aria-label="Hecha"><span class="mini-check">${icon('check')}</span></label>
    <input class="input sm" value="${esc(s.texto)}" maxlength="255" placeholder="Paso…" aria-label="Subtarea">
    <button class="icon-btn sm" type="button" data-quitar-sub aria-label="Quitar subtarea">${icon('x')}</button>
</li>`;

export function openTareaForm(t = null, preset = {}) {
    const today = new Date();
    const v = t || {
        descripcion: '',
        materiaId: preset.materiaId ?? materiaPreferida(),
        fecha: preset.fecha || toISO(addDays(today, 1)),
        prioridad: preset.tipo === 'examen' ? 'alta' : 'media',
        tipo: preset.tipo || 'tarea',
        recurrencia: null,
        subtareas: [],
    };
    const fechas = [['Hoy', 0], ['Mañana', 1], ['En 3 días', 3], ['En 1 semana', 7]];
    const adjuntos = t ? archivosDeTarea(t.id) : [];

    openForm({
        eyebrow: t ? (t.tipo === 'examen' ? 'Editar examen' : 'Editar tarea') : (v.tipo === 'examen' ? 'Nuevo examen' : 'Nueva tarea'),
        title: t ? esc(t.descripcion) : (v.tipo === 'examen' ? '¿Qué examen tienes?' : '¿Qué tienes que entregar?'),
        submit: t ? 'Guardar cambios' : 'Agregar',
        wide: true,
        body: `
            <div class="segmented" role="radiogroup" aria-label="Tipo">
                <label><input type="radio" name="tipo" value="tarea" ${v.tipo !== 'examen' ? 'checked' : ''}><span>${icon('tasks')}Tarea</span></label>
                <label><input type="radio" name="tipo" value="examen" ${v.tipo === 'examen' ? 'checked' : ''}><span>${icon('target')}Examen</span></label>
            </div>
            ${field({ label: 'Descripción', control: `<input class="input" name="descripcion" required maxlength="255" placeholder="Ej. Ensayo sobre la Restauración" value="${esc(v.descripcion)}">` })}
            <div class="form-row">
                ${field({ label: 'Materia', control: `<select class="select" name="materiaId">${materiaOptions(v.materiaId)}</select>` })}
                ${field({
                    label: 'Fecha',
                    control: `<input class="input" type="date" name="fecha" required value="${esc(v.fecha)}">
                        <div class="presets">${fechas.map(([l, n]) => `<button class="preset" type="button" data-set="fecha" data-value="${toISO(addDays(today, n))}">${l}</button>`).join('')}</div>`,
                })}
            </div>
            <div class="form-row">
                <fieldset class="field">
                    <legend class="field-label">Prioridad</legend>
                    <div class="segmented">
                        ${['alta', 'media', 'baja'].map(p => `<label class="seg-${p}"><input type="radio" name="prioridad" value="${p}" ${v.prioridad === p ? 'checked' : ''}><span>${icon('flag')}${PRIO_LABEL[p]}</span></label>`).join('')}
                    </div>
                </fieldset>
                ${field({
                    label: 'Repetir',
                    control: `<select class="select" name="recurrencia">
                        <option value="">No se repite</option>
                        ${Object.entries(REC_LABEL).map(([k, l]) => `<option value="${k}" ${v.recurrencia === k ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>`,
                    hint: 'Al completarla se programa la siguiente.',
                })}
            </div>
            <div class="field" data-sin-validar>
                <span class="field-label">Subtareas <small>(opcional)</small></span>
                <ul class="sub-editor" id="subEditor">${(v.subtareas || []).map(filaSub).join('')}</ul>
                <div class="sub-add">
                    <input class="input sm" id="subNueva" maxlength="255" placeholder="Agrega un paso y pulsa Enter">
                    <button class="btn btn-ghost btn-sm" type="button" id="subAgregar">${icon('plus')}Agregar</button>
                </div>
            </div>
            <div class="field" data-sin-validar>
                <span class="field-label">Archivos adjuntos <small>(opcional)</small></span>
                ${adjuntos.length ? `<ul class="attach-list">${adjuntos.map(a => `<li>${icon(iconoArchivo(a.nombre, a.mime))}<span>${esc(a.nombre)}</span><small>${fmtBytes(a.tamano)}</small></li>`).join('')}</ul>` : ''}
                <label class="attach-pick" id="attachPick">
                    <input type="file" multiple class="sr-only" id="attachInput">
                    ${icon('paperclip')}<span id="attachText">Adjuntar archivos</span>
                </label>
                <span class="field-hint" id="attachHint"></span>
            </div>`,
        footLeft: t ? borrarBtn('tarea', t.id) : '',
        onOpen(form) {
            const lista = $('#subEditor', form);
            const nueva = $('#subNueva', form);
            const agregar = () => {
                const texto = nueva.value.trim();
                if (!texto) return;
                lista.insertAdjacentHTML('beforeend', filaSub({ texto }));
                nueva.value = '';
                nueva.focus();
            };
            $('#subAgregar', form).addEventListener('click', agregar);
            nueva.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
            lista.addEventListener('click', (e) => { if (e.target.closest('[data-quitar-sub]')) e.target.closest('.sub-row').remove(); });

            const tipoCambio = () => {
                const ex = form.elements.tipo.value === 'examen';
                $('[name="descripcion"]', form).placeholder = ex ? 'Ej. Segundo parcial de Cálculo' : 'Ej. Ensayo sobre la Restauración';
            };
            $$('[name="tipo"]', form).forEach(r => r.addEventListener('change', tipoCambio));

            const input = $('#attachInput', form);
            const actualizarAdj = () => {
                const sinMateria = !form.elements.materiaId.value;
                $('#attachPick', form).classList.toggle('is-disabled', sinMateria);
                input.disabled = sinMateria;
                $('#attachHint', form).textContent = sinMateria ? 'Elige una materia para poder adjuntar archivos.' : '';
                const n = input.files.length;
                $('#attachText', form).textContent = n ? `${n} archivo${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}` : 'Adjuntar archivos';
            };
            input.addEventListener('change', actualizarAdj);
            form.elements.materiaId.addEventListener('change', actualizarAdj);
            actualizarAdj();
        },
        async onSubmit(d, form) {
            const subtareas = $$('.sub-row', form).map(li => ({
                id: li.dataset.subId ? Number(li.dataset.subId) : undefined,
                texto: $('input.input', li).value.trim(),
                hecha: $('input[type="checkbox"]', li).checked,
            })).filter(s => s.texto);
            const pendiente = $('#subNueva', form).value.trim();
            if (pendiente) subtareas.push({ texto: pendiente, hecha: false });

            const cuerpo = {
                descripcion: d.descripcion, materiaId: d.materiaId ? Number(d.materiaId) : null, fecha: d.fecha,
                prioridad: d.prioridad || 'media', tipo: d.tipo || 'tarea', recurrencia: d.recurrencia || null, subtareas,
            };
            const archivos = [...$('#attachInput', form).files];
            const r = t ? await actualizar('tarea', t.id, cuerpo) : await crear('tarea', cuerpo);
            if (archivos.length && r.materiaId) {
                await subirArchivos(archivos, { materiaId: r.materiaId, categoria: 'tarea', tareaId: r.id });
            }
            toast({
                type: 'success',
                title: t ? 'Cambios guardados' : (r.tipo === 'examen' ? 'Examen agregado' : 'Tarea agregada'),
                msg: r.descripcion,
                action: !t && r.tipo === 'examen' ? { label: 'Plan de repaso', run: () => crearPlanRepaso(r.id) } : null,
            });
        },
    });
}

export async function crearPlanRepaso(id) {
    try {
        const r = await api.post(`tareas/${id}/plan-repaso`);
        r.tareas.forEach(t => reemplazar('tareas', t));
        render();
        toast({ type: 'success', title: 'Plan de repaso creado', msg: `${r.tareas.length} sesiones antes del examen.` });
    } catch (e) { toastError(e); }
}

/* =====================================================================
   NOTA
   ===================================================================== */
/* ---------- Ver una nota completa ---------- */
export function verNota(n) {
    if (!n) return;
    const fechas = [`Creada ${fmtRelativo(n.creadoEn)}`, n.actualizadoEn ? `editada ${fmtRelativo(n.actualizadoEn)}` : ''].filter(Boolean).join(' · ');
    const tarjetas = tarjetasDeNota(n).length;
    openForm({
        eyebrow: `<span class="mat-tag" style="${mc(n.materiaId)}"><i class="dot"></i><span>${esc(materiaName(n.materiaId))}</span></span>`,
        title: esc(n.titulo),
        desc: esc(fechas),
        wide: true,
        body: `<div class="md note-view" style="${mc(n.materiaId)}">${n.contenido?.trim() ? markdown(n.contenido) : '<p class="muted">Esta nota no tiene contenido.</p>'}</div>`,
        submit: `${icon('pencil')}Editar`,
        cancel: 'Cerrar',
        footLeft: `
            <button class="icon-btn" type="button" data-action="copiar-nota" data-id="${n.id}" aria-label="Copiar texto" title="Copiar texto">${icon('copy')}</button>
            <button class="icon-btn" type="button" data-action="share" data-tipo="nota" data-id="${n.id}" aria-label="Compartir en un grupo" title="Compartir en un grupo">${icon('share')}</button>
            ${tarjetas ? `<button class="icon-btn" type="button" data-action="nota-tarjetas" data-id="${n.id}" aria-label="Crear ${tarjetas} tarjetas de repaso" title="Crear tarjetas de repaso">${icon('layers')}</button>` : ''}
            ${app.ia ? `<a class="icon-btn" href="#/asistente?nota=${n.id}" aria-label="Usar con el asistente IA" title="Resumir o crear tarjetas con IA">${icon('sparkles')}</a>` : ''}
            <button class="icon-btn danger" type="button" data-action="delete" data-type="nota" data-id="${n.id}" aria-label="Eliminar nota" title="Eliminar">${icon('trash')}</button>`,
        // «Editar» reutiliza la misma ventana: se abre el formulario y esta no se cierra
        onSubmit: () => { openNotaForm(n); return false; },
    });
}

accion({
    'ver-nota': (el, e) => {
        // Los botones y enlaces de la tarjeta hacen lo suyo; seleccionar texto tampoco abre
        if (e?.target?.closest('button, a, input') && e.target.closest('button, a, input') !== el) return;
        if (String(window.getSelection?.() || '').trim()) return;
        verNota(db.anotaciones.find(x => x.id === idDe(el)));
    },
    'copiar-nota': async (el) => {
        const n = db.anotaciones.find(x => x.id === idDe(el));
        if (!n) return;
        try {
            await navigator.clipboard.writeText(`${n.titulo}\n\n${n.contenido || ''}`);
            toast({ type: 'success', title: 'Nota copiada' });
        } catch { toast({ type: 'error', title: 'No se pudo copiar', msg: 'Tu navegador no permitió acceder al portapapeles.' }); }
    },
});

// Teclado: Enter o Espacio sobre una tarjeta de nota la abre
document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches?.('.note[data-action="ver-nota"]')) return;
    e.preventDefault();
    verNota(db.anotaciones.find(x => x.id === idDe(e.target)));
});

export function openNotaForm(n = null, preset = {}) {
    const v = n || { titulo: '', contenido: '', materiaId: preset.materiaId ?? (ui.noteMateria && ui.noteMateria !== 'general' ? Number(ui.noteMateria) : materiaPreferida()) };
    openForm({
        eyebrow: n ? 'Editar nota' : 'Nueva nota',
        title: n ? esc(n.titulo) : 'Escribe una nota',
        submit: n ? 'Guardar cambios' : 'Guardar nota',
        wide: true,
        body: `
            ${field({ label: 'Título', control: `<input class="input" name="titulo" required maxlength="160" placeholder="Ej. Fórmulas para el parcial" value="${esc(v.titulo)}">` })}
            ${field({ label: 'Contenido', hint: 'Consejo: escribe «pregunta :: respuesta» por línea para convertirlas en tarjetas de repaso.', control: `<textarea class="textarea" name="contenido" required rows="9" placeholder="Escribe aquí…">${esc(v.contenido)}</textarea>` })}
            ${field({ label: 'Materia', control: `<select class="select" name="materiaId">${materiaOptions(v.materiaId)}</select>` })}`,
        footLeft: n ? borrarBtn('nota', n.id) : '',
        async onSubmit(d) {
            const cuerpo = { titulo: d.titulo, contenido: d.contenido, materiaId: d.materiaId ? Number(d.materiaId) : null };
            if (n) { await actualizar('nota', n.id, cuerpo); toast({ type: 'success', title: 'Nota actualizada' }); }
            else { await crear('nota', cuerpo); toast({ type: 'success', title: 'Nota guardada', msg: d.titulo }); }
        },
    });
}

/* =====================================================================
   EVALUACIÓN (calificación)
   ===================================================================== */
export function openEvaluacionForm(e = null, preset = {}) {
    if (!db.materias.length) return pedirMateriaPrimero('Las calificaciones se registran por materia.');
    const materiaId = e?.materiaId ?? preset.materiaId ?? (materiaPreferida() || db.materias[0].id);
    const usado = db.evaluaciones.filter(x => x.materiaId === materiaId && x.id !== e?.id).reduce((s, x) => s + x.peso, 0);
    const v = e || { nombre: '', peso: Math.max(0, Math.min(25, 100 - usado)) || '', nota: null, notaMax: 100, fecha: '' };
    openForm({
        eyebrow: e ? 'Editar calificación' : 'Nueva calificación',
        title: e ? esc(e.nombre) : 'Registra una evaluación',
        desc: `Los pesos de cada materia deben sumar 100 %. En esta materia ya hay ${String(Math.round(usado * 100) / 100).replace('.', ',')} % asignado.`,
        submit: e ? 'Guardar cambios' : 'Agregar',
        body: `
            ${field({ label: 'Materia', control: `<select class="select" name="materiaId" required>${materiaOptions(materiaId, { general: false })}</select>` })}
            ${field({ label: 'Nombre', control: `<input class="input" name="nombre" required maxlength="120" placeholder="Ej. Primer parcial" value="${esc(v.nombre)}">
                <div class="presets">${['Primer parcial', 'Segundo parcial', 'Prácticas', 'Proyecto', 'Examen final'].map(n => `<button class="preset" type="button" data-set="nombre" data-value="${n}">${n}</button>`).join('')}</div>` })}
            <div class="form-row three">
                ${field({ label: 'Peso (%)', control: `<input class="input" type="number" name="peso" required min="0.01" max="100" step="0.01" inputmode="decimal" value="${esc(v.peso)}">` })}
                ${field({ label: 'Nota obtenida', optional: true, control: `<input class="input" type="number" name="nota" min="0" step="0.01" inputmode="decimal" placeholder="Pendiente" value="${esc(v.nota ?? '')}">` })}
                ${field({ label: 'Sobre', control: `<input class="input" type="number" name="notaMax" required min="1" max="1000" step="0.01" inputmode="decimal" value="${esc(v.notaMax)}">` })}
            </div>
            ${field({ label: 'Fecha', optional: true, control: `<input class="input" type="date" name="fecha" value="${esc(v.fecha || '')}">` })}`,
        footLeft: e ? borrarBtn('evaluacion', e.id) : '',
        onOpen(form) {
            const sync = () => { form.elements.nota.max = form.elements.notaMax.value || 100; };
            form.elements.notaMax.addEventListener('input', sync);
            sync();
        },
        async onSubmit(d) {
            const cuerpo = { materiaId: Number(d.materiaId), nombre: d.nombre, peso: Number(d.peso), nota: d.nota === '' ? null : Number(d.nota), notaMax: Number(d.notaMax), fecha: d.fecha || null };
            if (e) { await actualizar('evaluacion', e.id, cuerpo); toast({ type: 'success', title: 'Calificación actualizada' }); }
            else { await crear('evaluacion', cuerpo); toast({ type: 'success', title: 'Calificación agregada', msg: `${d.nombre} · ${d.peso} %` }); }
        },
    });
}

/* =====================================================================
   ARCHIVO (renombrar, categoría, tarea)
   ===================================================================== */
export function openArchivoForm(a) {
    const tareas = db.tareas.filter(t => t.materiaId === a.materiaId);
    openForm({
        eyebrow: 'Archivo',
        title: esc(a.nombre),
        submit: 'Guardar cambios',
        body: `
            ${field({ label: 'Nombre', control: `<input class="input" name="nombre" required maxlength="255" value="${esc(a.nombre)}">` })}
            ${field({ label: 'Categoría', control: `<select class="select" name="categoria">${Object.entries(CATEGORIAS).map(([k, c]) => `<option value="${k}" ${a.categoria === k ? 'selected' : ''}>${c.label}</option>`).join('')}</select>` })}
            ${field({ label: 'Vincular a una tarea', optional: true, control: `<select class="select" name="tareaId"><option value="">Ninguna</option>${tareas.map(t => `<option value="${t.id}" ${a.tareaId === t.id ? 'selected' : ''}>${esc(t.descripcion)}</option>`).join('')}</select>` })}`,
        footLeft: borrarBtn('archivo', a.id),
        async onSubmit(d) {
            await actualizar('archivo', a.id, { nombre: d.nombre, categoria: d.categoria, tareaId: d.tareaId ? Number(d.tareaId) : null });
            toast({ type: 'success', title: 'Archivo actualizado' });
        },
    });
}

/* =====================================================================
   TARJETA DE REPASO
   ===================================================================== */
export function openTarjetaForm(f = null, preset = {}) {
    const v = f || { frente: '', reverso: '', materiaId: preset.materiaId ?? materiaPreferida() };
    openForm({
        eyebrow: f ? 'Editar tarjeta' : 'Nueva tarjeta',
        title: f ? 'Edita la tarjeta' : 'Crea una tarjeta de repaso',
        submit: f ? 'Guardar cambios' : 'Crear tarjeta',
        body: `
            ${field({ label: 'Frente (pregunta o concepto)', control: `<textarea class="textarea sm" name="frente" required maxlength="2000" rows="3">${esc(v.frente)}</textarea>` })}
            ${field({ label: 'Reverso (respuesta)', control: `<textarea class="textarea sm" name="reverso" required maxlength="4000" rows="3">${esc(v.reverso)}</textarea>` })}
            ${field({ label: 'Materia', control: `<select class="select" name="materiaId">${materiaOptions(v.materiaId)}</select>` })}`,
        footLeft: f ? borrarBtn('flashcard', f.id) : '',
        async onSubmit(d) {
            const cuerpo = { frente: d.frente, reverso: d.reverso, materiaId: d.materiaId ? Number(d.materiaId) : null };
            if (f) { await actualizar('flashcard', f.id, cuerpo); toast({ type: 'success', title: 'Tarjeta actualizada' }); }
            else {
                const r = await api.post('flashcards', cuerpo);
                r.tarjetas.forEach(x => reemplazar('flashcards', x));
                render();
                toast({ type: 'success', title: 'Tarjeta creada' });
            }
        },
    });
}

/** Extrae tarjetas de una nota con líneas «pregunta :: respuesta». */
export function tarjetasDeNota(n) {
    return String(n.contenido).split(/\r?\n/).map(l => l.split('::')).filter(p => p.length === 2 && p[0].trim() && p[1].trim())
        .map(([frente, reverso]) => ({ frente: frente.trim(), reverso: reverso.trim() }));
}

/* =====================================================================
   COMPARTIR EN UN GRUPO
   ===================================================================== */
export async function openCompartir(tipo, id) {
    try {
        if (!db.grupos) db.grupos = (await api.get('grupos')).grupos;
    } catch (e) { toastError(e); return; }
    if (!db.grupos.length) {
        openForm({
            eyebrow: 'Compartir', title: 'Aún no estás en ningún grupo',
            desc: 'Crea un grupo de estudio o únete con el código que te compartan tus compañeros.',
            body: '', submit: 'Ir a grupos',
            onSubmit: () => { location.hash = '#/grupos'; },
        });
        return;
    }
    const nombre = tipo === 'archivo' ? db.archivos.find(x => x.id === id)?.nombre : tipo === 'nota' ? db.anotaciones.find(x => x.id === id)?.titulo : db.tareas.find(x => x.id === id)?.descripcion;
    openForm({
        eyebrow: 'Compartir en un grupo',
        title: esc(nombre || ''),
        desc: tipo === 'archivo' ? 'Los miembros del grupo podrán verlo, descargarlo y copiarlo a sus materias.' : 'Se comparte una copia; tus cambios posteriores no se sincronizan.',
        submit: 'Compartir',
        body: `
            ${field({ label: 'Grupo', control: `<select class="select" name="grupo" required>${db.grupos.map(g => `<option value="${g.id}" ${ui.grupoActivo === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>` })}
            ${field({ label: 'Mensaje', optional: true, control: `<textarea class="textarea sm" name="contenido" maxlength="1000" rows="2" placeholder="Ej. Les dejo la guía resuelta"></textarea>` })}`,
        async onSubmit(d) {
            const r = await api.post(`grupos/${d.grupo}/publicaciones`, { tipo, refId: id, contenido: d.contenido });
            db.grupos = r.grupos;
            ui.grupoActivo = Number(d.grupo);
            render();
            toast({ type: 'success', title: 'Compartido', msg: db.grupos.find(g => g.id === Number(d.grupo))?.nombre, action: { label: 'Ver grupo', run: () => { location.hash = '#/grupos'; } } });
        },
    });
}

/* =====================================================================
   SEMESTRE
   ===================================================================== */
export function openSemestreForm(s = null) {
    openForm({
        eyebrow: s ? `Editar ${P().uno}` : `Nuevo ${P().uno}`,
        title: s ? esc(s.nombre) : `Empieza un nuevo ${P().uno}`,
        desc: s ? '' : `El ${P().uno} actual queda archivado con sus notas e índice. Puedes volver a él cuando quieras.`,
        submit: s ? 'Guardar' : 'Crear y cambiar',
        body: `
            ${field({ label: 'Nombre', control: `<input class="input" name="nombre" required maxlength="80" placeholder="Ej. Enero – Abril 2027" value="${esc(s?.nombre)}">` })}
            <div class="form-row">
                ${field({ label: 'Inicio', optional: true, control: `<input class="input" type="date" name="inicio" value="${esc(s?.inicio || '')}">` })}
                ${field({ label: 'Fin', optional: true, control: `<input class="input" type="date" name="fin" value="${esc(s?.fin || '')}">` })}
            </div>
            ${s ? '' : `<label class="check-line"><input type="checkbox" name="copiarMaterias" value="1"><span>Copiar las materias del ${P().uno} actual (sin clases, tareas ni notas)</span></label>`}`,
        async onSubmit(d) {
            const { cargarEstado } = await import('./estado.js');
            if (s) {
                const r = await api.patch(`semestres/${s.id}`, { nombre: d.nombre, inicio: d.inicio || null, fin: d.fin || null });
                const i = db.semestres.findIndex(x => x.id === s.id);
                db.semestres[i] = r;
                if (db.semestre.id === r.id) db.semestre = r;
                render();
            } else {
                cargarEstado(await api.post('semestres', { nombre: d.nombre, inicio: d.inicio || null, fin: d.fin || null, copiarMaterias: !!d.copiarMaterias }));
                render({ enter: true });
                toast({ type: 'success', title: `Nuevo ${P().uno} activo`, msg: d.nombre });
            }
        },
    });
}

