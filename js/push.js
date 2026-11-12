/* Suscripción a notificaciones push (Web Push + service worker). */
import { api } from './api.js';
import { app } from './estado.js';
import { toast } from './ui.js';

const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function claveAUint8(base64) {
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function estadoPush() {
    if (!soportado()) return { soportado: false, permiso: 'default', suscrito: false };
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return { soportado: true, permiso: Notification.permission, suscrito: !!sub };
}

export async function activarPush() {
    if (!soportado()) throw new Error('Este navegador no admite notificaciones push.');
    if (!app.pushKey) throw new Error('El servidor no tiene configuradas las notificaciones.');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('No diste permiso para mostrar notificaciones.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAUint8(app.pushKey) });
    await api.post('push/suscribir', sub.toJSON());
    try { await api.post('push/prueba'); } catch { /* sin internet en el servidor: la suscripción igual queda guardada */ }
    toast({ type: 'success', title: 'Notificaciones activadas', msg: 'Te llegará un aviso de prueba en unos segundos.' });
}

export async function desactivarPush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    await api.post('push/desuscribir', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
}
