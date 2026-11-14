/*
 * Service worker de EduGestor Pro.
 * - Guarda la interfaz de cada versión en su propia caché (abre sin conexión y nunca
 *   mezcla archivos de dos versiones).
 * - Versión nueva: se descarga en segundo plano y espera; la app muestra el botón
 *   «Actualizar» (js/actualizacion.js) y al pulsarlo toma el control.
 *
 *   ►► PARA PUBLICAR UNA VERSIÓN NUEVA: cambia VERSION (p. ej. v7 → v8) y sube sw.js
 *      junto con los archivos modificados. Sin ese cambio nadie recibe la actualización.
 * - API: red primero; si no hay conexión, la última respuesta GET guardada
 *   (la app queda en modo solo lectura).
 * - Push: al recibir un aviso, pide las notificaciones pendientes a la API.
 */
const VERSION = 'edugestor-v11';
const SHELL = [
    './', 'index.html', 'styles.css', 'manifest.webmanifest', 'logo.jpeg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/icon-512.png',
    'js/main.js', 'js/util.js', 'js/iconos.js', 'js/api.js', 'js/estado.js', 'js/ui.js', 'js/acciones.js', 'js/datos.js',
    'js/componentes.js', 'js/formularios.js', 'js/rutas.js', 'js/acceso.js', 'js/paleta.js', 'js/pomodoro.js', 'js/push.js', 'js/datos-ejemplo.js', 'js/markdown.js',
    'js/vistas/inicio.js', 'js/vistas/calendario.js', 'js/vistas/horario.js', 'js/vistas/tareas.js', 'js/vistas/materias.js',
    'js/vistas/calificaciones.js', 'js/vistas/notas.js', 'js/vistas/enfoque.js', 'js/vistas/repaso.js', 'js/vistas/asistente.js',
    'js/vistas/grupos.js', 'js/vistas/historial.js', 'js/vistas/ajustes.js', 'js/actualizacion.js',
];

const API_CACHE = 'edugestor-api';
// Marca de las versiones que saben mostrar el botón «Actualizar»
const MARCA = 'edugestor-generacion-2';

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const c = await caches.open(VERSION);
        // cache: 'reload' → descarga del servidor, nunca de la caché HTTP del navegador.
        // Uno a uno: si falta un archivo, la versión se instala igual (ese archivo irá a la red).
        await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
        // Si la versión en uso es anterior al botón «Actualizar», nadie podría pulsarlo:
        // esta vez se aplica sola. A partir de aquí, la nueva espera al botón.
        if (!(await caches.has(MARCA))) self.skipWaiting();
    })());
});

self.addEventListener('message', (e) => {
    if (e.data?.tipo === 'actualizar') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then(ks => Promise.all(ks.filter(k => ![VERSION, API_CACHE, MARCA].includes(k)).map(k => caches.delete(k))))
        .then(() => caches.open(MARCA))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;

    if (url.pathname.includes('/api/')) {
        // Solo se guardan en caché las lecturas de estado y sesión (no archivos ni escrituras)
        if (req.method !== 'GET' || /\/archivos\/|\/publicaciones\//.test(url.pathname)) return;
        e.respondWith(
            fetch(req).then(r => {
                if (r.ok) { const copia = r.clone(); caches.open(API_CACHE).then(c => c.put(req, copia)); }
                return r;
            }).catch(() => caches.match(req).then(r => r || new Response(JSON.stringify({ error: 'Sin conexión.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
        );
        return;
    }

    if (req.method !== 'GET') return;

    // Abrir la app: siempre el index.html de esta versión (otras páginas, como install.php, van a la red)
    if (req.mode === 'navigate') {
        if (!/\/(index\.html)?$/.test(url.pathname)) return;
        e.respondWith(caches.open(VERSION).then(c => c.match('index.html')).then(r => r || fetch(req)));
        return;
    }

    // Interfaz: la copia de esta versión; lo que no esté en ella (fotos, etc.), de la red
    e.respondWith(
        caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true })).then(enCache => enCache || fetch(req).catch(() => Response.error()))
    );
});

/* ---------- Notificaciones push ---------- */
self.addEventListener('push', (e) => {
    e.waitUntil((async () => {
        let lista = [];
        try {
            const r = await fetch(new URL('api/index.php/notificaciones', self.registration.scope), { credentials: 'include' });
            if (r.ok) lista = (await r.json()).notificaciones || [];
        } catch { /* sin conexión o sesión */ }
        if (!lista.length) {
            return self.registration.showNotification('EduGestor Pro', { body: 'Tienes novedades en tu planificador.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'edugestor' });
        }
        await Promise.all(lista.map(n => self.registration.showNotification(n.titulo, {
            body: n.cuerpo, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: `n-${n.id}`, data: { url: n.url || '#/inicio' },
        })));
    })());
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const destino = new URL(e.notification.data?.url || '#/inicio', self.registration.scope).href;
    e.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const abierta = ventanas.find(w => w.url.startsWith(self.registration.scope));
        if (abierta) { await abierta.focus(); abierta.postMessage({ tipo: 'navegar', url: destino }); }
        else await self.clients.openWindow(destino);
    })());
});
