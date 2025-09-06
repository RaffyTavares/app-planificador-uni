document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const themeToggle = document.getElementById('themeToggle');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    const modal = document.getElementById('editModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    // Datos de la aplicación
    let materias = JSON.parse(localStorage.getItem('materias')) || [];
    let clases = JSON.parse(localStorage.getItem('clases')) || [];
    let tareas = JSON.parse(localStorage.getItem('tareas')) || [];
    let anotaciones = JSON.parse(localStorage.getItem('anotaciones')) || [];
    
    // Inicializar la aplicación
    function init() {
        updateMateriasSelects();
        renderMaterias();
        renderClases();
        renderTareas();
        renderAnotaciones();
        renderHistorialTareas(); // Renderizar historial de tareas
        renderHistorialClases(); // Renderizar historial de clases
        checkUpcomingClasses();
        checkUpcomingTareas();
        setInterval(checkUpcomingClasses, 60000);
        setInterval(checkUpcomingTareas, 60000);
    }
    
    // Cambiar entre modo claro y oscuro
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    });
    
    
    // Sistema de pestañas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(this.dataset.tab + 'Tab').classList.add('active');
        });
    });
    
    // --- AÑADE ESTE BLOQUE ---
    // Botón para sincronizar manualmente las clases
    document.getElementById('syncClassesBtn').addEventListener('click', function() {
        showNotification('Actualizando estado de las clases...');
        checkUpcomingClasses();
    });
    // --- FIN DEL BLOQUE AÑADIDO ---

    // Formulario de materias
    document.getElementById('materiaForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const nuevaMateria = {
            id: Date.now(),
            nombre: document.getElementById('materiaNombre').value,
            profesor: document.getElementById('materiaProfesor').value,
            creditos: document.getElementById('materiaCreditos').value
        };
        
        materias.push(nuevaMateria);
        guardarDatos();
        renderMaterias();
        updateMateriasSelects();
        
        this.reset();
        showNotification('Materia agregada correctamente');
    });
    
    // Formulario de clases
    document.getElementById('claseForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const materiaId = parseInt(document.getElementById('claseMateria').value);
        const materia = materias.find(m => m.id === materiaId);

        const nuevaClase = {
            id: Date.now(),
            materiaId: materiaId,
            materiaNombre: materia.nombre,
            dia: document.getElementById('claseDia').value,
            hora: document.getElementById('claseHora').value,
            duracion: document.getElementById('claseDuracion').value,
            aula: document.getElementById('claseAula').value
        };

        clases.push(nuevaClase);
        guardarDatos();
        renderClases();
        this.reset();
        showNotification('Clase agregada correctamente');
    });
    
    // Formulario de tareas
    document.getElementById('tareaForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const materiaId = document.getElementById('tareaMateria').value ? 
            parseInt(document.getElementById('tareaMateria').value) : null;
        const materiaNombre = materiaId ? 
            materias.find(m => m.id === materiaId).nombre : 'General';

        const nuevaTarea = {
            id: Date.now(),
            descripcion: document.getElementById('tareaDescripcion').value,
            materiaId: materiaId,
            materiaNombre: materiaNombre,
            fecha: document.getElementById('tareaFecha').value,
            prioridad: document.getElementById('tareaPrioridad').value,
            completada: false
        };

        tareas.push(nuevaTarea);
        guardarDatos();
        renderTareas();
        this.reset();
        showNotification('Tarea agregada correctamente');
    });
    
    // Formulario de anotaciones
    document.getElementById('anotacionForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const materiaId = document.getElementById('anotacionMateria').value ? 
            parseInt(document.getElementById('anotacionMateria').value) : null;
        
        const materiaNombre = materiaId ? 
            materias.find(m => m.id === materiaId).nombre : 'General';
        
        const nuevaAnotacion = {
            id: Date.now(),
            titulo: document.getElementById('anotacionTitulo').value,
            contenido: document.getElementById('anotacionContenido').value,
            materiaId: materiaId,
            materiaNombre: materiaNombre,
            fecha: new Date().toLocaleDateString()
        };
        
        anotaciones.push(nuevaAnotacion);
        guardarDatos();
        renderAnotaciones();
        
        this.reset();
        showNotification('Anotación guardada correctamente');
    });
    
    // Actualizar los selects de materias
    function updateMateriasSelects() {
        const selects = [
            document.getElementById('claseMateria'),
            document.getElementById('tareaMateria'),
            document.getElementById('anotacionMateria')
        ];
        
        selects.forEach(select => {
            // Guardar el valor actual
            const currentValue = select.value;
            
            // Limpiar opciones excepto la primera
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Agregar las materias
            materias.forEach(materia => {
                const option = document.createElement('option');
                option.value = materia.id;
                option.textContent = materia.nombre;
                select.appendChild(option);
            });
            
            // Restaurar el valor si existe
            if (currentValue) {
                select.value = currentValue;
            }
        });
    }
    
    // Renderizar lista de materias
    function renderMaterias() {
        const materiasList = document.getElementById('materiasList');
        materiasList.innerHTML = '';
        
        if (materias.length === 0) {
            materiasList.innerHTML = '<p>No hay materias registradas</p>';
            return;
        }
        
        materias.forEach(materia => {
            const materiaItem = document.createElement('div');
            materiaItem.className = 'materia-item';
            materiaItem.innerHTML = `
                <div class="item-content">
                    <div class="item-title">${materia.nombre}</div>
                    <div class="item-details">Profesor: ${materia.profesor || 'No especificado'} | Créditos: ${materia.creditos || 'N/A'}</div>
                </div>
                <div class="item-actions">
                    <button class="action-btn delete-btn" data-id="${materia.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            materiasList.appendChild(materiaItem);
        });
        
        // Agregar event listeners para los botones de eliminar
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                eliminarMateria(id);
            });
        });
    }
    
    // Renderizar lista de clases
    function renderClases() {
        const clasesList = document.getElementById('clasesList');
        clasesList.innerHTML = '';
        
        if (clases.length === 0) {
            clasesList.innerHTML = '<p>No hay clases registradas</p>';
            return;
        }
        
        // Ordenar clases por día y hora
        const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        clases.sort((a, b) => {
            const diaA = diasSemana.indexOf(a.dia);
            const diaB = diasSemana.indexOf(b.dia);
            
            if (diaA !== diaB) return diaA - diaB;
            return a.hora.localeCompare(b.hora);
        });
        
        clases.forEach(clase => {
            const claseItem = document.createElement('div');
            claseItem.className = 'clase-item';
            claseItem.innerHTML = `
                <div class="item-content">
                    <div class="item-title">${clase.materiaNombre} <span class="badge badge-primary">${clase.dia}</span></div>
                    <div class="item-details">Hora: ${formatTime(clase.hora)} | Duración: ${clase.duracion} min | Aula: ${clase.aula || 'No especificada'}</div>
                </div>
                <div class="item-actions">
                    <button class="action-btn edit-btn" data-id="${clase.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${clase.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            clasesList.appendChild(claseItem);
        });
        
        // Agregar event listeners para los botones de eliminar
        document.querySelectorAll('.clase-item .delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                eliminarClase(id);
            });
        });

        document.querySelectorAll('.clase-item .edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                editarClase(id);
            });
        });
    }
    
    // Renderizar lista de tareas
    function renderTareas() {
        const tareasList = document.getElementById('tareasList');
        tareasList.innerHTML = '';

        if (tareas.length === 0) {
            tareasList.innerHTML = '<p>No hay tareas registradas</p>';
            return;
        }

        // Ordenar tareas por fecha y prioridad
        tareas.sort((a, b) => {
            if (a.completada !== b.completada) return a.completada ? 1 : -1;

            const prioridadVal = { alta: 0, media: 1, baja: 2 };
            if (prioridadVal[a.prioridad] !== prioridadVal[b.prioridad]) {
                return prioridadVal[a.prioridad] - prioridadVal[b.prioridad];
            }

            return new Date(a.fecha) - new Date(b.fecha);
        });

        tareas.forEach(tarea => {
            const hoy = new Date();
            const fechaTarea = new Date(tarea.fecha);
            const diffTime = fechaTarea - hoy;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let diasRestantes = '';
            if (diffDays === 0) {
                diasRestantes = '<span class="badge badge-warning">Hoy</span>';
            } else if (diffDays === 1) {
                diasRestantes = '<span class="badge badge-warning">Mañana</span>';
            } else if (diffDays > 0) {
                diasRestantes = `<span class="badge">${diffDays} días</span>`;
            } else {
                diasRestantes = '<span class="badge">Vencida</span>';
            }

            const prioridadBadge = `<span class="badge badge-${tarea.prioridad === 'alta' ? 'warning' : tarea.prioridad === 'media' ? 'primary' : 'success'}">${tarea.prioridad}</span>`;

            const tareaItem = document.createElement('div');
            tareaItem.className = `tarea-item ${tarea.completada ? 'completada' : ''}`;
            tareaItem.innerHTML = `
                <div class="item-content">
                    <div class="item-title">
                        ${tarea.completada ? '<s>' : ''}${tarea.descripcion}${tarea.completada ? '</s>' : ''}
                        ${prioridadBadge}
                        ${diasRestantes}
                    </div>
                    <div class="item-details">
                        Materia: ${tarea.materiaNombre} | Entrega: ${formatDate(tarea.fecha)}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="action-btn toggle-btn" data-id="${tarea.id}">
                        <i class="fas fa-${tarea.completada ? 'undo' : 'check'}"></i>
                    </button>
                    <button class="action-btn edit-btn" data-id="${tarea.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${tarea.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            tareasList.appendChild(tareaItem);
        });
        
        // Agregar event listeners para los botones
        document.querySelectorAll('.tarea-item .toggle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                toggleTareaCompletada(id);
            });
        });
        
        document.querySelectorAll('.tarea-item .delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                eliminarTarea(id);
            });
        });

        document.querySelectorAll('.tarea-item .edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                editarTarea(id);
            });
        });
    }
    
    // Renderizar lista de anotaciones
    function renderAnotaciones() {
        const anotacionesList = document.getElementById('anotacionesList');
        anotacionesList.innerHTML = '';
        
        if (anotaciones.length === 0) {
            anotacionesList.innerHTML = '<p>No hay anotaciones registradas</p>';
            return;
        }
        
        anotaciones.forEach(anotacion => {
            const anotacionItem = document.createElement('div');
            anotacionItem.className = 'anotacion-item';
            anotacionItem.innerHTML = `
                <div class="item-content">
                    <div class="item-title">${anotacion.titulo} <span class="badge">${anotacion.materiaNombre}</span></div>
                    <div class="item-details">${anotacion.contenido}</div>
                    <div class="item-meta">Creada: ${anotacion.fecha}</div>
                </div>
                <div class="item-actions">
                    <button class="action-btn delete-btn" data-id="${anotacion.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            anotacionesList.appendChild(anotacionItem);
        });
        
        // Agregar event listeners para los botones de eliminar
        document.querySelectorAll('.anotacion-item .delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                eliminarAnotacion(id);
            });
        });
    }
    
    // Renderizar historial de tareas completadas
