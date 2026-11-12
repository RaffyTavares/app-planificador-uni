<?php
/**
 * Archivos por materia: tareas entregadas, material de apoyo, documentos…
 * Se guardan en storage/uploads/{usuario}/{nombre aleatorio} (sin acceso web)
 * y solo se sirven a través de esta ruta, comprobando el dueño.
 */
declare(strict_types=1);

const CATEGORIAS_ARCHIVO = ['tarea', 'material', 'documento', 'otro'];

/** Tipos que el navegador puede mostrar sin riesgo dentro de la app. */
const MIME_EN_LINEA = [
    'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'video/mp4', 'video/webm', 'video/quicktime',
];

function ruta_archivos(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) subir_archivo($u);

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $a = propio('archivos', $id, 'El archivo no existe.');

    if ($m === 'GET') enviar_archivo($a, isset($_GET['ver']));

    if ($m === 'PATCH') {
        $d = entrada();
        $c = [];
        if (array_key_exists('categoria', $d)) $c['categoria'] = opcion($d, 'categoria', CATEGORIAS_ARCHIVO);
        if (array_key_exists('nombre', $d)) $c['nombre'] = nombre_seguro(texto($d, 'nombre', 255, true, 'El nombre'));
        if (array_key_exists('tareaId', $d)) {
            $c['tarea_id'] = ($d['tareaId'] === null || $d['tareaId'] === '') ? null : (int) propio('tareas', $d['tareaId'], 'La tarea no existe.')['id'];
        }
        actualizar('archivos', $c, 'id = ?', [$a['id']]);
        responder(s_archivo(fila('SELECT * FROM archivos WHERE id = ?', [$a['id']])));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM archivos WHERE id = ?', [$a['id']]);
        $f = ruta_archivo($u, $a['ruta']);
        if (is_file($f)) @unlink($f);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}

function nombre_seguro(string $nombre): string
{
    $nombre = basename(str_replace('\\', '/', $nombre));
    $nombre = preg_replace('/[\x00-\x1F\x7F<>:"|?*]/u', '', $nombre) ?? 'archivo';
    $nombre = trim($nombre, " .");
    return mb_substr($nombre !== '' ? $nombre : 'archivo', 0, 255);
}

function subir_archivo(int $u): never
{
    $materia = materia_valida($_POST['materiaId'] ?? null, true);
    $categoria = opcion($_POST, 'categoria', CATEGORIAS_ARCHIVO, 'documento');
    $tarea = !empty($_POST['tareaId']) ? (int) propio('tareas', $_POST['tareaId'], 'La tarea no existe.')['id'] : null;

    $f = $_FILES['archivo'] ?? null;
    if (!$f || is_array($f['error'])) fallar('No se recibió ningún archivo.', 422);

    $max = (int) config('uploads.max_bytes');
    $mb = round($max / 1048576);
    match ($f['error']) {
        UPLOAD_ERR_OK => null,
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => fallar("El archivo supera el máximo de $mb MB.", 413),
        UPLOAD_ERR_PARTIAL => fallar('La subida se interrumpió. Inténtalo de nuevo.', 422),
        UPLOAD_ERR_NO_FILE => fallar('No se recibió ningún archivo.', 422),
        default => fallar('El servidor no pudo guardar el archivo.', 500),
    };
    if ($f['size'] <= 0) fallar('El archivo está vacío.', 422);
    if ($f['size'] > $max) fallar("El archivo supera el máximo de $mb MB.", 413);

    $nombre = nombre_seguro((string) $f['name']);
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    if (!in_array($ext, config('uploads.extensiones'), true)) {
        fallar("No se permiten archivos .$ext. Usa documentos, imágenes, presentaciones, código o comprimidos.", 415);
    }

    $usado = (int) valor('SELECT COALESCE(SUM(tamano), 0) FROM archivos WHERE usuario_id = ?', [$u]);
    if ($usado + $f['size'] > (int) config('uploads.cuota_bytes')) {
        fallar('Alcanzaste tu espacio de almacenamiento. Elimina archivos que ya no necesites.', 413);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: 'application/octet-stream';
    $ruta = bin2hex(random_bytes(16));
    $dir = dirname(ruta_archivo($u, $ruta));
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) fallar('No se pudo preparar la carpeta de archivos.', 500);
    $destino = ruta_archivo($u, $ruta);
    $movido = is_uploaded_file($f['tmp_name']) ? move_uploaded_file($f['tmp_name'], $destino) : false;
    if (!$movido) fallar('El servidor no pudo guardar el archivo.', 500);

    try {
        $id = insertar('archivos', [
            'usuario_id' => $u, 'materia_id' => $materia, 'tarea_id' => $tarea, 'categoria' => $categoria,
            'nombre' => $nombre, 'ruta' => $ruta, 'mime' => mb_substr($mime, 0, 120), 'tamano' => (int) $f['size'],
            'creado_en' => ahora(),
        ]);
    } catch (Throwable $e) {
        @unlink($destino);
        throw $e;
    }
    responder(s_archivo(fila('SELECT * FROM archivos WHERE id = ?', [$id])), 201);
}

/** Envía el archivo. Solo los tipos seguros se muestran en el navegador; el resto se descarga. */
function enviar_archivo(array $a, bool $ver): never
{
    $f = ruta_archivo((int) $a['usuario_id'], $a['ruta']);
    if (!is_file($f)) fallar('El archivo ya no está disponible en el servidor.', 410);

    $enLinea = $ver && in_array($a['mime'], MIME_EN_LINEA, true);
    $tipo = $enLinea ? $a['mime'] : 'application/octet-stream';
    $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $a['nombre']);

    while (ob_get_level()) ob_end_clean();
    header('Content-Type: ' . $tipo);
    header('Content-Length: ' . filesize($f));
    header(sprintf('Content-Disposition: %s; filename="%s"; filename*=UTF-8\'\'%s', $enLinea ? 'inline' : 'attachment', $ascii, rawurlencode($a['nombre'])));
    header('X-Content-Type-Options: nosniff');
    // El visor de PDF del navegador no funciona dentro de un sandbox CSP
    if ($tipo !== 'application/pdf') {
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    header('Cache-Control: private, max-age=0, must-revalidate');
    readfile($f);
    exit;
}
