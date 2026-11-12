/* Vista: Ajustes — perfil, perfil académico, escala, Pomodoro, notificaciones, datos y sesión. */
import { $, $$, esc, fmtBytes } from '../util.js';
import { icon } from '../iconos.js';
import { db, app, escala, ESCALA_DEFECTO, pomodoroConfig, perfil, P, TIPOS_PERIODO, aplicarPerfil } from '../estado.js';
import { pageHead, render, toast, toastError, field, mostrarErrorForm, confirmDialog } from '../ui.js';
import { accion } from '../acciones.js';
import { api } from '../api.js';
import { exportarRespaldo, cargarDemo, borrarSemestre } from '../datos.js';
import { estadoPush, activarPush, desactivarPush } from '../push.js';

let push = { soportado: false, permiso: 'default', suscrito: false };

export default {
    titulo: 'Ajustes',
    render: renderAjustes,
    async alEntrar() { push = await estadoPush(); render(); },
};

/* Plantillas de escala habituales (notas sobre 100) */
const PLANTILLAS_ESCALA = {
    'af-4': { nombre: 'A–F, índice sobre 4 (aprueba con 60)', escala: ESCALA_DEFECTO },
    'af-70': { nombre: 'A–F, índice sobre 4 (aprueba con 70)', escala: [
        { letra: 'A', min: 90, puntos: 4 }, { letra: 'B', min: 80, puntos: 3 }, { letra: 'C', min: 70, puntos: 2 }, { letra: 'F', min: 0, puntos: 0 }] },
    'af-mas': { nombre: 'A–F con B+ y C+ (sobre 4)', escala: [
        { letra: 'A', min: 90, puntos: 4 }, { letra: 'B+', min: 85, puntos: 3.5 }, { letra: 'B', min: 80, puntos: 3 }, { letra: 'C+', min: 75, puntos: 2.5 },
        { letra: 'C', min: 70, puntos: 2 }, { letra: 'D', min: 60, puntos: 1 }, { letra: 'F', min: 0, puntos: 0 }] },
    'af-5': { nombre: 'A–F, índice sobre 5', escala: [
        { letra: 'A', min: 90, puntos: 5 }, { letra: 'B', min: 80, puntos: 4 }, { letra: 'C', min: 70, puntos: 3 }, { letra: 'D', min: 60, puntos: 2 }, { letra: 'F', min: 0, puntos: 0 }] },
    'ar': { nombre: 'Aprobado / Reprobado (aprueba con 70)', escala: [{ letra: 'AP', min: 70, puntos: 4 }, { letra: 'RP', min: 0, puntos: 0 }] },
};