function renderHistorialTareas() {
    const historialTareasList = document.getElementById('historialTareasList');
    historialTareasList.innerHTML = '';

    const tareasCompletadas = tareas.filter(tarea => tarea.completada);

    if (tareasCompletadas.length === 0) {
        historialTareasList.innerHTML = '<p>No hay tareas completadas</p>';
        return;
    }

    tareasCompletadas.forEach(tarea => {
        const tareaItem = document.createElement('div');
        tareaItem.className = 'tarea-item completada';
        tareaItem.innerHTML = `
            <div class="item-content">
                <div class="item-title">${tarea.descripcion}</div>
                <div class="item-details">Materia: ${tarea.materiaNombre} | Entregada: ${formatDate(tarea.fecha)}</div>
            </div>
        `;
        historialTareasList.appendChild(tareaItem);
    });
}

// Renderizar historial de clases pasadas
function renderHistorialClases() {
    const historialClasesList = document.getElementById('historialClasesList');
    historialClasesList.innerHTML = '';

    const hoy = new Date();
    const clasesPasadas = clases.filter(clase => {
        const [hora, minuto] = clase.hora.split(':').map(Number);
        const horaClase = new Date();
        horaClase.setHours(hora, minuto, 0, 0);
        return clase.dia === diasSemana[hoy.getDay()] && horaClase < hoy;
    });

    if (clasesPasadas.length === 0) {
        historialClasesList.innerHTML = '<p>No hay clases pasadas</p>';
        return;
    }

    clasesPasadas.forEach(clase => {
        const claseItem = document.createElement('div');
        claseItem.className = 'clase-item pasada';
        claseItem.innerHTML = `
            <div class="item-content">
                <div class="item-title">${clase.materiaNombre}</div>
                <div class="item-details">Día: ${clase.dia} | Hora: ${formatTime(clase.hora)}</div>
            </div>
        `;
        historialClasesList.appendChild(claseItem);
    });
}

    // Comprobar clases próximas
    function checkUpcomingClasses() {
        const ahora = new Date();
        const diaActual = ahora.getDay();
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const diaActualNombre = diasSemana[diaActual];
        const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
        
        const proximasClasesContainer = document.getElementById('proximasClases');
        proximasClasesContainer.innerHTML = '';
        
        // --- CORRECCIÓN INICIA AQUÍ ---

        // 1. Primero, obtenemos TODAS las clases de hoy que no han terminado.
        const todasLasClasesDeHoy = clases.filter(clase => {
            if (clase.dia !== diaActualNombre) return false;
            const [hora, minuto] = clase.hora.split(':').map(Number);
            const horaClase = hora * 60 + minuto;
            // Devuelve la clase si aún no ha terminado
            return horaClase + parseInt(clase.duracion) > horaActual;
        });

        // 2. Ahora, iteramos sobre TODAS las clases de hoy para las notificaciones.
        todasLasClasesDeHoy.forEach(clase => {
            const [hora, minuto] = clase.hora.split(':').map(Number);
            const horaClase = hora * 60 + minuto;
            const diffMinutos = horaClase - horaActual;

            // Mostrar notificación si la clase comienza en el rango deseado (1-120 min)
            if (diffMinutos > 0 && diffMinutos <= 120) {
                showNotification(`La clase de ${clase.materiaNombre} comienza en ${diffMinutos} minutos`);
            }
        });

        // 3. Luego, creamos una lista más pequeña solo para MOSTRAR en la barra lateral.
        const clasesParaMostrar = todasLasClasesDeHoy.filter(clase => {
            const [hora, minuto] = clase.hora.split(':').map(Number);
            const horaClase = hora * 60 + minuto;
            // Mostrar clases que comienzan en los próximos 30 minutos o están en curso
            return horaClase - horaActual <= 30;
        });
        
        // Ordenar por hora
        clasesParaMostrar.sort((a, b) => {
            const [horaA, minutoA] = a.hora.split(':').map(Number);
            const [horaB, minutoB] = b.hora.split(':').map(Number);
            return (horaA * 60 + minutoA) - (horaB * 60 + minutoB);
        });
        
        if (clasesParaMostrar.length === 0) {
            proximasClasesContainer.innerHTML = '<p>No hay clases próximas</p>';
            return;
        }
        
        clasesParaMostrar.forEach(clase => {
            const [hora, minuto] = clase.hora.split(':').map(Number);
            const horaClase = hora * 60 + minuto;
            const diffMinutos = horaClase - horaActual;
            
            let mensaje = '';
            if (diffMinutos < 0) {
                // Corregido para mostrar el tiempo restante correctamente
                const tiempoRestante = parseInt(clase.duracion) + diffMinutos;
                mensaje = `En curso - Finaliza en ${tiempoRestante} min`;
            } else if (diffMinutos === 0) {
                mensaje = 'Comienza ahora';
            } else {
                mensaje = `Comienza en ${diffMinutos} min`;
            }
            
            const claseElement = document.createElement('div');
            claseElement.innerHTML = `
                <div><strong>${clase.materiaNombre}</strong></div>
                <div>${formatTime(clase.hora)} - ${mensaje}</div>
            `;
            
            proximasClasesContainer.appendChild(claseElement);
        });
    }
    
    // Verificar tareas próximas a vencer
