// CineNow — modal compartido y tarjetas optimizadas

let modalOverlay, modalBody, modalClose;

// Convierte posters grandes de TMDB a un tamaño más ligero para la cuadrícula.
function posterLigero(url, fallback = 'https://via.placeholder.com/200x280/111/e50914?text=CineNow') {
  if (!url) return fallback;
  return String(url).replace('/w500/', '/w342/');
}

// Renderiza las tarjetas de películas en el contenedor
function renderCards(lista, contenedor) {
  contenedor.innerHTML = '';

  lista.forEach(p => {
    // Determinar texto y clase del estado dinámicamente
    const estadoTexto = p.estado === 'proximamente'
      ? 'PRÓXIMAMENTE'
      : 'EN CARTELERA';

    const estadoClase = p.estado === 'proximamente'
      ? 'proximo'
      : '';

    // Crear tarjeta
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img src="${posterLigero(p.img)}" 
           alt="${p.titulo}" 
           loading="lazy"
           onerror="this.src='https://via.placeholder.com/200x280/111/e50914?text=CineNow'">
      
      <span class="card-badge ${estadoClase}">
        ${estadoTexto}
      </span>

      <div class="card-body">
        <h3>${p.titulo}</h3>
        <p>${p.genero || ''} • ${p.clasificacion || ''}</p>
      </div>
    `;

    // Evento para abrir modal
    card.addEventListener('click', () => {
      if (typeof abrirModal === 'function') {
        abrirModal(p);
      }
    });

    contenedor.appendChild(card);
  });
}

// Abre el modal y carga reseñas solo cuando el usuario entra a la película.
async function abrirModal(p) {
  if (!modalOverlay) initModal();

  modalBody.innerHTML = `
    <h2>${p.titulo}</h2>
    <p style="color:#888;">Cargando información de la película...</p>`;
  modalOverlay.style.display = 'flex';

  const funciones = DB.getFuncionesPorPelicula(p.id);
  const rating = Number(p.ratingPromedio || DB.promedioRating(p.id) || 0);
  const ratingCount = Number(p.resenasCount || 0);
  const clsMap = { A: 'badge-a', B: 'badge-b', B15: 'badge-b15', C: 'badge-c' };
  const clsClass = clsMap[p.clasificacion] || '';

  let resenas = [];
  try {
    resenas = await DB.fetchResenasPorPelicula(p.id);
  } catch (_) {
    resenas = [];
  }

  // Si el modal se cerró antes de terminar de cargar, no pintamos nada.
  if (modalOverlay.style.display === 'none') return;

  let funcHTML = '<p class="no-resenas">No hay funciones disponibles actualmente.</p>';
  if (funciones.length) {
    funcHTML = `<table class="funciones-table">
      <thead><tr><th>Cine</th><th>Región</th><th>Horarios</th><th>Precio</th></tr></thead>
      <tbody>
        ${funciones.map(f => `<tr>
          <td>${f.cine?.nombre || 'N/A'}</td>
          <td>${f.cine?.region || ''}</td>
          <td>${(f.horarios || []).join(' · ')}</td>
          <td>$${Number(f.precio).toFixed(0)} MXN <span class="badge">informativo</span></td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  let resenasHTML = '';
  if (resenas.length) {
    resenasHTML = resenas.map(r => `
      <div class="resena-card">
        <div class="resena-header">
          <span class="resena-autor">${r.autor}</span>
          <span class="resena-fecha">${r.fecha} ${estrellas(r.rating)}</span>
        </div>
        <p class="resena-texto">${r.texto}</p>
        ${DB.isAdmin() ? `<button onclick="eliminarResena(${r.id},${p.id})" style="background:none;border:none;color:#e50914;font-size:.75em;cursor:pointer;margin-top:6px;">🗑 Eliminar</button>` : ''}
      </div>`).join('');
  } else {
    resenasHTML = '<p class="no-resenas">Sé el primero en dejar una reseña.</p>';
  }

  let formResena = '';
  if (DB.getSession() && !resenas.some(r => Number(r.userId) === Number(DB.getSession().id))) {
    formResena = `
      <div class="resena-form" id="resenaForm_${p.id}">
        <div class="estrellas-input" id="starsInput_${p.id}">
          ${[1,2,3,4,5].map(i => `<span data-val="${i}" onclick="setRating(${p.id},${i})">★</span>`).join('')}
        </div>
        <input type="hidden" id="ratingVal_${p.id}" value="0">
        <textarea id="resenaTexto_${p.id}" placeholder="Escribe tu reseña..."></textarea>
        <button class="btn-resena" onclick="enviarResena(${p.id})">Publicar reseña</button>
      </div>`;
  } else if (!DB.getSession()) {
    formResena = `<p style="color:#888;font-size:.85em;margin-top:8px;"><a href="login.html" style="color:#e50914;">Inicia sesión</a> para dejar una reseña.</p>`;
  }

  modalBody.innerHTML = `
    <img src="${p.img}" alt="${p.titulo}" loading="eager" decoding="async" onerror="this.src='https://via.placeholder.com/600x900/111/e50914?text=CineNow'">
    <h2>${p.titulo} ${p.clasificacion ? `<span class="badge ${clsClass}">${p.clasificacion}</span>` : ''}</h2>
    <div class="info-row"><span class="info-label">Género</span><span class="info-value">${p.genero || '—'}</span></div>
    <div class="info-row"><span class="info-label">Director</span><span class="info-value">${p.director || '—'}</span></div>
    <div class="info-row"><span class="info-label">Año</span><span class="info-value">${p.anio || '—'}</span></div>
    <div class="info-row"><span class="info-label">Duración</span><span class="info-value">${p.duracion || '—'}</span></div>
    <div class="info-row"><span class="info-label">Estado</span><span class="info-value">${p.estado === 'proximamente' ? 'Próximamente' : 'En cartelera'}</span></div>
    ${rating > 0 ? `<div class="info-row"><span class="info-label">Rating</span><span class="info-value">${estrellas(Math.round(rating))} ${rating.toFixed(1)}${ratingCount ? ` · ${ratingCount} reseñas` : ''}</span></div>` : ''}
    <p style="color:#ccc;line-height:1.6;">${p.descripcion || 'Sin descripción disponible.'}</p>
    ${p.trailer ? `<a href="${p.trailer}" target="_blank" class="btn-trailer">▶ Ver tráiler</a>` : ''}
    <div class="resenas-section">
      <h4>Funciones disponibles</h4>
      ${funcHTML}
    </div>
    <div class="resenas-section">
      <h4>Reseñas</h4>
      ${resenasHTML}
      ${formResena}
    </div>`;
}

function initModal() {
  modalOverlay = document.getElementById('modalOverlay');
  modalBody = document.getElementById('modalBody');
  modalClose = document.querySelector('.modal-close');
  if (!modalOverlay || !modalBody || !modalClose) return;
  modalClose.addEventListener('click', cerrarModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) cerrarModal();
  });
}

function cerrarModal() {
  if (!modalOverlay) initModal();
  if (modalOverlay) modalOverlay.style.display = 'none';
}

// Reseñas: selección y envío.
function setRating(peliculaId, value) {
  const input = document.getElementById(`ratingVal_${peliculaId}`);
  if (input) input.value = value;
  document.querySelectorAll(`#starsInput_${peliculaId} span`).forEach(s => {
    s.classList.toggle('activa', Number(s.dataset.val) <= Number(value));
  });
}

async function enviarResena(peliculaId) {
  const rating = Number(document.getElementById(`ratingVal_${peliculaId}`)?.value || 0);
  const texto = document.getElementById(`resenaTexto_${peliculaId}`)?.value.trim() || '';
  if (!rating || !texto) {
    toast('Selecciona una calificación y escribe tu reseña', 'error');
    return;
  }
  try {
    await DB.addResena({ peliculaId, rating, texto });
    toast('Reseña publicada');
    const pelicula = DB.getPelicula(peliculaId);
    if (pelicula) await abrirModal(pelicula);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function eliminarResena(id, peliculaId) {
  if (!confirm('¿Eliminar esta reseña?')) return;
  try {
    await DB.deleteResena(id);
    toast('Reseña eliminada');
    const pelicula = DB.getPelicula(peliculaId);
    if (pelicula) await abrirModal(pelicula);
  } catch (e) {
    toast(e.message, 'error');
  }
}

window.renderCards = renderCards;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.initModal = initModal;
window.setRating = setRating;
window.enviarResena = enviarResena;
window.eliminarResena = eliminarResena;