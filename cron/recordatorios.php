<?php
/**
 * Envía los recordatorios push (clases, exámenes, entregas, repaso).
 * Prográmalo cada minuto. En Windows (Programador de tareas), una sola vez:
 *
 *   schtasks /create /sc minute /mo 1 /tn "EduGestor recordatorios" ^
 *     /tr "C:\xampp\php\php.exe C:\xampp\htdocs\app-planificador-uni\cron\recordatorios.php"
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo desde la línea de comandos.');
}

require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/lib/webpush.php';

try {
    $r = procesar_recordatorios();
    echo date('Y-m-d H:i:s') . " · usuarios: {$r['usuarios']} · notificaciones: {$r['notificaciones']} · avisos push: {$r['avisos']}\n";
} catch (Throwable $e) {
    fwrite(STDERR, date('Y-m-d H:i:s') . ' · error: ' . $e->getMessage() . "\n");
    exit(1);
}
