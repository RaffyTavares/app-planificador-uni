<?php
/**
 * Esquema de la base de datos: lo usan el instalador de consola (db/instalar.php)
 * y el instalador web (install.php).
 */
declare(strict_types=1);

/** Adapta el esquema común al motor indicado. */
function esquema(string $driver): array
{
    $sql = file_get_contents(__DIR__ . '/esquema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $sentencias = array_filter(array_map('trim', preg_split('/;\s*$/m', $sql)));
    return array_map(function (string $s) use ($driver) {
        if ($driver === 'sqlite') {
            $s = str_replace('INTEGER PRIMARY KEY AUTO_INCREMENT', 'INTEGER PRIMARY KEY AUTOINCREMENT', $s);
            $s = preg_replace('/^CREATE TABLE /', 'CREATE TABLE IF NOT EXISTS ', $s);
            $s = preg_replace('/^CREATE INDEX /', 'CREATE INDEX IF NOT EXISTS ', $s);
        } else {
            $s = preg_replace('/^CREATE TABLE /', 'CREATE TABLE IF NOT EXISTS ', $s);
            if (str_starts_with($s, 'CREATE TABLE')) $s .= ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        }
        return $s;
    }, $sentencias);
}

function aplicar_esquema(PDO $pdo, string $driver): int
{
    // Tablas con el mismo nombre pero de otra versión: se avisa en lugar de fallar a medias
    if ($driver === 'mysql') {
        $esperadas = ['materias' => 'semestre_id', 'clases' => 'usuario_id', 'tareas' => 'semestre_id', 'anotaciones' => 'semestre_id'];
        foreach ($esperadas as $t => $col) {
            $existe = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($t))->fetchColumn();
            if ($existe && !$pdo->query("SHOW COLUMNS FROM `$t` LIKE " . $pdo->quote($col))->fetchColumn()) {
                throw new RuntimeException("La tabla `$t` es de una versión anterior. Renómbrala (p. ej. RENAME TABLE $t TO antigua_$t) y vuelve a ejecutar el instalador.");
            }
        }
    }
    $n = 0;
    foreach (esquema($driver) as $s) {
        if ($driver === 'mysql' && str_starts_with($s, 'CREATE INDEX')) {
            // MySQL no admite CREATE INDEX IF NOT EXISTS: se ignora si ya existe
            try { $pdo->exec($s); } catch (PDOException $e) { if (!str_contains($e->getMessage(), 'Duplicate key name')) throw $e; }
        } else {
            $pdo->exec($s);
        }
        $n++;
    }
    return $n;
}
