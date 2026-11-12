/*
 * Registro de acciones para la delegación de eventos.
 * Cualquier elemento con data-action="nombre" ejecuta la acción registrada.
 */
const registro = new Map();

/** Registra una o varias acciones: accion({ nombre: (el, evento) => {} }) */
export function accion(mapa) {
    Object.entries(mapa).forEach(([k, fn]) => registro.set(k, fn));
}

export function ejecutar(nombre, el, evento) {
    const fn = registro.get(nombre);
    if (!fn) return false;
    fn(el, evento);
    return true;
}

/** id numérico del atributo data-id (o null). */
export const idDe = (el, attr = 'id') => (el.dataset[attr] != null && el.dataset[attr] !== '' ? Number(el.dataset[attr]) : null);
