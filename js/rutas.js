/* Rutas de la app (metadatos para navegación, paleta y títulos). */
export const RUTAS = {
    inicio: { titulo: 'Inicio', icono: 'home', grupo: 'Planificar' },
    calendario: { titulo: 'Calendario', icono: 'month', grupo: 'Planificar' },
    horario: { titulo: 'Horario', icono: 'calendar', grupo: 'Planificar' },
    tareas: { titulo: 'Tareas', icono: 'tasks', grupo: 'Planificar' },
    materias: { titulo: 'Materias', icono: 'book', grupo: 'Académico' },
    calificaciones: { titulo: 'Calificaciones', icono: 'award', grupo: 'Académico' },
    notas: { titulo: 'Notas', icono: 'note', grupo: 'Académico' },
    enfoque: { titulo: 'Enfoque', icono: 'timer', grupo: 'Estudiar' },
    repaso: { titulo: 'Repaso', icono: 'layers', grupo: 'Estudiar' },
    asistente: { titulo: 'Asistente IA', icono: 'sparkles', grupo: 'Estudiar' }, // chat
    grupos: { titulo: 'Grupos', icono: 'users', grupo: 'Comunidad' },
    historial: { titulo: 'Historial', icono: 'history', grupo: 'Comunidad' },
    ajustes: { titulo: 'Ajustes', icono: 'settings', grupo: 'Cuenta', oculta: false },
};

/** Rutas que aparecen en la barra inferior móvil (el resto va en "Más"). */
export const RUTAS_MOVIL = ['inicio', 'calendario', 'tareas'];

export function rutaActual() {
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const [r, param] = h.split('/');
    if (RUTAS[r]) return { ruta: r, param: param || null };
    const alias = { dashboard: 'inicio', anotaciones: 'notas' };
    return { ruta: alias[r] || 'inicio', param: null };
}
