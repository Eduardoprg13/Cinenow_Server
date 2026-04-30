<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/**
 * Envía una respuesta JSON uniforme al cliente y finaliza la ejecución.
 */
function cn_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Lee la entrada entrante desde POST, GET o cuerpo JSON.
 */
function cn_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) return $decoded;
    }
    return $_POST ?: $_GET;
}

/**
 * Filtra los datos de usuario para exponer solo campos seguros al frontend.
 */
function cn_safe_user(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'nombre' => $row['nombre'],
        'email' => $row['email'],
        'rol' => $row['rol'],
        'fecha' => $row['fecha'] ?? null,
    ];
}

/**
 * Recupera el usuario autenticado actual a partir de la sesión activa.
 */
function cn_current_user(PDO $pdo): ?array
{
    if (empty($_SESSION['user_id'])) return null;
    $stmt = $pdo->prepare('SELECT id, nombre, email, rol, fecha FROM usuarios WHERE id = ? LIMIT 1');
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch();
    return $user ? cn_safe_user($user) : null;
}

/**
 * Exige una sesión iniciada y devuelve el usuario autenticado.
 */
function cn_require_login(PDO $pdo): array
{
    $user = cn_current_user($pdo);
    if (!$user) cn_json(['ok'=>false,'error'=>'No autorizado'], 401);
    return $user;
}

/**
 * Exige privilegios de administrador antes de continuar con la operación.
 */
function cn_require_admin(PDO $pdo): array
{
    $user = cn_require_login($pdo);
    if (($user['rol'] ?? '') !== 'admin') cn_json(['ok'=>false,'error'=>'Acceso restringido a administradores'], 403);
    return $user;
}

/**
 * Lee la tabla de configuración completa y la convierte en un arreglo asociativo.
 */
function cn_fetch_config(PDO $pdo): array
{
    $rows = $pdo->query('SELECT clave, valor FROM configuracion')->fetchAll();
    $cfg = [];
    foreach ($rows as $row) $cfg[$row['clave']] = $row['valor'];
    return $cfg;
}

/**
 * Inserta o actualiza un parámetro de configuración según exista o no previamente.
 */
function cn_upsert_config(PDO $pdo, string $clave, string $valor): void
{
    $stmt = $pdo->prepare('SELECT id FROM configuracion WHERE clave = ? LIMIT 1');
    $stmt->execute([$clave]);
    $id = $stmt->fetchColumn();
    if ($id) {
        $stmt = $pdo->prepare('UPDATE configuracion SET valor = ? WHERE clave = ?');
        $stmt->execute([$valor, $clave]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?)');
        $stmt->execute([$clave, $valor]);
    }
}

/**
 * Normaliza una fila de película de MySQL al formato esperado por el frontend.
 */
function cn_map_pelicula(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'tmdbId' => isset($row['tmdb_id']) ? ($row['tmdb_id'] !== null ? (int)$row['tmdb_id'] : null) : ($row['tmdbId'] ?? null),
        'titulo' => $row['titulo'],
        'genero' => $row['genero'] ?? '',
        'clasificacion' => $row['clasificacion'] ?? '',
        'duracion' => $row['duracion'] ?? '',
        'director' => $row['director'] ?? '',
        'anio' => isset($row['anio']) ? ($row['anio'] !== null ? (int)$row['anio'] : null) : (isset($row['año']) ? (int)$row['año'] : null),
        'img' => $row['img'] ?? '',
        'descripcion' => $row['descripcion'] ?? '',
        'trailer' => $row['trailer'] ?? '',
        'estado' => $row['estado'] ?? 'cartelera',
        'origen' => $row['origen'] ?? 'manual',
        'ratingPromedio' => isset($row['rating_promedio']) ? (float)$row['rating_promedio'] : (isset($row['ratingPromedio']) ? (float)$row['ratingPromedio'] : 0),
        'resenasCount' => isset($row['resenas_count']) ? (int)$row['resenas_count'] : (isset($row['resenasCount']) ? (int)$row['resenasCount'] : 0),
        'creadoEn' => $row['creado_en'] ?? null,
        'actualizadoEn' => $row['actualizado_en'] ?? null,
    ];
}

/**
 * Normaliza una fila de cine al formato esperado por el frontend.
 */
function cn_map_cine(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'nombre' => $row['nombre'],
        'region' => $row['region'],
        'direccion' => $row['direccion'] ?? '',
        'activo' => isset($row['activo']) ? (int)$row['activo'] : 1,
    ];
}

/**
 * Normaliza una función y sus relaciones con película y cine.
 */
function cn_map_funcion(array $row): array
{
    $horarios = $row['horarios'] ?? '[]';
    $decoded = json_decode($horarios, true);
    if (!is_array($decoded)) {
        $decoded = $horarios ? array_map('trim', explode(',', (string)$horarios)) : [];
    }
    $func = [
        'id' => (int)$row['id'],
        'peliculaId' => (int)$row['pelicula_id'],
        'cineId' => (int)$row['cine_id'],
        'horarios' => array_values(array_filter(array_map('trim', $decoded), fn($v) => $v !== '')),
        'precio' => (float)$row['precio'],
        'fechaInicio' => $row['fecha_inicio'] ?? '',
        'fechaFin' => $row['fecha_fin'] ?? '',
    ];
    if (isset($row['pelicula_titulo'])) {
        $func['pelicula'] = ['id' => (int)$row['pelicula_id'], 'titulo' => $row['pelicula_titulo']];
    }
    if (isset($row['cine_nombre'])) {
        $func['cine'] = ['id' => (int)$row['cine_id'], 'nombre' => $row['cine_nombre'], 'region' => $row['cine_region'] ?? '', 'direccion' => $row['cine_direccion'] ?? ''];
    }
    return $func;
}

/**
 * Normaliza una reseña y estandariza la fecha para mostrarla en interfaz.
 */
function cn_map_resena(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'peliculaId' => (int)$row['pelicula_id'],
        'userId' => (int)$row['usuario_id'],
        'autor' => $row['autor'] ?? $row['nombre'] ?? 'Usuario',
        'rating' => (int)$row['rating'],
        'texto' => $row['texto'],
        'fecha' => $row['fecha_formato'] ?? $row['fecha'] ?? null,
    ];
}