function renderAjustes() {
    const u = db.usuario || {};
    const pf = perfil();
    const p = pomodoroConfig();
    const pct = db.cuotaAlmacenamiento ? Math.min(100, (db.usoAlmacenamiento / db.cuotaAlmacenamiento) * 100) : 0;
    return pageHead({ eyebrow: 'Ajustes', title: 'Tu cuenta, <em>a tu manera</em>' }) + `
    <div class="settings">
        <form class="panel settings-card rise" style="--i:1" data-form="perfil">
            <h2>${icon('user')}Perfil</h2>
            <div class="form-row">
                ${field({ label: 'Nombre', control: `<input class="input" name="nombre" required maxlength="80" value="${esc(u.nombre)}">` })}
                ${field({ label: 'Carrera', optional: true, control: `<input class="input" name="carrera" maxlength="120" value="${esc(u.carrera)}" placeholder="Ej. Ingeniería de Sistemas">` })}
            </div>
            <p class="muted small">${icon('mail')}${esc(u.email)}</p>
            <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar perfil</button></div>
        </form>

        <form class="panel settings-card rise" style="--i:2" data-form="academico">
            <h2>${icon('cap')}Perfil académico</h2>
            <p class="muted small">Adapta la app a tu universidad: cómo se llaman tus períodos, cuántos créditos tiene tu carrera y cómo ves las horas.</p>
            <div class="form-row">
                ${field({ label: 'Universidad', optional: true, control: `<input class="input" name="universidad" maxlength="120" value="${esc(pf.universidad)}" placeholder="Ej. Universidad Adventista Dominicana">` })}
                ${field({ label: 'Tu universidad trabaja por', hint: 'Cambia los textos de toda la app y los períodos del récord.', control: `<select class="select" name="periodo">${Object.entries(TIPOS_PERIODO).map(([k, t]) =>
                    `<option value="${k}" ${k === pf.periodo ? 'selected' : ''}>${t.varios.charAt(0).toUpperCase() + t.varios.slice(1)} (${t.desc})</option>`).join('')}</select>` })}
            </div>
            <div class="form-row">
                ${field({ label: 'Créditos de la carrera', optional: true, hint: 'Para ver tu avance en Historial.', control: `<input class="input" type="number" name="creditosCarrera" min="1" max="1000" value="${pf.creditosCarrera ?? ''}" placeholder="Ej. 180">` })}
                <div class="field"><span class="field-label">Formato de hora</span>
                    <div class="segmented">
                        <label><input type="radio" name="formatoHora" value="12" ${pf.formatoHora !== '24' ? 'checked' : ''}><span>2:30 PM</span></label>
                        <label><input type="radio" name="formatoHora" value="24" ${pf.formatoHora === '24' ? 'checked' : ''}><span>14:30</span></label>
                    </div></div>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar perfil académico</button></div>
        </form>

        <form class="panel settings-card rise" style="--i:3" data-form="password">
            <h2>${icon('lock')}Contraseña</h2>
            <div class="form-row">
                ${field({ label: 'Contraseña actual', control: '<input class="input" type="password" name="actual" required autocomplete="current-password">' })}
                ${field({ label: 'Nueva contraseña', hint: 'Mínimo 8 caracteres.', control: '<input class="input" type="password" name="nueva" required minlength="8" autocomplete="new-password">' })}
            </div>
            <div class="form-actions"><button class="btn btn-ghost" type="submit">Cambiar contraseña</button></div>
        </form>

        <form class="panel settings-card rise" style="--i:4" data-form="escala">
            <h2>${icon('award')}Escala de calificaciones</h2>
            <p class="muted small">Nota mínima (de 100) para cada letra y los puntos que vale en el índice. Ajústala a la de tu universidad o parte de una plantilla.</p>
            ${field({ label: 'Plantilla', optional: true, control: `<select class="select" data-action-change="escala-plantilla"><option value="">Elegir una plantilla…</option>${Object.entries(PLANTILLAS_ESCALA).map(([k, t]) => `<option value="${k}">${t.nombre}</option>`).join('')}</select>` })}
            <table class="scale-table"><thead><tr><th>Letra</th><th>Desde</th><th>Puntos</th><th></th></tr></thead>
                <tbody id="escalaFilas">${escala().map(filaEscala).join('')}</tbody></table>
            <div class="form-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="escala-fila">${icon('plus')}Nivel</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="escala-defecto">Restablecer</button>
                <button class="btn btn-primary" type="submit">Guardar escala</button>
            </div>
        </form>

        <form class="panel settings-card rise" style="--i:5" data-form="pomodoro">
            <h2>${icon('timer')}Pomodoro y meta diaria</h2>
            <div class="form-row four">
                ${field({ label: 'Enfoque (min)', control: `<input class="input" type="number" name="trabajo" min="5" max="120" value="${p.trabajo}">` })}
                ${field({ label: 'Descanso', control: `<input class="input" type="number" name="descanso" min="1" max="60" value="${p.descanso}">` })}
                ${field({ label: 'Descanso largo', control: `<input class="input" type="number" name="descansoLargo" min="5" max="90" value="${p.descansoLargo}">` })}
                ${field({ label: 'Bloques por ciclo', control: `<input class="input" type="number" name="ciclos" min="2" max="8" value="${p.ciclos}">` })}
            </div>
            ${field({ label: 'Meta de estudio diaria (min)', control: `<input class="input" type="number" name="metaDiaria" min="15" max="720" step="15" value="${p.metaDiaria}">` })}
            <div class="form-actions"><button class="btn btn-primary" type="submit">Guardar</button></div>
        </form>

        <section class="panel settings-card rise" style="--i:6">
            <h2>${icon('bell')}Notificaciones</h2>
            ${!push.soportado ? '<p class="muted">Este navegador no admite notificaciones push. Prueba con Chrome, Edge o Firefox, o instala la app.</p>'
                : !app.pushKey ? '<p class="muted">El servidor aún no tiene configuradas las notificaciones push (ejecuta <code>php db/instalar.php --vapid</code>).</p>'
                : push.permiso === 'denied' ? '<p class="form-alert">Bloqueaste las notificaciones para este sitio. Actívalas desde la configuración del navegador (icono del candado).</p>'
                : `<p class="muted small">Te avisamos 15 minutos antes de cada clase, la noche anterior a tus entregas, 3 días y 1 día antes de cada examen, y cuando tengas tarjetas para repasar, aunque la app esté cerrada.</p>
                   <div class="form-actions">${push.suscrito
                       ? `<span class="pill tone-live">Activadas en este dispositivo</span><button class="btn btn-ghost btn-sm" type="button" data-action="push-prueba">Enviar prueba</button><button class="btn btn-ghost btn-sm" type="button" data-action="push-off">Desactivar</button>`
                       : `<button class="btn btn-primary" type="button" data-action="push-on">${icon('bell')}Activar notificaciones</button>`}</div>`}
        </section>

        <section class="panel settings-card rise" style="--i:7">
            <h2>${icon('database')}Datos</h2>
            <p class="muted small">Tus datos se guardan en el servidor y se sincronizan entre tus dispositivos.</p>
            <p class="storage-line">${icon('paperclip')}<span>Archivos: ${fmtBytes(db.usoAlmacenamiento)} de ${fmtBytes(db.cuotaAlmacenamiento)}</span><span class="bar storage-bar"><span style="width:${pct}%"></span></span></p>
            <div class="form-actions wrap">
                <button class="btn btn-ghost btn-sm" type="button" data-action="export">${icon('download')}Exportar respaldo</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="import">${icon('upload')}Importar respaldo</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="demo">${icon('sparkles')}Datos de ejemplo</button>
                <button class="btn btn-ghost btn-sm danger-text" type="button" data-action="vaciar-semestre">${icon('trash')}Vaciar ${P().uno}</button>
            </div>
        </section>

        <section class="panel settings-card rise" style="--i:8">
            <h2>${icon('logout')}Sesión</h2>
            <div class="form-actions"><button class="btn btn-ghost" type="button" data-action="logout">${icon('logout')}Cerrar sesión</button></div>
        </section>
    </div>`;
}

