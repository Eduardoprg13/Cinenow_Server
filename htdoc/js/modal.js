// CineNow — modal compartido

let modalOverlay, modalBody, modalClose;

function renderCards(lista, contenedor, tipo = 'cartelera') {
  if (!contenedor) return;
  contenedor.innerHTML = '';
  lista.forEach(p => {
    const rating = DB.promedioRating(p.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${tipo === 'proximo' ? '<span class="card-badge proximo">Próximamente</span>' : '<span class="card-badge">En cartelera</span>'}
      <img src="${p.img}" alt="${p.titulo}" onerror="this.src='https://via.placeholder.com/200x280/111/e50914?text=CineNow'">
      <div class="card-body">
        <h4>${p.titulo}</h4>
        <p>${p.genero || ''} ${p.clasificacion ? '· <strong>' + p.clasificacion + '</strong>' : ''}</p>
        ${rating > 0 ? `<div class="card-rating">${estrellas(Math.round(rating))} ${rating}</div>` : ''}
      </div>`;
    card.addEventListener('click', () => abrirModal(p));
    contenedor.appendChild(card);
  });
}

function abrirModal(p) {
  if (!modalOverlay) initModal();
  const funciones = DB.getFuncionesPorPelicula(p.id);
  const resenas = DB.getResenasPorPelicula(p.id);
  const sesion = DB.getSession();
  const yaReseno = sesion && resenas.some(r => Number(r.userId) === Number(sesion.id));
  const rating = DB.promedioRating(p.id);
  const clsMap = { A: 'badge-a', B: 'badge-b', B15: 'badge-b15', C: 'badge-c' };
  const clsClass = clsMap[p.clasificacion] || '';

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
  if (sesion && !yaReseno) {
    formResena = `
      <div class="resena-form" id="resenaForm_${p.id}">
        <div class="estrellas-input" id="starsInput_${p.id}">
          ${[1,2,3,4,5].map(i => `<span data-val="${i}" onclick="setRating(${p.id},${i})">★</span>`).join('')}
        </div>
        <input type="hidden" id="ratingVal_${p.id}" value="0">
        <textarea id="resenaTexto_${p.id}" placeholder="Escribe tu reseña..."></textarea>
        <button class="btn-resena" onclick="enviarResena(${p.id})">Publicar reseña</button>
      </div>`;
  } else if (!sesion) {
    formResena = `<p style="color:#888;font-size:.85em;margin-top:8px;"><a href="login.html" style="color:#e50914;">Inicia sesión</a> para dejar una reseña.</p>`;
  } else {
    formResena = `<p style="color:#888;font-size:.85em;margin-top:8px;">Ya dejaste una reseña para esta película.</p>`;
  }

  modalBody.innerHTML = `
    <img src="${p.img}" alt="${p.titulo}" onerror="this.src='https://via.placeholder.com/600x280/111/e50914?text=CineNow'">
    <h2>${p.titulo}</h2>
    ${rating > 0 ? `<div style="margin-bottom:4px">${estrellas(Math.round(rating))} <span style="color:#aaa;font-size:.85em">${rating}/5 (${resenas.length} reseñas)</span></div>` : ''}

    <div class="info-row">
      <span class="info-label">Descripción</span>
      <span class="info-value">${p.descripcion}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Género</span><span class="info-value">${p.genero || '—'}</span>
      <span class="info-label">Duración</span><span class="info-value">${p.duracion || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Director</span><span class="info-value">${p.director || '—'}</span>
      <span class="info-label">Año</span><span class="info-value">${p.anio || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Clasificación</span>
      <span class="info-value"><span class="badge ${clsClass}">${p.clasificacion || '—'}</span></span>
    </div>

    ${p.trailer ? `<a href="${p.trailer}" target="_blank" class="btn-trailer">▶ Ver Tráiler</a>` : ''}

    <div style="margin-top:6px">
      <div class="info-label" style="margin-bottom:10px">🎭 Funciones disponibles</div>
      ${funcHTML}
    </div>

    <div class="resenas-section">
      <h4>💬 Reseñas (${resenas.length})</h4>
      <div id="resenasList_${p.id}">${resenasHTML}</div>
      ${formResena}
    </div>`;

  modalOverlay.style.display = 'flex';
  window._modalPelId = p.id;
}

function setRating(pelId, val) {
  document.getElementById('ratingVal_' + pelId).value = val;
  document.querySelectorAll(`#starsInput_${pelId} span`).forEach((s, i) => {
    s.classList.toggle('activa', i < val);
  });
}

async function enviarResena(pelId) {
  const sesion = DB.getSession();
  if (!sesion) { toast('Debes iniciar sesión', 'error'); return; }
  const texto = document.getElementById('resenaTexto_' + pelId).value.trim();
  const rating = parseInt(document.getElementById('ratingVal_' + pelId).value, 10);
  if (!texto) { toast('Escribe tu reseña', 'error'); return; }
  if (!rating) { toast('Selecciona una calificación', 'error'); return; }

  try {
    await DB.addResena({ peliculaId: pelId, rating, texto });
    toast('¡Reseña publicada!');
    abrirModal(DB.getPelicula(pelId));
  } catch (e) {
    toast(e.message || 'No se pudo guardar la reseña', 'error');
  }
}

async function eliminarResena(resenaId, pelId) {
  if (!confirm('¿Eliminar esta reseña?')) return;
  try {
    await DB.deleteResena(resenaId);
    toast('Reseña eliminada');
    abrirModal(DB.getPelicula(pelId));
  } catch (e) {
    toast(e.message || 'No se pudo eliminar', 'error');
  }
}

function cerrarModal() { if (modalOverlay) modalOverlay.style.display = 'none'; }

function initModal() {
  modalOverlay = document.getElementById('modalOverlay');
  modalBody = document.getElementById('modalBody');
  modalClose = document.querySelector('.modal-close');
  if (!modalOverlay) return;
  modalClose && modalClose.addEventListener('click', cerrarModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) cerrarModal(); });
}

document.addEventListener('DOMContentLoaded', initModal);

window.renderCards = renderCards;
window.abrirModal = abrirModal;
window.setRating = setRating;
window.enviarResena = enviarResena;
window.eliminarResena = eliminarResena;
window.cerrarModal = cerrarModal;
