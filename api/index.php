<?php
/**
 * Punto de entrada de la API REST.
 * Rutas: api/index.php/<recurso>[/<id>[/<accion>]]
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

set_error_handler(static function (int $nivel, string $mensaje, string $archivo, int $linea): bool {
    if (!(error_reporting() & $nivel)) return false;
    throw new ErrorException($mensaje, 0, $nivel, $archivo, $linea);
});

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

const RUTAS = [
    'sesion' => 'auth', 'registro' => 'auth', 'login' => 'auth', 'logout' => 'auth', 'perfil' => 'auth',
    'estado' => 'estado',
    'importar' => 'datos', 'exportar' => 'datos', 'borrar' => 'datos',
    'semestres' => 'semestres',
    'materias' => 'materias',
    'clases' => 'clases',
    'tareas' => 'tareas', 'subtareas' => 'tareas',
    'anotaciones' => 'notas',
    'evaluaciones' => 'evaluaciones',
    'asistencias' => 'asistencias',
    'sesiones' => 'estudio', 'flashcards' => 'estudio',
    'archivos' => 'archivos',
    'grupos' => 'grupos', 'publicaciones' => 'grupos',
    'push' => 'push', 'notificaciones' => 'push',
    'chat' => 'chat',
];

try {
    iniciar_sesion();

    $ruta = trim((string) ($_SERVER['PATH_INFO'] ?? ($_GET['r'] ?? '')), '/');
    $partes = $ruta === '' ? [] : explode('/', $ruta);
    $recurso = $partes[0] ?? '';
    $id = $partes[1] ?? null;
    $accion = $partes[2] ?? null;
    $metodo = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if (!isset(RUTAS[$recurso])) fallar('Ruta no encontrada.', 404);

    verificar_csrf();

    $modulo = RUTAS[$recurso];
    require __DIR__ . "/rutas/$modulo.php";
    ('ruta_' . $modulo)($metodo, $recurso, $id, $accion);

    fallar('Ruta no encontrada.', 404);
} catch (ErrorApi $e) {
    responder(['error' => $e->getMessage()] + $e->extra, $e->estado);
} catch (PDOException $e) {
    error_log('[EduGestor] BD: ' . $e->getMessage());
    responder(['error' => config('app.debug') ? $e->getMessage() : 'No se pudo acceder a la base de datos.'], 500);
} catch (Throwable $e) {
    error_log('[EduGestor] ' . $e::class . ': ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    responder(['error' => config('app.debug') ? $e->getMessage() : 'Ocurrió un error inesperado.'], 500);
}
