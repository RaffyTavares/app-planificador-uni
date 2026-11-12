<?php
/**
 * Web Push mínimo con VAPID (RFC 8292) usando solo la extensión openssl.
 *
 * Se envían avisos SIN contenido (sin cifrado de payload): al recibirlos, el
 * service worker consulta GET api/index.php/notificaciones con la sesión del
 * usuario y muestra las pendientes. Así no hace falta ninguna librería externa.
 */
declare(strict_types=1);

function b64url(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function openssl_config(): array
{
    foreach ([getenv('OPENSSL_CONF') ?: '', 'C:/xampp/php/extras/ssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf'] as $c) {
        if ($c && is_file($c)) return ['config' => $c];
    }
    return [];
}

/** Genera un par de claves VAPID (P-256). */
function vapid_generar(): array
{
    $clave = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC] + openssl_config());
    if (!$clave) throw new RuntimeException('No se pudo generar la clave: ' . openssl_error_string());
    openssl_pkey_export($clave, $pem, null, openssl_config());
    $det = openssl_pkey_get_details($clave);
    $x = str_pad($det['ec']['x'], 32, "\0", STR_PAD_LEFT);
    $y = str_pad($det['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return ['public_key' => b64url("\x04" . $x . $y), 'private_key_pem' => $pem];
}

/** Convierte una firma ECDSA DER en el formato JOSE (R||S, 64 bytes). */
function der_a_jose(string $der): string
{
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7F;
    $partes = [];
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $v = substr($der, $pos + 2, $len);
        $pos += 2 + $len;
        $v = ltrim($v, "\0");
        $partes[] = str_pad($v, 32, "\0", STR_PAD_LEFT);
    }
    return $partes[0] . $partes[1];
}

function vapid_jwt(string $audiencia): string
{
    $pem = (string) config('push.private_key_pem');
    $priv = openssl_pkey_get_private($pem);
    if (!$priv) throw new RuntimeException('La clave privada VAPID no es válida.');
    $cab = b64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $cuerpo = b64url(json_encode(['aud' => $audiencia, 'exp' => time() + 12 * 3600, 'sub' => (string) config('push.subject')]));
    $datos = "$cab.$cuerpo";
    if (!openssl_sign($datos, $firma, $priv, OPENSSL_ALGO_SHA256)) throw new RuntimeException('No se pudo firmar el JWT.');
    return $datos . '.' . b64url(der_a_jose($firma));
}

/**
 * Envía un aviso vacío a una suscripción. Devuelve el código HTTP
 * (201 = aceptado; 404/410 = suscripción caducada).
 */
function webpush_enviar(string $endpoint): int
{
    $p = parse_url($endpoint);
    if (($p['scheme'] ?? '') !== 'https' || empty($p['host'])) return 400;
    $aud = 'https://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'TTL: 3600',
            'Urgency: high',
            'Content-Length: 0',
            'Authorization: vapid t=' . vapid_jwt($aud) . ', k=' . config('push.public_key'),
        ],
    ]);
    curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return $codigo;
}

/** Envía un aviso a todas las suscripciones del usuario y limpia las caducadas. */
function webpush_usuario(int $usuario): int
{
    if (!config('push.public_key') || !config('push.private_key_pem')) return 0;
    $enviados = 0;
    foreach (filas('SELECT id, endpoint FROM push_suscripciones WHERE usuario_id = ?', [$usuario]) as $s) {
        try {
            $c = webpush_enviar($s['endpoint']);
        } catch (Throwable $e) {
            error_log('[EduGestor] push: ' . $e->getMessage());
            continue;
        }
        if ($c === 404 || $c === 410) q('DELETE FROM push_suscripciones WHERE id = ?', [$s['id']]);
        elseif ($c >= 200 && $c < 300) $enviados++;
    }
    return $enviados;
}

/** Crea una notificación (una sola vez por clave) y devuelve true si es nueva. */
function notificar(int $usuario, string $clave, string $titulo, string $cuerpo, ?string $url = null): bool
{
    if (valor('SELECT 1 FROM notificaciones WHERE usuario_id = ? AND clave = ?', [$usuario, $clave])) return false;
    insertar('notificaciones', [
        'usuario_id' => $usuario, 'clave' => mb_substr($clave, 0, 120), 'titulo' => mb_substr($titulo, 0, 160),
        'cuerpo' => mb_substr($cuerpo, 0, 255), 'url' => $url, 'entregada' => 0, 'creada_en' => ahora(),
    ]);
    return true;
}

