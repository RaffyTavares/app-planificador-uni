/* Vista: Grupos de estudio. */
import { $, esc, plural, fmtBytes, fmtRelativo, fmtDate } from '../util.js';
import { icon, iconoArchivo } from '../iconos.js';
import { db, ui, materiaName } from '../estado.js';
import { pageHead, emptyState, render, toast, toastError, openForm, field, confirmDialog } from '../ui.js';
import { materiaOptions, visibleEnLinea } from '../componentes.js';
import { accion, idDe } from '../acciones.js';
import { api, urlArchivoGrupo } from '../api.js';

let cargando = false;

export default {
    titulo: 'Grupos',
    render: renderGrupos,
    async alEntrar() {
        if (db.grupos || cargando) return;
        cargando = true;
        try { db.grupos = (await api.get('grupos')).grupos; } catch (e) { toastError(e); db.grupos = []; }
        cargando = false;
        render();
    },
};

const acciones = `<button class="btn btn-ghost" type="button" data-action="grupo-unirse">${icon('users')}Unirme con código</button>
    <button class="btn btn-primary" type="button" data-action="grupo-crear">${icon('plus')}Crear grupo</button>`;

function renderGrupos() {
    const head = pageHead({ eyebrow: 'Grupos de estudio', title: 'Estudiar juntos <em>rinde más</em>', lead: 'Comparte notas, tareas y archivos con tus compañeros de clase.', actions: acciones });
    if (!db.grupos) return head + `<section class="panel"><div class="ai-loading"><span class="spinner"></span><p>Cargando tus grupos…</p></div></section>`;
    if (!db.grupos.length) {
        return head + `<section class="panel">${emptyState({ ic: 'users', size: 'lg', title: 'Aún no estás en ningún grupo', text: 'Crea uno y comparte el código con tus compañeros, o únete con el código que te den.', action: acciones })}</section>`;
    }
    if (!db.grupos.some(g => g.id === ui.grupoActivo)) ui.grupoActivo = db.grupos[0].id;
    const g = db.grupos.find(x => x.id === ui.grupoActivo);

    return head + `
    <div class="groups-layout rise" style="--i:1">
        <nav class="group-list" aria-label="Tus grupos">${db.grupos.map(x => `<button type="button" class="group-item" aria-current="${x.id === g.id}" data-action="grupo-ver" data-id="${x.id}">
            <span class="group-avatar">${esc(x.nombre.charAt(0).toUpperCase())}</span>
            <span><strong>${esc(x.nombre)}</strong><small>${plural(x.miembros.length, 'miembro', 'miembros')} · ${plural(x.publicaciones.length, 'publicación', 'publicaciones')}</small></span>
        </button>`).join('')}</nav>

        <section class="panel group-main">
            <header class="group-head">
                <div>
                    <h2>${esc(g.nombre)}</h2>
                    ${g.descripcion ? `<p class="muted">${esc(g.descripcion)}</p>` : ''}
                    <p class="members">${g.miembros.map(m => `<span class="member" title="${esc(m.carrera || '')}">${esc(m.nombre)}${m.rol === 'admin' ? ' ★' : ''}</span>`).join('')}</p>
                </div>
                <div class="group-code">
                    <span class="eyebrow">Código de invitación</span>
                    <button class="code" type="button" data-action="grupo-copiar" data-codigo="${g.codigo}" title="Copiar código">${g.codigo}${icon('copy')}</button>
                    <div class="group-tools">
                        ${g.rol === 'admin' ? `<button class="link-btn" type="button" data-action="grupo-codigo" data-id="${g.id}">Generar otro</button>` : ''}
                        <button class="link-btn danger-text" type="button" data-action="grupo-salir" data-id="${g.id}">Salir</button>
                    </div>
                </div>
            </header>

            <form class="composer" id="grupoMensaje" data-grupo="${g.id}" autocomplete="off">
                <label class="sr-only" for="msgGrupo">Mensaje</label>
                <textarea class="textarea sm" id="msgGrupo" name="contenido" rows="2" maxlength="4000" placeholder="Escribe un mensaje para el grupo…" required></textarea>
                <div class="composer-actions">
                    <span class="muted small">Compartir:</span>
                    <button class="chip-btn" type="button" data-action="grupo-compartir" data-tipo="nota">${icon('note')}Nota</button>
                    <button class="chip-btn" type="button" data-action="grupo-compartir" data-tipo="tarea">${icon('tasks')}Tarea</button>
                    <button class="chip-btn" type="button" data-action="grupo-compartir" data-tipo="archivo">${icon('paperclip')}Archivo</button>
                    <button class="btn btn-primary btn-sm" type="submit">${icon('send')}Enviar</button>
                </div>
            </form>

            ${g.publicaciones.length ? `<ul class="feed">${g.publicaciones.map(p => publicacion(p, g)).join('')}</ul>`
                : emptyState({ ic: 'message', title: 'Aún no hay publicaciones', text: 'Comparte una guía, tus apuntes o una tarea para empezar.' })}
        </section>
    </div>`;
}

