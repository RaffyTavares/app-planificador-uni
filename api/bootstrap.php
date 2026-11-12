<?php
/**
 * Núcleo de la API: configuración, base de datos, sesión, seguridad y utilidades.
 */
declare(strict_types=1);

const RAIZ = __DIR__ . '/..';

/* =====================================================================
   CONFIGURACIÓN
   ===================================================================== */
function config(?string $ruta = null): mixed
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require RAIZ . '/config.php';
        $local = RAIZ . '/config.local.php';
        if (is_file($local)) {
            $cfg = array_replace_recursive($cfg, require $local);
        }
        // Permite forzar otra configuración en pruebas automáticas
        $env = getenv('EDUGESTOR_CONFIG');
        if ($env && is_file($env)) {
            $cfg = array_replace_recursive($cfg, require $env);
        }
    }
    if ($ruta === null) return $cfg;
    $valor = $cfg;
    foreach (explode('.', $ruta) as $k) {
        if (!is_array($valor) || !array_key_exists($k, $valor)) return null;
        $valor = $valor[$k];
    }
    return $valor;
}

date_default_timezone_set(config('app.zona_horaria') ?: 'America/Santo_Domingo');

// En producción los errores se registran en el log, nunca se muestran
if (!config('app.debug')) {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

/** HTTPS directo o detrás de un proxy/CDN (Hostinger, Cloudflare…). */
function es_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/* =====================================================================
   BASE DE DATOS
   ===================================================================== */
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config('db');
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if ($c['driver'] === 'sqlite') {
        $pdo = new PDO('sqlite:' . $c['sqlite_path'], null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
    } else {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
        $pdo = new PDO($dsn, $c['user'], $c['pass'], $opts);
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute(array_values($params));
    return $st;
}

function filas(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function fila(string $sql, array $params = []): ?array { $r = q($sql, $params)->fetch(); return $r === false ? null : $r; }
function valor(string $sql, array $params = []): mixed { $r = q($sql, $params)->fetchColumn(); return $r === false ? null : $r; }

function insertar(string $tabla, array $datos): int
{
    $cols = array_keys($datos);
    $sql = sprintf('INSERT INTO %s (%s) VALUES (%s)', $tabla, implode(', ', $cols), implode(', ', array_fill(0, count($cols), '?')));
    q($sql, array_values($datos));
    return (int) db()->lastInsertId();
}

/** Actualiza solo filas del usuario actual (o con la condición indicada). */
function actualizar(string $tabla, array $datos, string $donde, array $params): int
{
    if (!$datos) return 0;
    $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($datos)));
    return q("UPDATE $tabla SET $set WHERE $donde", [...array_values($datos), ...$params])->rowCount();
}

function transaccion(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function ahora(): string { return date('Y-m-d H:i:s'); }
function hoy(): string { return date('Y-m-d'); }

/* =====================================================================
   RESPUESTAS Y ERRORES
   ===================================================================== */
final class ErrorApi extends Exception
{
    public function __construct(string $mensaje, public int $estado = 400, public array $extra = [])
    {
        parent::__construct($mensaje);
    }
}

function fallar(string $mensaje, int $estado = 400, array $extra = []): never
{
    throw new ErrorApi($mensaje, $estado, $extra);
}

function responder(mixed $datos, int $estado = 200): never
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function entrada(): array
{
    static $datos = null;
    if ($datos !== null) return $datos;
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($tipo, 'application/json')) {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 5 * 1024 * 1024) fallar('La solicitud es demasiado grande.', 413);
        $datos = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($datos)) fallar('JSON no válido.');
    } else {
        $datos = $_POST;
    }
    return $datos;
}

/* =====================================================================
   SESIÓN, AUTENTICACIÓN Y CSRF
   ===================================================================== */
function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = es_https();
    session_name('edugestor');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function csrf_token(): string { return $_SESSION['csrf'] ?? ''; }

function verificar_csrf(): void
{
    $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($metodo, ['GET', 'HEAD', 'OPTIONS'], true)) return;
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !hash_equals(csrf_token(), $token)) {
        // 403 + marca csrf (Apache no admite el código no estándar 419)
        fallar('La sesión expiró o la solicitud no es válida. Recarga la página.', 403, ['csrf' => true]);
    }
}

function usuario_id_opcional(): ?int
{
    return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
}

function uid(): int
{
    $id = usuario_id_opcional();
    if (!$id) fallar('Inicia sesión para continuar.', 401);
    return $id;
}

