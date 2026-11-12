<?php
/**
 * Grupos de estudio: se crean con un código de invitación; los miembros
 * comparten notas, tareas, archivos y mensajes, y pueden copiarlos a su cuenta.
 */
declare(strict_types=1);

require_once __DIR__ . '/archivos.php';

function ruta_grupos(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($recurso === 'publicaciones') {
        ruta_publicaciones($m, $u, $id, $accion);
        return;
    }

    if ($m === 'GET' && $id === null) responder(['grupos' => grupos_de($u)]);

    if ($m === 'POST' && $id === 'unirse') {
        $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) (entrada()['codigo'] ?? '')));
        $g = $codigo ? fila('SELECT * FROM grupos WHERE codigo = ?', [$codigo]) : null;
        if (!$g) fallar('No existe ningún grupo con ese código.', 404, ['campo' => 'codigo']);
        if (valor('SELECT 1 FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ?', [$g['id'], $u])) {
            fallar('Ya eres miembro de este grupo.', 409, ['campo' => 'codigo']);
        }
        if ((int) valor('SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = ?', [$g['id']]) >= 50) fallar('El grupo está lleno (50 miembros).', 422);
        insertar('grupo_miembros', ['grupo_id' => $g['id'], 'usuario_id' => $u, 'rol' => 'miembro', 'unido_en' => ahora()]);
        responder(['grupos' => grupos_de($u), 'grupoId' => (int) $g['id']]);
    }

    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $nombre = texto($d, 'nombre', 120, true, 'El nombre');
        $desc = texto($d, 'descripcion', 255, false);
        $gid = transaccion(function () use ($u, $nombre, $desc) {
            $gid = insertar('grupos', ['nombre' => $nombre, 'descripcion' => $desc, 'codigo' => codigo_unico(), 'creador_id' => $u, 'creado_en' => ahora()]);
            insertar('grupo_miembros', ['grupo_id' => $gid, 'usuario_id' => $u, 'rol' => 'admin', 'unido_en' => ahora()]);
            return $gid;
        });
        responder(['grupos' => grupos_de($u), 'grupoId' => $gid], 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $g = grupo_miembro($u, (int) $id);

    if ($m === 'POST' && $accion === 'publicaciones') publicar($u, $g);

    if ($m === 'POST' && $accion === 'salir') {
        transaccion(function () use ($u, $g) {
            q('DELETE FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ?', [$g['id'], $u]);
            $resto = filas('SELECT usuario_id, rol FROM grupo_miembros WHERE grupo_id = ? ORDER BY unido_en', [$g['id']]);
            if (!$resto) {
                q('DELETE FROM grupos WHERE id = ?', [$g['id']]);
            } elseif (!array_filter($resto, fn($r) => $r['rol'] === 'admin')) {
                q("UPDATE grupo_miembros SET rol = 'admin' WHERE grupo_id = ? AND usuario_id = ?", [$g['id'], $resto[0]['usuario_id']]);
            }
        });
        responder(['grupos' => grupos_de($u)]);
    }

    if ($m === 'POST' && $accion === 'codigo') {
        exigir_admin($u, $g);
        q('UPDATE grupos SET codigo = ? WHERE id = ?', [codigo_unico(), $g['id']]);
        responder(['grupos' => grupos_de($u)]);
    }

    if ($m === 'PATCH') {
        exigir_admin($u, $g);
        $d = entrada();
        $c = [];
        if (array_key_exists('nombre', $d)) $c['nombre'] = texto($d, 'nombre', 120, true, 'El nombre');
        if (array_key_exists('descripcion', $d)) $c['descripcion'] = texto($d, 'descripcion', 255, false);
        actualizar('grupos', $c, 'id = ?', [$g['id']]);
        responder(['grupos' => grupos_de($u)]);
    }

    if ($m === 'DELETE') {
        exigir_admin($u, $g);
        q('DELETE FROM grupos WHERE id = ?', [$g['id']]);
        responder(['grupos' => grupos_de($u)]);
    }

    fallar('Ruta no encontrada.', 404);
}

function codigo_unico(): string
{
    $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
    } while (valor('SELECT 1 FROM grupos WHERE codigo = ?', [$c]));
    return $c;
}