const TIPO = { mensaje: ['message', 'escribió'], nota: ['note', 'compartió una nota'], tarea: ['tasks', 'compartió una tarea'], archivo: ['paperclip', 'compartió un archivo'] };

function publicacion(p, g) {
    const [ic, verbo] = TIPO[p.tipo];
    const puedeBorrar = p.propia || g.rol === 'admin';
    let cuerpo = '';
    if (p.tipo === 'mensaje') cuerpo = `<p class="post-text">${esc(p.contenido)}</p>`;
    if (p.tipo === 'nota') cuerpo = `<div class="post-card"><strong>${esc(p.titulo)}</strong><p class="post-text clamp">${esc(p.contenido)}</p></div>`;
    if (p.tipo === 'tarea') cuerpo = `${p.contenido && !p.contenido.startsWith('•') ? `<p class="post-text">${esc(p.contenido.split('\n\n')[0])}</p>` : ''}<div class="post-card"><strong>${icon('tasks')}${esc(p.titulo)}</strong>${p.fecha ? `<small>Entrega: ${fmtDate(p.fecha, { weekday: 'long', day: 'numeric', month: 'long' })}</small>` : ''}</div>`;
    if (p.tipo === 'archivo') {
        cuerpo = `${p.contenido ? `<p class="post-text">${esc(p.contenido)}</p>` : ''}${p.archivo
            ? `<div class="post-card post-file">${icon(iconoArchivo(p.archivo.nombre, p.archivo.mime))}<div><a href="${urlArchivoGrupo(p.id, visibleEnLinea(p.archivo.mime))}" target="_blank" rel="noopener">${esc(p.archivo.nombre)}</a><small>${fmtBytes(p.archivo.tamano)}</small></div>
                <a class="icon-btn sm" href="${urlArchivoGrupo(p.id)}" download aria-label="Descargar">${icon('download')}</a></div>`
            : '<p class="muted small">El archivo ya no está disponible.</p>'}`;
    }
    return `<li class="post">
        <span class="group-avatar sm">${esc(p.autor.charAt(0).toUpperCase())}</span>
        <div class="post-body">
            <p class="post-meta"><strong>${p.propia ? 'Tú' : esc(p.autor)}</strong> ${verbo} · <time>${fmtRelativo(p.creadoEn)}</time></p>
            ${cuerpo}
            <div class="post-actions">
                ${p.tipo !== 'mensaje' && !p.propia && (p.tipo !== 'archivo' || p.archivo) ? `<button class="link-btn" type="button" data-action="grupo-copiar-pub" data-id="${p.id}" data-tipo="${p.tipo}">${icon('copy')}Copiar a mi cuenta</button>` : ''}
                ${puedeBorrar ? `<button class="link-btn danger-text" type="button" data-action="grupo-borrar-pub" data-id="${p.id}">${icon('trash')}Eliminar</button>` : ''}
            </div>
        </div>
    </li>`;
}

export async function enviarMensaje(form) {
    const contenido = form.elements.contenido.value.trim();
    if (!contenido) return;
    const btn = $('[type="submit"]', form);
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
        db.grupos = (await api.post(`grupos/${form.dataset.grupo}/publicaciones`, { tipo: 'mensaje', contenido })).grupos;
        render();
        $('#msgGrupo')?.focus();
    } catch (e) { toastError(e); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}

