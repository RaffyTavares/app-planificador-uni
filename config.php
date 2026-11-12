<?php
/**
 * Configuración de EduGestor Pro.
 *
 * Detecta sola el entorno (local o producción) y usa los datos de cada uno.
 * Las contraseñas y claves van en `config.local.php` (excluido de git y del
 * paquete de producción); lo que ponga ese archivo tiene prioridad sobre este.
 *
 *   Local (XAMPP):        config.local.php lo crea  php db/instalar.php
 *   Producción (Hostinger): config.local.php lo crea  install.php
 *
 * Para forzar un entorno: variable de entorno EDUGESTOR_ENTORNO=local|produccion
 */

$entorno = (static function (): string {
    $forzado = getenv('EDUGESTOR_ENTORNO');
    if ($forzado === 'local' || $forzado === 'produccion') return $forzado;

    $host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    if ($host !== '') {
        $esLocal = in_array($host, ['localhost', '127.0.0.1', '[::1]', '::1'], true)
            || preg_match('/\.(test|local|localhost)$/', $host)
            || preg_match('/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./', $host);
        return $esLocal ? 'local' : 'produccion';
    }
    // Línea de comandos (cron, instaladores): el XAMPP de desarrollo corre en Windows
    return PHP_OS_FAMILY === 'Windows' ? 'local' : 'produccion';
})();

$bd = [
    'local' => [
        'host' => '127.0.0.1',
        'name' => 'planificador_universitario',
        'user' => 'edugestor',
    ],
    'produccion' => [
        // Hostinger (hPanel → Bases de datos)
        'host' => 'localhost',
        'name' => 'u382859220_planif_uni',
        'user' => 'u382859220_edugestor',
    ],
][$entorno];

return [
    'app' => [
        'nombre' => 'EduGestor Pro',
        // 'local' o 'produccion' (detectado automáticamente)
        'entorno' => $entorno,
        // Muestra el detalle de los errores en las respuestas de la API (solo en local)
        'debug' => $entorno === 'local',
        // Zona horaria usada para fechas, recordatorios y el cron
        'zona_horaria' => 'America/Santo_Domingo',
        // false = nadie más puede crear cuentas (las existentes siguen funcionando)
        'registro_abierto' => true,
    ],

    'db' => [
        // 'mysql' o 'sqlite' (pruebas)
        'driver' => 'mysql',
        'host' => $bd['host'],
        'port' => 3306,
        'name' => $bd['name'],
        'user' => $bd['user'],
        'pass' => '', // la real está en config.local.php de cada entorno (no se sube a git)
        'sqlite_path' => __DIR__ . '/storage/edugestor.sqlite',
    ],

    // Valores iniciales del perfil académico de cada cuenta nueva (cada estudiante los cambia en Ajustes)
    'academico' => [
        'universidad' => '',
        // semestre | cuatrimestre | trimestre | bimestre | anual
        'periodo' => 'semestre',
        // '12' (2:30 PM) o '24' (14:30)
        'formato_hora' => '12',
    ],

    'uploads' => [
        'dir' => __DIR__ . '/storage/uploads',
        // Tamaño máximo por archivo (debe ser menor que upload_max_filesize de PHP)
        'max_bytes' => 25 * 1024 * 1024,
        // Espacio total por usuario
        'cuota_bytes' => 1024 * 1024 * 1024,
        'extensiones' => [
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv',
            'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
            'zip', 'rar', '7z',
            'mp3', 'm4a', 'wav', 'mp4', 'mov', 'webm',
            'java', 'py', 'js', 'ts', 'html', 'css', 'php', 'c', 'cpp', 'h', 'cs', 'sql', 'json', 'xml', 'ipynb',
        ],
    ],

    'ia' => [
        // Clave de la API de Anthropic. Vacía = asistente desactivado.
        'api_key' => '',
        'modelo' => 'claude-opus-5-5',
        // low | medium | high — profundidad de razonamiento (y coste)
        'esfuerzo' => 'medium',
        'max_tokens' => 16000,
    ],

    'push' => [
        // Claves VAPID para notificaciones push. Se generan con: php db/instalar.php --vapid
        'public_key' => '',
        'private_key_pem' => '',
        'subject' => 'mailto:admin@localhost',
    ],
];
