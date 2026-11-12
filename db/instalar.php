<?php
/**
 * Instalador de EduGestor Pro (línea de comandos).
 *
 *   php db/instalar.php --admin-user=root --admin-pass=SECRETO
 *       Crea la base de datos y un usuario MySQL dedicado (con contraseña
 *       aleatoria), aplica el esquema, genera las claves VAPID y guarda todo
 *       en config.local.php.
 *
 *   php db/instalar.php --sqlite            Usa SQLite (pruebas/desarrollo).
 *   php db/instalar.php --vapid             Solo genera claves VAPID nuevas.
 *   php db/instalar.php --esquema           Solo aplica el esquema con la configuración actual.
 *
 * La contraseña del administrador también puede pasarse con la variable de
 * entorno MYSQL_ADMIN_PASS para que no quede en el historial de la consola.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo desde la línea de comandos.');
}

require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/lib/webpush.php';
require __DIR__ . '/esquema_lib.php';

$opts = getopt('', ['admin-user::', 'admin-pass::', 'sqlite', 'vapid', 'esquema', 'db-name::', 'db-user::']);
$local = RAIZ . '/config.local.php';

function guardar_local(array $cambios): void
{
    global $local;
    $actual = is_file($local) ? require $local : [];
    $nuevo = array_replace_recursive(is_array($actual) ? $actual : [], $cambios);
    $php = "<?php\n// Configuración local de EduGestor Pro (NO subir a git).\n// Generada por db/instalar.php el " . date('Y-m-d H:i') . "\nreturn " . var_export($nuevo, true) . ";\n";
    file_put_contents($local, $php, LOCK_EX);
    echo "✓ Guardado config.local.php\n";
}

function asegurar_vapid(bool $forzar = false): void
{
    if (!$forzar && config('push.public_key') && config('push.private_key_pem')) {
        echo "• Claves VAPID ya configuradas\n";
        return;
    }
    $k = vapid_generar();
    guardar_local(['push' => $k]);
    echo "✓ Claves VAPID generadas\n";
}

try {
    if (isset($opts['vapid'])) {
        asegurar_vapid(true);
        exit(0);
    }

    if (isset($opts['sqlite'])) {
        $ruta = config('db.sqlite_path');
        if (!is_dir(dirname($ruta))) mkdir(dirname($ruta), 0750, true);
        guardar_local(['db' => ['driver' => 'sqlite']]);
        $pdo = new PDO('sqlite:' . $ruta, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        echo '✓ Esquema aplicado (' . aplicar_esquema($pdo, 'sqlite') . " sentencias)
";
        asegurar_vapid();
        echo "Listo: SQLite en $ruta\n";
        exit(0);
    }

    if (isset($opts['esquema'])) {
        echo '✓ Esquema aplicado (' . aplicar_esquema(db(), config('db.driver')) . " sentencias)
";
        exit(0);
    }

    // ---------- Instalación MySQL ----------
    $adminUser = $opts['admin-user'] ?? 'root';
    $adminPass = $opts['admin-pass'] ?? (getenv('MYSQL_ADMIN_PASS') ?: '');
    $dbName = $opts['db-name'] ?? config('db.name');
    $dbUser = $opts['db-user'] ?? config('db.user');
    $host = config('db.host');
    $port = (int) config('db.port');

    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $dbName) || !preg_match('/^[A-Za-z0-9_]{1,32}$/', $dbUser)) {
        throw new RuntimeException('Nombre de base de datos o usuario no válido.');
    }

    $admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $adminUser, $adminPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "✓ Conectado a MySQL como $adminUser\n";

    $admin->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "✓ Base de datos `$dbName` lista\n";

    // Usuario dedicado con permisos solo sobre esta base. Su contraseña solo se
    // reutiliza si ya la generó este instalador (config.local.php); nunca la de config.php.
    $previa = is_file($local) ? ((require $local)['db']['pass'] ?? '') : '';
    $dbPass = (is_string($previa) && strlen($previa) >= 24) ? $previa : bin2hex(random_bytes(18));
    foreach (['localhost', '127.0.0.1'] as $h) {
        $existe = (int) $admin->query("SELECT COUNT(*) FROM mysql.user WHERE User = " . $admin->quote($dbUser) . " AND Host = " . $admin->quote($h))->fetchColumn();
        if ($existe) {
            $admin->exec("ALTER USER '$dbUser'@'$h' IDENTIFIED BY " . $admin->quote($dbPass));
        } else {
            $admin->exec("CREATE USER '$dbUser'@'$h' IDENTIFIED BY " . $admin->quote($dbPass));
        }
        $admin->exec("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON `$dbName`.* TO '$dbUser'@'$h'");
    }
    $admin->exec('FLUSH PRIVILEGES');
    echo "✓ Usuario MySQL `$dbUser` con permisos solo sobre `$dbName`\n";

    guardar_local(['db' => ['driver' => 'mysql', 'name' => $dbName, 'user' => $dbUser, 'pass' => $dbPass]]);

    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo '✓ Esquema aplicado (' . aplicar_esquema($pdo, 'mysql') . " sentencias)
";
    asegurar_vapid();

    if (!is_dir(config('uploads.dir'))) mkdir(config('uploads.dir'), 0750, true);
    echo "\nListo. Abre http://localhost/app-planificador-uni/ y crea tu cuenta.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "✗ " . $e->getMessage() . "\n");
    exit(1);
}