/**
 * Genera los recordatorios que tocan ahora para todos los usuarios con
 * notificaciones activadas y les envía el aviso push. Lo ejecuta el cron.
 */
function procesar_recordatorios(): array
{
    $ahora = time();
    $hoy = date('Y-m-d', $ahora);
    $hora = (int) date('G', $ahora);
    $minAhora = $hora * 60 + (int) date('i', $ahora);
    $dia = (int) date('w', $ahora);
    $resumen = ['usuarios' => 0, 'notificaciones' => 0, 'avisos' => 0];

    $usuarios = array_map('intval', array_column(filas('SELECT DISTINCT usuario_id FROM push_suscripciones'), 'usuario_id'));
    foreach ($usuarios as $u) {
        $nuevas = 0;
        $sem = (int) (valor('SELECT id FROM semestres WHERE usuario_id = ? AND activo = 1', [$u]) ?: 0);

        // Clases que empiezan en los próximos 15 minutos
        foreach (filas('SELECT c.*, m.nombre FROM clases c JOIN materias m ON m.id = c.materia_id WHERE c.usuario_id = ? AND m.semestre_id = ? AND c.dia = ?', [$u, $sem, $dia]) as $c) {
            [$h, $mi] = array_map('intval', explode(':', $c['hora']));
            $falta = $h * 60 + $mi - $minAhora;
            if ($falta > 0 && $falta <= 15) {
                $nuevas += (int) notificar($u, "clase-{$c['id']}-$hoy", 'Tu clase empieza pronto', "{$c['nombre']} en $falta min" . ($c['aula'] ? " · {$c['aula']}" : ''), '#/inicio');
            }
        }

        // Exámenes en 3 días y mañana
        foreach ([3 => 'en 3 días', 1 => 'mañana'] as $n => $texto) {
            $f = date('Y-m-d', strtotime("+$n day", $ahora));
            foreach (filas("SELECT id, descripcion FROM tareas WHERE usuario_id = ? AND semestre_id = ? AND tipo = 'examen' AND completada = 0 AND fecha = ?", [$u, $sem, $f]) as $t) {
                $nuevas += (int) notificar($u, "examen-{$t['id']}-$n", "Examen $texto", $t['descripcion'], '#/tareas');
            }
        }

        // Resumen de entregas de mañana (a partir de las 7 p. m.)
        if ($hora >= 19) {
            $manana = date('Y-m-d', strtotime('+1 day', $ahora));
            $n = (int) valor("SELECT COUNT(*) FROM tareas WHERE usuario_id = ? AND semestre_id = ? AND completada = 0 AND tipo = 'tarea' AND fecha = ?", [$u, $sem, $manana]);
            if ($n) $nuevas += (int) notificar($u, "entregas-$manana", 'Entregas para mañana', $n === 1 ? 'Tienes 1 tarea para mañana.' : "Tienes $n tareas para mañana.", '#/tareas');
        }

        // Tarjetas de repaso pendientes (a partir de las 8 a. m.)
        if ($hora >= 8) {
            $n = (int) valor('SELECT COUNT(*) FROM flashcards WHERE usuario_id = ? AND semestre_id = ? AND proxima <= ?', [$u, $sem, $hoy]);
            if ($n >= 5) $nuevas += (int) notificar($u, "repaso-$hoy", 'Hora de repasar', "Tienes $n tarjetas pendientes hoy.", '#/repaso');
        }

        if ($nuevas) {
            $resumen['usuarios']++;
            $resumen['notificaciones'] += $nuevas;
            $resumen['avisos'] += webpush_usuario($u);
        }
    }

    // Limpieza: notificaciones de más de 30 días
    q('DELETE FROM notificaciones WHERE creada_en < ?', [date('Y-m-d H:i:s', strtotime('-30 days', $ahora))]);
    return $resumen;
}
