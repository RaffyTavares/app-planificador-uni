<?php
/** Clases del horario semanal. */
declare(strict_types=1);

function ruta_clases(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) {
        $datos = datos_clase(entrada(), true);
        $nuevo = insertar('clases', $datos + ['usuario_id' => $u]);
        responder(s_clase(fila('SELECT * FROM clases WHERE id = ?', [$nuevo]), nombres_materias($u)), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $c = propio('clases', $id, 'La clase no existe.');

    if ($m === 'PATCH') {
        actualizar('clases', datos_clase(entrada(), false), 'id = ?', [$c['id']]);
        responder(s_clase(fila('SELECT * FROM clases WHERE id = ?', [$c['id']]), nombres_materias($u)));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM clases WHERE id = ?', [$c['id']]);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}

function datos_clase(array $d, bool $nuevo): array
{
    $r = [];
    if ($nuevo || array_key_exists('materiaId', $d)) $r['materia_id'] = materia_valida($d['materiaId'] ?? null, true);
    if ($nuevo || array_key_exists('dia', $d)) {
        $dia = is_numeric($d['dia'] ?? null) ? (int) $d['dia'] : array_search($d['dia'] ?? '', DIAS, true);
        if ($dia === false || $dia < 0 || $dia > 6) fallar('Selecciona un día válido.', 422, ['campo' => 'dia']);
        $r['dia'] = $dia;
    }
    if ($nuevo || array_key_exists('hora', $d)) $r['hora'] = hora($d, 'hora');
    if ($nuevo || array_key_exists('duracion', $d)) $r['duracion'] = entero($d, 'duracion', 5, 600, true, 'La duración');
    if ($nuevo || array_key_exists('aula', $d)) $r['aula'] = texto($d, 'aula', 120, false);
    return $r;
}
