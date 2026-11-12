<?php
/** Suscripciones push y entrega de notificaciones al service worker. */
declare(strict_types=1);

require_once __DIR__ . '/../lib/webpush.php';

function ruta_push(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($recurso === 'notificaciones' && $m === 'GET') {
        // El service worker las pide al recibir un aviso push
        $desde = date('Y-m-d H:i:s', strtotime('-1 day'));
        $lista = filas('SELECT id, titulo, cuerpo, url FROM notificaciones WHERE usuario_id = ? AND entregada = 0 AND creada_en >= ? ORDER BY id LIMIT 10', [$u, $desde]);
        if ($lista) {
            $ids = implode(',', array_map(fn($n) => (int) $n['id'], $lista));
            q("UPDATE notificaciones SET entregada = 1 WHERE id IN ($ids)");
        }
        responder(['notificaciones' => array_map(fn($n) => ['id' => (int) $n['id'], 'titulo' => $n['titulo'], 'cuerpo' => $n['cuerpo'], 'url' => $n['url']], $lista)]);
    }

    if ($recurso !== 'push' || $m !== 'POST') fallar('Ruta no encontrada.', 404);

    if ($id === 'suscribir') {
        if (!config('push.public_key')) fallar('Las notificaciones push no están configuradas en el servidor.', 503);
        $d = entrada();
        $endpoint = (string) ($d['endpoint'] ?? '');
        $keys = (array) ($d['keys'] ?? []);
        if (!preg_match('#^https://#', $endpoint) || strlen($endpoint) > 1000) fallar('Suscripción no válida.', 422);
        $p256 = texto($keys, 'p256dh', 255, true);
        $auth = texto($keys, 'auth', 255, true);
        $hash = hash('sha256', $endpoint);
        $existente = valor('SELECT id FROM push_suscripciones WHERE endpoint_hash = ?', [$hash]);
        if ($existente) {
            q('UPDATE push_suscripciones SET usuario_id = ?, p256dh = ?, auth = ? WHERE id = ?', [$u, $p256, $auth, $existente]);
        } else {
            insertar('push_suscripciones', ['usuario_id' => $u, 'endpoint_hash' => $hash, 'endpoint' => $endpoint, 'p256dh' => $p256, 'auth' => $auth, 'creado_en' => ahora()]);
        }
        responder(['ok' => true]);
    }

    if ($id === 'desuscribir') {
        $endpoint = (string) (entrada()['endpoint'] ?? '');
        q('DELETE FROM push_suscripciones WHERE endpoint_hash = ? AND usuario_id = ?', [hash('sha256', $endpoint), $u]);
        responder(['ok' => true]);
    }

    if ($id === 'prueba') {
        notificar($u, 'prueba-' . bin2hex(random_bytes(4)), '¡Notificaciones activadas!', 'Así te avisaremos de tus clases, entregas y exámenes.', '#/inicio');
        $enviados = webpush_usuario($u);
        if (!$enviados) fallar('No se pudo entregar el aviso. Revisa que el navegador tenga permiso y conexión a internet.', 502);
        responder(['ok' => true, 'enviados' => $enviados]);
    }

    fallar('Ruta no encontrada.', 404);
}