function grupo_miembro(int $u, int $gid): array
{
    $g = fila('SELECT g.*, gm.rol FROM grupos g JOIN grupo_miembros gm ON gm.grupo_id = g.id WHERE g.id = ? AND gm.usuario_id = ?', [$gid, $u]);
    if (!$g) fallar('No perteneces a este grupo.', 404);
    return $g;
}

function exigir_admin(int $u, array $g): void
{
    if ($g['rol'] !== 'admin') fallar('Solo la administración del grupo puede hacer esto.', 403);
}

function grupos_de(int $u): array
{
    $grupos = filas('SELECT g.*, gm.rol FROM grupos g JOIN grupo_miembros gm ON gm.grupo_id = g.id WHERE gm.usuario_id = ? ORDER BY g.creado_en DESC', [$u]);
    $r = [];
    foreach ($grupos as $g) {
        $gid = (int) $g['id'];
        $miembros = filas('SELECT u.id, u.nombre, u.carrera, gm.rol FROM grupo_miembros gm JOIN usuarios u ON u.id = gm.usuario_id WHERE gm.grupo_id = ? ORDER BY gm.unido_en', [$gid]);
        $pubs = filas(
            'SELECT p.*, u.nombre AS autor, a.nombre AS archivo_nombre, a.tamano AS archivo_tamano, a.mime AS archivo_mime
             FROM grupo_publicaciones p JOIN usuarios u ON u.id = p.usuario_id LEFT JOIN archivos a ON a.id = p.archivo_id
             WHERE p.grupo_id = ? ORDER BY p.id DESC LIMIT 150',
            [$gid]
        );
        $r[] = [
            'id' => $gid,
            'nombre' => $g['nombre'],
            'descripcion' => $g['descripcion'] ?? '',
            'codigo' => $g['codigo'],
            'rol' => $g['rol'],
            'creadoEn' => $g['creado_en'],
            'miembros' => array_map(fn($x) => ['id' => (int) $x['id'], 'nombre' => $x['nombre'], 'carrera' => $x['carrera'] ?? '', 'rol' => $x['rol']], $miembros),
            'publicaciones' => array_map(fn($p) => [
                'id' => (int) $p['id'],
                'tipo' => $p['tipo'],
                'titulo' => $p['titulo'],
                'contenido' => $p['contenido'],
                'fecha' => $p['fecha'],
                'autor' => $p['autor'],
                'autorId' => (int) $p['usuario_id'],
                'propia' => (int) $p['usuario_id'] === $u,
                'archivo' => $p['archivo_id'] ? ['nombre' => $p['archivo_nombre'], 'tamano' => (int) $p['archivo_tamano'], 'mime' => $p['archivo_mime']] : null,
                'creadoEn' => $p['creado_en'],
            ], $pubs),
        ];
    }
    return $r;
}

function publicar(int $u, array $g): never
{
    $d = entrada();
    $tipo = opcion($d, 'tipo', ['mensaje', 'nota', 'tarea', 'archivo']);
    $fila = ['grupo_id' => $g['id'], 'usuario_id' => $u, 'tipo' => $tipo, 'creado_en' => ahora()];

    switch ($tipo) {
        case 'mensaje':
            $fila['contenido'] = texto($d, 'contenido', 4000, true, 'El mensaje');
            break;
        case 'nota':
            $n = propio('anotaciones', $d['refId'] ?? 0, 'La nota no existe.');
            $fila += ['titulo' => $n['titulo'], 'contenido' => $n['contenido']];
            break;
        case 'tarea':
            $t = propio('tareas', $d['refId'] ?? 0, 'La tarea no existe.');
            $subs = array_map(fn($s) => '• ' . $s['texto'], filas('SELECT texto FROM subtareas WHERE tarea_id = ? ORDER BY orden', [$t['id']]));
            $fila += ['titulo' => $t['descripcion'], 'contenido' => implode("\n", $subs) ?: null, 'fecha' => $t['fecha']];
            break;
        case 'archivo':
            $a = propio('archivos', $d['refId'] ?? 0, 'El archivo no existe.');
            $fila += ['titulo' => $a['nombre'], 'archivo_id' => $a['id']];
            break;
    }
    if ($tipo !== 'mensaje' && !empty($d['contenido'])) {
        // Comentario opcional al compartir
        $comentario = texto($d, 'contenido', 1000, false);
        if ($comentario) $fila['contenido'] = trim($comentario . "\n\n" . ($fila['contenido'] ?? ''));
    }
    insertar('grupo_publicaciones', $fila);
    responder(['grupos' => grupos_de($u)], 201);
}

