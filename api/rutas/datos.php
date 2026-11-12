<?php
/**
 * Importar / exportar respaldos y borrar datos del semestre activo.
 * El formato de importación acepta tanto los respaldos nuevos como los
 * antiguos de localStorage (ids numéricos, día como nombre, etc.).
 */
declare(strict_types=1);

require_once __DIR__ . '/estado.php';

function ruta_datos(string $m, string $recurso, ?string $id, ?string $accion): void
{
    match ("$m $recurso") {
        'GET exportar' => responder(exportar(uid())),
        'POST importar' => importar(uid()),
        'POST borrar' => borrar_semestre(uid()),
        default => fallar('Ruta no encontrada.', 404),
    };
}

function exportar(int $u): array
{
    $e = estado_completo($u);
    return [
        'app' => 'EduGestor Pro',
        'version' => 2,
        'exportadoEl' => date('c'),
        'semestre' => $e['semestre'],
        'materias' => $e['materias'],
        'clases' => $e['clases'],
        'tareas' => $e['tareas'],
        'anotaciones' => $e['anotaciones'],
        'evaluaciones' => $e['evaluaciones'],
        'asistencias' => $e['asistencias'],
        'flashcards' => $e['flashcards'],
    ];
}

function borrar_contenido_semestre(int $u, int $sem): void
{
    // Las clases, evaluaciones, asistencias y archivos caen en cascada con la materia
    foreach (filas('SELECT ruta FROM archivos WHERE usuario_id = ? AND materia_id IN (SELECT id FROM materias WHERE semestre_id = ?)', [$u, $sem]) as $a) {
        $f = ruta_archivo($u, $a['ruta']);
        if (is_file($f)) @unlink($f);
    }
    q('DELETE FROM tareas WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]);
    q('DELETE FROM anotaciones WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]);
    q('DELETE FROM flashcards WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]);
    q('DELETE FROM sesiones_estudio WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]);
    q('DELETE FROM materias WHERE usuario_id = ? AND semestre_id = ?', [$u, $sem]);
}

function borrar_semestre(int $u): never
{
    $sem = semestre_activo($u);
    transaccion(fn() => borrar_contenido_semestre($u, $sem));
    responder(estado_completo($u));
}

function importar(int $u): never
{
    $d = entrada();
    foreach (['materias', 'clases', 'tareas', 'anotaciones'] as $k) {
        if (isset($d[$k]) && !is_array($d[$k])) fallar("El respaldo no es válido ($k).", 422);
    }
    $total = array_sum(array_map(fn($k) => count($d[$k] ?? []), ['materias', 'clases', 'tareas', 'anotaciones', 'evaluaciones', 'flashcards']));
    if ($total > 20000) fallar('El respaldo es demasiado grande.', 413);

    $sem = semestre_activo($u);
    $reemplazar = ($d['modo'] ?? 'reemplazar') === 'reemplazar';

    transaccion(function () use ($d, $u, $sem, $reemplazar) {
        if ($reemplazar) borrar_contenido_semestre($u, $sem);

        $mapaMat = [];   // id antiguo → id nuevo
        $mapaClase = [];
        $mapaTarea = [];
        foreach ($d['materias'] ?? [] as $m) {
            $m = (array) $m;
            $nombre = trim((string) ($m['nombre'] ?? ''));
            if ($nombre === '') continue;
            $color = in_array($m['color'] ?? null, COLORES, true) ? $m['color'] : null;
            $nuevo = insertar('materias', [
                'usuario_id' => $u, 'semestre_id' => $sem,
                'nombre' => mb_substr($nombre, 0, 120),
                'profesor' => mb_substr(trim((string) ($m['profesor'] ?? '')), 0, 120) ?: null,
                'creditos' => is_numeric($m['creditos'] ?? null) ? max(0, min(30, (int) $m['creditos'])) : null,
                'color' => $color,
                'max_ausencias' => is_numeric($m['maxAusencias'] ?? null) ? (int) $m['maxAusencias'] : null,
                'nota_final' => is_numeric($m['notaFinal'] ?? null) ? max(0, min(100, (float) $m['notaFinal'])) : null,
                'creado_en' => ahora(),
            ]);
            if (isset($m['id'])) $mapaMat[(string) $m['id']] = $nuevo;
        }
        $mat = fn($id) => ($id === null || $id === '') ? null : ($mapaMat[(string) $id] ?? null);

        foreach ($d['clases'] ?? [] as $c) {
            $c = (array) $c;
            $mid = $mat($c['materiaId'] ?? null);
            if (!$mid) continue;
            $dia = is_numeric($c['dia'] ?? null) ? (int) $c['dia'] : array_search($c['dia'] ?? '', DIAS, true);
            $hora = (string) ($c['hora'] ?? '');
            if ($dia === false || $dia < 0 || $dia > 6 || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora)) continue;
            $nuevo = insertar('clases', [
                'usuario_id' => $u, 'materia_id' => $mid, 'dia' => $dia, 'hora' => $hora,
                'duracion' => max(5, min(600, (int) ($c['duracion'] ?? 60) ?: 60)),
                'aula' => mb_substr(trim((string) ($c['aula'] ?? '')), 0, 120) ?: null,
            ]);
            if (isset($c['id'])) $mapaClase[(string) $c['id']] = [$nuevo, $mid];
        }

        foreach ($d['tareas'] ?? [] as $t) {
            $t = (array) $t;
            $desc = trim((string) ($t['descripcion'] ?? ''));
            $fecha = (string) ($t['fecha'] ?? '');
            if ($desc === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) continue;
            $nuevo = insertar('tareas', [
                'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $mat($t['materiaId'] ?? null),
                'descripcion' => mb_substr($desc, 0, 255),
                'fecha' => $fecha,
                'prioridad' => in_array($t['prioridad'] ?? '', ['alta', 'media', 'baja'], true) ? $t['prioridad'] : 'media',
                'tipo' => ($t['tipo'] ?? '') === 'examen' ? 'examen' : 'tarea',
                'recurrencia' => in_array($t['recurrencia'] ?? null, ['diaria', 'semanal', 'mensual'], true) ? $t['recurrencia'] : null,
                'completada' => !empty($t['completada']) ? 1 : 0,
                'completada_en' => !empty($t['completada']) ? ($t['completadaEn'] ?? ahora()) : null,
                'creado_en' => ahora(),
            ]);
            foreach (array_values((array) ($t['subtareas'] ?? [])) as $i => $s) {
                $s = (array) $s;
                $texto = trim((string) ($s['texto'] ?? ''));
                if ($texto === '') continue;
                insertar('subtareas', ['tarea_id' => $nuevo, 'texto' => mb_substr($texto, 0, 255), 'hecha' => !empty($s['hecha']) ? 1 : 0, 'orden' => $i]);
            }
            if (isset($t['id'])) $mapaTarea[(string) $t['id']] = $nuevo;
        }

        foreach ($d['anotaciones'] ?? [] as $n) {
            $n = (array) $n;
            $titulo = trim((string) ($n['titulo'] ?? ''));
            if ($titulo === '') continue;
            insertar('anotaciones', [
                'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $mat($n['materiaId'] ?? null),
                'titulo' => mb_substr($titulo, 0, 160),
                'contenido' => (string) ($n['contenido'] ?? ''),
                'creado_en' => fecha_creacion_nota($n),
            ]);
        }

        foreach ($d['evaluaciones'] ?? [] as $e) {
            $e = (array) $e;
            $mid = $mat($e['materiaId'] ?? null);
            if (!$mid || trim((string) ($e['nombre'] ?? '')) === '' || !is_numeric($e['peso'] ?? null)) continue;
            insertar('evaluaciones', [
                'usuario_id' => $u, 'materia_id' => $mid,
                'nombre' => mb_substr(trim((string) $e['nombre']), 0, 120),
                'peso' => max(0, min(100, (float) $e['peso'])),
                'nota' => is_numeric($e['nota'] ?? null) ? (float) $e['nota'] : null,
                'nota_max' => is_numeric($e['notaMax'] ?? null) && $e['notaMax'] > 0 ? (float) $e['notaMax'] : 100,
                'fecha' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($e['fecha'] ?? '')) ? $e['fecha'] : null,
            ]);
        }

        foreach ($d['asistencias'] ?? [] as $a) {
            $a = (array) $a;
            $par = $mapaClase[(string) ($a['claseId'] ?? '')] ?? null;
            if (!$par || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($a['fecha'] ?? ''))) continue;
            if (!in_array($a['estado'] ?? '', ['presente', 'ausente', 'tarde', 'justificada'], true)) continue;
            insertar('asistencias', ['usuario_id' => $u, 'clase_id' => $par[0], 'materia_id' => $par[1], 'fecha' => $a['fecha'], 'estado' => $a['estado']]);
        }

        foreach (array_slice((array) ($d['sesiones'] ?? []), 0, 2000) as $s) {
            $s = (array) $s;
            $ts = strtotime((string) ($s['inicio'] ?? ''));
            $min = (int) ($s['minutos'] ?? 0);
            if (!$ts || $min < 1 || $min > 600) continue;
            insertar('sesiones_estudio', [
                'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $mat($s['materiaId'] ?? null),
                'inicio' => date('Y-m-d H:i:s', $ts), 'minutos' => $min,
            ]);
        }

        foreach ($d['flashcards'] ?? [] as $f) {
            $f = (array) $f;
            if (trim((string) ($f['frente'] ?? '')) === '' || trim((string) ($f['reverso'] ?? '')) === '') continue;
            insertar('flashcards', [
                'usuario_id' => $u, 'semestre_id' => $sem, 'materia_id' => $mat($f['materiaId'] ?? null),
                'frente' => (string) $f['frente'], 'reverso' => (string) $f['reverso'],
                'repeticiones' => (int) ($f['repeticiones'] ?? 0), 'intervalo' => (int) ($f['intervalo'] ?? 0),
                'facilidad' => is_numeric($f['facilidad'] ?? null) ? (float) $f['facilidad'] : 2.5,
                'proxima' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($f['proxima'] ?? '')) ? $f['proxima'] : hoy(),
                'creado_en' => ahora(),
            ]);
        }
    });

    responder(estado_completo($u));
}

/** Respaldos nuevos traen creadoEn; los antiguos solo un id = Date.now(). */
function fecha_creacion_nota(array $n): string
{
    if (!empty($n['creadoEn']) && strtotime((string) $n['creadoEn'])) return date('Y-m-d H:i:s', strtotime((string) $n['creadoEn']));
    if (is_numeric($n['id'] ?? null) && $n['id'] > 1e12) return date('Y-m-d H:i:s', (int) ($n['id'] / 1000));
    return ahora();
}
