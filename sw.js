/*
 * Service worker de EduGestor Pro.
 * - Guarda la interfaz en caché para abrir la app sin conexión.
 * - API: red primero; si no hay conexión, la última respuesta GET guardada
 *   (la app queda en modo solo lectura).
 * - Push: al recibir un aviso, pide las notificaciones pendientes a la API.
 */
const VERSION = 'edugestor-v4';
const SHELL = [
    './', 'index.html', 'styles.css', 'manifest.webmanifest', 'logo.jpeg', 'icons/icon-192.png', 'icons/icon-512.png',
    'js/main.js', 'js/util.js', 'js/iconos.js', 'js/api.js', 'js/estado.js', 'js/ui.js', 'js/acciones.js', 'js/datos.js',
    'js/componentes.js', 'js/formularios.js', 'js/rutas.js', 'js/acceso.js', 'js/paleta.js', 'js/pomodoro.js', 'js/push.js', 'js/datos-ejemplo.js', 'js/markdown.js',
    'js/vistas/inicio.js', 'js/vistas/calendario.js', 'js/vistas/horario.js', 'js/vistas/tareas.js', 'js/vistas/materias.js',
    'js/vistas/calificaciones.js', 'js/vistas/notas.js', 'js/vistas/enfoque.js', 'js/vistas/repaso.js', 'js/vistas/asistente.js',
    'js/vistas/grupos.js', 'js/vistas/historial.js', 'js/vistas/ajustes.js',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
                if (r.ok) { const copia = r.clone(); caches.open(VERSION + '-api').then(c => c.put(req, copia)); }
                return r;
            }).catch(() => caches.match(req).then(r => r || new Response(JSON.stringify({ error: 'Sin conexión.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
        );
        return;
    }

    // Interfaz: caché primero y actualiza en segundo plano
    e.respondWith(
        caches.match(req, { ignoreSearch: true }).then(enCache => {
            const red = fetch(req).then(r => {
                if (r.ok && req.method === 'GET') { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
                return r;
            }).catch(() => enCache || caches.match('index.html'));
            return enCache || red;
        })
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
