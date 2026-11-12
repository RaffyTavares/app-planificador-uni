<?php
/**
 * Sesiones de estudio (Pomodoro) y tarjetas de repaso con repetición
 * espaciada (algoritmo SM-2).
 */
declare(strict_types=1);

function ruta_estudio(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();
    $recurso === 'sesiones' ? ruta_sesiones($m, $u, $id) : ruta_flashcards($m, $u, $id, $accion);
}

function ruta_sesiones(string $m, int $u, ?string $id): void
{
    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $minutos = entero($d, 'minutos', 1, 600, true, 'Los minutos');
        $inicio = (string) ($d['inicio'] ?? '');
        $ts = $inicio !== '' ? strtotime($inicio) : false;
        if ($ts === false || $ts > time() + 300 || $ts < time() - 86400 * 7) $ts = time() - $minutos * 60;
        $nuevo = insertar('sesiones_estudio', [
            'usuario_id' => $u, 'semestre_id' => semestre_activo($u),
            'materia_id' => materia_valida($d['materiaId'] ?? null),
            'inicio' => date('Y-m-d H:i:s', $ts), 'minutos' => $minutos,
        ]);
        responder(s_sesion(fila('SELECT * FROM sesiones_estudio WHERE id = ?', [$nuevo])), 201);
    }
    if ($m === 'DELETE' && $id !== null) {
        $s = propio('sesiones_estudio', $id, 'La sesión no existe.');
        q('DELETE FROM sesiones_estudio WHERE id = ?', [$s['id']]);
        responder(['ok' => true]);
    }
    fallar('Ruta no encontrada.', 404);
}

function ruta_flashcards(string $m, int $u, ?string $id, ?string $accion): void
{
    if ($m === 'POST' && $id === null) {
        $d = entrada();
        // Acepta una tarjeta o un lote: { tarjetas: [{frente, reverso}], materiaId }
        $lote = isset($d['tarjetas']) && is_array($d['tarjetas']) ? $d['tarjetas'] : [$d];
        if (count($lote) > 100) fallar('Máximo 100 tarjetas por lote.', 422);
        $materia = materia_valida($d['materiaId'] ?? null);
        $sem = semestre_activo($u);
        $ids = transaccion(function () use ($lote, $materia, $sem, $u) {
            $ids = [];
            foreach ($lote as $t) {
                $t = (array) $t;
                $ids[] = insertar('flashcards', [
                    'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $materia,
                    'frente' => texto($t, 'frente', 2000, true, 'El frente'),
                    'reverso' => texto($t, 'reverso', 4000, true, 'El reverso'),
                    'proxima' => hoy(), 'creado_en' => ahora(),
                ]);
            }
            return $ids;
        });
        $marcas = implode(',', $ids);
        responder(['tarjetas' => array_map('s_flashcard', filas("SELECT * FROM flashcards WHERE id IN ($marcas) ORDER BY id"))], 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $f = propio('flashcards', $id, 'La tarjeta no existe.');

    if ($m === 'POST' && $accion === 'repasar') {
        $calidad = entero(entrada(), 'calidad', 0, 5, true, 'La calificación');
        actualizar('flashcards', sm2($f, $calidad), 'id = ?', [$f['id']]);
        responder(s_flashcard(fila('SELECT * FROM flashcards WHERE id = ?', [$f['id']])));
    }

    if ($m === 'PATCH') {
        $d = entrada();
        $c = [];
        if (array_key_exists('frente', $d)) $c['frente'] = texto($d, 'frente', 2000, true, 'El frente');
        if (array_key_exists('reverso', $d)) $c['reverso'] = texto($d, 'reverso', 4000, true, 'El reverso');
        if (array_key_exists('materiaId', $d)) $c['materia_id'] = materia_valida($d['materiaId']);
        actualizar('flashcards', $c, 'id = ?', [$f['id']]);
        responder(s_flashcard(fila('SELECT * FROM flashcards WHERE id = ?', [$f['id']])));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM flashcards WHERE id = ?', [$f['id']]);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}

/**
 * SM-2: calidad 0–5 (0–2 = no la recordé, 3 = difícil, 4 = bien, 5 = fácil).
 */
function sm2(array $f, int $q): array
{
    $rep = (int) $f['repeticiones'];
    $int = (int) $f['intervalo'];
    $ef = (float) $f['facilidad'];

    if ($q < 3) {
        $rep = 0;
        $int = 1;
    } else {
        $rep++;
        $int = match (true) {
            $rep === 1 => 1,
            $rep === 2 => 6,
            default => (int) round(max(1, $int) * $ef),
        };
    }
    $ef = max(1.3, $ef + (0.1 - (5 - $q) * (0.08 + (5 - $q) * 0.02)));
    $int = min($int, 365);

    return [
        'repeticiones' => $rep,
        'intervalo' => $int,
        'facilidad' => round($ef, 2),
        'proxima' => date('Y-m-d', strtotime("+$int day")),
    ];
}
