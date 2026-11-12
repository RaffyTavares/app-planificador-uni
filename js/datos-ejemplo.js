/* =====================================================================
   DATOS DE EJEMPLO — Semestre ficticio en la UNAD
   (Universidad Adventista Dominicana, Villa Sonador, Bonao)
   ---------------------------------------------------------------------
   · Carrera de ejemplo: Ingeniería de Sistemas, tercer año.
   · Profesores, aulas, horarios y notas son FICTICIOS.
   · Respeta el sábado: sin clases el viernes por la tarde ni el sábado,
     y ninguna entrega cae en sábado. Hay una clase dominical.
   · Las fechas se calculan desde el día de carga.
   · Se envía al endpoint /importar, que asigna los ids reales.
   ===================================================================== */
export function construirDemo(today = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const dia = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // Las entregas nunca caen en sábado (día de reposo): se mueven al viernes
    const iso = (offset) => {
        let d = dia(offset);
        if (d.getDay() === 6) d = dia(offset - 1);
        return isoDe(d);
    };

    let seq = 1;
    const id = () => seq++;

    /* ---------- Materias ---------- */
    const M = {
        poo: { id: id(), nombre: 'Programación Orientada a Objetos', profesor: 'Ing. Samuel Rosario', creditos: 4, color: 'teal', maxAusencias: 4 },
        bd: { id: id(), nombre: 'Base de Datos I', profesor: 'Ing. Rebeca Almonte', creditos: 4, color: 'sky', maxAusencias: 4 },
        calc: { id: id(), nombre: 'Cálculo Integral', profesor: 'Lic. Daniel Peña', creditos: 4, color: 'violet', maxAusencias: 3 },
        ing: { id: id(), nombre: 'Inglés Técnico II', profesor: 'Lic. Sarah Thompson', creditos: 2, color: 'amber', maxAusencias: 3 },
        rel: { id: id(), nombre: 'Doctrinas Bíblicas', profesor: 'Pr. Josué Marte', creditos: 3, color: 'green', maxAusencias: 3 },
        etica: { id: id(), nombre: 'Ética Profesional Cristiana', profesor: 'Dra. Miriam Castillo', creditos: 2, color: 'pink', maxAusencias: 2 },
    };
    const materias = Object.values(M);

    /* ---------- Clases ---------- */
    const clase = (m, d, hora, duracion, aula) => ({ id: id(), materiaId: m.id, dia: d, hora, duracion, aula });
    const clases = [
        clase(M.poo, 'Lunes', '08:00', 120, 'Laboratorio de Informática 2'),
        clase(M.calc, 'Lunes', '14:00', 90, 'Edificio de Ingeniería · Aula 105'),
        clase(M.bd, 'Martes', '10:00', 90, 'Edificio de Ingeniería · Aula 204'),
        clase(M.ing, 'Martes', '16:00', 60, 'Centro de Idiomas · Aula 3'),
        clase(M.poo, 'Miércoles', '08:00', 120, 'Laboratorio de Informática 2'),
        clase(M.rel, 'Miércoles', '14:00', 90, 'Edificio de Teología · Aula 1'),
        clase(M.bd, 'Jueves', '10:00', 90, 'Laboratorio de Informática 1'),
        clase(M.calc, 'Jueves', '14:00', 90, 'Edificio de Ingeniería · Aula 105'),
        clase(M.ing, 'Viernes', '08:00', 60, 'Centro de Idiomas · Aula 3'),
        clase(M.etica, 'Domingo', '09:00', 120, 'Edificio Administrativo · Aula 12'),
    ];

    /* ---------- Tareas y exámenes ---------- */
    const tarea = (m, descripcion, offset, prioridad, extra = {}) => ({
        id: id(), descripcion, materiaId: m ? m.id : null, fecha: iso(offset), prioridad, completada: false, ...extra,
    });
    const tareas = [
        tarea(M.calc, 'Ejercicios de integración por partes (guía 4)', 0, 'alta', { subtareas: [{ texto: 'Ejercicios 1 al 10', hecha: true }, { texto: 'Ejercicios 11 al 20' }, { texto: 'Revisar con el grupo de estudio' }] }),
        tarea(M.bd, 'Modelo entidad-relación del caso "Clínica Villa Sonador"', 2, 'alta', { subtareas: [{ texto: 'Identificar entidades', hecha: true }, { texto: 'Definir relaciones y cardinalidad' }, { texto: 'Pasar el diagrama a draw.io' }] }),
        tarea(M.poo, 'Proyecto: sistema de biblioteca en Java — entrega 1', 4, 'alta', { subtareas: [{ texto: 'Diagrama de clases', hecha: true }, { texto: 'Clases Libro y Usuario', hecha: true }, { texto: 'Herencia: Bibliotecario' }, { texto: 'Interfaz Prestable' }, { texto: 'Pruebas unitarias' }] }),
        tarea(M.ing, 'Presentation: "My dream software project" (5 min)', 6, 'media'),
        tarea(null, 'Entregar reporte de horas de labor estudiantil', 5, 'media', { recurrencia: 'mensual' }),
        tarea(M.rel, 'Lectura: capítulos 4 al 6 del libro de texto', 3, 'baja'),
        tarea(M.bd, 'Práctica de normalización hasta 3FN', 8, 'media'),
        tarea(M.calc, 'Segundo parcial: integrales definidas', 11, 'alta', { tipo: 'examen' }),
        tarea(M.bd, 'Examen práctico de SQL', 15, 'alta', { tipo: 'examen' }),
        tarea(M.etica, 'Ensayo: ética y responsabilidad en la inteligencia artificial', 13, 'media'),
        tarea(null, 'Pasar por Caja a saldar la cuota del semestre', 9, 'alta'),
        tarea(M.ing, 'Vocabulary list', -2, 'media', { recurrencia: 'semanal' }),
        tarea(M.poo, 'Taller de polimorfismo e interfaces', -1, 'media', { completada: true }),
        tarea(M.calc, 'Quiz de sustitución trigonométrica', -4, 'alta', { completada: true, tipo: 'examen' }),
        tarea(M.bd, 'Instalar MySQL Workbench y crear la base "universidad"', -6, 'baja', { completada: true }),
        tarea(M.rel, 'Reflexión escrita sobre el sábado como día de reposo', -3, 'media', { completada: true }),
    ];

    /* ---------- Calificaciones (los pesos suman 100 por materia) ---------- */
    const ev = (m, nombre, peso, nota = null, offset = null) => ({ id: id(), materiaId: m.id, nombre, peso, nota, notaMax: 100, fecha: offset == null ? null : iso(offset) });
    const evaluaciones = [
        ev(M.poo, 'Primer parcial', 20, 88, -30), ev(M.poo, 'Talleres', 20, 95, -1), ev(M.poo, 'Proyecto final', 35), ev(M.poo, 'Examen final', 25),
        ev(M.bd, 'Primer parcial', 25, 91, -28), ev(M.bd, 'Prácticas de laboratorio', 25, 84, -6), ev(M.bd, 'Examen práctico de SQL', 20, null, 15), ev(M.bd, 'Examen final', 30),
        ev(M.calc, 'Primer parcial', 25, 72, -32), ev(M.calc, 'Quizzes', 15, 68, -4), ev(M.calc, 'Segundo parcial', 25, null, 11), ev(M.calc, 'Examen final', 35),
        ev(M.ing, 'Midterm', 30, 90, -25), ev(M.ing, 'Presentations', 30), ev(M.ing, 'Final exam', 40),
        ev(M.rel, 'Reflexiones', 30, 97, -3), ev(M.rel, 'Parcial', 30, 89, -21), ev(M.rel, 'Trabajo final', 40),
        ev(M.etica, 'Participación', 20, 100), ev(M.etica, 'Ensayo', 40), ev(M.etica, 'Examen final', 40),
    ];

    /* ---------- Asistencia de las últimas 5 semanas ---------- */
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const asistencias = [];
    const hoy0 = dia(0);
    clases.forEach((c, ci) => {
        const d = DIAS.indexOf(c.dia);
        let f = dia(-((today.getDay() - d + 7) % 7));
        if (isoDe(f) === isoDe(hoy0)) f = dia(-7);
        for (let semana = 0; semana < 5; semana++) {
            const patron = (ci * 7 + semana * 3) % 11;
            const estado = patron === 0 ? 'ausente' : patron === 5 ? 'tarde' : patron === 8 && ci === 2 ? 'justificada' : 'presente';
            asistencias.push({ claseId: c.id, fecha: isoDe(f), estado });
            f = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 7);
        }
    });

    /* ---------- Sesiones de estudio (últimas 3 semanas) ---------- */
    const sesiones = [];
    const rot = [M.poo, M.calc, M.bd, M.calc, M.ing, M.poo, M.rel, M.bd, M.etica];
    for (let i = 20; i >= 1; i--) {
        const d = dia(-i);
        if (d.getDay() === 6) continue; // sábado: día de reposo
        const n = (i * 5) % 4; // 0–3 sesiones al día
        for (let k = 0; k < n; k++) {
            const m = rot[(i + k) % rot.length];
            const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17 + k, (i * 7) % 50);
            sesiones.push({ materiaId: m.id, inicio: `${isoDe(ini)} ${pad(ini.getHours())}:${pad(ini.getMinutes())}:00`, minutos: k === 2 ? 50 : 25 });
        }
    }

    /* ---------- Notas ---------- */
    const creado = (offset) => `${isoDe(dia(offset))} 18:30:00`;
    const nota = (m, titulo, contenido, offset) => ({ id: id(), titulo, contenido, materiaId: m ? m.id : null, creadoEn: creado(offset) });
    const anotaciones = [
        nota(M.calc, 'Fórmulas de integración',
            '∫ u dv = uv − ∫ v du\n∫ eˣ dx = eˣ + C\n∫ 1/x dx = ln|x| + C\n∫ sen x dx = −cos x + C\n\nTruco LIATE para elegir u: Logarítmica, Inversa trigonométrica, Algebraica, Trigonométrica, Exponencial.', -5),
        nota(M.bd, 'Comandos SQL que más uso',
            '¿Qué hace SELECT? :: Consulta filas de una o varias tablas\n¿Qué hace un INNER JOIN? :: Devuelve solo las filas que coinciden en ambas tablas\n¿Qué es una clave foránea? :: Una columna que referencia la clave primaria de otra tabla\n\nRecordar: nunca un UPDATE sin WHERE.', -3),
        nota(M.poo, 'Ideas para el proyecto de biblioteca',
            'Clases: Libro, Usuario, Préstamo, Bibliotecario (hereda de Usuario).\nInterfaz Prestable con prestar() y devolver().\nPreguntar si se puede usar una base de datos o solo archivos.', -2),
        nota(null, 'Capilla y Semana de Oración',
            'La asistencia a capilla cuenta. Revisar en el portal las fechas de la Semana de Oración para no programar estudios de grupo esos días.', -1),
        nota(M.ing, 'Phrasal verbs de la unidad 5',
            'set up :: configurar\nlog in / log out :: iniciar / cerrar sesión\nback up :: respaldar\nfigure out :: resolver, entender\nrun into :: toparse con (un error)', 0),
    ];

    /* ---------- Tarjetas de repaso ---------- */
    const tj = (m, frente, reverso, proxima, repeticiones = 0, intervalo = 0) => ({ materiaId: m.id, frente, reverso, proxima: iso(proxima), repeticiones, intervalo, facilidad: 2.5 });
    const flashcards = [
        tj(M.calc, '∫ u dv', 'uv − ∫ v du (integración por partes)', 0),
        tj(M.calc, '∫ 1/x dx', 'ln|x| + C', 0, 2, 6),
        tj(M.calc, 'd/dx (sen x)', 'cos x', 3, 3, 15),
        tj(M.bd, '¿Qué es la 3FN?', 'Está en 2FN y ningún atributo no clave depende transitivamente de la clave', 0),
        tj(M.bd, '¿Qué es una clave primaria?', 'Atributo o conjunto que identifica de forma única cada fila', 0, 1, 1),
        tj(M.bd, 'INNER JOIN vs LEFT JOIN', 'INNER: solo coincidencias. LEFT: todas las filas de la izquierda aunque no coincidan', 2, 2, 6),
        tj(M.poo, '¿Qué es el polimorfismo?', 'Un mismo mensaje produce comportamientos distintos según el objeto que lo recibe', 0),
        tj(M.poo, 'Clase abstracta vs interfaz', 'La abstracta puede tener estado e implementación; la interfaz define un contrato', 1, 1, 1),
        tj(M.ing, 'back up', 'respaldar', 0),
        tj(M.ing, 'figure out', 'resolver, entender', 4, 2, 6),
    ];

    return { materias, clases, tareas, evaluaciones, asistencias, sesiones, anotaciones, flashcards };
}