/** Semestre activo del usuario (lo crea si no existe). */
function semestre_activo(?int $usuario = null): int
{
    $usuario ??= uid();
    $id = valor('SELECT id FROM semestres WHERE usuario_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1', [$usuario]);
    if ($id) return (int) $id;
    $id = valor('SELECT id FROM semestres WHERE usuario_id = ? ORDER BY id DESC LIMIT 1', [$usuario]);
    if ($id) {
        q('UPDATE semestres SET activo = 1 WHERE id = ?', [$id]);
        return (int) $id;
    }
    return insertar('semestres', [
        'usuario_id' => $usuario,
        'nombre' => nombre_semestre_actual(perfil_usuario(fila('SELECT perfil FROM usuarios WHERE id = ?', [$usuario]) ?: [])['periodo']),
        'activo' => 1,
        'creado_en' => ahora(),
    ]);
}

/** Tipos de período académico y sus tramos del año: [nombre, mes inicial, mes final]. */
const PERIODOS = [
    'semestre' => [['Enero – Junio', 1, 6], ['Agosto – Diciembre', 7, 12]],
    'cuatrimestre' => [['Enero – Abril', 1, 4], ['Mayo – Agosto', 5, 8], ['Septiembre – Diciembre', 9, 12]],
    'trimestre' => [['Enero – Marzo', 1, 3], ['Abril – Junio', 4, 6], ['Julio – Septiembre', 7, 9], ['Octubre – Diciembre', 10, 12]],
    'bimestre' => [['Enero – Febrero', 1, 2], ['Marzo – Abril', 3, 4], ['Mayo – Junio', 5, 6], ['Julio – Agosto', 7, 8], ['Septiembre – Octubre', 9, 10], ['Noviembre – Diciembre', 11, 12]],
    'anual' => [['Año', 1, 12]],
];
const PERIODO_PALABRA = ['semestre' => 'semestre', 'cuatrimestre' => 'cuatrimestre', 'trimestre' => 'trimestre', 'bimestre' => 'bimestre', 'anual' => 'año académico'];

/** Perfil académico de un usuario con los valores por defecto del servidor. */
function perfil_usuario(array $u): array
{
    $guardado = !empty($u['perfil']) ? (json_decode($u['perfil'], true) ?: []) : [];
    $perfil = $guardado + [
        'universidad' => (string) (config('academico.universidad') ?? ''),
        'periodo' => (string) (config('academico.periodo') ?: 'semestre'),
        'formatoHora' => (string) (config('academico.formato_hora') ?: '12'),
        'creditosCarrera' => null,
    ];
    if (!isset(PERIODOS[$perfil['periodo']])) $perfil['periodo'] = 'semestre';
    return $perfil;
}

function nombre_semestre_actual(string $tipo = 'semestre'): string
{
    $m = (int) date('n');
    foreach (PERIODOS[$tipo] ?? PERIODOS['semestre'] as [$nombre, $desde, $hasta]) {
        if ($m >= $desde && $m <= $hasta) return "$nombre " . date('Y');
    }
    return date('Y');
}

/** Comprueba que un registro pertenece al usuario y lo devuelve. */
function propio(string $tabla, mixed $id, string $mensaje = 'No encontrado.'): array
{
    $id = (int) $id;
    $r = $id ? fila("SELECT * FROM $tabla WHERE id = ? AND usuario_id = ?", [$id, uid()]) : null;
    if (!$r) fallar($mensaje, 404);
    return $r;
}

/** Valida que una materia exista, sea del usuario y devuelve su id (o null). */
function materia_valida(mixed $id, bool $requerida = false): ?int
{
    if ($id === null || $id === '' || $id === 0 || $id === '0') {
        if ($requerida) fallar('Selecciona una materia.', 422, ['campo' => 'materiaId']);
        return null;
    }
    return (int) propio('materias', $id, 'La materia no existe.')['id'];
}

/** Ruta en disco de un archivo subido (fuera del alcance web). */
function ruta_archivo(int $u, string $ruta): string
{
    return rtrim((string) config('uploads.dir'), '/\\') . "/$u/" . basename($ruta);
}

/* =====================================================================
   VALIDACIÓN
   ===================================================================== */
function texto(array $d, string $campo, int $max, bool $requerido = true, string $etiqueta = ''): ?string
{
    $v = $d[$campo] ?? null;
    $v = is_string($v) ? trim($v) : (is_numeric($v) ? (string) $v : null);
    if ($v === null || $v === '') {
        if ($requerido) fallar(($etiqueta ?: ucfirst($campo)) . ' es obligatorio.', 422, ['campo' => $campo]);
        return null;
    }
    if (mb_strlen($v) > $max) fallar(($etiqueta ?: ucfirst($campo)) . " admite como máximo $max caracteres.", 422, ['campo' => $campo]);
    return $v;
}

