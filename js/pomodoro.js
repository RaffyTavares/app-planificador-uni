/*
 * Temporizador Pomodoro. Sigue corriendo al cambiar de vista; su estado de
 * pantalla vive en sessionStorage (solo esta pestaña). Cada bloque de enfoque
 * terminado se guarda en el servidor como sesión de estudio.
 */
import { $, pad } from './util.js';
import { api } from './api.js';
import { db, pomodoroConfig, materiaName, reemplazar } from './estado.js';
import { toast, toastError, render } from './ui.js';

const CLAVE = 'eduPomodoro';
export const MODOS = {
    trabajo: { label: 'Enfoque', min: () => pomodoroConfig().trabajo },
    descanso: { label: 'Descanso', min: () => pomodoroConfig().descanso },
    largo: { label: 'Descanso largo', min: () => pomodoroConfig().descansoLargo },
};

export const pomo = (() => {
    try {
        const s = JSON.parse(sessionStorage.getItem(CLAVE));
        if (s && MODOS[s.modo]) return s;
    } catch { /* sin almacenamiento de sesión */ }
    return { modo: 'trabajo', corriendo: false, fin: null, restante: null, ciclo: 0, materiaId: null, inicio: null };
})();

const guardar = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify(pomo)); } catch { /* ignorar */ } };

export function segundosRestantes() {
    if (pomo.corriendo && pomo.fin) return Math.max(0, Math.round((pomo.fin - Date.now()) / 1000));
    return pomo.restante ?? MODOS[pomo.modo].min() * 60;
}
export const totalModo = () => MODOS[pomo.modo].min() * 60;
export const fmtReloj = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

export function iniciar() {
    if (pomo.corriendo) return;
    const s = segundosRestantes();
    pomo.corriendo = true;
    pomo.fin = Date.now() + s * 1000;
    if (pomo.modo === 'trabajo' && !pomo.inicio) pomo.inicio = new Date(Date.now() - (totalModo() - s) * 1000).toISOString();
    pomo.restante = null;
    guardar();
    pedirPermisoAviso();
    tick();
}

export function pausar() {
    if (!pomo.corriendo) return;
    pomo.restante = segundosRestantes();
    pomo.corriendo = false;
    pomo.fin = null;
    guardar();
    tick();
}

export function reiniciar() {
    pomo.corriendo = false; pomo.fin = null; pomo.restante = null; pomo.inicio = null;
    guardar();
    tick();
}

export function cambiarModo(modo) {
    pomo.modo = modo;
    reiniciar();
}

export function setMateria(id) {
    pomo.materiaId = id || null;
    guardar();
}

/** Termina el bloque de enfoque ahora y guarda el tiempo trabajado. */
export async function terminarAhora() {
    if (pomo.modo !== 'trabajo') return reiniciar();
    const min = Math.floor((totalModo() - segundosRestantes()) / 60);
    if (min < 1) { reiniciar(); return; }
    await registrar(min);
    reiniciar();
}

async function registrar(minutos) {
    try {
        const s = await api.post('sesiones', { materiaId: pomo.materiaId, minutos, inicio: pomo.inicio });
        reemplazar('sesiones', s);
        render();
        return s;
    } catch (e) { toastError(e, 'No se pudo guardar la sesión'); return null; }
}

async function completar() {
    const cfg = pomodoroConfig();
    sonar();
    if (pomo.modo === 'trabajo') {
        await registrar(cfg.trabajo);
        pomo.ciclo += 1;
        const largo = pomo.ciclo % cfg.ciclos === 0;
        avisar('¡Bloque completado!', `${cfg.trabajo} min de ${materiaName(pomo.materiaId)}. Toma un ${largo ? 'descanso largo' : 'descanso'}.`);
        pomo.modo = largo ? 'largo' : 'descanso';
        pomo.inicio = null;
        pomo.corriendo = false; pomo.fin = null; pomo.restante = null;
        iniciar(); // el descanso empieza solo
    } else {
        avisar('Fin del descanso', '¿Listo para el siguiente bloque?');
        pomo.modo = 'trabajo';
        pomo.corriendo = false; pomo.fin = null; pomo.restante = null; pomo.inicio = null;
        guardar();
    }
}

let tituloBase = document.title;
export const setTituloBase = (t) => { tituloBase = t; };

/** Refresca el mini temporizador, la vista Enfoque y el título de la pestaña. */
export function tick() {
    const s = segundosRestantes();
    if (pomo.corriendo && s <= 0) { completar(); return; }
    const mini = $('#miniTimer');
    if (mini) {
        const visible = pomo.corriendo || (pomo.restante != null && pomo.restante < totalModo());
        mini.hidden = !visible;
        mini.classList.toggle('is-break', pomo.modo !== 'trabajo');
        mini.classList.toggle('is-paused', !pomo.corriendo);
        $('#miniTimerText').textContent = fmtReloj(s);
    }
    const reloj = $('#pomoReloj');
    if (reloj) {
        reloj.textContent = fmtReloj(s);
        const anillo = $('#pomoAnillo');
        if (anillo) anillo.style.strokeDashoffset = String(Number(anillo.dataset.len) * (1 - s / totalModo()));
    }
    document.title = pomo.corriendo ? `${fmtReloj(s)} · ${MODOS[pomo.modo].label}` : tituloBase;
}

setInterval(() => { if (pomo.corriendo) tick(); }, 1000);

/* ---------- Avisos ---------- */
function sonar() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.18, 0.36].forEach((t, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = [660, 880, 990][i];
            g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime + t);
            o.stop(ctx.currentTime + t + 0.2);
        });
    } catch { /* sin audio */ }
}

function pedirPermisoAviso() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

async function avisar(titulo, cuerpo) {
    toast({ type: 'reminder', title: titulo, msg: cuerpo, duration: 8000 });
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) reg.showNotification(titulo, { body: cuerpo, icon: 'icons/icon-192.png', tag: 'pomodoro' });
        else new Notification(titulo, { body: cuerpo });
    } catch { /* ignorar */ }
}

