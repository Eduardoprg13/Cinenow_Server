// CineNow v3 — cliente de API con caché ligera y accesos rápidos

const DB = {
  _catalog: null,                 // Catálogo cargado en memoria.
  _scope: 'public',               // Scope actual de datos.
  _cacheTTL: 3 * 60 * 1000,       // Vida útil del caché local (3 min).
  _reviewCache: new Map(),        // Reseñas por película ya consultadas.
  _funcionesByMovie: new Map(),   // Índice de funciones por película.
  _funcionesByCine: new Map(),    // Índice de funciones por cine.

  // Solicitud genérica a la API con respuesta JSON.
  /**
   * Realiza peticiones HTTP a la API con soporte para JSON, credenciales de sesión
   * y manejo uniforme de errores del servidor.
   */
  async request(url, options = {}) {
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: isGet ? 'default' : 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
    });

    if (res.status === 304) {
      return { ok: true, notModified: true };
    }

    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  },

  // Clave del caché local por tipo de catálogo.
  /**
   * Genera la clave de almacenamiento local usada para separar el catálogo por scope.
   */
  _cacheKey(scope = this._scope) {
    return `cinenow_catalog_${scope}`;
  },

  // Lee el catálogo guardado en localStorage.
  /**
   * Lee el catálogo previamente guardado en localStorage y valida su vigencia.
   */
  _readCache(scope = this._scope) {
    try {
      const raw = localStorage.getItem(this._cacheKey(scope));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || !parsed?.savedAt) return null;
      if (Date.now() - parsed.savedAt > this._cacheTTL) return null;
      return parsed.data;
    } catch (_) {
      return null;
    }
  },

  // Guarda el catálogo en localStorage para cargarlo más rápido.
  /**
   * Persiste el catálogo en localStorage para reducir llamadas repetidas al backend.
   */
  _writeCache(data, scope = this._scope) {
    try {
      localStorage.setItem(this._cacheKey(scope), JSON.stringify({
        savedAt: Date.now(),
        data,
      }));
    } catch (_) {
      // Si el navegador no permite storage, seguimos sin caché persistente.
    }
  },

  // Construye índices en memoria para evitar recorridos repetidos.
  /**
   * Construye índices en memoria para consultar funciones y reseñas de forma rápida.
   */
  _buildIndexes() {
    this._funcionesByMovie = new Map();
    this._funcionesByCine = new Map();
    this._reviewCache = new Map();

    for (const f of this.getFunciones()) {
      const movieId = Number(f.peliculaId);
      const cineId = Number(f.cineId);

      if (!this._funcionesByMovie.has(movieId)) this._funcionesByMovie.set(movieId, []);
      if (!this._funcionesByCine.has(cineId)) this._funcionesByCine.set(cineId, []);
      this._funcionesByMovie.get(movieId).push(f);
      this._funcionesByCine.get(cineId).push(f);
    }
  },

  // Actualiza el catálogo desde el servidor y refresca los índices.
  /**
   * Descarga el catálogo desde la API, respeta el caché HTTP y reconstruye índices locales.
   */
  async refresh(scope = this._scope, { force = false } = {}) {
    this._scope = scope;
    const cached = this._readCache(scope);

    if (!force && cached) {
      this._catalog = cached;
      this._buildIndexes();
      return this._catalog;
    }

    const data = await this.request(`api/catalogo.php?scope=${encodeURIComponent(scope)}`);
    if (data?.notModified && cached) {
      this._catalog = cached;
      this._buildIndexes();
      return this._catalog;
    }

    this._catalog = data;
    this._buildIndexes();
    this._writeCache(data, scope);
    return this._catalog;
  },

  // Inicializa el catálogo solo una vez por página.
  /**
   * Inicializa el cliente cargando el catálogo una sola vez por scope.
   */
  async init(scope = 'public') {
    if (!this._catalog || this._scope !== scope) {
      await this.refresh(scope);
    }
    return this;
  },

  // Limpia la caché local cuando cambia el contenido.
  /**
   * Elimina el catálogo guardado en localStorage para forzar una recarga completa.
   */
  invalidateCache(scope = this._scope) {
    try { localStorage.removeItem(this._cacheKey(scope)); } catch (_) {}
  },

  /**
   * Devuelve la sesión activa actualmente cargada en memoria.
   */
  getSession() { return this._catalog?.session || null; },
  /**
   * Indica si existe una sesión iniciada.
   */
  isLoggedIn() { return !!this.getSession(); },
  /**
   * Verifica si el usuario activo tiene privilegios de administrador.
   */
  isAdmin() { return this.getSession()?.rol === 'admin'; },

  /**
   * Retorna el objeto de configuración general recibido desde el backend.
   */
  getConfiguracion() { return this._catalog?.configuracion || {}; },
  /**
   * Obtiene un valor de configuración individual con valor por defecto opcional.
   */
  getConfig(key, fallback = null) { return this.getConfiguracion()[key] ?? fallback; },

  /**
   * Devuelve la lista de películas disponibles en el catálogo cargado.
   */
  getPeliculas() { return this._catalog?.peliculas || []; },
  /**
   * Devuelve el listado de cines activos.
   */
  getCines() { return this._catalog?.cines || []; },
  /**
   * Devuelve todas las funciones del catálogo actual.
   */
  getFunciones() { return this._catalog?.funciones || []; },
  /**
   * Devuelve las reseñas precargadas en memoria, si existen.
   */
  getResenas() { return this._catalog?.resenas || []; },
  /**
   * Devuelve la lista de regiones disponibles para filtros y navegación.
   */
  getRegiones() { return this._catalog?.regiones || []; },

  /**
   * Busca una película por identificador.
   */
  getPelicula(id) { return this.getPeliculas().find(p => Number(p.id) === Number(id)) || null; },
  /**
   * Busca un cine por identificador.
   */
  getCine(id) { return this.getCines().find(c => Number(c.id) === Number(id)) || null; },
  /**
   * Busca una función por identificador.
   */
  getFuncion(id) { return this.getFunciones().find(f => Number(f.id) === Number(id)) || null; },

  // Devuelve funciones de una película usando índice si existe.
  /**
   * Devuelve las funciones asociadas a una película específica usando el índice en memoria.
   */
  getFuncionesPorPelicula(peliculaId) {
    const key = Number(peliculaId);
    return this._funcionesByMovie.get(key) || [];
  },

  // Devuelve funciones de un cine usando índice si existe.
  /**
   * Devuelve las funciones asociadas a un cine específico usando el índice en memoria.
   */
  getFuncionesPorCine(cineId) {
    const key = Number(cineId);
    return this._funcionesByCine.get(key) || [];
  },

  // Reseñas guardadas en memoria (si el catálogo las trae).
  /**
   * Devuelve las reseñas almacenadas localmente para una película concreta.
   */
  getResenasPorPelicula(peliculaId) {
    const key = Number(peliculaId);
    return this._reviewCache.get(key) || [];
  },

  // Obtiene reseñas de una película solo cuando realmente se necesitan.
  /**
   * Consulta las reseñas de una película en el backend y las memoriza para reutilizarlas.
   */
  async fetchResenasPorPelicula(peliculaId) {
    const key = Number(peliculaId);
    if (this._reviewCache.has(key)) return this._reviewCache.get(key);

    const data = await this.request(`api/resenas.php?peliculaId=${encodeURIComponent(key)}`);
    const items = data.items || [];
    this._reviewCache.set(key, items);
    return items;
  },

  // Calcula el rating usando primero los datos agregados del catálogo.
  /**
   * Calcula el rating promedio de una película usando datos agregados o reseñas locales.
   */
  promedioRating(peliculaId) {
    const pelicula = this.getPelicula(peliculaId);
    if (pelicula && pelicula.ratingPromedio !== undefined && pelicula.ratingPromedio !== null) {
      return Number(pelicula.ratingPromedio) || 0;
    }

    const rs = this.getResenasPorPelicula(peliculaId);
    if (!rs.length) return 0;
    const sum = rs.reduce((a, r) => a + Number(r.rating || 0), 0);
    return Number((sum / rs.length).toFixed(1));
  },

  /**
   * Ejecuta el inicio de sesión y recarga el catálogo para reflejar la sesión nueva.
   */
  async loginUsuario(email, password) {
    const data = await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email, password }),
    });
    await this.refresh(this._scope, { force: true });
    return data.user;
  },

  /**
   * Registra un usuario nuevo y actualiza el estado de sesión.
   */
  async registrarUsuario(nombre, email, password) {
    const data = await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'register', nombre, email, password }),
    });
    await this.refresh(this._scope, { force: true });
    return data.user;
  },

  /**
   * Cierra la sesión en el servidor y refresca la vista local.
   */
  async cerrarSesion() {
    await this.request('api/auth.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout' }),
    });
    await this.refresh(this._scope, { force: true });
  },

  /**
   * Obtiene el listado administrativo de una entidad específica.
   */
  async adminList(entity) {
    const data = await this.request(`api/admin.php?action=list&entity=${encodeURIComponent(entity)}`);
    return data.items || [];
  },

  /**
   * Solicita las métricas principales del panel administrativo.
   */
  async getDashboard() {
    const data = await this.request('api/admin.php?action=dashboard');
    return data.data || {};
  },

  // Guardado administrativo con opción de posponer el refresh global.
  /**
   * Guarda o actualiza un registro administrativo y opcionalmente refresca el catálogo.
   */
  async adminSave(entity, payload, options = {}) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save', entity, ...payload }),
    });
    if (options.refresh !== false) {
      await this.refresh(this._scope, { force: true });
    }
    return data.item || null;
  },

  /**
   * Elimina un registro administrativo y opcionalmente refresca el catálogo.
   */
  async adminDelete(entity, id, options = {}) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', entity, id }),
    });
    if (options.refresh !== false) {
      await this.refresh(this._scope, { force: true });
    }
    return data;
  },

  /**
   * Actualiza un valor de configuración del sistema.
   */
  async setConfig(key, value, options = {}) {
    const data = await this.request('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'set_config', key, value }),
    });
    if (options.refresh !== false) {
      await this.refresh(this._scope, { force: true });
    }
    return data;
  },

  /**
   * Publica una reseña nueva para la película seleccionada.
   */
  async addResena({ peliculaId, rating, texto }) {
    const data = await this.request('api/resenas.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', peliculaId, rating, texto }),
    });
    await this.refresh(this._scope, { force: true });
    return data.item;
  },

  /**
   * Elimina una reseña existente.
   */
  async deleteResena(id) {
    const data = await this.request('api/resenas.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    await this.refresh(this._scope, { force: true });
    return data;
  },
};

/**
 * Muestra notificaciones breves en pantalla para confirmar acciones o errores.
 */
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

/**
 * Convierte un valor numérico en una representación visual de estrellas.
 */
function estrellas(n) {
  const full = '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)));
  const empty = '☆'.repeat(5 - full.length);
  return `<span style="color:#e50914">${full}</span><span style="color:#444">${empty}</span>`;
}

/**
 * Reescribe la navegación principal según el estado de autenticación del usuario.
 */
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