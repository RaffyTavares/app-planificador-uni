/* Pantalla de acceso (iniciar sesión / crear cuenta) y migración de datos antiguos. */
import { $, $$, esc, plural } from './util.js';
import { icon, hydrateIcons } from './iconos.js';
import { api, setCsrf } from './api.js';
import { validateField, mostrarErrorForm, openForm, toast, toastError } from './ui.js';
import { app } from './estado.js';

let modo = 'login';

export function mostrarAcceso(alEntrar) {
    document.body.classList.add('is-auth');
    const raiz = $('#acceso');
    raiz.hidden = false;
    pintar(raiz, alEntrar);
}

export function ocultarAcceso() {
    document.body.classList.remove('is-auth');
    $('#acceso').hidden = true;
    $('#acceso').innerHTML = '';
}

function pintar(raiz, alEntrar) {
    if (app.registroAbierto === false) modo = 'login';
    const registro = modo === 'registro';
    raiz.innerHTML = `
    <div class="auth-art" aria-hidden="true">
        <div class="auth-art-inner">
            <span class="brand-mark lg"><img src="logo.jpeg" alt="" width="56" height="56"></span>
            <h2 class="display">Tu semestre,<br><em>en calma y en orden.</em></h2>
            <ul class="auth-points">
                <li>${icon('calendar')}Horario, tareas y exámenes en un solo lugar</li>
                <li>${icon('award')}Calificaciones e índice calculados al instante</li>
                <li>${icon('timer')}Pomodoro, tarjetas de repaso y plan de estudio</li>
                <li>${icon('users')}Grupos para compartir apuntes y archivos</li>
            </ul>
        </div>
    </div>
    <main class="auth-main" id="main">
        <div class="auth-card">
            <a class="brand" href="#/inicio" aria-label="EduGestor Pro">
                <span class="brand-mark"><img src="logo.jpeg" alt="" width="40" height="40"></span>
                <span class="brand-text"><strong>EduGestor <em>Pro</em></strong><small>Tu éxito académico</small></span>
            </a>
            <h1 class="auth-title">${registro ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h1>
            <p class="muted">${registro ? 'Es gratis y tus datos se guardan de forma segura en el servidor.' : 'Inicia sesión para ver tu planificador.'}</p>
            ${app.registroAbierto === false ? '' : `<div class="segmented auth-tabs" role="tablist">
                <label><input type="radio" name="authModo" value="login" ${registro ? '' : 'checked'}><span>Iniciar sesión</span></label>
                <label><input type="radio" name="authModo" value="registro" ${registro ? 'checked' : ''}><span>Crear cuenta</span></label>
            </div>`}
            <form class="form" id="authForm" novalidate>
                ${registro ? campo('Nombre', `<input class="input" name="nombre" required maxlength="80" autocomplete="name" placeholder="Ej. Rafael Tavares">`) : ''}
                ${campo('Correo', `<input class="input" type="email" name="email" required maxlength="190" autocomplete="email" placeholder="tucorreo@unad.edu.do">`)}
                ${campo('Contraseña', `<div class="pass-wrap"><input class="input" type="password" name="password" required ${registro ? 'minlength="8"' : ''} autocomplete="${registro ? 'new-password' : 'current-password'}">
                    <button type="button" class="icon-btn sm" data-ver-pass aria-label="Mostrar contraseña">${icon('eye')}</button></div>`, registro ? 'Mínimo 8 caracteres.' : '')}
                ${registro ? campo('Carrera', `<input class="input" name="carrera" maxlength="120" placeholder="Ej. Ingeniería de Sistemas">`, '', true) : ''}
                <p class="form-error" role="alert"></p>
                <button class="btn btn-primary btn-block" type="submit">${registro ? 'Crear cuenta' : 'Entrar'}${icon('arrow', 'arr')}</button>
            </form>
        </div>
    </main>`;

    $$('[name="authModo"]', raiz).forEach(r => r.addEventListener('change', () => { modo = r.value; pintar(raiz, alEntrar); $('#authForm input', raiz)?.focus(); }));
    $('[data-ver-pass]', raiz).addEventListener('click', (e) => {
        const inp = $('[name="password"]', raiz);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        e.currentTarget.setAttribute('aria-label', inp.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });
    const form = $('#authForm', raiz);
    form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') validateField(e.target); });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inval = $$('input', form).filter(i => !validateField(i));
        if (inval.length) { inval[0].focus(); return; }
        const btn = $('[type="submit"]', form);
        btn.classList.add('is-loading'); btn.disabled = true;
        $('.form-error', form).textContent = '';
        try {
            const d = Object.fromEntries(new FormData(form).entries());
            const r = await api.post(registro ? 'registro' : 'login', d);
            setCsrf(r.csrf);
            ocultarAcceso();
            await alEntrar(r, registro);
        } catch (err) {
            mostrarErrorForm(form, err);
        } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
    });
    hydrateIcons(raiz);
    requestAnimationFrame(() => $('#authForm input', raiz)?.focus());
}

const campo = (label, control, hint = '', opcional = false) => `<label class="field">
    <span class="field-label">${label}${opcional ? ' <small>(opcional)</small>' : ''}</span>${control}
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}<span class="field-error" aria-live="polite"></span></label>`;

/* ---------- Migración desde la versión anterior (localStorage) ---------- */
const CLAVES_ANTIGUAS = ['materias', 'clases', 'tareas', 'anotaciones'];

export function datosAntiguos() {
    try {
        const d = {};
        CLAVES_ANTIGUAS.forEach(k => { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v) && v.length) d[k] = v; });
        return Object.keys(d).length ? d : null;
    } catch { return null; }
}

export function ofrecerMigracion(alTerminar) {
    const d = datosAntiguos();
    if (!d) return;
    const n = (k) => (d[k] || []).length;
    openForm({
        eyebrow: 'Encontramos datos en este navegador',
        title: '¿Pasarlos a tu cuenta?',
        desc: `La versión anterior guardó ${plural(n('materias'), 'materia', 'materias')}, ${plural(n('clases'), 'clase', 'clases')}, ${plural(n('tareas'), 'tarea', 'tareas')} y ${plural(n('anotaciones'), 'nota', 'notas')} solo en este navegador. Al importarlos quedarán en el servidor y se borrarán de aquí.`,
        body: '',
        submit: 'Importar a mi cuenta',
        footLeft: '<button class="btn btn-ghost" type="button" data-descartar>Descartar</button>',
        async onSubmit() {
            const r = await api.post('importar', { ...d, modo: 'agregar' });
            CLAVES_ANTIGUAS.forEach(k => localStorage.removeItem(k));
            toast({ type: 'success', title: 'Datos importados', msg: 'Ya están guardados en tu cuenta.' });
            alTerminar(r);
        },
        onOpen(form) {
            $('[data-descartar]', form).addEventListener('click', () => {
                CLAVES_ANTIGUAS.forEach(k => localStorage.removeItem(k));
                $('[data-close]', form).click();
                toast({ type: 'info', title: 'Datos antiguos descartados' });
            });
        },
    });
}