function entero(array $d, string $campo, int $min, int $max, bool $requerido = false, string $etiqueta = ''): ?int
{
    $v = $d[$campo] ?? null;
    if ($v === null || $v === '') {
        if ($requerido) fallar(($etiqueta ?: ucfirst($campo)) . ' es obligatorio.', 422, ['campo' => $campo]);
        return null;
    }
    if (!is_numeric($v) || (int) $v != $v) fallar(($etiqueta ?: ucfirst($campo)) . ' debe ser un número entero.', 422, ['campo' => $campo]);
    $v = (int) $v;
    if ($v < $min || $v > $max) fallar(($etiqueta ?: ucfirst($campo)) . " debe estar entre $min y $max.", 422, ['campo' => $campo]);
    return $v;
}

function decimal(array $d, string $campo, float $min, float $max, bool $requerido = false, string $etiqueta = ''): ?float
{
    $v = $d[$campo] ?? null;
    if ($v === null || $v === '') {
        if ($requerido) fallar(($etiqueta ?: ucfirst($campo)) . ' es obligatorio.', 422, ['campo' => $campo]);
        return null;
    }
    if (!is_numeric($v)) fallar(($etiqueta ?: ucfirst($campo)) . ' debe ser un número.', 422, ['campo' => $campo]);
    $v = round((float) $v, 2);
    if ($v < $min || $v > $max) fallar(($etiqueta ?: ucfirst($campo)) . " debe estar entre $min y $max.", 422, ['campo' => $campo]);
    return $v;
}

function fecha(array $d, string $campo, bool $requerido = true, string $etiqueta = 'La fecha'): ?string
{
    $v = $d[$campo] ?? null;
    if ($v === null || $v === '') {
        if ($requerido) fallar("$etiqueta es obligatoria.", 422, ['campo' => $campo]);
        return null;
    }
    $f = DateTime::createFromFormat('!Y-m-d', (string) $v);
    if (!$f || $f->format('Y-m-d') !== $v) fallar("$etiqueta no es válida.", 422, ['campo' => $campo]);
    return $v;
}

function opcion(array $d, string $campo, array $permitidos, ?string $defecto = null): ?string
{
    $v = $d[$campo] ?? $defecto;
    if ($v === null) return null;
    if (!in_array($v, $permitidos, true)) fallar("Valor no permitido para $campo.", 422, ['campo' => $campo]);
    return $v;
}

function hora(array $d, string $campo): string
{
    $v = (string) ($d[$campo] ?? '');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) fallar('La hora no es válida.', 422, ['campo' => $campo]);
    return $v;
}

function booleano(array $d, string $campo, bool $defecto = false): bool
{
    if (!array_key_exists($campo, $d)) return $defecto;
    return filter_var($d[$campo], FILTER_VALIDATE_BOOLEAN);
}

/* =====================================================================
   SERIALIZACIÓN (formato que usa el frontend)
   ===================================================================== */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLORES = ['teal', 'sky', 'green', 'violet', 'ember', 'amber', 'pink', 'rose'];

function num(mixed $v): ?float { return $v === null ? null : (float) $v; }

function s_materia(array $m): array
{
    return [
        'id' => (int) $m['id'],
        'semestreId' => (int) $m['semestre_id'],
        'nombre' => $m['nombre'],
        'profesor' => $m['profesor'] ?? '',
        'creditos' => $m['creditos'] === null ? null : (int) $m['creditos'],
        'color' => $m['color'],
        'maxAusencias' => $m['max_ausencias'] === null ? null : (int) $m['max_ausencias'],
        'notaFinal' => num($m['nota_final']),
    ];
}

function s_clase(array $c, array $nombres = []): array
{
    return [
        'id' => (int) $c['id'],
        'materiaId' => (int) $c['materia_id'],
        'materiaNombre' => $nombres[(int) $c['materia_id']] ?? '',
        'dia' => DIAS[(int) $c['dia']] ?? 'Lunes',
        'hora' => $c['hora'],
        'duracion' => (int) $c['duracion'],
        'aula' => $c['aula'] ?? '',
    ];
}

