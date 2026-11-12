<?php
/**
 * EduGestor Pro — instalador web (para hosting compartido como Hostinger).
 *
 * 1. Crea la base de datos y su usuario en el panel del hosting.
 * 2. Sube el proyecto y abre https://tu-dominio/install.php
 * 3. Escribe los datos de la base de datos y pulsa "Instalar".
 *
 * Al terminar crea storage/instalado.lock y deja de funcionar. Para volver a
 * ejecutarlo hay que borrar ese archivo desde el administrador de archivos.
 */
declare(strict_types=1);

require __DIR__ . '/api/bootstrap.php';
require __DIR__ . '/api/lib/webpush.php';
require __DIR__ . '/db/esquema_lib.php';

const LOCK = RAIZ . '/storage/instalado.lock';
const LOCAL = RAIZ . '/config.local.php';
const DATOS = RAIZ . '/db/datos.sql';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');

session_name('edugestor_install');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => es_https()]);
session_start();
if (empty($_SESSION['csrf_install'])) $_SESSION['csrf_install'] = bin2hex(random_bytes(32));

$h = fn($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

/* =====================================================================
   REQUISITOS
   ===================================================================== */
function bytes_ini(string $v): int
{
    $v = trim($v);
    $n = (int) $v;
    return match (strtolower(substr($v, -1))) { 'g' => $n << 30, 'm' => $n << 20, 'k' => $n << 10, default => $n };
}

function requisitos(): array
{
    $subida = min(bytes_ini((string) ini_get('upload_max_filesize')), bytes_ini((string) ini_get('post_max_size')));
    $necesario = (int) config('uploads.max_bytes');
    return [
        ['PHP 8.1 o superior', version_compare(PHP_VERSION, '8.1.0', '>='), 'Versión actual: ' . PHP_VERSION . '. Cámbiala en hPanel → Avanzado → Configuración de PHP.', true],
        ['Extensión pdo_mysql', extension_loaded('pdo_mysql'), 'Actívala en la configuración de PHP del hosting.', true],
        ['Extensión openssl', extension_loaded('openssl'), 'Necesaria para las notificaciones push.', true],
        ['Extensión curl', extension_loaded('curl'), 'Necesaria para el asistente con IA y las notificaciones.', true],
        ['Extensión fileinfo', extension_loaded('fileinfo'), 'Necesaria para validar los archivos subidos.', true],
        ['Extensión mbstring', extension_loaded('mbstring'), 'Necesaria para el texto en español.', true],
        ['Se puede escribir config.local.php', is_file(LOCAL) ? is_writable(LOCAL) : is_writable(RAIZ), 'Da permisos de escritura a la carpeta del sitio (755).', true],
        ['Se puede escribir en storage/', is_dir(RAIZ . '/storage') && is_writable(RAIZ . '/storage'), 'Crea la carpeta storage/ con permisos 755.', true],
        ['Conexión HTTPS', es_https(), 'Activa el SSL del dominio en hPanel → Seguridad → SSL. Sin HTTPS no funcionan las notificaciones ni la app instalable.', false],
        ['Dependencias de Composer (vendor/)', is_file(RAIZ . '/vendor/autoload.php'), 'Sin vendor/ el asistente con IA no funciona. Sube el paquete completo.', false],
        ["Subidas de " . round($necesario / 1048576) . ' MB', $subida >= $necesario, 'El servidor permite ' . round($subida / 1048576) . ' MB. Sube upload_max_filesize y post_max_size en la configuración de PHP.', false],
    ];
}

/* =====================================================================
   INSTALACIÓN
   ===================================================================== */
function guardar_config_local(array $cambios): void
{
    $actual = is_file(LOCAL) ? require LOCAL : [];
    $nuevo = array_replace_recursive(is_array($actual) ? $actual : [], $cambios);
    $php = "<?php\n// Configuración local de EduGestor Pro (NO subir a git ni compartir).\n// Generada por install.php el " . date('Y-m-d H:i') . "\nreturn " . var_export($nuevo, true) . ";\n";
    if (file_put_contents(LOCAL, $php, LOCK_EX) === false) {
        throw new RuntimeException('No se pudo escribir config.local.php. Revisa los permisos de la carpeta del sitio.');
    }
    @chmod(LOCAL, 0640);
    if (function_exists('opcache_invalidate')) @opcache_invalidate(LOCAL, true);
}

/** Importa db/datos.sql (una sentencia por línea) si la base está vacía. */
function importar_datos(PDO $pdo): int
{
    $n = 0;
    $f = fopen(DATOS, 'rb');
    $pdo->beginTransaction();
    try {
        while (($linea = fgets($f)) !== false) {
            $linea = trim($linea);
            if ($linea === '' || str_starts_with($linea, '--')) continue;
            if (!preg_match('/^(INSERT INTO `[a-z_]+`|SET FOREIGN_KEY_CHECKS=[01];$)/', $linea)) {
                throw new RuntimeException('datos.sql contiene una sentencia no permitida.');
            }
            $pdo->exec($linea);
            if (str_starts_with($linea, 'INSERT')) $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        throw $e;
    } finally {
        fclose($f);
    }
    return $n;
}

function instalar(array $d): array
{
    $host = trim($d['host'] ?? '') ?: 'localhost';
    $port = (int) ($d['port'] ?? 3306) ?: 3306;
    $name = trim($d['name'] ?? '');
    $user = trim($d['user'] ?? '');
    $pass = (string) ($d['pass'] ?? '');
    $email = trim($d['email'] ?? '');
    $iaKey = trim($d['ia_key'] ?? '');

    if ($name === '' || $user === '') throw new RuntimeException('Escribe el nombre de la base de datos y el usuario.');
    if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $name)) throw new RuntimeException('El nombre de la base de datos no es válido.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('El correo de contacto no es válido.');
    if ($iaKey !== '' && !str_starts_with($iaKey, 'sk-ant-')) throw new RuntimeException('La clave de Anthropic debe empezar por «sk-ant-».');

    try {
        $pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 10,
        ]);
    } catch (PDOException $e) {
        $m = $e->getMessage();
        throw new RuntimeException(match (true) {
            str_contains($m, '1045') => 'Usuario o contraseña de la base de datos incorrectos.',
            str_contains($m, '1049') => "La base de datos «{$name}» no existe. Créala primero en el panel del hosting.",
            str_contains($m, '1044') => 'El usuario no tiene permisos sobre esa base de datos. Asígnalo en el panel del hosting.',
            str_contains($m, '2002') => "No se pudo conectar al servidor «{$host}». En Hostinger suele ser «localhost».",
            default => 'No se pudo conectar a la base de datos: ' . preg_replace('/\(using password.*\)/', '', $m),
        });
    }

    $pasos = [];
    $sentencias = aplicar_esquema($pdo, 'mysql');
    $pasos[] = "Tablas creadas o actualizadas ($sentencias sentencias).";

    $cambios = [
        'app' => ['debug' => false, 'registro_abierto' => !empty($d['registro'])],
        'db' => ['driver' => 'mysql', 'host' => $host, 'port' => $port, 'name' => $name, 'user' => $user, 'pass' => $pass],
    ];
    if (!config('push.public_key') || !config('push.private_key_pem')) {
        $cambios['push'] = vapid_generar();
        $pasos[] = 'Claves de notificaciones push generadas.';
    }
    if ($email !== '') $cambios['push']['subject'] = "mailto:$email";
    if ($iaKey !== '') { $cambios['ia'] = ['api_key' => $iaKey]; $pasos[] = 'Asistente con IA activado.'; }
    guardar_config_local($cambios);
    $pasos[] = 'Configuración guardada en config.local.php.';

    // Datos de la instalación local
    if (is_file(DATOS)) {
        $usuarios = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
        if ($usuarios === 0) {
            $n = importar_datos($pdo);
            $pasos[] = "Datos importados desde datos.sql ($n bloques).";
        } else {
            $pasos[] = 'datos.sql no se importó porque la base de datos ya tenía usuarios.';
        }
        @unlink(DATOS);
        $pasos[] = 'datos.sql eliminado del servidor.';
    }

    foreach (['/storage', '/storage/uploads'] as $dir) {
        if (!is_dir(RAIZ . $dir) && !@mkdir(RAIZ . $dir, 0755, true)) throw new RuntimeException("No se pudo crear la carpeta $dir.");
    }
    if (!is_file(RAIZ . '/storage/.htaccess')) file_put_contents(RAIZ . '/storage/.htaccess', "Require all denied\n");

    file_put_contents(LOCK, 'Instalado el ' . date('Y-m-d H:i:s') . "\n");
    $pasos[] = 'Instalador bloqueado (storage/instalado.lock).';
    return $pasos;
}

