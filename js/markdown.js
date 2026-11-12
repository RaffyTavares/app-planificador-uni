/*
 * Markdown mínimo y seguro para las respuestas del asistente.
 * Todo el texto se escapa primero; luego solo se añaden etiquetas conocidas.
 * Soporta: títulos, párrafos, listas (con y sin número), tablas, citas,
 * bloques de código, línea horizontal, **negrita**, *cursiva*, `código` y enlaces http(s).
 */
import { esc } from './util.js';

function enLinea(t) {
    return t
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

const esFilaTabla = (l) => /^\s*\|.*\|\s*$/.test(l);
const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function markdown(fuente) {
    const lineas = esc(String(fuente ?? '')).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let parrafo = [];
    const cerrarParrafo = () => {
        if (parrafo.length) out.push(`<p>${enLinea(parrafo.join('<br>'))}</p>`);
        parrafo = [];
    };

    while (i < lineas.length) {
        const l = lineas[i];

        // Bloque de código
        if (/^\s*```/.test(l)) {
            cerrarParrafo();
            const cod = [];
            i++;
            while (i < lineas.length && !/^\s*```/.test(lineas[i])) cod.push(lineas[i++]);
            i++;
            out.push(`<pre><code>${cod.join('\n')}</code></pre>`);
            continue;
        }
        // Tabla (fila de encabezado + separador)
        if (esFilaTabla(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
            cerrarParrafo();
            const cab = celdas(l);
            i += 2;
            const filas = [];
            while (i < lineas.length && esFilaTabla(lineas[i])) filas.push(celdas(lineas[i++]));
            out.push(`<div class="md-table"><table><thead><tr>${cab.map(c => `<th>${enLinea(c)}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${enLinea(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
            continue;
        }
        // Títulos
        const h = l.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
            cerrarParrafo();
            const n = Math.min(4, h[1].length + 2); // # → h3, ## → h4…
            out.push(`<h${n}>${enLinea(h[2])}</h${n}>`);
            i++;
            continue;
        }
        // Línea horizontal
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { cerrarParrafo(); out.push('<hr>'); i++; continue; }
        // Cita
        if (/^\s*&gt;\s?/.test(l)) {
            cerrarParrafo();
            const cita = [];
            while (i < lineas.length && /^\s*&gt;\s?/.test(lineas[i])) cita.push(lineas[i++].replace(/^\s*&gt;\s?/, ''));
            out.push(`<blockquote>${enLinea(cita.join('<br>'))}</blockquote>`);
            continue;
        }
        // Listas
        const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
        if (ul.test(l) || ol.test(l)) {
            cerrarParrafo();
            const ordenada = ol.test(l);
            const patron = ordenada ? ol : ul;
            const items = [];
            while (i < lineas.length && (patron.test(lineas[i]) || (/^\s{2,}\S/.test(lineas[i]) && items.length))) {
                if (patron.test(lineas[i])) items.push(lineas[i].replace(patron, ''));
                else items[items.length - 1] += '<br>' + lineas[i].trim();
                i++;
            }
            const tag = ordenada ? 'ol' : 'ul';
            out.push(`<${tag}>${items.map(it => `<li>${enLinea(it)}</li>`).join('')}</${tag}>`);
            continue;
        }
        if (!l.trim()) { cerrarParrafo(); i++; continue; }
        parrafo.push(l);
        i++;
    }
    cerrarParrafo();
    return out.join('');
}