function ruta_publicaciones(string $m, int $u, ?string $id, ?string $accion): void
{
    $p = fila('SELECT * FROM grupo_publicaciones WHERE id = ?', [(int) $id]);
    if (!$p) fallar('La publicación no existe.', 404);
    $g = grupo_miembro($u, (int) $p['grupo_id']);

    if ($m === 'GET' && $accion === 'archivo') {
        if (!$p['archivo_id']) fallar('El archivo ya no está disponible.', 410);
        enviar_archivo(fila('SELECT * FROM archivos WHERE id = ?', [$p['archivo_id']]), isset($_GET['ver']));
    }

    if ($m === 'DELETE') {
        if ((int) $p['usuario_id'] !== $u && $g['rol'] !== 'admin') fallar('Solo puedes eliminar tus propias publicaciones.', 403);
        q('DELETE FROM grupo_publicaciones WHERE id = ?', [$p['id']]);
        responder(['grupos' => grupos_de($u)]);
    }

    if ($m === 'POST' && $accion === 'copiar') copiar_publicacion($u, $p);

    fallar('Ruta no encontrada.', 404);
}

/** Copia una publicación compartida a la cuenta del usuario (semestre activo). */
function copiar_publicacion(int $u, array $p): never
{
    $d = entrada();
    $sem = semestre_activo($u);
    $materia = materia_valida($d['materiaId'] ?? null, $p['tipo'] === 'archivo');

    switch ($p['tipo']) {
        case 'nota':
            insertar('anotaciones', ['usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $materia, 'titulo' => mb_substr((string) $p['titulo'], 0, 160), 'contenido' => (string) $p['contenido'], 'creado_en' => ahora()]);
            responder(['ok' => true, 'tipo' => 'nota'], 201);
        case 'tarea':
            transaccion(function () use ($u, $sem, $materia, $p) {
                $tid = insertar('tareas', [
                    'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $materia,
                    'descripcion' => mb_substr((string) $p['titulo'], 0, 255), 'fecha' => $p['fecha'] ?: hoy(),
                    'prioridad' => 'media', 'tipo' => 'tarea', 'completada' => 0, 'creado_en' => ahora(),
                ]);
                $i = 0;
                foreach (preg_split('/\R/', (string) $p['contenido']) as $linea) {
                    if (str_starts_with($linea, '• ')) insertar('subtareas', ['tarea_id' => $tid, 'texto' => mb_substr(substr($linea, strlen('• ')), 0, 255), 'hecha' => 0, 'orden' => $i++]);
                }
            });
            responder(['ok' => true, 'tipo' => 'tarea'], 201);
        case 'archivo':
            $a = $p['archivo_id'] ? fila('SELECT * FROM archivos WHERE id = ?', [$p['archivo_id']]) : null;
            if (!$a) fallar('El archivo ya no está disponible.', 410);
            $origen = ruta_archivo((int) $a['usuario_id'], $a['ruta']);
            if (!is_file($origen)) fallar('El archivo ya no está disponible.', 410);
            $usado = (int) valor('SELECT COALESCE(SUM(tamano), 0) FROM archivos WHERE usuario_id = ?', [$u]);
            if ($usado + (int) $a['tamano'] > (int) config('uploads.cuota_bytes')) fallar('No tienes espacio suficiente para copiar este archivo.', 413);
            $ruta = bin2hex(random_bytes(16));
            $destino = ruta_archivo($u, $ruta);
            if (!is_dir(dirname($destino))) mkdir(dirname($destino), 0750, true);
            if (!copy($origen, $destino)) fallar('No se pudo copiar el archivo.', 500);
            insertar('archivos', [
                'usuario_id' => $u, 'materia_id' => $materia, 'categoria' => 'material', 'nombre' => $a['nombre'],
                'ruta' => $ruta, 'mime' => $a['mime'], 'tamano' => $a['tamano'], 'creado_en' => ahora(),
            ]);
            responder(['ok' => true, 'tipo' => 'archivo'], 201);
        default:
            fallar('Este tipo de publicación no se puede copiar.', 422);
    }
}
