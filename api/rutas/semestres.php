<?php
/** Semestres: crear, renombrar, activar (cambiar de semestre) y eliminar. */
declare(strict_types=1);

require_once __DIR__ . '/estado.php';

function ruta_semestres(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();
    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $nombre = texto($d, 'nombre', 80, true, 'El nombre');
        $inicio = fecha($d, 'inicio', false, 'La fecha de inicio');
        $fin = fecha($d, 'fin', false, 'La fecha de fin');
        if ($inicio && $fin && $fin < $inicio) fallar('La fecha de fin debe ser posterior al inicio.', 422, ['campo' => 'fin']);
        $copiar = booleano($d, 'copiarMaterias');
        $anterior = semestre_activo($u);

        // Semestre ya cursado: se archiva con sus notas finales, sin cambiar el semestre activo
        if (booleano($d, 'pasado')) {
            transaccion(function () use ($u, $nombre, $inicio, $fin, $d) {
                $sid = insertar('semestres', ['usuario_id' => $u, 'nombre' => $nombre, 'inicio' => $inicio, 'fin' => $fin, 'activo' => 0, 'creado_en' => ahora()]);
                guardar_record($u, $sid, $d['materias'] ?? []);
            });
            responder(estado_completo($u), 201);
        }

        transaccion(function () use ($u, $nombre, $inicio, $fin, $copiar, $anterior) {
            q('UPDATE semestres SET activo = 0 WHERE usuario_id = ?', [$u]);
            $nuevo = insertar('semestres', ['usuario_id' => $u, 'nombre' => $nombre, 'inicio' => $inicio, 'fin' => $fin, 'activo' => 1, 'creado_en' => ahora()]);
            if ($copiar) {
                // Copia solo nombres, profesores y colores (sin clases ni notas)
                foreach (filas('SELECT * FROM materias WHERE usuario_id = ? AND semestre_id = ?', [$u, $anterior]) as $mat) {
                    insertar('materias', [
                        'usuario_id' => $u, 'semestre_id' => $nuevo, 'nombre' => $mat['nombre'], 'profesor' => $mat['profesor'],
                        'creditos' => $mat['creditos'], 'color' => $mat['color'], 'max_ausencias' => $mat['max_ausencias'], 'creado_en' => ahora(),
                    ]);
                }
            }
        });
        responder(estado_completo($u), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $s = propio('semestres', $id, 'El semestre no existe.');

    if ($m === 'POST' && $accion === 'record') {
        $d = entrada();
        transaccion(function () use ($u, $s, $d) {
            $c = [];
            if (array_key_exists('nombre', $d)) $c['nombre'] = texto($d, 'nombre', 80, true, 'El nombre');
            if (array_key_exists('inicio', $d)) $c['inicio'] = fecha($d, 'inicio', false, 'La fecha de inicio');
            if (array_key_exists('fin', $d)) $c['fin'] = fecha($d, 'fin', false, 'La fecha de fin');
            actualizar('semestres', $c, 'id = ?', [$s['id']]);
            guardar_record($u, (int) $s['id'], $d['materias'] ?? [], true);
        });
        responder(estado_completo($u));
    }

    if ($m === 'POST' && $accion === 'activar') {
        transaccion(function () use ($u, $s) {
            q('UPDATE semestres SET activo = 0 WHERE usuario_id = ?', [$u]);
            q('UPDATE semestres SET activo = 1 WHERE id = ?', [$s['id']]);
        });
        responder(estado_completo($u));
    }

    if ($m === 'PATCH') {
        $d = entrada();
        $c = [];
        if (array_key_exists('nombre', $d)) $c['nombre'] = texto($d, 'nombre', 80, true, 'El nombre');
        if (array_key_exists('inicio', $d)) $c['inicio'] = fecha($d, 'inicio', false, 'La fecha de inicio');
        if (array_key_exists('fin', $d)) $c['fin'] = fecha($d, 'fin', false, 'La fecha de fin');
        actualizar('semestres', $c, 'id = ?', [$s['id']]);
        responder(s_semestre(fila('SELECT * FROM semestres WHERE id = ?', [$s['id']])));
    }

    if ($m === 'DELETE') {
        if ((int) valor('SELECT COUNT(*) FROM semestres WHERE usuario_id = ?', [$u]) <= 1) {
            fallar('No puedes eliminar tu único semestre.', 422);
        }
        transaccion(function () use ($u, $s) {
            require_once __DIR__ . '/datos.php';
            borrar_contenido_semestre($u, (int) $s['id']);
            q('DELETE FROM semestres WHERE id = ?', [$s['id']]);
        });
        semestre_activo($u);
        responder(estado_completo($u));
    }

    fallar('Ruta no encontrada.', 404);
}

/**
 * Guarda las materias de un semestre cursado con su nota final (récord académico).
 * Con $sincronizar, elimina las que ya no vengan en la lista, salvo que tengan
 * clases, tareas, notas, calificaciones o archivos (esas se eliminan desde la materia).
 */
function guardar_record(int $u, int $sem, mixed $lista, bool $sincronizar = false): void
{
    if (!is_array($lista)) fallar('La lista de materias no es válida.', 422);
    if (count($lista) > 40) fallar('Máximo 40 materias por semestre.', 422);
    $conservar = [];
    foreach (array_values($lista) as $i => $fila) {
        $fila = (array) $fila;
        $n = $i + 1;
        $nombre = trim((string) ($fila['nombre'] ?? ''));
        if ($nombre === '') fallar("Falta el nombre de la materia $n.", 422);
        if (mb_strlen($nombre) > 120) fallar("El nombre de la materia $n es demasiado largo.", 422);
        $creditos = entero($fila, 'creditos', 0, 30, false, "Los créditos de «{$nombre}»");
        $nota = decimal($fila, 'notaFinal', 0, 100, false, "La nota de «{$nombre}»");
        $datos = ['nombre' => $nombre, 'creditos' => $creditos, 'nota_final' => $nota];
        $mid = (int) ($fila['id'] ?? 0);
        if ($mid && valor('SELECT id FROM materias WHERE id = ? AND usuario_id = ? AND semestre_id = ?', [$mid, $u, $sem])) {
            actualizar('materias', $datos, 'id = ?', [$mid]);
            $conservar[] = $mid;
        } else {
            $conservar[] = insertar('materias', $datos + ['usuario_id' => $u, 'semestre_id' => $sem, 'profesor' => texto($fila, 'profesor', 120, false), 'creado_en' => ahora()]);
        }
    }
    if (!$sincronizar) return;
    $marcas = $conservar ? implode(',', array_map('intval', $conservar)) : '0';
    foreach (filas("SELECT id, nombre FROM materias WHERE usuario_id = ? AND semestre_id = ? AND id NOT IN ($marcas)", [$u, $sem]) as $m) {
        $uso = (int) valor('SELECT (SELECT COUNT(*) FROM clases WHERE materia_id = ?) + (SELECT COUNT(*) FROM tareas WHERE materia_id = ?)
            + (SELECT COUNT(*) FROM anotaciones WHERE materia_id = ?) + (SELECT COUNT(*) FROM evaluaciones WHERE materia_id = ?)
            + (SELECT COUNT(*) FROM archivos WHERE materia_id = ?)', array_fill(0, 5, $m['id']));
        if ($uso) fallar("«{$m['nombre']}» tiene clases, tareas, notas o archivos. Elimínala desde la propia materia.", 422);
        q('DELETE FROM materias WHERE id = ?', [$m['id']]);
    }
}
