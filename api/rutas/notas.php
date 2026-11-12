<?php
/** Anotaciones (notas) del semestre activo. */
declare(strict_types=1);

function ruta_notas(string $m, string $recurso, ?string $id, ?string $accion): void
{
    $u = uid();

    if ($m === 'POST' && $id === null) {
        $d = entrada();
        $nuevo = insertar('anotaciones', [
            'usuario_id' => $u, 'semestre_id' => semestre_activo($u),
            'materia_id' => materia_valida($d['materiaId'] ?? null),
            'titulo' => texto($d, 'titulo', 160, true, 'El título'),
            'contenido' => texto($d, 'contenido', 60000, true, 'El contenido'),
            'creado_en' => ahora(),
        ]);
        responder(s_nota(fila('SELECT * FROM anotaciones WHERE id = ?', [$nuevo]), nombres_materias($u)), 201);
    }

    if ($id === null) fallar('Ruta no encontrada.', 404);
    $n = propio('anotaciones', $id, 'La nota no existe.');

    if ($m === 'PATCH') {
        $d = entrada();
        $c = ['actualizado_en' => ahora()];
        if (array_key_exists('titulo', $d)) $c['titulo'] = texto($d, 'titulo', 160, true, 'El título');
        if (array_key_exists('contenido', $d)) $c['contenido'] = texto($d, 'contenido', 60000, true, 'El contenido');
        if (array_key_exists('materiaId', $d)) $c['materia_id'] = materia_valida($d['materiaId']);
        actualizar('anotaciones', $c, 'id = ?', [$n['id']]);
        responder(s_nota(fila('SELECT * FROM anotaciones WHERE id = ?', [$n['id']]), nombres_materias($u)));
    }

    if ($m === 'DELETE') {
        q('DELETE FROM anotaciones WHERE id = ?', [$n['id']]);
        responder(['ok' => true]);
    }

    fallar('Ruta no encontrada.', 404);
}