function s_tarea(array $t, array $subtareas = [], array $nombres = []): array
{
    $mid = $t['materia_id'] === null ? null : (int) $t['materia_id'];
    return [
        'id' => (int) $t['id'],
        'descripcion' => $t['descripcion'],
        'materiaId' => $mid,
        'materiaNombre' => $mid ? ($nombres[$mid] ?? '') : 'General',
        'fecha' => $t['fecha'],
        'prioridad' => $t['prioridad'],
        'tipo' => $t['tipo'],
        'recurrencia' => $t['recurrencia'],
        'completada' => (bool) $t['completada'],
        'completadaEn' => $t['completada_en'],
        'subtareas' => array_map('s_subtarea', $subtareas),
    ];
}

function s_subtarea(array $s): array
{
    return ['id' => (int) $s['id'], 'texto' => $s['texto'], 'hecha' => (bool) $s['hecha'], 'orden' => (int) $s['orden']];
}

function s_nota(array $n, array $nombres = []): array
{
    $mid = $n['materia_id'] === null ? null : (int) $n['materia_id'];
    return [
        'id' => (int) $n['id'],
        'titulo' => $n['titulo'],
        'contenido' => $n['contenido'],
        'materiaId' => $mid,
        'materiaNombre' => $mid ? ($nombres[$mid] ?? '') : 'General',
        'creadoEn' => $n['creado_en'],
        'actualizadoEn' => $n['actualizado_en'],
    ];
}

function s_evaluacion(array $e): array
{
    return [
        'id' => (int) $e['id'],
        'materiaId' => (int) $e['materia_id'],
        'nombre' => $e['nombre'],
        'peso' => (float) $e['peso'],
        'nota' => num($e['nota']),
        'notaMax' => (float) $e['nota_max'],
        'fecha' => $e['fecha'],
    ];
}

function s_asistencia(array $a): array
{
    return ['id' => (int) $a['id'], 'claseId' => (int) $a['clase_id'], 'materiaId' => (int) $a['materia_id'], 'fecha' => $a['fecha'], 'estado' => $a['estado']];
}

function s_sesion(array $s): array
{
    return ['id' => (int) $s['id'], 'materiaId' => $s['materia_id'] === null ? null : (int) $s['materia_id'], 'inicio' => $s['inicio'], 'minutos' => (int) $s['minutos']];
}

function s_flashcard(array $f): array
{
    return [
        'id' => (int) $f['id'],
        'materiaId' => $f['materia_id'] === null ? null : (int) $f['materia_id'],
        'frente' => $f['frente'],
        'reverso' => $f['reverso'],
        'repeticiones' => (int) $f['repeticiones'],
        'intervalo' => (int) $f['intervalo'],
        'facilidad' => (float) $f['facilidad'],
        'proxima' => $f['proxima'],
    ];
}

function s_archivo(array $a): array
{
    return [
        'id' => (int) $a['id'],
        'materiaId' => (int) $a['materia_id'],
        'tareaId' => $a['tarea_id'] === null ? null : (int) $a['tarea_id'],
        'categoria' => $a['categoria'],
        'nombre' => $a['nombre'],
        'mime' => $a['mime'],
        'tamano' => (int) $a['tamano'],
        'creadoEn' => $a['creado_en'],
    ];
}

function s_semestre(array $s): array
{
    return ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'inicio' => $s['inicio'], 'fin' => $s['fin'], 'activo' => (bool) $s['activo']];
}

function s_usuario(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'nombre' => $u['nombre'],
        'email' => $u['email'],
        'carrera' => $u['carrera'] ?? '',
        'escala' => $u['escala'] ? json_decode($u['escala'], true) : null,
        'pomodoro' => $u['pomodoro'] ? json_decode($u['pomodoro'], true) : null,
        'perfil' => perfil_usuario($u),
    ];
}

/** Mapa id → nombre de las materias del usuario. */
function nombres_materias(int $usuario): array
{
    $r = [];
    foreach (filas('SELECT id, nombre FROM materias WHERE usuario_id = ?', [$usuario]) as $m) $r[(int) $m['id']] = $m['nombre'];
    return $r;
}

function subtareas_de(array $tareaIds): array
{
    if (!$tareaIds) return [];
    $marcas = implode(',', array_fill(0, count($tareaIds), '?'));
    $agrupadas = [];
    foreach (filas("SELECT * FROM subtareas WHERE tarea_id IN ($marcas) ORDER BY orden, id", $tareaIds) as $s) {
        $agrupadas[(int) $s['tarea_id']][] = $s;
    }
    return $agrupadas;
}

function tarea_completa(int $id): array
{
    $t = fila('SELECT * FROM tareas WHERE id = ?', [$id]);
    return s_tarea($t, subtareas_de([$id])[$id] ?? [], nombres_materias((int) $t['usuario_id']));
}