/* =====================================================================
   PETICIÓN
   ===================================================================== */
$bloqueado = is_file(LOCK);
$error = null;
$hecho = null;
$req = requisitos();
$obligatoriosOk = !array_filter($req, fn($r) => $r[3] && !$r[1]);

if (!$bloqueado && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf_install'], (string) ($_POST['csrf'] ?? ''))) {
        $error = 'La página caducó. Recárgala e inténtalo de nuevo.';
    } elseif (!$obligatoriosOk) {
        $error = 'Corrige primero los requisitos marcados en rojo.';
    } else {
        try {
            $hecho = instalar($_POST);
            $bloqueado = true;
        } catch (Throwable $e) {
            $error = $e->getMessage();
            error_log('[EduGestor install] ' . $e->getMessage());
        }
    }
}
if ($bloqueado && !$hecho) http_response_code(403);

$dominio = $_SERVER['HTTP_HOST'] ?? 'tu-dominio';
$php = PHP_BINARY && str_contains(PHP_BINARY, 'php') && !str_contains(PHP_BINARY, 'fpm') && !str_contains(PHP_BINARY, 'lsphp') ? PHP_BINARY : '/usr/bin/php';
$cron = $php . ' ' . (realpath(RAIZ . '/cron/recordatorios.php') ?: RAIZ . '/cron/recordatorios.php');
$datosLocales = is_file(DATOS);
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Instalar EduGestor Pro</title>
<style>
    :root { color-scheme: light dark; --bg: #f2f7f6; --card: #fff; --ink: #12201f; --dim: #3e5452; --faint: #5f7573; --line: #d4e3e0; --accent: #0f766e; --accent-ink: #fff; --soft: rgba(15,118,110,.09); --ok: #15803d; --warn: #9a6408; --bad: #b4423f; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b1215; --card: #131e22; --ink: #e6f0ee; --dim: #a6bab8; --faint: #7f9794; --line: #22343a; --accent: #5fd0b3; --accent-ink: #052019; --soft: rgba(95,208,179,.13); --ok: #7fd6a0; --warn: #e8c37a; --bad: #f29a96; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font: 15px/1.6 system-ui, "Segoe UI", Roboto, sans-serif; padding: 40px 16px; }
    main { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    header { display: flex; align-items: center; gap: 14px; }
    header img { width: 48px; height: 48px; border-radius: 14px; background: #f4f1ea; }
    h1 { font-size: 1.6rem; line-height: 1.2; }
    h1 small { display: block; font-size: .85rem; font-weight: 500; color: var(--faint); }
    h2 { font-size: 1rem; margin-bottom: 12px; }
    section { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
    p { color: var(--dim); }
    ul.req { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    ul.req li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; font-size: .9rem; }
    ul.req small { grid-column: 2; color: var(--faint); }
    .ok { color: var(--ok); font-weight: 700; } .bad { color: var(--bad); font-weight: 700; } .warn { color: var(--warn); font-weight: 700; }
    form { display: flex; flex-direction: column; gap: 14px; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: .82rem; font-weight: 600; color: var(--dim); }
    label small { font-weight: 400; color: var(--faint); }
    input[type=text], input[type=password], input[type=email], input[type=number] { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
    input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    .check { flex-direction: row; align-items: flex-start; gap: 8px; font-weight: 500; }
    .check input { margin-top: 4px; accent-color: var(--accent); }
    button { font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 12px 18px; background: var(--accent); color: var(--accent-ink); cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .alert { border-radius: 10px; padding: 12px 14px; font-size: .9rem; }
    .alert.bad { background: rgba(180,66,63,.1); color: var(--bad); font-weight: 600; }
    .alert.info { background: var(--soft); color: var(--ink); font-weight: 400; }
    ol { padding-left: 1.3em; display: flex; flex-direction: column; gap: 6px; color: var(--dim); }
    code { font-family: ui-monospace, Consolas, monospace; font-size: .85em; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 2px 6px; word-break: break-all; }
    a { color: var(--accent); }
    .cta { display: inline-block; margin-top: 8px; padding: 12px 18px; border-radius: 10px; background: var(--accent); color: var(--accent-ink); font-weight: 700; text-decoration: none; }
    @media (max-width: 560px) { .row { grid-template-columns: 1fr; } section { padding: 18px; } }
</style>
</head>
<body>
<main>
    <header>
        <img src="logo.jpeg" alt="">
        <h1>Instalar EduGestor Pro <small><?= $h($dominio) ?></small></h1>
    </header>

<?php if ($hecho): ?>
    <section>
        <h2>✓ Instalación completada</h2>
        <ul class="req"><?php foreach ($hecho as $p): ?><li><span class="ok">✓</span><span><?= $h($p) ?></span></li><?php endforeach; ?></ul>
    </section>
    <section>
        <h2>Últimos pasos</h2>
        <ol>
            <li><strong>Borra <code>install.php</code></strong> desde el administrador de archivos. Ya está bloqueado, pero es mejor no dejarlo en el servidor.</li>
            <li><strong>Recordatorios automáticos:</strong> en hPanel → Avanzado → <em>Cron Jobs</em>, crea uno que se ejecute <strong>cada minuto</strong> (o cada 5 minutos) con este comando:<br><code><?= $h($cron) ?></code></li>
            <li>Abre la app, inicia sesión y activa las notificaciones en <em>Ajustes</em>.</li>
        </ol>
        <a class="cta" href="./">Abrir EduGestor Pro →</a>
    </section>

<?php elseif ($bloqueado): ?>
    <section>
        <h2>El instalador está bloqueado</h2>
        <p>EduGestor Pro ya está instalado en este servidor. Por seguridad, borra <code>install.php</code>.</p>
        <p style="margin-top:10px">Si necesitas reinstalar, borra el archivo <code>storage/instalado.lock</code> y vuelve a abrir esta página.</p>
        <a class="cta" href="./">Abrir EduGestor Pro →</a>
    </section>

<?php else: ?>
    <section>
        <h2>1. Requisitos del servidor</h2>
        <ul class="req">
        <?php foreach ($req as [$nombre, $ok, $ayuda, $obligatorio]): ?>
            <li><span class="<?= $ok ? 'ok' : ($obligatorio ? 'bad' : 'warn') ?>"><?= $ok ? '✓' : ($obligatorio ? '✗' : '!') ?></span>
                <span><?= $h($nombre) ?><?= $obligatorio ? '' : ' <small style="display:inline">(recomendado)</small>' ?></span>
                <?php if (!$ok): ?><small><?= $h($ayuda) ?></small><?php endif; ?></li>
        <?php endforeach; ?>
        </ul>
    </section>

    <section>
        <h2>2. Base de datos</h2>
        <p style="margin-bottom:14px">Créala antes en hPanel → <em>Bases de datos</em> → <em>Administración</em>. Hostinger añade un prefijo al nombre y al usuario (por ejemplo <code>u123456789_edugestor</code>): cópialos tal cual.</p>
        <?php if ($error): ?><div class="alert bad" role="alert" style="margin-bottom:14px"><?= $h($error) ?></div><?php endif; ?>
        <?php if ($datosLocales): ?><div class="alert info" style="margin-bottom:14px">Se encontró <code>db/datos.sql</code>: tus datos se importarán si la base de datos está vacía, y después el archivo se borrará.</div><?php endif; ?>
        <form method="post" autocomplete="off">
            <input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf_install']) ?>">
            <div class="row">
                <label>Servidor <input type="text" name="host" value="<?= $h($_POST['host'] ?? 'localhost') ?>" required><small>En Hostinger: localhost</small></label>
                <label>Puerto <input type="number" name="port" value="<?= $h($_POST['port'] ?? '3306') ?>" required></label>
            </div>
            <label>Nombre de la base de datos <input type="text" name="name" value="<?= $h($_POST['name'] ?? (config('app.entorno') === 'produccion' ? (string) config('db.name') : '')) ?>" placeholder="u123456789_edugestor" required></label>
            <div class="row">
                <label>Usuario <input type="text" name="user" value="<?= $h($_POST['user'] ?? (config('app.entorno') === 'produccion' ? (string) config('db.user') : '')) ?>" placeholder="u123456789_edugestor" required></label>
                <label>Contraseña <input type="password" name="pass" required></label>
            </div>

            <h2 style="margin-top:10px">3. Opcional</h2>
            <label>Correo de contacto <small>Se envía a los servicios de notificaciones push (requisito del protocolo).</small>
                <input type="email" name="email" value="<?= $h($_POST['email'] ?? '') ?>" placeholder="tu@correo.com"></label>
            <label>Clave de la API de Anthropic <small>Activa el asistente con IA. Puedes añadirla después en config.local.php.</small>
                <input type="password" name="ia_key" placeholder="sk-ant-…"></label>
            <label class="check"><input type="checkbox" name="registro" value="1" <?= !isset($_POST['csrf']) || !empty($_POST['registro']) ? 'checked' : '' ?>>
                <span>Permitir que otras personas creen su cuenta <small style="display:block">Necesario si tus compañeros van a usar los grupos de estudio. Se puede cambiar en config.local.php (<code>registro_abierto</code>).</small></span></label>

            <button type="submit" <?= $obligatoriosOk ? '' : 'disabled' ?>>Instalar</button>
        </form>
    </section>
<?php endif; ?>
</main>
</body>
</html>
