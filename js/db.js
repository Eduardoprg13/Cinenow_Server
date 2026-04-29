// CineNow v2 — API client MySQL + PHP

const DB = {
  _catalog: null,

  async request(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
    });

    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  },

  async refresh() {
    this._catalog = await this.request('api/catalogo.php');
    return this._catalog;
  },

  async init() {
    if (!this._catalog) await this.refresh();
    return this;
  },

  getSession() { return this._catalog?.session || null; },
  isLoggedIn() { return !!this.getSession(); },
  isAdmin() { return this.getSession()?.rol === 'admin'; },

  getConfiguracion() { return this._catalog?.configuracion || {}; },
  getConfig(key, fallback = null) { return this.getConfiguracion()[key] ?? fallback; },

  getPeliculas() { return this._catalog?.peliculas || []; },
  getCines() { return this._catalog?.cines || []; },
  getFunciones() { return this._catalog?.funciones || []; },
  getResenas() { return this._catalog?.resenas || []; },
  getRegiones() { return this._catalog?.regiones || []; },

  getPelicula(id) { return this.getPeliculas().find(p => Number(p.id) === Number(id)) || null; },
  getCine(id) { return this.getCines().find(c => Number(c.id) === Number(id)) || null; },
  getFuncion(id) { return this.getFunciones().find(f => Number(f.id) === Number(id)) || null; },

  getFuncionesPorPelicula(peliculaId) {
    return this.getFunciones().filter(f => Number(f.peliculaId) === Number(peliculaId));
  },
  getResenasPorPelicula(peliculaId) {
    return this.getResenas().filter(r => Number(r.peliculaId) === Number(peliculaId));
  },
  promedioRating(peliculaId) {
    const rs = this.getResenasPorPelicula(peliculaId);
    if (!rs.length) return 0;
    const sum = rs.reduce((a, r) => a + Number(r.rating || 0), 0);
    return (sum / rs.length).toFixed(1);
  },

  async loginUsuario(email, password) {
    const data = await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email, password }),
    });
    await this.refresh();
    return data.user;
  },

  async registrarUsuario(nombre, email, password) {
    const data = await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'register', nombre, email, password }),
    });
    await this.refresh();
    return data.user;
  },

  async cerrarSesion() {
    await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout' }),
    });
    await this.refresh();
  },

  async adminList(entity) {
    const data = await this.request(`api/admin.php?action=list&entity=${encodeURIComponent(entity)}`);
    return data.items || [];
  },

  async getDashboard() {
    const data = await this.request('api/admin.php?action=dashboard');
    return data.data || {};
  },

  async adminSave(entity, payload) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save', entity, ...payload }),
    });
    await this.refresh();
    return data.item || null;
  },

  async adminDelete(entity, id) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', entity, id }),
    });
    await this.refresh();
    return data;
  },

  async setConfig(key, value) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'set_config', key, value }),
    });
    await this.refresh();
    return data;
  },

  async addResena({ peliculaId, rating, texto }) {
    const data = await this.request('api/resenas.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', peliculaId, rating, texto }),
    });
    await this.refresh();
    return data.item;
  },

  async deleteResena(id) {
    const data = await this.request('api/resenas.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    await this.refresh();
    return data;
  },
};

function toast(msg, tipo = 'success') {
  let t = document.querySelector('.cn-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'cn-toast';
    document.body.appendChild(t);
  }
  t.className = `cn-toast cn-toast-${tipo}`;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function estrellas(n) {
  const full = '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)));
  const empty = '☆'.repeat(5 - full.length);
  return `<span style="color:#e50914">${full}</span><span style="color:#444">${empty}</span>`;
}

async function actualizarNav() {
  try { await DB.init(); } catch (_) {}
  const navEl = document.querySelector('header nav ul');
  if (!navEl) return;
  const sesion = DB.getSession();
  navEl.innerHTML = `
    <li><a href="index.html">Principal</a></li>
    <li><a href="cartelera.html">Cartelera</a></li>
    <li><a href="regiones.html">Regiones</a></li>
    <li><a href="contacto.html">Contacto</a></li>
  `;

  if (sesion) {
    const userLi = document.createElement('li');
    userLi.className = 'nav-user';
    userLi.innerHTML = `<span>👤 ${sesion.nombre.split(' ')[0]}</span>`;
    navEl.appendChild(userLi);

    if (sesion.rol === 'admin') {
      const adminLi = document.createElement('li');
      adminLi.innerHTML = `<a href="admin.html">⚙️ Admin</a>`;
      navEl.appendChild(adminLi);
    }

    const logoutLi = document.createElement('li');
    logoutLi.className = 'nav-logout';
    logoutLi.innerHTML = `<a href="#" id="logoutBtn">Cerrar sesión</a>`;
    navEl.appendChild(logoutLi);
    document.getElementById('logoutBtn').addEventListener('click', async e => {
      e.preventDefault();
      await DB.cerrarSesion();
      window.location.href = 'index.html';
    });
  } else {
    const li1 = document.createElement('li'); li1.innerHTML = `<a href="login.html">Iniciar Sesión</a>`;
    const li2 = document.createElement('li'); li2.innerHTML = `<a href="register.html">Registrarse</a>`;
    navEl.appendChild(li1);
    navEl.appendChild(li2);
  }
}

window.DB = DB;
window.toast = toast;
window.estrellas = estrellas;
window.actualizarNav = actualizarNav;
