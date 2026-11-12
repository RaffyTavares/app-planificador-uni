# EduGestor Pro

Planificador universitario para organizar el semestre en un solo lugar: horario, tareas y exámenes, calificaciones e índice académico, asistencia, archivos por materia, sesiones de estudio, tarjetas de repaso, grupos de estudio y un asistente con IA.

Es una aplicación web con **backend en PHP y MySQL** y **frontend en JavaScript sin frameworks** (módulos ES). Funciona en XAMPP, se puede instalar en el celular como app (PWA) y abre sin conexión en modo lectura.

> Proyecto de Rafael Tavares, estudiante de la Universidad Adventista Dominicana (UNAD).

---

## Contenido

1. [Funciones](#funciones)
2. [Tecnologías](#tecnologías)
3. [Instalación](#instalación)
4. [Despliegue en producción (Hostinger)](#despliegue-en-producción-hostinger)
5. [Configuración](#configuración)
6. [Primeros pasos](#primeros-pasos)
7. [Cómo está construido](#cómo-está-construido)
8. [Estructura de carpetas](#estructura-de-carpetas)
9. [Base de datos](#base-de-datos)
10. [API REST](#api-rest)
11. [Frontend](#frontend)
12. [Seguridad](#seguridad)
13. [Notificaciones push y recordatorios](#notificaciones-push-y-recordatorios)
14. [Asistente con IA](#asistente-con-ia)
15. [Diseño y accesibilidad](#diseño-y-accesibilidad)
16. [Cómo se probó](#cómo-se-probó)
17. [Solución de problemas](#solución-de-problemas)

---

## Funciones

### Planificar
- **Inicio:** resumen del día con la clase en curso o la siguiente (cuenta regresiva), agenda de hoy, próximas entregas y exámenes, progreso de estudio y tarjetas pendientes.
- **Calendario mensual:** entregas, exámenes y clases de cada día.
- **Horario semanal:** bloques por color de materia; se mueven **arrastrando**, se crean haciendo clic en un hueco libre y se exportan a Google Calendar, Outlook o Apple Calendar (`.ics`). Avisa si dos clases se cruzan.
- **Tareas y exámenes:** agregado rápido con Enter, prioridad, **subtareas**, **tareas recurrentes** (diaria, semanal, mensual), archivos adjuntos, filtros y agrupación por fecha. Para cada examen se puede crear un **plan de repaso** automático.

### Académico
- **Materias:** cada una tiene su página con pestañas de resumen, **archivos**, calificaciones, asistencia y notas.
- **Archivos por materia:** subida por arrastrar y soltar con barra de progreso, categorías (tareas, material de apoyo, documentos, otros) y vista previa de PDF e imágenes.
- **Calificaciones:** evaluaciones con peso porcentual, nota acumulada, promedio, letra y la calculadora **"¿cuánto necesito para obtener una A?"**.
- **Índice académico:** del semestre y **acumulado de toda la carrera**, ponderado por créditos y con escala configurable.
- **Perfil académico por estudiante (Ajustes):** universidad, tipo de período (**semestre, cuatrimestre, trimestre, bimestre o año académico**: cambia los textos de toda la app, el nombre del período nuevo y los tramos del récord), créditos totales de la carrera (avance en Historial), formato de hora 12/24 y plantillas de escala de calificaciones. Sirve para estudiantes de cualquier universidad, no solo de la UNAD.
- **Récord académico:** permite cargar semestres ya cursados con su nota final (en número o letra), incluso pegando la lista desde Excel o el portal.
- **Asistencia:** se marca desde la agenda del día y avisa cuando te acercas al límite de ausencias.
- **Notas (apuntes):** búsqueda, filtro por materia y conversión a tarjetas de repaso.

### Estudiar
- **Enfoque (Pomodoro):** temporizador configurable que sigue corriendo al cambiar de sección, con meta diaria, racha y estadísticas (minutos por día, tiempo por materia y mapa de constancia).
- **Repaso:** tarjetas con **repetición espaciada (algoritmo SM-2)**; se pueden crear a mano, desde notas con líneas `pregunta :: respuesta` o con la IA.
- **Asistente IA (chat):** conversación tipo Claude que consulta tus materias, horario, tareas, calificaciones, récord y notas; lee los PDF e imágenes que adjuntes; y propone tareas, tarjetas o notas que solo se guardan si las confirmas. Las conversaciones quedan guardadas en tu cuenta.

### Comunidad y cuenta
- **Grupos de estudio:** se crean con un código de invitación y permiten compartir notas, tareas, archivos y mensajes; los miembros pueden copiar lo compartido a su cuenta.
- **Semestres:** crear, archivar y volver a cualquier semestre.
- **Respaldo:** exportar e importar el semestre en `.json` (acepta también los respaldos de la versión antigua basada en localStorage).
- **Datos de ejemplo:** semestre ficticio de Ingeniería de Sistemas en la UNAD para explorar la app.
- **Búsqueda global y acciones** con `Ctrl K` (`⌘ K` en Mac). Atajos: `N` crea una tarea y `/` abre la búsqueda.
- **Tema claro y oscuro**, que sigue la preferencia del sistema o se elige manualmente.

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Servidor | PHP 8.1+ (probado con 8.2) sobre Apache (XAMPP) |
| Base de datos | MySQL/MariaDB (producción) o SQLite (pruebas), mediante PDO |
| Frontend | HTML, CSS y JavaScript con módulos ES, sin frameworks ni paso de compilación |
| Dependencias PHP | [Composer](https://getcomposer.org/): SDK oficial de Anthropic (`anthropic-ai/sdk`) y Guzzle, usados solo por el asistente con IA |
| PWA | Service worker, manifiesto y Web Push con VAPID (implementado con `openssl`, sin librerías) |
| Tipografías | Instrument Serif, Inter y JetBrains Mono (Google Fonts) |

---

## Instalación

### Requisitos
- XAMPP con **Apache** y **MySQL** encendidos.
- PHP con las extensiones `pdo_mysql`, `openssl`, `curl` y `fileinfo` (vienen activadas en XAMPP).
- Apache con `AllowOverride All` en `htdocs`, para que funcionen los `.htaccess` (es lo predeterminado en XAMPP).
- Composer (solo para el asistente con IA).

### Pasos

**1. Copiar el proyecto** a `C:\xampp\htdocs\app-planificador-uni\`.

**2. Instalar las dependencias de PHP:**
```bash
composer install
```

**3. Crear la base de datos.** El instalador:
- crea la base `planificador_universitario`;
- crea un usuario MySQL **`edugestor`** con contraseña aleatoria y permisos solo sobre esa base;
- aplica el esquema y genera las claves de las notificaciones push;
- guarda todo en `config.local.php`.

```powershell
$env:MYSQL_ADMIN_PASS = 'TU_CONTRASEÑA_DE_ROOT'; C:\xampp\php\php.exe db\instalar.php --admin-user=root
```

Pasar la contraseña por variable de entorno evita que quede en el historial de la consola. También se puede usar `--admin-pass=...`. La contraseña de `root` no se guarda en ningún archivo.

**4. Abrir la app** en `http://localhost/app-planificador-uni/` y crear una cuenta.

Si el navegador tiene datos de la versión anterior (guardados en localStorage), la app ofrece importarlos a la cuenta.

### Otras opciones del instalador

| Comando | Qué hace |
|---|---|
| `php db/instalar.php --admin-user=root` | Instalación completa en MySQL |
| `php db/instalar.php --esquema` | Solo aplica el esquema con la configuración actual |
| `php db/instalar.php --vapid` | Genera claves VAPID nuevas (invalida las suscripciones push existentes) |
| `php db/instalar.php --sqlite` | Usa SQLite en `storage/` (desarrollo y pruebas) |

Volver a ejecutar el instalador es seguro: no borra datos, reutiliza la contraseña de `edugestor` que ya está en `config.local.php` y se detiene con un aviso si encuentra tablas de una versión anterior con el mismo nombre.

---

## Despliegue en producción (Hostinger)

Dominio de producción: **https://edugestor.nesuxtech.com**. Hostinger usa LiteSpeed, compatible con el `.htaccess` del proyecto.

### 1. Preparar el paquete (en tu PC con XAMPP)

```powershell
cd C:\xampp\htdocs\app-planificador-uni
C:\xampp\php\php.exe db\empaquetar.php --con-datos
```

Genera `dist/edugestor-produccion-con-datos.zip` (unos 5 MB) con la app, `vendor/`, **tus datos** (`db/datos.sql`: cuentas, récord, materias, notas, conversaciones…) y **tus archivos subidos**. Sin `--con-datos` genera un paquete vacío para una instalación nueva.

Nunca incluye `config.local.php`. El zip con datos contiene los hashes de las contraseñas: no lo compartas.

### 2. Preparar Hostinger (hPanel)

1. **Sitio:** agrega el dominio `edugestor.nesuxtech.com` (o el subdominio, si `nesuxtech.com` ya está en tu plan).
2. **SSL:** Seguridad → SSL → actívalo para el dominio. La app fuerza HTTPS y las notificaciones y la instalación como app lo requieren.
3. **PHP:** Avanzado → Configuración de PHP → versión **8.2 o superior**. Comprueba que `upload_max_filesize` y `post_max_size` sean de al menos 25 MB.
4. **Base de datos:** Bases de datos → Administración → crea la base y el usuario. Apunta el **nombre**, el **usuario** y la **contraseña**; Hostinger les pone un prefijo como `u123456789_`.

### 3. Subir e instalar

1. Administrador de archivos → `public_html` del dominio → sube el `.zip` → clic derecho → **Extraer** → borra el `.zip`.
2. Abre **https://edugestor.nesuxtech.com/install.php**. Comprueba los requisitos, escribe los datos de la base (servidor `localhost`) y, si quieres, la clave de Anthropic y un correo de contacto.
3. Pulsa **Instalar**. El instalador:
   - crea las tablas y genera las claves de notificaciones;
   - escribe `config.local.php`;
   - **importa tus datos** si la base está vacía y luego borra `datos.sql`;
   - se bloquea a sí mismo con `storage/instalado.lock`.
4. **Borra `install.php`** desde el administrador de archivos.

### 4. Recordatorios (cron)

hPanel → Avanzado → **Cron Jobs** → comando personalizado, **cada minuto** (o cada 5 minutos si tu plan no lo permite). Usa el comando exacto que muestra el instalador al terminar, por ejemplo:

```
/usr/bin/php /home/u123456789/domains/edugestor.nesuxtech.com/public_html/cron/recordatorios.php
```

### 5. Después de publicar

- Inicia sesión con tu misma cuenta y contraseña: se migraron con los datos.
- **Activa de nuevo las notificaciones** en Ajustes. Las suscripciones dependen del dominio y no se migran.
- Si no quieres que otras personas creen cuentas, pon `'registro_abierto' => false` dentro de `'app'` en `config.local.php`.
- Instala la app en el celular desde el navegador (“Añadir a pantalla de inicio”).

### Actualizar a una versión nueva

1. En tu PC, sube `VERSION` en `sw.js` y genera el paquete **sin** `--con-datos`.
2. En Hostinger, extrae el zip encima de lo existente. No toca `config.local.php` ni `storage/`.
3. Si el esquema cambió, borra `storage/instalado.lock`, abre `install.php` con los mismos datos de la base (crea las tablas nuevas sin tocar las existentes) y vuelve a borrar `install.php`.

> **Si modificas el `<script>` en línea de `index.html`** (el que aplica el tema), recalcula su hash `sha256` y actualízalo en la `Content-Security-Policy` del `.htaccess`. Si no, el navegador lo bloqueará.

---

## Configuración

`config.php` **detecta solo el entorno**: `localhost`, `127.0.0.1`, IPs privadas, `*.test` o `*.local` (o la línea de comandos en Windows) son **local**; cualquier otro dominio es **producción**. Cada entorno trae su servidor, base y usuario (producción: `u382859220_planif_uni` / `u382859220_edugestor` en `localhost`), y `debug` solo se activa en local. Se puede forzar con la variable de entorno `EDUGESTOR_ENTORNO=local|produccion`. Las contraseñas de cada entorno van en su propio `config.local.php`.

La sección `academico` de `config.php` fija los valores iniciales del perfil de cada cuenta nueva (`universidad`, `periodo`, `formato_hora`); cada estudiante los cambia después en **Ajustes → Perfil académico**. Se guardan en la columna `usuarios.perfil` (JSON); los instaladores añaden esa columna a bases existentes automáticamente.

La configuración está repartida en dos archivos que se combinan:

| Archivo | Contenido | ¿Va a git? |
|---|---|---|
| `config.php` | Valores por defecto, **sin contraseñas ni claves** | Sí |
| `config.local.php` | Contraseña de la base de datos, claves VAPID y clave de la IA | **No** (está en `.gitignore`) |

`config.local.php` solo necesita los valores que cambian. Lo genera el instalador; la clave de la IA se añade a mano.

| Clave | Por defecto | Descripción |
|---|---|---|
| `app.debug` | `false` | Muestra el detalle de los errores en la API. Solo para desarrollo |
| `app.zona_horaria` | `America/Santo_Domingo` | Zona horaria para fechas y recordatorios |
| `db.driver` | `mysql` | `mysql` o `sqlite` |
| `db.host` / `db.port` / `db.name` | `127.0.0.1` / `3306` / `planificador_universitario` | Conexión a MySQL |
| `db.user` / `db.pass` | `edugestor` / (en `config.local.php`) | Usuario dedicado de la app |
| `uploads.max_bytes` | 25 MB | Tamaño máximo por archivo. Debe ser menor que `upload_max_filesize` y `post_max_size` de PHP |
| `uploads.cuota_bytes` | 1 GB | Espacio total por usuario |
| `uploads.extensiones` | documentos, imágenes, código, comprimidos, audio y video | Lista blanca de extensiones permitidas |
| `ia.api_key` | vacía | Clave de la API de Anthropic. Vacía = asistente desactivado |
| `ia.modelo` / `ia.esfuerzo` / `ia.max_tokens` | `claude-opus-5-5` / `medium` / `16000` | Modelo, profundidad de razonamiento y longitud máxima de respuesta |
| `push.public_key` / `push.private_key_pem` | (las genera el instalador) | Claves VAPID para Web Push |
| `push.subject` | `mailto:admin@localhost` | Contacto que se envía a los servicios de push |

> **Sobre la contraseña de la base de datos:** el valor de `db.pass` en `config.local.php` es la contraseña real del usuario `edugestor`. No está cifrada: es otra contraseña, distinta de la de `root`. La de `root` sigue siendo la de siempre y se usa para phpMyAdmin.

---

## Primeros pasos

1. **Crea tu cuenta** en la pantalla de acceso.
2. Si ya llevas semestres cursados, entra en **Historial → Agregar semestre cursado** y carga tus materias anteriores con su nota final. Así el índice acumulado es real desde el primer día.
3. Sigue la **ruta de inicio** del semestre actual: agrega materias, arma tu horario y anota tus entregas.
4. ¿Solo quieres explorar? En **Inicio** o en **Ajustes → Datos** pulsa **Datos de ejemplo**: carga un semestre ficticio de la UNAD (y se puede deshacer).
5. Opcional: activa las **notificaciones** en Ajustes e **instala la app** desde el navegador (icono de instalar en la barra de direcciones o "Añadir a pantalla de inicio" en el celular).

La escala de letras por defecto es A ≥ 90 (4 puntos), B ≥ 80 (3), C ≥ 70 (2), D ≥ 60 (1) y F (0). Si tu universidad usa otra, cámbiala en **Ajustes → Escala de calificaciones** y todos los índices se recalculan.

---

## Cómo está construido

```
 Navegador (PWA)                              Servidor (Apache + PHP)                MySQL
┌──────────────────────────┐   JSON + cookie   ┌─────────────────────────────┐   PDO   ┌──────────────┐
│ index.html + js/main.js  │ ───────────────▶  │ api/index.php  (enrutador)  │ ──────▶ │ 21 tablas    │
│ vistas, formularios,     │   X-CSRF-Token    │ api/rutas/*.php (recursos)  │         └──────────────┘
│ estado en memoria        │ ◀───────────────  │ api/bootstrap.php (núcleo)  │
│ sw.js (caché y push)     │                   │ storage/uploads (archivos)  │ ──▶ Anthropic API (IA)
└──────────────────────────┘                   └─────────────────────────────┘ ──▶ servicios de push
                                                cron/recordatorios.php (cada minuto)
```

**Flujo de datos:**
1. Al iniciar sesión, el frontend pide `GET /estado`, que devuelve **todo el semestre activo** (materias, clases, tareas, notas, calificaciones, asistencia, archivos, tarjetas, sesiones de estudio y el histórico para el índice acumulado).
2. Ese estado vive en memoria (`js/estado.js`). Las vistas se pintan a partir de él; los cálculos (índice, nota necesaria, asistencia, estadísticas) se hacen en el navegador.
3. Cada cambio llama a la API y actualiza el estado con la respuesta del servidor, que es la fuente de verdad.
4. **Borrar con "Deshacer":** el elemento desaparece al momento y el borrado se confirma en el servidor a los 7 segundos. Si pulsas Deshacer, nunca llega a borrarse. Si cierras la pestaña, los borrados pendientes se envían antes de salir.
5. Al volver a la pestaña, la app vuelve a pedir el estado para traer cambios hechos desde otro dispositivo.

**localStorage** ya no guarda datos académicos. Solo guarda el tema (claro u oscuro) de cada dispositivo. El temporizador Pomodoro usa `sessionStorage` para seguir corriendo mientras navegas.

---

## Estructura de carpetas

```
app-planificador-uni/
├── index.html              Estructura de la app (acceso, barra lateral, diálogos)
├── styles.css              Sistema de diseño completo (tokens, componentes, temas)
├── sw.js                   Service worker: caché de la interfaz, modo sin conexión y push
├── manifest.webmanifest    Manifiesto PWA (nombre, iconos, accesos directos)
├── config.php              Configuración por defecto (sin secretos)
├── config.local.php        Secretos y valores locales (no se sube a git)
├── composer.json/.lock     Dependencias PHP (SDK de Anthropic, Guzzle)
├── .htaccess               HTTPS obligatorio, bloqueo de carpetas internas, CSP y cabeceras de seguridad
├── install.php             Instalador web para producción (se bloquea solo al terminar)
│
├── api/
│   ├── index.php           Único punto de entrada público: enrutador y manejo de errores
│   ├── bootstrap.php       Núcleo: configuración, PDO, sesión, CSRF, validación, serialización
│   ├── rutas/              Un archivo por recurso (auth, materias, tareas, archivos, grupos, ia…)
│   └── lib/webpush.php     Web Push con VAPID y generación de recordatorios
│
├── db/
│   ├── esquema.sql         Esquema en un dialecto común (se adapta a MySQL o SQLite)
│   ├── esquema_lib.php     Aplica el esquema (lo usan los dos instaladores)
│   ├── instalar.php        Instalador por línea de comandos (XAMPP)
│   ├── exportar_datos.php  Exporta tus datos a db/datos.sql para llevarlos a producción
│   └── empaquetar.php      Genera dist/edugestor-produccion.zip
│
├── cron/recordatorios.php  Envía recordatorios push (programarlo cada minuto)
│
├── js/
│   ├── main.js             Arranque, enrutado, render, eventos globales
│   ├── api.js              Cliente HTTP: CSRF, sesión expirada, sin conexión, subida con progreso
│   ├── estado.js           Estado en memoria y cálculos (horario, notas, índice, asistencia, estudio)
│   ├── datos.js            Operaciones: crear, editar, borrar con deshacer, respaldo, ejemplo
│   ├── ui.js               Avisos, diálogos, formularios, estados vacíos
│   ├── formularios.js      Formularios de materia, clase, tarea, nota, calificación, archivo, tarjeta
│   ├── componentes.js      Piezas reutilizables (fila de tarea, agenda, archivo, nota)
│   ├── acciones.js         Registro de acciones para la delegación de clics (data-action)
│   ├── rutas.js            Rutas y su orden en la navegación
│   ├── acceso.js           Inicio de sesión, registro y migración desde localStorage
│   ├── paleta.js           Búsqueda global y acciones (Ctrl K)
│   ├── pomodoro.js         Motor del temporizador
│   ├── push.js             Suscripción a notificaciones
│   ├── iconos.js           Iconos SVG en línea
│   ├── util.js             Fechas, formato y utilidades del DOM
│   ├── datos-ejemplo.js    Semestre de ejemplo (UNAD)
│   └── vistas/             Una vista por sección (inicio, horario, tareas, materias, enfoque…)
│
├── storage/uploads/        Archivos subidos, por usuario (sin acceso web directo)
├── icons/                  Iconos de la PWA generados a partir de logo.jpeg
└── vendor/                 Dependencias de Composer (no se sube a git)
```

Las carpetas `api/rutas`, `api/lib`, `db`, `cron`, `storage` y `vendor` tienen su propio `.htaccess` que impide abrirlas desde el navegador.

---

## Base de datos

El esquema está en [`db/esquema.sql`](db/esquema.sql). Usa InnoDB y `utf8mb4`, y las claves foráneas con `ON DELETE CASCADE` se encargan de la limpieza: al borrar una materia se borran sus clases, tareas, notas, calificaciones, asistencia y archivos.

| Tabla | Para qué sirve |
|---|---|
| `usuarios` | Cuentas: nombre, correo, contraseña (hash bcrypt), carrera, escala de notas y preferencias del Pomodoro (JSON) |
| `semestres` | Semestres de cada usuario; solo uno está `activo` |
| `materias` | Materias de un semestre: profesor, créditos, color, ausencias permitidas y `nota_final` (récord) |
| `clases` | Horario: día (0 = domingo … 6 = sábado), hora, duración y aula |
| `tareas` | Tareas y exámenes (`tipo`), prioridad, `recurrencia` y fecha de completado |
| `subtareas` | Pasos de una tarea |
| `anotaciones` | Notas o apuntes |
| `evaluaciones` | Calificaciones por materia: peso (%), nota y nota máxima |
| `asistencias` | Una marca por clase y fecha: presente, tarde, ausente o justificada |
| `sesiones_estudio` | Bloques de estudio registrados por el Pomodoro |
| `flashcards` | Tarjetas de repaso con su estado SM-2 (repeticiones, intervalo, facilidad, próxima fecha) |
| `archivos` | Metadatos de archivos subidos (el contenido está en `storage/uploads/{usuario}/{nombre aleatorio}`) |
| `grupos` / `grupo_miembros` / `grupo_publicaciones` | Grupos de estudio, sus miembros y lo que se comparte |
| `push_suscripciones` | Dispositivos suscritos a notificaciones |
| `notificaciones` | Recordatorios generados (cada uno se envía una sola vez) |
| `intentos_login` | Intentos fallidos de inicio de sesión, para limitar ataques de fuerza bruta |
| `chat_conversaciones` / `chat_mensajes` | Conversaciones con el asistente. Cada mensaje guarda los bloques exactamente como los devuelve la API (incluidos los de razonamiento y herramientas), porque el modelo exige recibir el historial sin cambios |
| `chat_archivos` | Relación entre un archivo tuyo y su copia en la Files API de Anthropic (`file_id`), para no volver a subirlo |

**Cómo se calcula la nota de una materia:**
- Si tiene `nota_final` (récord), esa es la nota.
- Si no, se usan las evaluaciones: acumulado = Σ (nota / nota máx × peso). El promedio se calcula sobre el peso ya evaluado y sirve de proyección hasta que el curso está evaluado al 100 %.
- Índice = Σ (puntos de la letra × créditos) / Σ créditos.

> En la instalación actual, las tablas de la versión anterior se renombraron a `antigua_materias`, `antigua_clases`, `antigua_tareas` y `antigua_anotaciones`. Conservan sus datos por si hacen falta y la app no las usa.

---

## API REST

**URL base:** `api/index.php/<recurso>[/<id>[/<acción>]]`, por ejemplo `api/index.php/tareas/15/toggle`.

**Convenciones:**
- Se envía y se recibe JSON. La subida de archivos usa `multipart/form-data`.
- **Sesión:** la cookie `edugestor` es `HttpOnly` y `SameSite=Lax`. Si la sesión no existe o expiró, la API responde `401`.
- **CSRF:** toda petición que no sea GET debe llevar la cabecera `X-CSRF-Token`, cuyo valor devuelve `GET /sesion`. Si falta o no es válido, la respuesta es `403` con `{"csrf": true}` y el frontend renueva el token automáticamente.
- **Errores:** `{"error": "mensaje para el usuario", "campo": "nombre_del_campo"}`. `422` indica una validación, `404` algo que no existe o no es tuyo, `409` un duplicado, `413` un archivo grande y `429` demasiados intentos.
- Cada consulta comprueba que el registro pertenezca al usuario de la sesión.

| Recurso | Endpoints |
|---|---|
| Sesión | `GET sesion` · `POST registro` · `POST login` · `POST logout` · `PATCH perfil` (nombre, carrera, escala, pomodoro) · `POST perfil/password` |
| Estado y datos | `GET estado` · `GET exportar` · `POST importar` (`modo`: `reemplazar` o `agregar`) · `POST borrar` (vacía el semestre activo) |
| Semestres | `POST semestres` (con `pasado: true` y `materias` para el récord) · `PATCH semestres/{id}` · `POST semestres/{id}/activar` · `POST semestres/{id}/record` · `DELETE semestres/{id}` |
| Materias, clases, notas | `POST materias` · `PATCH materias/{id}` · `DELETE materias/{id}` (igual para `clases` y `anotaciones`) |
| Tareas | `POST tareas` · `PATCH tareas/{id}` · `DELETE tareas/{id}` · `POST tareas/{id}/toggle` (crea la siguiente si es recurrente) · `POST tareas/{id}/plan-repaso` · `PATCH`/`DELETE subtareas/{id}` |
| Calificaciones | `POST evaluaciones` · `PATCH evaluaciones/{id}` · `DELETE evaluaciones/{id}` (los pesos de una materia no pueden pasar de 100 %) |
| Asistencia | `POST asistencias` (crea o actualiza la marca de una clase y fecha) · `DELETE asistencias/{id}` |
| Estudio | `POST sesiones` · `DELETE sesiones/{id}` · `POST flashcards` (una o un lote) · `PATCH`/`DELETE flashcards/{id}` · `POST flashcards/{id}/repasar` (`calidad` 0–5) |
| Archivos | `POST archivos` (multipart: `archivo`, `materiaId`, `categoria`, `tareaId`) · `GET archivos/{id}` (descarga; `?ver=1` para abrir en el navegador) · `PATCH archivos/{id}` · `DELETE archivos/{id}` |
| Grupos | `GET grupos` · `POST grupos` · `POST grupos/unirse` · `PATCH`/`DELETE grupos/{id}` · `POST grupos/{id}/publicaciones` · `POST grupos/{id}/salir` · `POST grupos/{id}/codigo` · `GET publicaciones/{id}/archivo` · `POST publicaciones/{id}/copiar` · `DELETE publicaciones/{id}` |
| Notificaciones | `POST push/suscribir` · `POST push/desuscribir` · `POST push/prueba` · `GET notificaciones` (las pide el service worker) |
| Chat (IA) | `GET chat` · `POST chat` · `GET chat/{id}` · `PATCH chat/{id}` · `DELETE chat/{id}` · `POST chat/{id}/enviar` (responde en streaming `text/event-stream`) · `POST chat/{id}/propuestas` (`mensajeId`, `indice`, `accion`: `aceptar` o `descartar`) |

Los nombres de campo de la API usan camelCase (`materiaId`, `notaFinal`) y en la base de datos snake_case (`materia_id`, `nota_final`). Las funciones `s_*()` de `api/bootstrap.php` hacen la conversión.

---

## Frontend

- **Sin frameworks ni compilación:** módulos ES nativos que carga el navegador. `js/main.js` es la entrada.
- **Render por cadenas:** cada vista exporta `render()`, que devuelve HTML. Todo texto del usuario pasa por `esc()` para evitar inyección de HTML (XSS).
- **Delegación de eventos:** los elementos llevan `data-action="nombre"` y las acciones se registran con `accion({ nombre: fn })` en `js/acciones.js`. No hay listeners sueltos por elemento.
- **Re-render parcial:** las búsquedas usan `data-bind` y solo vuelven a pintar su lista, para no perder el foco del cuadro de texto.
- **Rutas por hash** (`#/tareas`, `#/materias/12`), de modo que el botón Atrás del navegador funciona.

**Interfaz de una vista** (`js/vistas/*.js`):

```js
export default {
    titulo: 'Tareas',
    render() { return '<section>…</section>'; },  // obligatorio
    alMontar(contenedor) {},   // una sola vez (listeners propios, p. ej. arrastrar y soltar)
    alEntrar() {},             // cada vez que se navega a la vista (p. ej. cargar grupos)
    alRenderizar() {},         // después de cada render
    live() {},                 // cada 30 s (cuenta regresiva, línea de "ahora")
    parcial: { busqueda: () => ['#lista', () => '…'] },  // re-render parcial por data-bind
};
```

**Para agregar una sección nueva:**
1. Crea `js/vistas/mi-vista.js` con la interfaz anterior.
2. Añádela a `RUTAS` en `js/rutas.js` (título, icono y grupo de la barra lateral).
3. Impórtala en `VISTAS` dentro de `js/main.js`.
4. Agrega el archivo a la lista `SHELL` de `sw.js` y sube la versión de `VERSION`, para que funcione sin conexión.

> **Al publicar cambios en JS o CSS**, sube `VERSION` en `sw.js` (por ejemplo `edugestor-v4`). Si no, los navegadores que ya abrieron la app pueden seguir usando la versión guardada en caché.

---

## Seguridad

- **Contraseñas** con `password_hash` (bcrypt) y rehash automático; mínimo 8 caracteres.
- **Sesiones:** cookie `HttpOnly` y `SameSite=Lax` (`Secure` con HTTPS), modo estricto e ID regenerado al iniciar sesión.
- **CSRF:** token por sesión, obligatorio en toda escritura.
- **Fuerza bruta:** máximo 10 intentos fallidos de inicio de sesión cada 15 minutos por IP.
- **SQL:** todas las consultas son preparadas (PDO sin emulación). No hay SQL armado con datos del usuario.
- **Aislamiento entre usuarios:** cada lectura y escritura comprueba el dueño del registro; los grupos comprueban la membresía.
- **Archivos subidos:**
  - lista blanca de extensiones y tipo MIME detectado con `finfo`;
  - límite de tamaño y cuota por usuario;
  - se guardan con nombre aleatorio y sin extensión en `storage/`, que no es accesible desde la web;
  - solo se sirven a través de la API, con control de acceso, `nosniff` y una CSP restrictiva;
  - los tipos que podrían ejecutar código en el navegador (HTML, SVG, PHP…) siempre se **descargan**, nunca se muestran en la app.
- **Usuario de base de datos dedicado**, con permisos solo sobre su base. La contraseña de `root` no se guarda en ningún archivo.
- **Secretos fuera de git** (`config.local.php`, `vendor/`, `storage/`), y Apache bloquea el acceso a `config*.php`, los `.md` y las carpetas internas.
- **IA:** la clave vive solo en el servidor. Hay un límite de 60 mensajes por hora y usuario. El asistente solo lee datos del propio usuario y no puede crear ni modificar nada sin que el estudiante confirme. El contenido de notas, archivos y resultados de herramientas se le presenta como datos, no como instrucciones.

---

## Notificaciones push y recordatorios

La app avisa:
- 15 minutos antes de cada clase;
- la noche anterior a tus entregas (desde las 7 p. m.);
- 3 días y 1 día antes de cada examen;
- cuando tienes 5 o más tarjetas para repasar (desde las 8 a. m.).

**Cómo funciona:**
1. En **Ajustes → Notificaciones** el navegador se suscribe con la clave pública VAPID y la suscripción se guarda en `push_suscripciones`.
2. `cron/recordatorios.php` revisa qué toca avisar, crea la notificación (una sola vez gracias a una clave única) y envía un aviso push **sin contenido**, firmado con VAPID (ES256).
3. Al recibirlo, el service worker pide `GET notificaciones` con la sesión del usuario y muestra el texto. Así no hace falta cifrar el contenido ni instalar librerías.
4. Las suscripciones caducadas (404/410) se eliminan solas.

**Programar el cron en Windows** (una vez, en una consola como administrador):

```bat
schtasks /create /sc minute /mo 1 /tn "EduGestor recordatorios" /tr "C:\xampp\php\php.exe C:\xampp\htdocs\app-planificador-uni\cron\recordatorios.php"
```

Para probarlo a mano: `C:\xampp\php\php.exe cron\recordatorios.php`.

**Limitaciones:**
- Web Push requiere `localhost` o **HTTPS**; desde otro dispositivo de la red local sin HTTPS no funciona.
- El servidor necesita salida a internet.
- Mientras la app está abierta, los avisos de clase también salen dentro de la propia app, aunque no haya cron.

---

## Asistente con IA

Usa el **SDK oficial de Anthropic para PHP** (`anthropic-ai/sdk`) con el modelo `claude-opus-5-5`.

**Para activarlo:**
1. `composer install`, si no lo hiciste.
2. Crea una clave en [console.anthropic.com](https://console.anthropic.com) → **API Keys**.
3. Pégala en `config.local.php`:
   ```php
   'ia' => array ( 'api_key' => 'sk-ant-...' ),
   ```
4. Recarga la app.

Se usa desde **Asistente IA** en el menú. Es un chat al estilo de Claude:

- **Conversaciones guardadas** en tu cuenta, con título automático, para retomarlas desde cualquier dispositivo.
- **Respuesta en streaming:** el texto aparece mientras se escribe y se ve en vivo qué datos está consultando ("Consultó tus tareas…"). El botón de pausa detiene la respuesta.
- **Adjuntos:** con el clip eliges PDF o imágenes de tus materias (máx. 5 por mensaje). Se suben una sola vez a la Files API de Anthropic y se reutilizan.
- **Sugerencias** para empezar, y accesos directos desde cada nota (botón **IA**) y desde cada materia (**Plan con IA**).

**Herramientas del asistente** (las ejecuta el servidor con los datos del usuario):

| Para consultar | Para proponer (requieren confirmación) |
|---|---|
| `ver_materias`, `ver_horario`, `ver_tareas`, `ver_calificaciones`, `ver_record_academico`, `buscar_notas`, `ver_archivos`, `ver_estudio` | `proponer_tareas` (con subtareas), `proponer_tarjetas`, `proponer_nota` |

Las propuestas aparecen como tarjetas con los botones **Crear** y **Descartar**: nada se guarda hasta que pulsas Crear, y cada propuesta solo se puede crear una vez.

**Detalles técnicos** (`api/rutas/chat.php`):
- **Bucle de herramientas manual** con `createStream` del SDK y `MessageAccumulator`; el texto se reenvía al navegador como Server-Sent Events. El frontend lo lee con `fetch` porque `EventSource` no admite POST.
- **Historial sin cambios:** cada respuesta del modelo se guarda junto con los resultados de sus herramientas, así el historial siempre es válido aunque se detenga una respuesta.
- **Caché del prompt:** el prompt del sistema y el historial llevan `cache_control`, así que en una conversación larga cada mensaje nuevo cuesta mucho menos. La fecha y hora van en cada mensaje del estudiante, no en el prompt del sistema, para no romper la caché.
- **Respaldo ante rechazos:** `fallbacks: 'default'` del servidor de Anthropic.
- **Límites:** 8 llamadas al modelo por mensaje, 60 mensajes por hora y unas 400 entradas por conversación (después hay que empezar otra).
- **Coste:** la API cobra por uso. Adjuntar PDF largos y las conversaciones largas consumen más. La profundidad de razonamiento se controla con `ia.esfuerzo` (`low`, `medium` o `high`).
- **Streaming en Apache:** funciona porque XAMPP no carga `mod_deflate`. Si activas la compresión, excluye `text/event-stream`.

---

## Diseño y accesibilidad

- **Sistema de diseño** basado en tokens CSS (`:root` en `styles.css`): escala tipográfica 1,25, espaciado en múltiplos de 4 px, un único color de acento (verde agua) reservado para lo que se puede tocar y tres niveles de tinta.
- **Paleta fresca y serena:** fondos neutros fríos con verde agua, salvia y azul cielo, en tema claro y oscuro (cada tema con sus propios valores, no una inversión automática).
- **Colores de materia:** paleta categórica de 8 tonos **validada** para daltonismo (protanopia, deuteranopia, tritanopia) y visión normal en ambos temas. El color nunca va solo: siempre acompaña al nombre de la materia. Las claves (`sky`, `ember`, `teal`…) están guardadas en la base de datos y no deben renombrarse.
- **Gráficos** en SVG: una sola serie con el color de acento, escala secuencial de un solo tono en el mapa de calor, tooltips en cada marca y una vista de tabla para lectores de pantalla.
- **Accesibilidad:**
  - enlace para saltar al contenido y foco siempre visible;
  - diálogos nativos (`<dialog>`) con retorno del foco;
  - etiquetas ARIA en controles de icono y navegación completa por teclado;
  - contraste AA y respeto de `prefers-reduced-motion`.
- **Responsive:** barra lateral en escritorio y barra inferior con botón "+" en móvil, sin scroll horizontal.

---

## Cómo se probó

Las pruebas se ejecutaron durante el desarrollo y **no forman parte del repositorio** (no hay una suite automática instalada en el proyecto):

- **API (61 comprobaciones)**, contra Apache con MySQL y contra el servidor integrado de PHP con SQLite:
  - registro y sesión, CSRF y validaciones;
  - aislamiento entre usuarios;
  - subtareas, recurrencia y plan de repaso;
  - pesos de evaluaciones, asistencia y SM-2;
  - subida segura de archivos y grupos;
  - importación del formato antiguo, semestres y respaldo con restauración.
- **Navegador (Playwright con Edge)**, en escritorio claro y oscuro y en móvil: registro, datos de ejemplo, todas las vistas, subida de archivos, Pomodoro, repaso, grupos, búsqueda global y récord académico, sin errores de consola ni scroll horizontal.
- **Recordatorios:** generación única por clave, limpieza de suscripciones caducadas y verificación de la firma VAPID.
- **Asistente (chat), con la API real:** respuesta en streaming a través de Apache, consultas a los datos con herramientas (cálculo de la nota necesaria verificado), lectura de un PDF adjunto, propuesta de tareas y tarjetas creadas solo al confirmar (y una sola vez), conversación conservada al recargar, y vista móvil sin desbordes.

---

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "No se pudo conectar con el servidor" al abrir | Apache o MySQL apagados | Enciéndelos en el panel de XAMPP |
| `Access denied for user 'edugestor'` | Falta el usuario o la contraseña no coincide | Vuelve a ejecutar `db\instalar.php --admin-user=root` |
| El instalador dice "La tabla `x` es de una versión anterior" | Hay tablas viejas con el mismo nombre | Renómbralas (`RENAME TABLE x TO antigua_x`) y repite |
| "La sesión expiró…" | El token o la cookie caducaron | Recarga la página e inicia sesión |
| Un archivo no sube | Supera `uploads.max_bytes`, la cuota o los límites de PHP | Revisa `upload_max_filesize` y `post_max_size` en `php.ini` |
| "El asistente con IA no está activado" | `ia.api_key` vacía | Ver [Asistente con IA](#asistente-con-ia) |
| "La clave de la API de Anthropic no es válida" | Clave mal copiada o revocada | Copia la clave completa, sin espacios |
| "Falta instalar las dependencias (composer install)" | No existe `vendor/` | Ejecuta `composer install` |
| No llegan notificaciones con la app cerrada | El cron no está programado, falta permiso o no hay HTTPS | Programa el cron, revisa el permiso del sitio y usa `localhost` o HTTPS |
| Los cambios de JS o CSS no se ven | El service worker sirve la versión en caché | Sube `VERSION` en `sw.js` o recarga dos veces |
