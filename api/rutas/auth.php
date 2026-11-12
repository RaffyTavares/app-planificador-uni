<?php
/** Registro, inicio y cierre de sesión, perfil y preferencias. */
declare(strict_types=1);

function ruta_auth(string $m, string $recurso, ?string $id, ?string $accion): void
{
    match ("$m $recurso") {
        'GET sesion' => auth_sesion(),
        'POST registro' => auth_registro(),
        'POST login' => auth_login(),
        'POST logout' => auth_logout(),
        'PATCH perfil' => auth_perfil(),
        'POST perfil' => $id === 'password' ? auth_password() : fallar('Ruta no encontrada.', 404),
        default => fallar('Ruta no encontrada.', 404),
    };
}

function info_publica(): array
{
    return [
        'csrf' => csrf_token(),
        'ia' => (bool) config('ia.api_key'),
        'pushKey' => config('push.public_key') ?: null,
        'maxSubida' => (int) config('uploads.max_bytes'),
        'registroAbierto' => config('app.registro_abierto') !== false,
    ];
}

function auth_sesion(): never
{
    $u = null;
    if ($id = usuario_id_opcional()) {
        $u = fila('SELECT * FROM usuarios WHERE id = ?', [$id]);
        if (!$u) unset($_SESSION['uid']);
    }
    responder(['usuario' => $u ? s_usuario($u) : null] + info_publica());
}

function validar_password(string $p): void
{
    if (mb_strlen($p) < 8) fallar('La contraseña debe tener al menos 8 caracteres.', 422, ['campo' => 'password']);
    if (mb_strlen($p) > 200) fallar('La contraseña es demasiado larga.', 422, ['campo' => 'password']);
}

function auth_registro(): never
{
    if (config('app.registro_abierto') === false) {
        fallar('El registro de cuentas nuevas está cerrado en este servidor.', 403);
    }
    $d = entrada();
    $nombre = texto($d, 'nombre', 80, true, 'El nombre');
    $email = mb_strtolower(texto($d, 'email', 190, true, 'El correo'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar('El correo no es válido.', 422, ['campo' => 'email']);
    $password = (string) ($d['password'] ?? '');
    validar_password($password);
    $carrera = texto($d, 'carrera', 120, false);

    if (valor('SELECT id FROM usuarios WHERE email = ?', [$email])) {
        fallar('Ya existe una cuenta con ese correo. Inicia sesión.', 409, ['campo' => 'email']);
    }

    $id = insertar('usuarios', [
        'nombre' => $nombre,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'carrera' => $carrera,
        'creado_en' => ahora(),
    ]);
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
    semestre_activo($id);
    responder(['usuario' => s_usuario(fila('SELECT * FROM usuarios WHERE id = ?', [$id]))] + info_publica(), 201);
}

function auth_login(): never
{
    $d = entrada();
    $email = mb_strtolower(trim((string) ($d['email'] ?? '')));
    $password = (string) ($d['password'] ?? '');
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    // Límite: 10 intentos fallidos por IP cada 15 minutos
    $desde = date('Y-m-d H:i:s', time() - 15 * 60);
    $intentos = (int) valor('SELECT COUNT(*) FROM intentos_login WHERE ip = ? AND creado_en > ?', [$ip, $desde]);
    if ($intentos >= 10) fallar('Demasiados intentos. Espera unos minutos y vuelve a intentarlo.', 429);

    $u = $email ? fila('SELECT * FROM usuarios WHERE email = ?', [$email]) : null;
    if (!$u || !password_verify($password, $u['password_hash'])) {
        insertar('intentos_login', ['ip' => $ip, 'email' => mb_substr($email, 0, 190), 'creado_en' => ahora()]);
        fallar('Correo o contraseña incorrectos.', 401);
    }

    q('DELETE FROM intentos_login WHERE ip = ?', [$ip]);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    responder(['usuario' => s_usuario($u)] + info_publica());
}

function auth_logout(): never
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'httponly' => true, 'samesite' => 'Lax']);
    }
    session_destroy();
    iniciar_sesion();
    responder(['ok' => true] + info_publica());
}

function auth_perfil(): never
{
    $u = uid();
    $d = entrada();
    $cambios = [];
    if (array_key_exists('nombre', $d)) $cambios['nombre'] = texto($d, 'nombre', 80, true, 'El nombre');
    if (array_key_exists('carrera', $d)) $cambios['carrera'] = texto($d, 'carrera', 120, false);

    if (array_key_exists('escala', $d)) {
        $escala = $d['escala'];
        if ($escala === null) {
            $cambios['escala'] = null;
        } else {
            if (!is_array($escala) || count($escala) < 2 || count($escala) > 15) fallar('La escala debe tener entre 2 y 15 niveles.', 422);
            $limpia = [];
            foreach ($escala as $n) {
                $letra = texto((array) $n, 'letra', 4, true, 'La letra');
                $min = decimal((array) $n, 'min', 0, 100, true, 'El mínimo');
                $puntos = decimal((array) $n, 'puntos', 0, 5, true, 'Los puntos');
                $limpia[] = ['letra' => $letra, 'min' => $min, 'puntos' => $puntos];
            }
            usort($limpia, fn($a, $b) => $b['min'] <=> $a['min']);
            $cambios['escala'] = json_encode($limpia, JSON_UNESCAPED_UNICODE);
        }
    }

    if (array_key_exists('pomodoro', $d)) {
        $p = (array) $d['pomodoro'];
        $cambios['pomodoro'] = json_encode([
            'trabajo' => entero($p, 'trabajo', 5, 120, true, 'El bloque de enfoque'),
            'descanso' => entero($p, 'descanso', 1, 60, true, 'El descanso'),
            'descansoLargo' => entero($p, 'descansoLargo', 5, 90, true, 'El descanso largo'),
            'ciclos' => entero($p, 'ciclos', 2, 8, true, 'Los ciclos'),
            'metaDiaria' => entero($p, 'metaDiaria', 15, 720, false) ?? 120,
        ]);
    }

    if ($cambios) actualizar('usuarios', $cambios, 'id = ?', [$u]);
    responder(['usuario' => s_usuario(fila('SELECT * FROM usuarios WHERE id = ?', [$u]))]);
}

function auth_password(): never
{
    $u = fila('SELECT * FROM usuarios WHERE id = ?', [uid()]);
    $d = entrada();
    if (!password_verify((string) ($d['actual'] ?? ''), $u['password_hash'])) {
        fallar('La contraseña actual no es correcta.', 422, ['campo' => 'actual']);
    }
    $nueva = (string) ($d['nueva'] ?? '');
    validar_password($nueva);
    q('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($nueva, PASSWORD_DEFAULT), $u['id']]);
    session_regenerate_id(true);
    responder(['ok' => true]);
}