accion({
    'grupo-ver': (el) => { ui.grupoActivo = idDe(el); render(); },
    'grupo-crear': () => openForm({
        eyebrow: 'Nuevo grupo', title: 'Crea un grupo de estudio', submit: 'Crear grupo',
        body: `${field({ label: 'Nombre', control: '<input class="input" name="nombre" required maxlength="120" placeholder="Ej. Cálculo II · Sección 02">' })}
            ${field({ label: 'Descripción', optional: true, control: '<input class="input" name="descripcion" maxlength="255" placeholder="Ej. Repasamos los jueves en la biblioteca">' })}`,
        async onSubmit(d) {
            const r = await api.post('grupos', d);
            db.grupos = r.grupos; ui.grupoActivo = r.grupoId;
            render();
            toast({ type: 'success', title: 'Grupo creado', msg: 'Comparte el código de invitación con tus compañeros.' });
        },
    }),
    'grupo-unirse': () => openForm({
        eyebrow: 'Unirme', title: 'Únete a un grupo', desc: 'Pide el código de 8 caracteres a quien creó el grupo.', submit: 'Unirme',
        body: field({ label: 'Código', control: '<input class="input code-input" name="codigo" required maxlength="12" autocomplete="off" placeholder="Ej. K7PQ2MXA">' }),
        async onSubmit(d) {
            const r = await api.post('grupos/unirse', d);
            db.grupos = r.grupos; ui.grupoActivo = r.grupoId;
            if (location.hash !== '#/grupos') location.hash = '#/grupos';
            render();
            toast({ type: 'success', title: 'Te uniste al grupo', msg: db.grupos.find(g => g.id === r.grupoId)?.nombre });
        },
    }),
    'grupo-copiar': async (el) => {
        try { await navigator.clipboard.writeText(el.dataset.codigo); toast({ type: 'success', title: 'Código copiado', msg: el.dataset.codigo }); }
        catch { toast({ type: 'info', title: 'Código de invitación', msg: el.dataset.codigo }); }
    },
    'grupo-codigo': async (el) => { try { db.grupos = (await api.post(`grupos/${idDe(el)}/codigo`)).grupos; render(); toast({ type: 'success', title: 'Nuevo código generado', msg: 'El código anterior ya no funciona.' }); } catch (e) { toastError(e); } },
    'grupo-salir': (el) => {
        const g = db.grupos.find(x => x.id === idDe(el));
        confirmDialog({
            title: `¿Salir de «${g.nombre.replace(/[<>&"]/g, '')}»?`, desc: g.miembros.length === 1 ? 'Eres el único miembro: el grupo y sus publicaciones se eliminarán.' : 'Podrás volver a unirte con el código.', confirm: 'Salir del grupo',
            async onConfirm() { db.grupos = (await api.post(`grupos/${g.id}/salir`)).grupos; ui.grupoActivo = null; render(); },
        });
    },
    'grupo-borrar-pub': (el) => confirmDialog({
        title: '¿Eliminar la publicación?', desc: 'Los miembros dejarán de verla.', confirm: 'Eliminar',
        async onConfirm() { db.grupos = (await api.del(`publicaciones/${idDe(el)}`)).grupos; render(); },
    }),
    'grupo-copiar-pub': (el) => {
        const tipo = el.dataset.tipo;
        openForm({
            eyebrow: 'Copiar a mi cuenta', title: tipo === 'archivo' ? '¿En qué materia lo guardas?' : `Copiar ${tipo} a «${esc(db.semestre?.nombre || '')}»`,
            submit: 'Copiar',
            body: field({ label: 'Materia', control: `<select class="select" name="materiaId" ${tipo === 'archivo' ? 'required' : ''}>${materiaOptions('', { general: tipo !== 'archivo', placeholder: tipo === 'archivo' ? 'Elige una materia' : '' })}</select>` }),
            async onSubmit(d) {
                await api.post(`publicaciones/${idDe(el)}/copiar`, { materiaId: d.materiaId ? Number(d.materiaId) : null });
                const { recargar } = await import('../datos.js');
                await recargar();
                toast({ type: 'success', title: 'Copiado a tu cuenta', msg: tipo === 'archivo' ? `En ${materiaName(Number(d.materiaId))}` : '' });
            },
        });
    },
    'grupo-compartir': (el) => {
        const tipo = el.dataset.tipo;
        const items = tipo === 'nota' ? db.anotaciones.map(n => [n.id, n.titulo]) : tipo === 'tarea' ? db.tareas.filter(t => !t.completada).map(t => [t.id, t.descripcion]) : db.archivos.map(a => [a.id, `${a.nombre} · ${materiaName(a.materiaId)}`]);
        if (!items.length) { toast({ type: 'info', title: `No tienes ${tipo === 'archivo' ? 'archivos' : tipo + 's'} para compartir` }); return; }
        openForm({
            eyebrow: 'Compartir en el grupo', title: { nota: 'Elige una nota', tarea: 'Elige una tarea', archivo: 'Elige un archivo' }[tipo], submit: 'Compartir',
            body: `${field({ label: tipo.charAt(0).toUpperCase() + tipo.slice(1), control: `<select class="select" name="refId">${items.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select>` })}
                ${field({ label: 'Mensaje', optional: true, control: '<textarea class="textarea sm" name="contenido" rows="2" maxlength="1000"></textarea>' })}`,
            async onSubmit(d) {
                db.grupos = (await api.post(`grupos/${ui.grupoActivo}/publicaciones`, { tipo, refId: Number(d.refId), contenido: d.contenido })).grupos;
                render();
            },
        });
    },
});
