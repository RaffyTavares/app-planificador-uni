<?php
/**
 * Tareas y exámenes, con subtareas y recurrencia.
 * - Al completar una tarea recurrente se crea la siguiente repetición.
 * - POST tareas/{id}/plan-repaso crea sesiones de repaso antes de un examen.
 */
declare(strict_types=1);

const PRIORIDADES = ['alta', 'media', 'baja'];
const RECURRENCIAS = ['diaria', 'semanal', 'mensual'];

function ruta_tareas(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($recurso === 'subtareas') {
        $s = fila('SELECT s.* FROM subtareas s JOIN tareas t ON t.id = s.tarea_id WHERE s.id = ? AND t.usuario_id = ?', [(int) $id, $u]);
        if (!$s) fallar('La subtarea no existe.', 404);
        if ($m === 'PATCH') {
            $d = entrada();
            $c = [];
            if (array_key_exists('hecha', $d)) $c['hecha'] = booleano($d, 'hecha') ? 1 : 0;
            if (array_key_exists('texto', $d)) $c['texto'] = texto($d, 'texto', 255, true, 'El texto');
            actualizar('subtareas', $c, 'id = ?', [$s['id']]);
            responder(tarea_completa((int) $s['tarea_id']));
        }
        if ($m === 'DELETE') {
            q('DELETE FROM subtareas WHERE id = ?', [$s['id']]);
            responder(tarea_completa((int) $s['tarea_id']));
        }
        fallar('Ruta no encontrada.', 404);
    }

    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $datos = datos_tarea($d, true);
        $nuevo = transaccion(function () use ($u, $datos, $d) {
            $id = insertar('tareas', $datos + ['usuario_id' => $u, 'semestre_id' => semestre_activo($u), 'completada' => 0, 'creado_en' => ahora()]);
            guardar_subtareas($id, $d['subtareas'] ?? []);
            return $id;
        });
        responder(tarea_completa($nuevo), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $t = propio('tareas', $id, 'La tarea no existe.');

    if ($m === 'PATCH') {
        $d = entrada();
        transaccion(function () use ($t, $d) {
            actualizar('tareas', datos_tarea($d, false), 'id = ?', [$t['id']]);
            if (array_key_exists('subtareas', $d)) guardar_subtareas((int) $t['id'], $d['subtareas'] ?? [], true);
        });
        responder(tarea_completa((int) $t['id']));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM tareas WHERE id = ?', [$t['id']]);
        responder(['ok' => true]);
    }

    if ($m === 'POST' && $accion === 'toggle') {
        $siguiente = null;
        transaccion(function () use ($t, $u, &$siguiente) {
            $completar = !$t['completada'];
            q('UPDATE tareas SET completada = ?, completada_en = ? WHERE id = ?', [$completar ? 1 : 0, $completar ? ahora() : null, $t['id']]);
            if ($completar && $t['recurrencia']) {
                $siguiente = crear_repeticion($t, $u);
            }
        });
        responder(['tarea' => tarea_completa((int) $t['id']), 'siguiente' => $siguiente ? tarea_completa($siguiente) : null]);
    }

    if ($m === 'POST' && $accion === 'plan-repaso') {
        $examen = new DateTimeImmutable($t['fecha']);
        $hoy = new DateTimeImmutable(hoy());
        $creadas = [];
        transaccion(function () use ($t, $u, $examen, $hoy, &$creadas) {
            foreach ([[3, 'Repasar apuntes y resúmenes'], [2, 'Practicar ejercicios'], [1, 'Repaso final y dudas']] as [$dias, $titulo]) {
                $f = $examen->modify("-$dias day");
                if ($f < $hoy) continue;
                $creadas[] = insertar('tareas', [
                    'usuario_id' => $u, 'semestre_id' => $t['semestre_id'], 'materia_id' => $t['materia_id'],
                    'descripcion' => mb_substr("$titulo: {$t['descripcion']}", 0, 255),
                    'fecha' => $f->format('Y-m-d'), 'prioridad' => $dias === 1 ? 'alta' : 'media',
                    'tipo' => 'tarea', 'completada' => 0, 'creado_en' => ahora(),
                ]);
            }
        });
        if (!$creadas) fallar('El examen está demasiado cerca para crear un plan de repaso.', 422);
        responder(['tareas' => array_map('tarea_completa', $creadas)], 201);
    }

    fallar('Ruta no encontrada.', 404);
}

function datos_tarea(array $d, bool $nuevo): array
{
    $r = [];
    if ($nuevo || array_key_exists('descripcion', $d)) $r['descripcion'] = texto($d, 'descripcion', 255, true, 'La descripción');
    if ($nuevo || array_key_exists('materiaId', $d)) $r['materia_id'] = materia_valida($d['materiaId'] ?? null);
    if ($nuevo || array_key_exists('fecha', $d)) $r['fecha'] = fecha($d, 'fecha', true, 'La fecha de entrega');
    if ($nuevo || array_key_exists('prioridad', $d)) $r['prioridad'] = opcion($d, 'prioridad', PRIORIDADES, 'media');
    if ($nuevo || array_key_exists('tipo', $d)) $r['tipo'] = opcion($d, 'tipo', ['tarea', 'examen'], 'tarea');
    if ($nuevo || array_key_exists('recurrencia', $d)) {
        $rec = $d['recurrencia'] ?? null;
        $r['recurrencia'] = ($rec === null || $rec === '') ? null : opcion($d, 'recurrencia', RECURRENCIAS);
    }
    return $r;
}

/** Guarda subtareas. Con $sincronizar, las que no vengan en la lista se eliminan. */
function guardar_subtareas(int $tareaId, mixed $lista, bool $sincronizar = false): void
{
    if (!is_array($lista)) fallar('Las subtareas no son válidas.', 422);
    if (count($lista) > 50) fallar('Máximo 50 subtareas por tarea.', 422);
    $conservar = [];
    foreach (array_values($lista) as $i => $s) {
        $s = is_array($s) ? $s : ['texto' => (string) $s];
        $texto = trim((string) ($s['texto'] ?? ''));
        if ($texto === '') continue;
        $texto = mb_substr($texto, 0, 255);
        $hecha = !empty($s['hecha']) ? 1 : 0;
        $sid = isset($s['id']) ? (int) $s['id'] : 0;
        if ($sid && valor('SELECT id FROM subtareas WHERE id = ? AND tarea_id = ?', [$sid, $tareaId])) {
            q('UPDATE subtareas SET texto = ?, hecha = ?, orden = ? WHERE id = ?', [$texto, $hecha, $i, $sid]);
            $conservar[] = $sid;
        } else {
            $conservar[] = insertar('subtareas', ['tarea_id' => $tareaId, 'texto' => $texto, 'hecha' => $hecha, 'orden' => $i]);
        }
    }
    if ($sincronizar) {
        $marcas = $conservar ? implode(',', array_map('intval', $conservar)) : '0';
        q("DELETE FROM subtareas WHERE tarea_id = ? AND id NOT IN ($marcas)", [$tareaId]);
    }
}

function crear_repeticion(array $t, int $u): int
{
    $paso = ['diaria' => '+1 day', 'semanal' => '+1 week', 'mensual' => '+1 month'][$t['recurrencia']];
    $fecha = (new DateTimeImmutable($t['fecha']))->modify($paso);
    // Si la tarea se completó tarde, la siguiente no debe quedar ya vencida
    $hoy = new DateTimeImmutable(hoy());
    while ($fecha < $hoy) $fecha = $fecha->modify($paso);

    $id = insertar('tareas', [
        'usuario_id' => $u, 'semestre_id' => $t['semestre_id'], 'materia_id' => $t['materia_id'],
        'descripcion' => $t['descripcion'], 'fecha' => $fecha->format('Y-m-d'), 'prioridad' => $t['prioridad'],
        'tipo' => $t['tipo'], 'recurrencia' => $t['recurrencia'], 'completada' => 0, 'creado_en' => ahora(),
    ]);
    foreach (filas('SELECT texto, orden FROM subtareas WHERE tarea_id = ? ORDER BY orden', [$t['id']]) as $s) {
        insertar('subtareas', ['tarea_id' => $id, 'texto' => $s['texto'], 'hecha' => 0, 'orden' => $s['orden']]);
    }
    // La repetición anterior deja de repetirse: la cadena continúa en la nueva
    q('UPDATE tareas SET recurrencia = NULL WHERE id = ?', [$t['id']]);
    return $id;
}
