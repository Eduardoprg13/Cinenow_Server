<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$pdo = cn_pdo();
$session = cn_current_user($pdo);

$peliculas = [];
$stmt = $pdo->query("SELECT id, tmdb_id, titulo, genero, clasificacion, duracion, director, anio, img, descripcion, trailer, estado, origen, creado_en, actualizado_en FROM peliculas WHERE estado <> 'inactivo' ORDER BY FIELD(estado,'cartelera','proximamente'), titulo ASC");
foreach ($stmt->fetchAll() as $row) {
    $peliculas[] = cn_map_pelicula($row);
}

$cines = [];
$stmt = $pdo->query("SELECT id, nombre, region, direccion, activo FROM cines WHERE activo = 1 ORDER BY region ASC, nombre ASC");
foreach ($stmt->fetchAll() as $row) {
    $cines[] = cn_map_cine($row);
}

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

$resenas = [];
$stmt = $pdo->query("SELECT r.id, r.pelicula_id, r.usuario_id, r.rating, r.texto,
                            DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha_formato,
                            u.nombre AS autor
                     FROM resenas r
                     INNER JOIN usuarios u ON u.id = r.usuario_id
                     ORDER BY r.fecha DESC");
foreach ($stmt->fetchAll() as $row) {
    $resenas[] = cn_map_resena($row);
}

$config = cn_fetch_config($pdo);

$regiones = [];
$stmt = $pdo->query("SELECT DISTINCT region FROM cines WHERE activo = 1 ORDER BY region ASC");
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $region) {
    $regiones[] = $region;
}

cn_json([
    'ok' => true,
    'session' => $session,
    'peliculas' => $peliculas,
    'cines' => $cines,
    'funciones' => $funciones,
    'resenas' => $resenas,
    'regiones' => $regiones,
    'configuracion' => $config,
]);
