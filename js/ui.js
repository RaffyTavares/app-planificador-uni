/* Componentes de interfaz compartidos: avisos, diálogos, formularios y estados vacíos. */
import { $, $$, esc, reducedMotion } from './util.js';
import { icon } from './iconos.js';

/** Ganchos que main.js rellena (evita importaciones circulares). */
export const hooks = { render: () => {}, renderParcial: () => {} };
export const render = (opts) => hooks.render(opts);

/* =====================================================================
   AVISOS (TOASTS)
   ===================================================================== */
const TOAST_ICON = { success: 'checkCircle', error: 'alert', warn: 'alert', info: 'info', reminder: 'bell' };

export function toast({ title, msg = '', type = 'info', action = null, duration = 4500 }) {
    const cont = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
        <span class="toast-ic">${icon(TOAST_ICON[type] || 'info')}</span>
        <div class="toast-body"><p class="toast-title">${esc(title)}</p>${msg ? `<p class="toast-msg">${esc(msg)}</p>` : ''}</div>
        ${action ? `<button class="toast-action" type="button">${esc(action.label)}</button>` : ''}
        <button class="icon-btn sm toast-close" type="button" aria-label="Cerrar notificación">${icon('x')}</button>
        <span class="toast-timer" style="animation-duration:${duration}ms"></span>`;

    let timer;
    const dismiss = () => {
        clearTimeout(timer);
        if (el.classList.contains('is-leaving')) return;
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 230);
        action?.onExpire?.();
    };
    const arm = (ms) => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };

    $('.toast-close', el).addEventListener('click', dismiss);
    if (action) $('.toast-action', el).addEventListener('click', () => { const r = action.run; action.onExpire = null; dismiss(); r(); });
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => arm(2000));

    cont.appendChild(el);
    while (cont.children.length > 4) cont.firstElementChild.remove();
    arm(duration);
    return dismiss;
}

export const toastError = (e, titulo = 'No se pudo completar') => toast({ type: 'error', title: titulo, msg: e?.message || String(e) });

/* =====================================================================
   DIÁLOGOS
   ===================================================================== */
let lastTrigger = null;

export function showDialog(dlg) {
    lastTrigger = document.activeElement;
    dlg.classList.remove('is-closing');
    if (!dlg.open) dlg.showModal();
}

export function closeDialog(dlg) {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    if (reducedMotion()) { dlg.close(); return; }
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); }, 170);
}

export function prepararDialogos() {
    $$('dialog').forEach(dlg => {
        dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!dlg.dataset.ocupado) closeDialog(dlg); });
        dlg.addEventListener('click', (e) => { if (e.target === dlg && !dlg.dataset.ocupado) closeDialog(dlg); });
        dlg.addEventListener('close', () => {
            if (lastTrigger && document.contains(lastTrigger) && typeof lastTrigger.focus === 'function') lastTrigger.focus({ preventScroll: true });
        });
    });
}

export const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Formulario en el diálogo principal.
 * onSubmit(datos, form) puede ser async; si lanza un ErrorApi con `campo`,
 * el error se muestra junto a ese campo. Devuelve false para mantener abierto.
 */
export function openForm({ eyebrow, title, desc = '', body, submit = 'Guardar', cancel = 'Cancelar', danger = false, footLeft = '', wide = false, onSubmit, onOpen }) {
    const dlg = $('#formDialog');
    dlg.classList.toggle('is-wide', wide);
    dlg.innerHTML = `<form class="dlg" novalidate>
        <header class="dlg-head">
            <div>
                ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
                <h2 id="dlgTitle">${title}</h2>
                ${desc ? `<p class="dlg-desc">${desc}</p>` : ''}
            </div>
            <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button>
        </header>
        ${body ? `<div class="dlg-body"><div class="form">${body}</div><p class="form-error" role="alert"></p></div>` : '<p class="form-error dlg-body" role="alert"></p>'}
        <footer class="dlg-foot">
            ${footLeft ? `<div class="dlg-foot-left">${footLeft}</div>` : ''}
            <button class="btn btn-ghost" type="button" data-close>${cancel}</button>
            ${submit ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit">${submit}</button>` : ''}
        </footer>
    </form>`;

    const form = $('form', dlg);
    $$('[data-close]', form).forEach(b => b.addEventListener('click', () => { if (!dlg.dataset.ocupado) closeDialog(dlg); }));
    form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') validateField(e.target); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (dlg.dataset.ocupado) return;
        const fields = $$('input, select, textarea', form).filter(el => el.willValidate && !el.closest('[data-sin-validar]'));
        const invalid = fields.filter(el => !validateField(el));
        if (invalid.length) { invalid[0].focus(); return; }
        const datos = Object.fromEntries(new FormData(form).entries());
        Object.keys(datos).forEach(k => { if (typeof datos[k] === 'string') datos[k] = datos[k].trim(); });

        const btn = $('[type="submit"]', form);
        $('.form-error', form).textContent = '';
        dlg.dataset.ocupado = '1';
        btn?.classList.add('is-loading');
        if (btn) btn.disabled = true;
        try {
            const r = await onSubmit(datos, form);
            delete dlg.dataset.ocupado;
            if (r !== false) closeDialog(dlg);
        } catch (err) {
            delete dlg.dataset.ocupado;
            mostrarErrorForm(form, err);
        } finally {
            btn?.classList.remove('is-loading');
            if (btn) btn.disabled = false;
        }
    });

    showDialog(dlg);
    onOpen?.(form);
    const first = $('.dlg-body input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), .dlg-body textarea, .dlg-body select', form)
        || (danger ? $('.btn[data-close]', form) : $('[type="submit"]', form));
    requestAnimationFrame(() => first?.focus());
    return form;
}

export function mostrarErrorForm(form, err) {
    const campo = err?.campo && (form.elements[err.campo] || $(`[data-campo="${err.campo}"]`, form));
    if (campo && campo.closest?.('.field')) {
        const el = campo.length && !campo.tagName ? campo[0] : campo;
        el.setAttribute('aria-invalid', 'true');
        $('.field-error', el.closest('.field')).textContent = err.message;
        el.focus?.();
    } else {
        $('.form-error', form).textContent = err?.message || 'No se pudo guardar.';
    }
}

export function validateField(el) {
    let msg = '';
    if (el.validity.valueMissing) msg = 'Este campo es obligatorio.';
    else if (el.validity.typeMismatch && el.type === 'email') msg = 'Escribe un correo válido.';
    else if (el.validity.tooShort) msg = `Mínimo ${el.minLength} caracteres.`;
    else if (el.validity.rangeUnderflow) msg = `El mínimo es ${el.min}.`;
    else if (el.validity.rangeOverflow) msg = `El máximo es ${el.max}.`;
    else if (el.validity.tooLong) msg = `Máximo ${el.maxLength} caracteres.`;
    else if (!el.validity.valid) msg = el.validationMessage;
    else if (el.required && typeof el.value === 'string' && !el.value.trim()) msg = 'Este campo es obligatorio.';
    const holder = el.closest('.field');
    const err = holder && $('.field-error', holder);
    if (el.type !== 'radio' && el.type !== 'checkbox') el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg;
    return !msg;
}

export function confirmDialog({ title, desc, confirm = 'Eliminar', danger = true, onConfirm }) {
    openForm({ eyebrow: 'Confirmar', title, desc, body: '', submit: confirm, danger, onSubmit: () => onConfirm() });
}

export const field = ({ label, control, optional = false, hint = '', cls = '' }) => `
    <label class="field ${cls}">
        <span class="field-label">${label}${optional ? ' <small>(opcional)</small>' : ''}</span>
        ${control}
        ${hint ? `<span class="field-hint">${hint}</span>` : ''}
        <span class="field-error" aria-live="polite"></span>
    </label>`;

/* =====================================================================
   PIEZAS REUTILIZABLES
   ===================================================================== */
export function emptyState({ ic = 'sparkles', title, text = '', action = '', size = '' }) {
    return `<div class="empty ${size}">
        <span class="empty-ic">${icon(ic)}</span>
        <h3>${title}</h3>
        ${text ? `<p>${text}</p>` : ''}
        ${action}
    </div>`;
}

export const newBtn = (type, label, cls = 'btn btn-primary', extra = '') =>
    `<button class="${cls}" type="button" data-action="new" data-type="${type}" ${extra}>${icon('plus')}${label}</button>`;

export function pageHead({ eyebrow, title, lead = '', actions = '' }) {
    return `<header class="page-head rise" style="--i:0">
        <div>
            <p class="eyebrow">${eyebrow}</p>
            <h1 class="display">${title}</h1>
            ${lead ? `<p class="lead">${lead}</p>` : ''}
        </div>
        ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </header>`;
}

/** Ejecuta una acción mostrando el botón como ocupado. */
export async function conCarga(btn, fn) {
    if (btn?.classList.contains('is-loading')) return;
    btn?.classList.add('is-loading');
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toastError(e); } finally {
        btn?.classList.remove('is-loading');
        if (btn) btn.disabled = false;
    }
}
