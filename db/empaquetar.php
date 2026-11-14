<?php
/**
 * Genera el paquete para subir a producción: dist/edugestor-produccion.zip
 *
 *   php db/empaquetar.php              App lista para instalar (sin datos)
 *   php db/empaquetar.php --con-datos  Incluye tus datos (db/datos.sql) y tus archivos subidos
 *
 * En Hostinger: Administrador de archivos → public_html → subir el .zip →
 * clic derecho → Extraer. Después abre https://tu-dominio/install.php
 *
 * Nunca incluye config.local.php (contraseñas y claves de esta instalación).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo desde la línea de comandos.');
}

$raiz = realpath(__DIR__ . '/..');
$conDatos = in_array('--con-datos', $argv, true);

if (!is_file("$raiz/vendor/autoload.php")) {
    fwrite(STDERR, "✗ Falta vendor/. Ejecuta antes: composer install --no-dev\n");
    exit(1);
}

if ($conDatos) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/exportar_datos.php'), $codigo);
    if ($codigo !== 0) exit($codigo);
    echo "\n";
}

// Versión del service worker: la defines tú en sw.js (const VERSION). Cámbiala en cada publicación.
preg_match("/const VERSION = '([^']*)';/", file_get_contents("$raiz/sw.js"), $mv);
echo '• Versión de la app (sw.js): ' . ($mv[1] ?? '¿?') . "  ← cámbiala si publicas cambios\n";

// Qué se incluye
$archivos = ['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', 'logo.jpeg', 'install.php', 'config.php',
    '.htaccess', 'README.md', 'composer.json', 'composer.lock', 'storage/.htaccess', 'storage/index.html'];
$carpetas = ['icons', 'js', 'api', 'cron', 'vendor'];
$db = ['db/.htaccess', 'db/esquema.sql', 'db/esquema_lib.php', 'db/instalar.php', 'db/exportar_datos.php', 'db/empaquetar.php'];
if ($conDatos) $db[] = 'db/datos.sql';

$lista = array_merge($archivos, $db);
foreach ($carpetas as $c) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$raiz/$c", FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($raiz) + 1));
        // Sin metadatos de git ni pruebas de las dependencias
        if (preg_match('#/(\.git|\.github|tests?|docs?)/#i', "/$rel")) continue;
        $lista[] = $rel;
    }
}
if ($conDatos && is_dir("$raiz/storage/uploads")) {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$raiz/storage/uploads", FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->isFile()) $lista[] = str_replace('\\', '/', substr($f->getPathname(), strlen($raiz) + 1));
    }
}

// Comprobaciones de seguridad
$lista = array_values(array_unique($lista));
foreach ($lista as $rel) {
    if (!is_file("$raiz/$rel")) { fwrite(STDERR, "✗ Falta $rel\n"); exit(1); }
    if (preg_match('#(^|/)config\.local\.php$|\.sqlite$|instalado\.lock$#', $rel)) { fwrite(STDERR, "✗ Se intentó incluir $rel\n"); exit(1); }
}

@mkdir("$raiz/dist", 0755, true);
$zip = "$raiz/dist/edugestor-produccion" . ($conDatos ? '-con-datos' : '') . '.zip';
@unlink($zip);

$mapa = [];
$bytes = 0;
foreach ($lista as $rel) {
    $mapa[$rel] = "$raiz/$rel";
    $bytes += filesize("$raiz/$rel");
}
$paquete = new PharData($zip, 0, null, Phar::ZIP);
$paquete->buildFromIterator(new ArrayIterator($mapa)); // escribe el zip de una sola vez
$paquete->addEmptyDir('storage/uploads');
$paquete->compressFiles(Phar::GZ); // deflate
unset($paquete);

if ($conDatos) @unlink("$raiz/db/datos.sql"); // queda solo dentro del zip

echo '✓ ' . count($lista) . ' archivos (' . round($bytes / 1048576, 1) . ' MB sin comprimir)' . PHP_EOL;
echo '✓ ' . str_replace('\\', '/', $zip) . ' (' . round(filesize($zip) / 1048576, 1) . ' MB)' . PHP_EOL;
if ($conDatos) echo "⚠ El zip contiene tus datos y los hashes de las contraseñas: no lo compartas.\n";
