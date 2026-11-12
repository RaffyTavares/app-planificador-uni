<?php
/** Estado completo del semestre activo: todo lo que la app necesita para pintar. */
declare(strict_types=1);

function ruta_estado(string $m, string $recurso, ?string $id, ?string $accion): void
{
    if ($m !== 'GET') fallar('Método no permitido.', 405);
    responder(estado_completo(uid()));
}

function estado_completo(int $u): array
{
    $sem = semestre_activo($u);
    $nombres = nombres_materias($u);

    $materias = filas('SELECT * FROM materias WHERE usuario_id = ? AND semestre_id = ? ORDER BY id', [$u, $sem]);
    $idsMaterias = array_map(fn($x) => (int) $x['id'], $materias);
    $enMaterias = $idsMaterias ? implode(',', $idsMaterias) : '0';

    $tareas = filas('SELECT * FROM tareas WHERE usuario_id = ? AND semestre_id = ? ORDER BY fecha, id', [$u, $sem]);
    $subs = subtareas_de(array_map(fn($t) => (int) $t['id'], $tareas));

    $desde = date('Y-m-d H:i:s', strtotime('-400 days'));

    return [
        'usuario' => s_usuario(fila('SELECT * FROM usuarios WHERE id = ?', [$u])),
        'semestre' => s_semestre(fila('SELECT * FROM semestres WHERE id = ?', [$sem])),
        'semestres' => array_map('s_semestre', filas('SELECT * FROM semestres WHERE usuario_id = ? ORDER BY activo DESC, COALESCE(inicio, DATE(creado_en)) DESC, id DESC', [$u])),
        'materias' => array_map('s_materia', $materias),
        'clases' => array_map(fn($c) => s_clase($c, $nombres), filas("SELECT * FROM clases WHERE usuario_id = ? AND materia_id IN ($enMaterias) ORDER BY dia, hora", [$u])),
        'tareas' => array_map(fn($t) => s_tarea($t, $subs[(int) $t['id']] ?? [], $nombres), $tareas),
        'anotaciones' => array_map(fn($n) => s_nota($n, $nombres), filas('SELECT * FROM anotaciones WHERE usuario_id = ? AND semestre_id = ? ORDER BY id DESC', [$u, $sem])),
        'evaluaciones' => array_map('s_evaluacion', filas("SELECT * FROM evaluaciones WHERE usuario_id = ? AND materia_id IN ($enMaterias) ORDER BY fecha, id", [$u])),
        'asistencias' => array_map('s_asistencia', filas("SELECT * FROM asistencias WHERE usuario_id = ? AND materia_id IN ($enMaterias) ORDER BY fecha", [$u])),
        'sesiones' => array_map('s_sesion', filas('SELECT * FROM sesiones_estudio WHERE usuario_id = ? AND inicio >= ? ORDER BY inicio', [$u, $desde])),
        'flashcards' => array_map('s_flashcard', filas('SELECT * FROM flashcards WHERE usuario_id = ? AND semestre_id = ? ORDER BY proxima, id', [$u, $sem])),
        'archivos' => array_map('s_archivo', filas("SELECT * FROM archivos WHERE usuario_id = ? AND materia_id IN ($enMaterias) ORDER BY id DESC", [$u])),
        'usoAlmacenamiento' => (int) valor('SELECT COALESCE(SUM(tamano), 0) FROM archivos WHERE usuario_id = ?', [$u]),
        'cuotaAlmacenamiento' => (int) config('uploads.cuota_bytes'),
        // Para el índice acumulado: materias y evaluaciones de todos los semestres
        'historico' => [
            'materias' => array_map('s_materia', filas('SELECT * FROM materias WHERE usuario_id = ? ORDER BY semestre_id, id', [$u])),
            'evaluaciones' => array_map('s_evaluacion', filas('SELECT * FROM evaluaciones WHERE usuario_id = ?', [$u])),
        ],
    ] + info_publica_estado();
}

function info_publica_estado(): array
{
    return ['ia' => (bool) config('ia.api_key'), 'pushKey' => config('push.public_key') ?: null];
}
