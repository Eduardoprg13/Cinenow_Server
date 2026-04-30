// CineNow — sincronización con TMDB

const TMDB_CONFIG = {
  apiKey: '42746f6b60fd330f98c80e8ef6a3ed76',
  baseUrl: 'https://api.themoviedb.org/3',
  imgBase: 'https://image.tmdb.org/t/p/w500',
  lang: 'es-MX',
  region: 'MX',
  syncIntervalHours: 24
};

const TMDB_GENEROS = {
  28:'Acción', 12:'Aventura', 16:'Animación', 35:'Comedia',
  80:'Crimen', 99:'Documental', 18:'Drama', 10751:'Familiar',
  14:'Fantasía', 36:'Historia', 27:'Terror', 10402:'Música',
  9648:'Misterio', 10749:'Romance', 878:'Ciencia Ficción',
  10770:'Película de TV', 53:'Thriller', 10752:'Bélica', 37:'Western'
};

function mapClasificacion(rating) {
  const map = { 'G':'A', 'PG':'B', 'PG-13':'B15', 'R':'C', 'NC-17':'D' };
  return map[rating] || 'B';
}

const TMDB = {
  async fetch(endpoint, params = {}) {
    const url = new URL(`${TMDB_CONFIG.baseUrl}${endpoint}`);
    url.searchParams.set('api_key', TMDB_CONFIG.apiKey);
    url.searchParams.set('language', TMDB_CONFIG.lang);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB error ${res.status}: ${res.statusText}`);
    return res.json();
  },

  async getNowPlaying() {
    const [data, data2] = await Promise.all([
      this.fetch('/movie/now_playing', { region: TMDB_CONFIG.region, page: 1 }),
      this.fetch('/movie/now_playing', { region: TMDB_CONFIG.region, page: 2 })
    ]);
    return [...(data.results || []), ...(data2.results || [])];
  },

  async getUpcoming() {
    const data = await this.fetch('/movie/upcoming', { region: TMDB_CONFIG.region, page: 1 });
    return data.results || [];
  },

  /** Distribuye una película recién agregada en todos los cines activos */
  async distribuirPeliculaEnCines(peliculaId) {
    try {
      const data = await DB.request('api/admin.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'distribuir_pelicula', peliculaId })
      });
      if (data && data.ok) {
        console.log(`[TMDB] Película ${peliculaId} distribuida en ${data.asignados || 'varios'} cines.`);
      } else {
        console.warn(`[TMDB] La distribución de la película ${peliculaId} no se completó:`, data?.error || '');
      }
    } catch (e) {
      console.warn(`[TMDB] No se pudo distribuir película ${peliculaId}:`, e.message);
    }
  },

  async getDetails(movieId) {
    return await this.fetch(`/movie/${movieId}`, { append_to_response: 'videos,credits' });
  },

  async convertirPelicula(movie, estado = 'cartelera') {
    const details = await this.getDetails(movie.id);
    const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || '';
    const trailer = details.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer')?.key || '';
    const genreIds = movie.genre_ids || details.genres?.map(g => g.id) || [];
    const genero = (genreIds[0] && TMDB_GENEROS[genreIds[0]]) || details.genres?.[0]?.name || '';

    return {
      tmdbId: movie.id,
      titulo: movie.title,
      genero,
      clasificacion: mapClasificacion(details.certification || (movie.adult ? 'R' : 'PG-13')),
      duracion: details.runtime ? `${details.runtime} min` : '',
      director,
      anio: details.release_date ? parseInt(details.release_date.substring(0,4), 10) : null,
      img: movie.poster_path ? `${TMDB_CONFIG.imgBase}${movie.poster_path}` : '',
      descripcion: details.overview || movie.overview || '',
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer}` : '',
      estado,
      origen: 'tmdb',
    };
  },

  async sincronizar(onProgress) {
    const log = (msg, tipo = 'info') => {
      console.log(`[TMDB Sync] ${msg}`);
      if (onProgress) onProgress(msg, tipo);
    };

    log('Iniciando sincronización con TMDB...', 'info');
    const [nowPlaying, upcoming] = await Promise.all([this.getNowPlaying(), this.getUpcoming()]);
    log(`✅ ${nowPlaying.length} en cartelera, ${upcoming.length} próximas encontradas`, 'info');

    const existentes = DB.getPeliculas();
    const tmdbIdsExistentes = new Set(existentes.filter(p => p.tmdbId).map(p => Number(p.tmdbId)));

    let agregadas = 0, actualizadas = 0, proximasAgregadas = 0, desactivadas = 0;

    for (const movie of nowPlaying) {
      if (!movie.poster_path) continue;
      if (tmdbIdsExistentes.has(movie.id)) {
        const existente = existentes.find(p => Number(p.tmdbId) === Number(movie.id));
        if (existente && existente.estado === 'proximamente') {
          existente.estado = 'cartelera';
          await DB.adminSave('peliculas', existente, { refresh: false });
          actualizadas++;
        }
        continue;
      }
      const pel = await this.convertirPelicula(movie, 'cartelera');
      const saved = await DB.adminSave('peliculas', pel, { refresh: false });
      
      // Obtenemos el ID de forma robusta (puede venir en .id, .item.id, etc.)
      const nuevoId = saved?.id || saved?.item?.id || saved?.data?.id;
      console.log('[TMDB] Nueva película guardada:', pel.titulo, '| ID:', nuevoId);
      if (nuevoId) {
        await this.distribuirPeliculaEnCines(nuevoId);
      }
      tmdbIdsExistentes.add(movie.id);
      agregadas++;
      await new Promise(r => setTimeout(r, 120));
    }

    for (const movie of upcoming.slice(0, 10)) {
      if (!movie.poster_path) continue;
      if (tmdbIdsExistentes.has(movie.id)) continue;
      const pel = await this.convertirPelicula(movie, 'proximamente');
      const saved = await DB.adminSave('peliculas', pel, { refresh: false });
      
      const nuevoId = saved?.id || saved?.item?.id || saved?.data?.id;
      console.log('[TMDB] Nueva próxima guardada:', pel.titulo, '| ID:', nuevoId);
      if (nuevoId) {
        await this.distribuirPeliculaEnCines(nuevoId);
      }
      tmdbIdsExistentes.add(movie.id);
      proximasAgregadas++;
      await new Promise(r => setTimeout(r, 120));
    }

    const tmdbIdsActivos = new Set([...nowPlaying, ...upcoming].map(m => Number(m.id)));
    for (const p of DB.getPeliculas().filter(p => p.tmdbId)) {
      if (p.estado === 'cartelera' && !tmdbIdsActivos.has(Number(p.tmdbId))) {
        p.estado = 'inactivo';
        await DB.adminSave('peliculas', p, { refresh: false });
        desactivadas++;
      }
    }

    await DB.setConfig('tmdb_last_sync_at', new Date().toISOString(), { refresh: false });

    // Un solo refresh al final evita decenas de recargas completas del catálogo.
    await DB.refresh(DB._scope, { force: true });

    const resumen = {
      agregadas,
      proximasAgregadas,
      actualizadas,
      desactivadas,
      total: DB.getPeliculas().filter(p => p.estado !== 'inactivo').length
    };

    log(`✅ Sincronización completada: +${agregadas} nuevas, +${proximasAgregadas} próximas, ${actualizadas} actualizadas, ${desactivadas} desactivadas`, 'success');
    return resumen;
  },

  async autoSync() {
    const lastSync = DB.getConfig('tmdb_last_sync_at', '');
    if (lastSync) {
      const diff = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
      if (diff < TMDB_CONFIG.syncIntervalHours) return false;
    }
    try {
      await this.sincronizar();
      return true;
    } catch (e) {
      console.warn('[TMDB] Auto-sync falló:', e.message);
      return false;
    }
  },

  getLastSyncInfo() {
    const lastSync = DB.getConfig('tmdb_last_sync_at', '');
    if (!lastSync) return null;
    const date = new Date(lastSync);
    if (Number.isNaN(date.getTime())) return null;
    const diffH = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60));
    return {
      fecha: date.toLocaleDateString('es-MX'),
      hora: date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      haceHoras: diffH
    };
  }
};

window.TMDB = TMDB;