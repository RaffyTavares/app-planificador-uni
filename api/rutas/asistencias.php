<?php
/** Asistencia por clase y fecha (una marca por clase y día). */
declare(strict_types=1);

const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'tarde', 'justificada'];

function ruta_asistencias(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $clase = propio('clases', $d['claseId'] ?? 0, 'La clase no existe.');
        $f = fecha($d, 'fecha');
        if ($f > hoy()) fallar('No puedes marcar asistencia de una fecha futura.', 422);
        if ((int) date('w', strtotime($f)) !== (int) $clase['dia']) fallar('Esa clase no se imparte ese día.', 422);
        $estado = opcion($d, 'estado', ESTADOS_ASISTENCIA);

        $existente = valor('SELECT id FROM asistencias WHERE clase_id = ? AND fecha = ?', [$clase['id'], $f]);
        if ($existente) {
            q('UPDATE asistencias SET estado = ? WHERE id = ?', [$estado, $existente]);
            $aid = (int) $existente;
        } else {
            $aid = insertar('asistencias', ['usuario_id' => $u, 'clase_id' => $clase['id'], 'materia_id' => $clase['materia_id'], 'fecha' => $f, 'estado' => $estado]);
        }
        responder(s_asistencia(fila('SELECT * FROM asistencias WHERE id = ?', [$aid])));
    }

    if ($m === 'DELETE' && $id !== null) {
        $a = propio('asistencias', $id, 'La marca de asistencia no existe.');
        q('DELETE FROM asistencias WHERE id = ?', [$a['id']]);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}
