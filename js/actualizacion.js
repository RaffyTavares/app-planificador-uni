/*
 * Actualizaciones de la app (service worker).
 * - Hay versión nueva cuando cambia VERSION en sw.js.
 * - Se busca al abrir la app, al volver a ella, al recuperar conexión, cada 15 minutos
 *   y con el botón «Buscar actualizaciones» de Ajustes.
 * - Cuando la nueva está descargada, aparece la barra con el botón «Actualizar».
 *   Al pulsarlo, la versión nueva toma el control y la página se recarga una sola vez.
 */
import { $ } from './util.js';
import { icon } from './iconos.js';

const CADA = 15 * 60 * 1000;
let reg = null;
let recargar = false;

export async function iniciarActualizaciones() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    try {
        // updateViaCache: 'none' → el navegador nunca usa una copia vieja de sw.js
        reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    } catch { return; /* la app funciona igual sin service worker */ }

    // Solo se recarga si el estudiante pidió actualizar (no en la primera instalación)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!recargar) return;
        recargar = false;
        location.reload();
    });

    // Una versión puede estar ya esperando o descargándose (el navegador la busca al abrir la app)
    if (reg.waiting) avisar(reg.waiting);
    if (reg.installing) vigilar(reg.installing);
    reg.addEventListener('updatefound', () => vigilar(reg.installing));

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
    window.addEventListener('online', buscar);
    setInterval(buscar, CADA);
    buscar();
}

function vigilar(w) {
    if (!w) return;
    const revisar = () => { if (w.state === 'installed') avisar(w); };
    w.addEventListener('statechange', revisar);
    revisar();
}

/** Muestra la barra solo si ya hay una versión en uso (en la primera instalación no hay nada que actualizar). */
function avisar(w) {
    if (w && navigator.serviceWorker.controller) mostrarBarra(w);
}

function buscar() {
    if (reg && navigator.onLine) reg.update().catch(() => {});
}

/** Botón de Ajustes: busca ya y responde 'nueva' | 'descargando' | 'al-dia' | 'sin-soporte'. */
export async function buscarAhora() {
    if (!reg) return 'sin-soporte';
    try { await reg.update(); } catch { /* sin conexión */ }
    if (reg.installing) {
        await new Promise(r => {
            const w = reg.installing;
            const fin = () => { if (w.state !== 'installing') r(); };
            w.addEventListener('statechange', fin);
            setTimeout(r, 15000);
        });
    }
    if (reg.waiting) { avisar(reg.waiting); return 'nueva'; }
    return reg.installing ? 'descargando' : 'al-dia';
}

/** Versión en uso (nombre de la caché de la interfaz). */
export async function versionActual() {
    try {
        const ks = await caches.keys();
        return ks.find(k => /^edugestor-/.test(k) && !['edugestor-api', 'edugestor-generacion-2'].includes(k)) || '—';
    } catch { return '—'; }
}

function mostrarBarra(worker) {
    $('#actualizacion')?.remove();
    const barra = document.createElement('div');
    barra.id = 'actualizacion';
    barra.className = 'update-bar';
    barra.setAttribute('role', 'status');
    barra.innerHTML = `
        <span class="update-ic">${icon('sparkles')}</span>
        <div class="update-text"><strong>Hay una versión nueva</strong><small>Actualiza para usar las últimas mejoras.</small></div>
        <button class="btn btn-primary btn-sm" type="button" data-actualizar>Actualizar</button>
        <button class="icon-btn sm" type="button" data-despues aria-label="Más tarde">${icon('x')}</button>`;
    document.body.appendChild(barra);
    requestAnimationFrame(() => barra.classList.add('is-visible'));

    $('[data-actualizar]', barra).addEventListener('click', (e) => {
        e.currentTarget.classList.add('is-loading');
        e.currentTarget.disabled = true;
        recargar = true;
        worker.postMessage({ tipo: 'actualizar' });
        // Por si el navegador no emite controllerchange
        setTimeout(() => { if (recargar) location.reload(); }, 4000);
    });
    // «Más tarde»: se oculta; vuelve a aparecer la próxima vez que se abra la app
    $('[data-despues]', barra).addEventListener('click', () => {
        barra.classList.remove('is-visible');
        setTimeout(() => barra.remove(), 250);
    });
}
