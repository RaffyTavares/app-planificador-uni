<?php
/** Evaluaciones (calificaciones) por materia, con su peso porcentual. */
declare(strict_types=1);

function ruta_evaluaciones(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) {
        $datos = datos_evaluacion(entrada(), true, null);
        $nuevo = insertar('evaluaciones', $datos + ['usuario_id' => $u]);
        responder(s_evaluacion(fila('SELECT * FROM evaluaciones WHERE id = ?', [$nuevo])), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $e = propio('evaluaciones', $id, 'La evaluación no existe.');

    if ($m === 'PATCH') {
        actualizar('evaluaciones', datos_evaluacion(entrada(), false, $e), 'id = ?', [$e['id']]);
        responder(s_evaluacion(fila('SELECT * FROM evaluaciones WHERE id = ?', [$e['id']])));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM evaluaciones WHERE id = ?', [$e['id']]);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}

function datos_evaluacion(array $d, bool $nuevo, ?array $actual): array
{
    $r = [];
    if ($nuevo || array_key_exists('materiaId', $d)) $r['materia_id'] = materia_valida($d['materiaId'] ?? null, true);
    if ($nuevo || array_key_exists('nombre', $d)) $r['nombre'] = texto($d, 'nombre', 120, true, 'El nombre');
    if ($nuevo || array_key_exists('peso', $d)) $r['peso'] = decimal($d, 'peso', 0.01, 100, true, 'El peso');
    if ($nuevo || array_key_exists('notaMax', $d)) $r['nota_max'] = decimal($d, 'notaMax', 1, 1000, false, 'La nota máxima') ?? 100;
    if ($nuevo || array_key_exists('fecha', $d)) $r['fecha'] = fecha($d, 'fecha', false);
    if ($nuevo || array_key_exists('nota', $d)) {
        $max = $r['nota_max'] ?? (float) ($actual['nota_max'] ?? 100);
        $r['nota'] = decimal($d, 'nota', 0, $max, false, 'La nota');
    }

    // Los pesos de una materia no pueden superar el 100 %
    $materia = $r['materia_id'] ?? (int) $actual['materia_id'];
    $peso = $r['peso'] ?? (float) $actual['peso'];
    $otros = (float) valor('SELECT COALESCE(SUM(peso), 0) FROM evaluaciones WHERE materia_id = ? AND id <> ?', [$materia, (int) ($actual['id'] ?? 0)]);
    if ($otros + $peso > 100.001) {
        $libre = max(0, 100 - $otros);
        fallar('Los pesos de esta materia superarían el 100 %. Queda ' . rtrim(rtrim(number_format($libre, 2, '.', ''), '0'), '.') . ' % disponible.', 422, ['campo' => 'peso']);
    }
    return $r;
}