function checkUpcomingTareas() {
    const hoy = new Date();
    const dosDiasDespues = new Date(hoy);
    dosDiasDespues.setDate(hoy.getDate() + 2);

    // Filtrar tareas próximas a vencer en los próximos dos días
    const tareasProximas = tareas.filter(tarea => {
        const fechaTarea = new Date(tarea.fecha);
        return fechaTarea >= hoy && fechaTarea <= dosDiasDespues && !tarea.completada;
    });

    // Actualizar el título de la pestaña "Ver Tareas"
    const tabVerTareas = document.querySelector('.tab[data-tab="ver-tareas"]');
    if (tareasProximas.length > 0) {
        tabVerTareas.innerHTML = `Ver Tareas <span class="badge badge-warning">${tareasProximas.length}</span>`;
    } else {
        tabVerTareas.innerHTML = 'Ver Tareas';
    }
}

// Eliminar una materia
    function eliminarMateria(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta materia? También se eliminarán sus clases, tareas y anotaciones relacionadas.')) {
            // Eliminar la materia
            materias = materias.filter(m => m.id !== id);
            
            // Eliminar clases relacionadas
            clases = clases.filter(c => c.materiaId !== id);
            
            // Eliminar tareas relacionadas
            tareas = tareas.filter(t => t.materiaId !== id);
            
            // Eliminar anotaciones relacionadas
            anotaciones = anotaciones.filter(a => a.materiaId !== id);
            
            guardarDatos();
            renderMaterias();
            renderClases();
            renderTareas();
            renderAnotaciones();
            updateMateriasSelects();
            
            showNotification('Materia eliminada correctamente');
        }
    }
    
    // Eliminar una clase
    function eliminarClase(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta clase?')) {
            clases = clases.filter(c => c.id !== id);
            guardarDatos();
            renderClases();
            showNotification('Clase eliminada correctamente');
        }
    }
    
    // Cambiar estado de tarea (completada/pendiente)
    function toggleTareaCompletada(id) {
        const tarea = tareas.find(t => t.id === id);
        if (tarea) {
            tarea.completada = !tarea.completada;
            guardarDatos();
            renderTareas();
            showNotification(`Tarea ${tarea.completada ? 'completada' : 'marcada como pendiente'}`);
        }
    }
    
    // Eliminar una tarea
    function eliminarTarea(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
            tareas = tareas.filter(t => t.id !== id);
            guardarDatos();
            renderTareas();
            showNotification('Tarea eliminada correctamente');
        }
    }
    
    // Eliminar una anotación
    function eliminarAnotacion(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta anotación?')) {
            anotaciones = anotaciones.filter(a => a.id !== id);
            guardarDatos();
            renderAnotaciones();
            showNotification('Anotación eliminada correctamente');
        }
    }
    
    // Guardar todos los datos en localStorage
    function guardarDatos() {
        localStorage.setItem('materias', JSON.stringify(materias));
        localStorage.setItem('clases', JSON.stringify(clases));
        localStorage.setItem('tareas', JSON.stringify(tareas));
        localStorage.setItem('anotaciones', JSON.stringify(anotaciones));
    }
    
    // Mostrar notificación
    function showNotification(mensaje) {
        notificationText.textContent = mensaje;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 7000); // <-- CAMBIADO DE 3000 A 7000
    }
    
    // Formatear hora (de HH:MM a HH:MM AM/PM)
    function formatTime(timeStr) {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHours = h % 12 || 12;
        return `${formattedHours}:${minutes} ${ampm}`;
    }
    
    // Formatear fecha (de YYYY-MM-DD a DD/MM/YYYY)
    function formatDate(dateStr) {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    // --- Lógica para cerrar el modal ---
    closeModalBtn.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', function(e) {
        if (e.target === modal) { // Cierra si se hace clic en el overlay
            modal.classList.remove('show');
        }
    });

    // --- REEMPLAZA TUS FUNCIONES DE EDICIÓN CON ESTAS ---

    function editarClase(id) {
        const clase = clases.find(c => c.id === id);
        if (!clase) return;

        modalTitle.textContent = 'Editar Clase';
        
        // Crear el formulario de edición para clases
        modalBody.innerHTML = `
            <form id="editClaseForm">
                <div class="form-group">
                    <label for="editClaseMateria">Materia</label>
                    <select id="editClaseMateria" required>${document.getElementById('claseMateria').innerHTML}</select>
                </div>
                <div class="form-group">
                    <label for="editClaseDia">Día</label>
                    <select id="editClaseDia" required>${document.getElementById('claseDia').innerHTML}</select>
                </div>
                <div class="form-group">
                    <label for="editClaseHora">Hora</label>
                    <input type="time" id="editClaseHora" required>
                </div>
                <div class="form-group">
                    <label for="editClaseDuracion">Duración (min)</label>
                    <input type="number" id="editClaseDuracion" min="1" required>
                </div>
                <div class="form-group">
                    <label for="editClaseAula">Aula</label>
                    <input type="text" id="editClaseAula">
                </div>
                <button type="submit" class="btn">Guardar Cambios</button>
            </form>
        `;

        // Rellenar los datos
        document.getElementById('editClaseMateria').value = clase.materiaId;
        document.getElementById('editClaseDia').value = clase.dia;
        document.getElementById('editClaseHora').value = clase.hora;
        document.getElementById('editClaseDuracion').value = clase.duracion;
        document.getElementById('editClaseAula').value = clase.aula;

        // Mostrar el modal
        modal.classList.add('show');

        // Manejar el guardado
        document.getElementById('editClaseForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const materiaId = parseInt(document.getElementById('editClaseMateria').value);
            clase.materiaId = materiaId;
            clase.materiaNombre = materias.find(m => m.id === materiaId).nombre;
            clase.dia = document.getElementById('editClaseDia').value;
            clase.hora = document.getElementById('editClaseHora').value;
            clase.duracion = document.getElementById('editClaseDuracion').value;
            clase.aula = document.getElementById('editClaseAula').value;

            guardarDatos();
            renderClases();
            modal.classList.remove('show');
            showNotification('Clase actualizada correctamente');
        });
    }

    function editarTarea(id) {
        const tarea = tareas.find(t => t.id === id);
        if (!tarea) return;

        modalTitle.textContent = 'Editar Tarea';
        
        // Crear el formulario de edición para tareas
        modalBody.innerHTML = `
            <form id="editTareaForm">
                <div class="form-group">
                    <label for="editTareaDescripcion">Descripción</label>
                    <input type="text" id="editTareaDescripcion" required>
                </div>
                <div class="form-group">
                    <label for="editTareaMateria">Materia</label>
                    <select id="editTareaMateria">${document.getElementById('tareaMateria').innerHTML}</select>
                </div>
                <div class="form-group">
                    <label for="editTareaFecha">Fecha de Entrega</label>
                    <input type="date" id="editTareaFecha" required>
                </div>
                <div class="form-group">
                    <label for="editTareaPrioridad">Prioridad</label>
                    <select id="editTareaPrioridad" required>${document.getElementById('tareaPrioridad').innerHTML}</select>
                </div>
                <button type="submit" class="btn">Guardar Cambios</button>
            </form>
        `;

        // Rellenar los datos
        document.getElementById('editTareaDescripcion').value = tarea.descripcion;
        document.getElementById('editTareaMateria').value = tarea.materiaId || '';
        document.getElementById('editTareaFecha').value = tarea.fecha;
        document.getElementById('editTareaPrioridad').value = tarea.prioridad;

        // Mostrar el modal
        modal.classList.add('show');

        // Manejar el guardado
        document.getElementById('editTareaForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const materiaId = document.getElementById('editTareaMateria').value ? parseInt(document.getElementById('editTareaMateria').value) : null;
            tarea.descripcion = document.getElementById('editTareaDescripcion').value;
            tarea.materiaId = materiaId;
            tarea.materiaNombre = materiaId ? materias.find(m => m.id === materiaId).nombre : 'General';
            tarea.fecha = document.getElementById('editTareaFecha').value;
            tarea.prioridad = document.getElementById('editTareaPrioridad').value;

            guardarDatos();
            renderTareas();
            modal.classList.remove('show');
            showNotification('Tarea actualizada correctamente');
        });
    }

    // Inicializar la aplicación
    init();
});