const filaEscala = (n) => `<tr>
    <td><input class="input sm" name="letra" required maxlength="4" value="${esc(n.letra)}" aria-label="Letra"></td>
    <td><input class="input sm" type="number" name="min" required min="0" max="100" step="0.5" value="${n.min}" aria-label="Nota mínima"></td>
    <td><input class="input sm" type="number" name="puntos" required min="0" max="5" step="0.1" value="${n.puntos}" aria-label="Puntos"></td>
    <td><button class="icon-btn sm" type="button" data-quitar-fila aria-label="Quitar nivel">${icon('x')}</button></td>
</tr>`;

/** Envía los formularios de ajustes (delegado desde main.js). */
export async function enviarAjustes(form) {
    const tipo = form.dataset.form;
    const btn = $('[type="submit"]', form);
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
        const d = Object.fromEntries(new FormData(form).entries());
        if (tipo === 'perfil') {
            db.usuario = (await api.patch('perfil', { nombre: d.nombre, carrera: d.carrera })).usuario;
            toast({ type: 'success', title: 'Perfil guardado' });
        } else if (tipo === 'academico') {
            const antes = perfil().periodo;
            db.usuario = (await api.patch('perfil', { perfil: {
                universidad: d.universidad, periodo: d.periodo, formatoHora: d.formatoHora,
                creditosCarrera: d.creditosCarrera === '' ? null : Number(d.creditosCarrera),
            } })).usuario;
            aplicarPerfil();
            $('#semChip').parentElement.title = `Cambiar de ${P().uno}`;
            toast({ type: 'success', title: 'Perfil académico guardado', msg: antes !== d.periodo ? `Ahora la app habla de ${P().varios}. Puedes renombrar tus períodos en Historial.` : '' });
        } else if (tipo === 'password') {
            await api.post('perfil/password', { actual: d.actual, nueva: d.nueva });
            form.reset();
            toast({ type: 'success', title: 'Contraseña actualizada' });
        } else if (tipo === 'escala') {
            const filas = $$('#escalaFilas tr', form).map(tr => ({ letra: $('[name="letra"]', tr).value.trim(), min: Number($('[name="min"]', tr).value), puntos: Number($('[name="puntos"]', tr).value) }));
            db.usuario = (await api.patch('perfil', { escala: filas })).usuario;
            toast({ type: 'success', title: 'Escala guardada', msg: 'Tus índices se recalcularon.' });
        } else if (tipo === 'pomodoro') {
            const p = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]));
            db.usuario = (await api.patch('perfil', { pomodoro: p })).usuario;
            toast({ type: 'success', title: 'Tiempos guardados' });
        }
        render();
    } catch (e) {
        mostrarErrorForm(form, e);
        if (!e.campo) toastError(e);
    } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}

accion({
    'escala-fila': () => $('#escalaFilas').insertAdjacentHTML('beforeend', filaEscala({ letra: '', min: 0, puntos: 0 })),
    'escala-defecto': () => { $('#escalaFilas').innerHTML = ESCALA_DEFECTO.map(filaEscala).join(''); },
    'escala-plantilla': (el) => {
        const t = PLANTILLAS_ESCALA[el.value];
        if (t) { $('#escalaFilas').innerHTML = t.escala.map(filaEscala).join(''); toast({ type: 'info', title: 'Plantilla aplicada', msg: 'Revísala y pulsa «Guardar escala».' }); }
    },
    'vaciar-semestre': borrarSemestre,
    'push-on': async (el) => { el.classList.add('is-loading'); try { await activarPush(); push = await estadoPush(); render(); } catch (e) { toastError(e); el.classList.remove('is-loading'); } },
    'push-off': async () => { try { await desactivarPush(); push = await estadoPush(); render(); toast({ type: 'info', title: 'Notificaciones desactivadas' }); } catch (e) { toastError(e); } },
    'push-prueba': async (el) => { el.classList.add('is-loading'); try { await api.post('push/prueba'); toast({ type: 'success', title: 'Aviso enviado', msg: 'Debería aparecer en unos segundos.' }); } catch (e) { toastError(e); } finally { el.classList.remove('is-loading'); } },
});

document.addEventListener('click', (e) => { if (e.target.closest('[data-quitar-fila]')) e.target.closest('tr').remove(); });

