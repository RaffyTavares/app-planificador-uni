-- =====================================================================
-- EDUGESTOR PRO — ESQUEMA DE BASE DE DATOS
-- Escrito en un dialecto común: db/instalar.php lo adapta a MySQL
-- (ENGINE=InnoDB, utf8mb4) o a SQLite (AUTOINCREMENT) automáticamente.
-- Reglas: cada sentencia termina en ";" al final de línea, sin comentarios
-- dentro de las sentencias, y las claves primarias se escriben como
-- "id INTEGER PRIMARY KEY AUTO_INCREMENT".
-- =====================================================================

CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(80) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    carrera VARCHAR(120) NULL,
    escala TEXT NULL,
    pomodoro TEXT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE semestres (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    inicio DATE NULL,
    fin DATE NULL,
    activo TINYINT NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_semestres_usuario ON semestres (usuario_id);

CREATE TABLE materias (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    semestre_id INTEGER NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    profesor VARCHAR(120) NULL,
    creditos SMALLINT NULL,
    color VARCHAR(12) NULL,
    max_ausencias SMALLINT NULL,
    nota_final DECIMAL(5,2) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (semestre_id) REFERENCES semestres(id) ON DELETE CASCADE
);
CREATE INDEX idx_materias_semestre ON materias (semestre_id);

CREATE TABLE clases (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    materia_id INTEGER NOT NULL,
    dia TINYINT NOT NULL,
    hora CHAR(5) NOT NULL,
    duracion SMALLINT NOT NULL DEFAULT 60,
    aula VARCHAR(120) NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_clases_materia ON clases (materia_id);

CREATE TABLE tareas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    semestre_id INTEGER NOT NULL,
    materia_id INTEGER NULL,
    descripcion VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    prioridad VARCHAR(5) NOT NULL DEFAULT 'media',
    tipo VARCHAR(10) NOT NULL DEFAULT 'tarea',
    recurrencia VARCHAR(10) NULL,
    completada TINYINT NOT NULL DEFAULT 0,
    completada_en DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (semestre_id) REFERENCES semestres(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_tareas_semestre ON tareas (semestre_id);
CREATE INDEX idx_tareas_fecha ON tareas (usuario_id, fecha);

CREATE TABLE subtareas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tarea_id INTEGER NOT NULL,
    texto VARCHAR(255) NOT NULL,
    hecha TINYINT NOT NULL DEFAULT 0,
    orden SMALLINT NOT NULL DEFAULT 0,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
);
CREATE INDEX idx_subtareas_tarea ON subtareas (tarea_id);

CREATE TABLE anotaciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    semestre_id INTEGER NOT NULL,
    materia_id INTEGER NULL,
    titulo VARCHAR(160) NOT NULL,
    contenido TEXT NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (semestre_id) REFERENCES semestres(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_anotaciones_semestre ON anotaciones (semestre_id);

CREATE TABLE evaluaciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    materia_id INTEGER NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    peso DECIMAL(5,2) NOT NULL,
    nota DECIMAL(6,2) NULL,
    nota_max DECIMAL(6,2) NOT NULL DEFAULT 100,
    fecha DATE NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_evaluaciones_materia ON evaluaciones (materia_id);

CREATE TABLE asistencias (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    materia_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    estado VARCHAR(12) NOT NULL,
    UNIQUE (clase_id, fecha),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (clase_id) REFERENCES clases(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_asistencias_materia ON asistencias (materia_id);

CREATE TABLE sesiones_estudio (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    semestre_id INTEGER NOT NULL,
    materia_id INTEGER NULL,
    inicio DATETIME NOT NULL,
    minutos SMALLINT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (semestre_id) REFERENCES semestres(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE SET NULL
);
CREATE INDEX idx_sesiones_usuario ON sesiones_estudio (usuario_id, inicio);

CREATE TABLE flashcards (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    semestre_id INTEGER NOT NULL,
    materia_id INTEGER NULL,
    frente TEXT NOT NULL,
    reverso TEXT NOT NULL,
    repeticiones SMALLINT NOT NULL DEFAULT 0,
    intervalo SMALLINT NOT NULL DEFAULT 0,
    facilidad DECIMAL(4,2) NOT NULL DEFAULT 2.5,
    proxima DATE NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (semestre_id) REFERENCES semestres(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
);
CREATE INDEX idx_flashcards_proxima ON flashcards (usuario_id, proxima);

CREATE TABLE archivos (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    materia_id INTEGER NOT NULL,
    tarea_id INTEGER NULL,
    categoria VARCHAR(12) NOT NULL DEFAULT 'documento',
    nombre VARCHAR(255) NOT NULL,
    ruta VARCHAR(80) NOT NULL,
    mime VARCHAR(120) NOT NULL,
    tamano INTEGER NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE SET NULL
);
CREATE INDEX idx_archivos_materia ON archivos (materia_id);

CREATE TABLE grupos (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    codigo CHAR(8) NOT NULL UNIQUE,
    creador_id INTEGER NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creador_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE grupo_miembros (
    grupo_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    rol VARCHAR(10) NOT NULL DEFAULT 'miembro',
    unido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (grupo_id, usuario_id),
    FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_miembros_usuario ON grupo_miembros (usuario_id);

CREATE TABLE grupo_publicaciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    grupo_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    titulo VARCHAR(255) NULL,
    contenido TEXT NULL,
    fecha DATE NULL,
    archivo_id INTEGER NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
);
CREATE INDEX idx_publicaciones_grupo ON grupo_publicaciones (grupo_id);

CREATE TABLE push_suscripciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    endpoint_hash CHAR(64) NOT NULL UNIQUE,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE notificaciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    clave VARCHAR(120) NOT NULL,
    titulo VARCHAR(160) NOT NULL,
    cuerpo VARCHAR(255) NOT NULL,
    url VARCHAR(255) NULL,
    entregada TINYINT NOT NULL DEFAULT 0,
    creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_id, clave),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE intentos_login (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    ip VARCHAR(45) NOT NULL,
    email VARCHAR(190) NOT NULL,
    creado_en DATETIME NOT NULL
);
CREATE INDEX idx_intentos_ip ON intentos_login (ip, creado_en);

CREATE TABLE chat_conversaciones (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    usuario_id INTEGER NOT NULL,
    titulo VARCHAR(160) NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_chat_usuario ON chat_conversaciones (usuario_id, actualizado_en);

CREATE TABLE chat_mensajes (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    conversacion_id INTEGER NOT NULL,
    rol VARCHAR(10) NOT NULL,
    tipo VARCHAR(12) NOT NULL,
    bloques MEDIUMTEXT NOT NULL,
    visible MEDIUMTEXT NULL,
    extras MEDIUMTEXT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversacion_id) REFERENCES chat_conversaciones(id) ON DELETE CASCADE
);
CREATE INDEX idx_chat_mensajes ON chat_mensajes (conversacion_id, id);

CREATE TABLE chat_archivos (
    archivo_id INTEGER PRIMARY KEY,
    file_id VARCHAR(120) NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE CASCADE
);
