<?php
/**
 * Exporta los datos de esta instalación a db/datos.sql para llevarlos a producción.
 *
 *   php db/exportar_datos.php
 *
 * El instalador web (install.php) importa ese archivo automáticamente si la
 * base de datos de destino está vacía, y luego lo borra.
 * Contiene los hashes de las contraseñas: no lo compartas ni lo subas a git.
 *
 * No se exportan: suscripciones push (dependen del dominio), notificaciones,
 * intentos de inicio de sesión ni las tablas antiguas (antigua_*).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo desde la línea de comandos.');
}

require __DIR__ . '/../api/bootstrap.php';

// Orden que respeta las claves foráneas
const TABLAS_EXPORTABLES = [
    'usuarios', 'semestres', 'materias', 'clases', 'tareas', 'subtareas', 'anotaciones', 'evaluaciones',
    'asistencias', 'sesiones_estudio', 'flashcards', 'archivos', 'grupos', 'grupo_miembros', 'grupo_publicaciones',
    'chat_conversaciones', 'chat_mensajes', 'chat_archivos',
];

$destino = __DIR__ . '/datos.sql';
$pdo = db();
$f = fopen($destino, 'wb');
fwrite($f, "-- EduGestor Pro · datos exportados el " . date('Y-m-d H:i') . "\n");
fwrite($f, "-- Una sentencia por línea. Lo importa install.php.\n");
fwrite($f, "SET FOREIGN_KEY_CHECKS=0;\n");

$total = 0;
foreach (TABLAS_EXPORTABLES as $t) {
    $filas = $pdo->query("SELECT * FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
    if (!$filas) { echo str_pad($t, 22) . "0\n"; continue; }
    $cols = '`' . implode('`, `', array_keys($filas[0])) . '`';
    foreach (array_chunk($filas, 100) as $lote) {
        $valores = array_map(fn($r) => '(' . implode(', ', array_map(
            fn($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), $r
        )) . ')', $lote);
        // PDO::quote escapa los saltos de línea, así cada sentencia ocupa una sola línea
        fwrite($f, "INSERT INTO `$t` ($cols) VALUES " . implode(', ', $valores) . ";\n");
    }
    $total += count($filas);
    echo str_pad($t, 22) . count($filas) . "\n";
}
fwrite($f, "SET FOREIGN_KEY_CHECKS=1;\n");
fclose($f);

$arch = (int) valor('SELECT COUNT(*) FROM archivos');
echo "\n✓ $total filas exportadas a db/datos.sql (" . round(filesize($destino) / 1024) . " KB)\n";
if ($arch) echo "• Hay $arch archivos subidos: empaqueta con  php db/empaquetar.php --con-datos  para incluirlos.\n";
