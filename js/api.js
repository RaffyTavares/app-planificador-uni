/*
 * Cliente de la API REST (api/index.php/...).
 * - Envía el token CSRF en cada escritura y lo renueva si caduca (419).
 * - Avisa a la app cuando la sesión expira (401) o no hay conexión.
 */

const BASE = new URL('api/index.php/', document.baseURI).href;
let csrf = '';
const oyentes = { sesion: [], conexion: [] };

export const setCsrf = (t) => { csrf = t || ''; };
export const on = (evento, fn) => oyentes[evento].push(fn);
const emitir = (evento, ...a) => oyentes[evento].forEach(fn => fn(...a));

export class ErrorApi extends Error {
    constructor(mensaje, estado = 0, datos = {}) {
        super(mensaje);
        this.estado = estado;
        this.datos = datos;
        this.campo = datos.campo || null;
    }
}

export const url = (ruta) => BASE + ruta.replace(/^\//, '');

async function pedir(metodo, ruta, cuerpo, { reintento = true, keepalive = false } = {}) {
    const opts = {
        method: metodo,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        keepalive,
    };
    if (metodo !== 'GET') opts.headers['X-CSRF-Token'] = csrf;
    if (cuerpo !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(cuerpo);
    }

    let resp;
    try {
        resp = await fetch(url(ruta), opts);
    } catch {
        emitir('conexion', false);
        throw new ErrorApi(navigator.onLine ? 'No se pudo conectar con el servidor.' : 'Sin conexión a internet. Los cambios no se guardaron.', 0);
    }
    emitir('conexion', true);

    let datos = {};
    const tipo = resp.headers.get('Content-Type') || '';
    if (tipo.includes('application/json')) {
        try { datos = await resp.json(); } catch { datos = {}; }
    }

    if (resp.status === 403 && datos.csrf && reintento) {
        await refrescarCsrf();
        return pedir(metodo, ruta, cuerpo, { reintento: false, keepalive });
    }
    if (resp.status === 401) emitir('sesion', null);
    if (!resp.ok) throw new ErrorApi(datos.error || `Error ${resp.status}`, resp.status, datos);
    return datos;
}

export async function refrescarCsrf() {
    const r = await fetch(url('sesion'), { credentials: 'same-origin' });
    const d = await r.json();
    setCsrf(d.csrf);
    return d;
}

export const api = {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
    patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
    del: (ruta, opts) => pedir('DELETE', ruta, undefined, opts),
};

/**
 * Sube un archivo con progreso (XMLHttpRequest permite medir la subida).
 * onProgreso recibe un valor entre 0 y 1. Devuelve una promesa y un abort().
 */
export function subir(campos, archivo, onProgreso = () => {}) {
    const xhr = new XMLHttpRequest();
    const promesa = new Promise((resolve, reject) => {
        const fd = new FormData();
        Object.entries(campos).forEach(([k, v]) => { if (v != null && v !== '') fd.append(k, v); });
        fd.append('archivo', archivo);
        xhr.open('POST', url('archivos'));
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-CSRF-Token', csrf);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgreso(e.loaded / e.total); };
        xhr.onload = () => {
            let datos = {};
            try { datos = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
            if (xhr.status === 401) emitir('sesion', null);
            if (xhr.status >= 200 && xhr.status < 300) resolve(datos);
            else if (xhr.status === 413 && !datos.error) reject(new ErrorApi('El archivo es demasiado grande para el servidor.', 413));
            else reject(new ErrorApi(datos.error || `Error ${xhr.status}`, xhr.status, datos));
        };
        xhr.onerror = () => reject(new ErrorApi('Se perdió la conexión durante la subida.', 0));
        xhr.onabort = () => reject(new ErrorApi('Subida cancelada.', -1));
        xhr.send(fd);
    });
    return { promesa, abortar: () => xhr.abort() };
}

/** URL para ver (en el navegador) o descargar un archivo. */
export const urlArchivo = (id, ver = false) => url(`archivos/${id}${ver ? '?ver=1' : ''}`);
export const urlArchivoGrupo = (pubId, ver = false) => url(`publicaciones/${pubId}/archivo${ver ? '?ver=1' : ''}`);

/**
 * Envía un mensaje al chat y procesa la respuesta en streaming (Server-Sent
 * Events sobre un POST, por eso no se usa EventSource).
 * onEvento(nombre, datos) recibe: texto, herramienta, propuesta, aviso, error, fin.
 */
export async function chatStream(conversacionId, cuerpo, onEvento, signal) {
    let resp;
    try {
        resp = await fetch(url(`chat/${conversacionId}/enviar`), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-CSRF-Token': csrf },
            body: JSON.stringify(cuerpo),
            signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        emitir('conexion', false);
        throw new ErrorApi('No se pudo conectar con el servidor.', 0);
    }
    if (!resp.ok || !(resp.headers.get('Content-Type') || '').includes('text/event-stream')) {
        let datos = {};
        try { datos = await resp.json(); } catch { /* sin cuerpo JSON */ }
        if (resp.status === 401) emitir('sesion', null);
        if (resp.status === 403 && datos.csrf) await refrescarCsrf();
        throw new ErrorApi(datos.error || `Error ${resp.status}`, resp.status, datos);
    }

    const lector = resp.body.getReader();
    const deco = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buffer += deco.decode(value, { stream: true });
        let corte;
        while ((corte = buffer.indexOf('\n\n')) >= 0) {
            const bloque = buffer.slice(0, corte);
            buffer = buffer.slice(corte + 2);
            let evento = 'message', data = '';
            for (const linea of bloque.split('\n')) {
                if (linea.startsWith('event: ')) evento = linea.slice(7);
                else if (linea.startsWith('data: ')) data += linea.slice(6);
            }
            if (!data) continue;
            try { onEvento(evento, JSON.parse(data)); } catch (e) { console.error(e); }
        }
    }
}
