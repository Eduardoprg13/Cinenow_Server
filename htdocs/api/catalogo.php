<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$pdo = cn_pdo();
$session = cn_current_user($pdo);
$scope = strtolower(trim((string)($_GET['scope'] ?? 'public')));

/**
 * Carga las películas activas incluyendo rating promedio y conteo de reseñas.
 */
// Películas con estadísticas agregadas para evitar cargar todas las reseñas.
$peliculas = [];
$sqlPeliculas = "SELECT p.id, p.tmdb_id, p.titulo, p.genero, p.clasificacion, p.duracion, p.director, p.anio,
                        p.img, p.descripcion, p.trailer, p.estado, p.origen, p.creado_en, p.actualizado_en,
                        COALESCE(rr.rating_promedio, 0) AS rating_promedio,
                        COALESCE(rr.resenas_count, 0) AS resenas_count
                 FROM peliculas p
                 LEFT JOIN (
                     SELECT pelicula_id,
                            ROUND(AVG(rating), 1) AS rating_promedio,
                            COUNT(*) AS resenas_count
                     FROM resenas
                     GROUP BY pelicula_id
                 ) rr ON rr.pelicula_id = p.id
                 WHERE p.estado <> 'inactivo'
                 ORDER BY FIELD(p.estado,'cartelera','proximamente'), p.titulo ASC";
$stmt = $pdo->query($sqlPeliculas);
foreach ($stmt->fetchAll() as $row) {
    $peliculas[] = cn_map_pelicula($row);
}

/**
 * Carga los cines activos que se mostrarán en navegación y filtros.
 */
$cines = [];
$stmt = $pdo->query("SELECT id, nombre, region, direccion, activo FROM cines WHERE activo = 1 ORDER BY region ASC, nombre ASC");
foreach ($stmt->fetchAll() as $row) {
    $cines[] = cn_map_cine($row);
}

/**
 * Carga las funciones disponibles vinculando película y cine para enriquecer la vista.
 */
$funciones = [];
$stmt = $pdo->query("SELECT f.id, f.pelicula_id, f.cine_id, f.horarios, f.precio, f.fecha_inicio, f.fecha_fin,
                             p.titulo AS pelicula_titulo,
                             c.nombre AS cine_nombre, c.region AS cine_region, c.direccion AS cine_direccion
                      FROM funciones f
                      INNER JOIN peliculas p ON p.id = f.pelicula_id
                      INNER JOIN cines c ON c.id = f.cine_id
                      WHERE p.estado <> 'inactivo' AND c.activo = 1
                      ORDER BY f.id ASC");
foreach ($stmt->fetchAll() as $row) {
    $funciones[] = cn_map_funcion($row);
}

/**
 * Obtiene la configuración global del sistema desde la tabla correspondiente.
 */
$config = cn_fetch_config($pdo);

/**
 * Recupera las regiones únicas donde existen cines activos.
 */
$regiones = [];
$stmt = $pdo->query("SELECT DISTINCT region FROM cines WHERE activo = 1 ORDER BY region ASC");
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $region) {
    $regiones[] = $region;
}

/**
 * Construye la respuesta final que consumirá el frontend.
 */
$response = [
    'ok' => true,
    'session' => $session,
    'peliculas' => $peliculas,
    'cines' => $cines,
    'funciones' => $funciones,
    'regiones' => $regiones,
    'configuracion' => $config,
];

/**
 * Define caché HTTP ligero para reducir tráfico y aprovechar revalidación mediante ETag.
 */
// Cache HTTP ligero para que el navegador revalide en vez de bajar todo otra vez.
$payload = json_encode($response, JSON_UNESCAPED_UNICODE);
$etag = '"' . sha1($payload) . '"';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=90, must-revalidate');
header('ETag: ' . $etag);

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

echo $payload;
