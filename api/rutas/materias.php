<?php
/** Materias del semestre activo. Eliminar una materia borra en cascada sus clases, tareas, notas, notas de evaluación y archivos. */
declare(strict_types=1);

function ruta_materias(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) {
        $datos = datos_materia(entrada(), true);
        $sem = semestre_activo($u);
        duplicado_materia($u, $sem, $datos['nombre'], 0);
        $nuevo = insertar('materias', $datos + ['usuario_id' => $u, 'semestre_id' => $sem, 'creado_en' => ahora()]);
        responder(s_materia(fila('SELECT * FROM materias WHERE id = ?', [$nuevo])), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $mat = propio('materias', $id, 'La materia no existe.');

    if ($m === 'PATCH') {
        $datos = datos_materia(entrada(), false);
        if (isset($datos['nombre'])) duplicado_materia($u, (int) $mat['semestre_id'], $datos['nombre'], (int) $mat['id']);
        actualizar('materias', $datos, 'id = ?', [$mat['id']]);
        responder(s_materia(fila('SELECT * FROM materias WHERE id = ?', [$mat['id']])));
    }

    if ($m === 'DELETE') {
        $rutas = filas('SELECT ruta FROM archivos WHERE materia_id = ?', [$mat['id']]);
        q('DELETE FROM materias WHERE id = ?', [$mat['id']]);
        foreach ($rutas as $a) {
            $f = ruta_archivo($u, $a['ruta']);
            if (is_file($f)) @unlink($f);
        }
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}

function datos_materia(array $d, bool $nuevo): array
{
    $r = [];
    if ($nuevo || array_key_exists('nombre', $d)) $r['nombre'] = texto($d, 'nombre', 120, true, 'El nombre');
    if ($nuevo || array_key_exists('profesor', $d)) $r['profesor'] = texto($d, 'profesor', 120, false);
    if ($nuevo || array_key_exists('creditos', $d)) $r['creditos'] = entero($d, 'creditos', 0, 30, false, 'Los créditos');
    if ($nuevo || array_key_exists('color', $d)) $r['color'] = opcion($d, 'color', COLORES);
    if (array_key_exists('notaFinal', $d)) $r['nota_final'] = decimal($d, 'notaFinal', 0, 100, false, 'La nota final');
    if ($nuevo || array_key_exists('maxAusencias', $d)) $r['max_ausencias'] = entero($d, 'maxAusencias', 0, 200, false, 'El máximo de ausencias');
    return $r;
}

function duplicado_materia(int $u, int $sem, string $nombre, int $excepto): void
{
    foreach (filas('SELECT id, nombre FROM materias WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]) as $x) {
        if ((int) $x['id'] !== $excepto && mb_strtolower($x['nombre']) === mb_strtolower($nombre)) {
            fallar('Ya tienes una materia con ese nombre en este semestre.', 409, ['campo' => 'nombre']);
        }
    }
}
