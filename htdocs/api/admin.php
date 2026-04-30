<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$pdo = cn_pdo();
cn_require_admin($pdo);
$input = cn_input();
$action = $input['action'] ?? $_GET['action'] ?? 'dashboard';
$entity = $input['entity'] ?? $_GET['entity'] ?? '';

function cn_entity_list(PDO $pdo, string $entity): array
{
    switch ($entity) {
        case 'peliculas':
            $rows = $pdo->query("SELECT id, tmdb_id, titulo, genero, clasificacion, duracion, director, anio, img, descripcion, trailer, estado, origen, creado_en, actualizado_en FROM peliculas ORDER BY id DESC")->fetchAll();
            return array_map('cn_map_pelicula', $rows);
        case 'cines':
            $rows = $pdo->query("SELECT id, nombre, region, direccion, activo FROM cines ORDER BY region ASC, nombre ASC")->fetchAll();
            return array_map('cn_map_cine', $rows);
        case 'funciones':
            $stmt = $pdo->query("SELECT f.id, f.pelicula_id, f.cine_id, f.horarios, f.precio, f.fecha_inicio, f.fecha_fin,
                                        p.titulo AS pelicula_titulo,
                                        c.nombre AS cine_nombre, c.region AS cine_region, c.direccion AS cine_direccion
                                 FROM funciones f
                                 INNER JOIN peliculas p ON p.id = f.pelicula_id
                                 INNER JOIN cines c ON c.id = f.cine_id
                                 ORDER BY f.id DESC");
            return array_map('cn_map_funcion', $stmt->fetchAll());
        case 'usuarios':
            $rows = $pdo->query("SELECT id, nombre, email, rol, fecha FROM usuarios ORDER BY id DESC")->fetchAll();
            return array_map(fn($r) => [
                'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'email' => $r['email'], 'rol' => $r['rol'], 'fecha' => $r['fecha'] ?? null,
            ], $rows);
        case 'resenas':
            $stmt = $pdo->query("SELECT r.id, r.pelicula_id, r.usuario_id, r.rating, r.texto,
                                        DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha_formato,
                                        u.nombre AS autor,
                                        p.titulo AS pelicula_titulo
                                 FROM resenas r
                                 INNER JOIN usuarios u ON u.id = r.usuario_id
                                 INNER JOIN peliculas p ON p.id = r.pelicula_id
                                 ORDER BY r.fecha DESC");
            return array_map(function($row) {
                $item = cn_map_resena($row);
                $item['pelicula'] = ['id' => (int)$row['pelicula_id'], 'titulo' => $row['pelicula_titulo']];
                return $item;
            }, $stmt->fetchAll());
        default:
            return [];
    }
}

function cn_dashboard(PDO $pdo): array
{
    $counts = [
        'peliculas' => (int)$pdo->query('SELECT COUNT(*) FROM peliculas')->fetchColumn(),
        'cines' => (int)$pdo->query('SELECT COUNT(*) FROM cines')->fetchColumn(),
        'funciones' => (int)$pdo->query('SELECT COUNT(*) FROM funciones')->fetchColumn(),
        'usuarios' => (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn(),
        'resenas' => (int)$pdo->query('SELECT COUNT(*) FROM resenas')->fetchColumn(),
        'cartelera' => (int)$pdo->query("SELECT COUNT(*) FROM peliculas WHERE estado = 'cartelera'")->fetchColumn(),
    ];

    $top = $pdo->query("SELECT p.id, p.titulo, COALESCE(rr.total_resenas, 0) AS total_resenas, COALESCE(rr.rating, 0) AS rating
                         FROM peliculas p
                         LEFT JOIN (
                             SELECT pelicula_id, COUNT(*) AS total_resenas, ROUND(AVG(rating),1) AS rating
                             FROM resenas
                             GROUP BY pelicula_id
                         ) rr ON rr.pelicula_id = p.id
                         ORDER BY total_resenas DESC, p.titulo ASC
                         LIMIT 5")->fetchAll();

    $counts['topResenadas'] = array_map(fn($row) => [
        'id' => (int)$row['id'],
        'titulo' => $row['titulo'],
        'totalResenas' => (int)$row['total_resenas'],
        'rating' => (float)$row['rating'],
    ], $top);

    return $counts;
}

function cn_distribuir_pelicula(PDO $pdo, int $peliculaId): int
{
    $stmtCines = $pdo->query("SELECT id FROM cines WHERE activo = 1");
    $cines = $stmtCines->fetchAll(PDO::FETCH_COLUMN);

    $horariosDefault = ["16:00", "19:00", "22:00"];
    $precioDefault = 85.00;
    $asignados = 0;

    foreach ($cines as $cineId) {
        $stmtCheck = $pdo->prepare("SELECT id FROM funciones WHERE pelicula_id = ? AND cine_id = ?");
        $stmtCheck->execute([$peliculaId, $cineId]);
        if ($stmtCheck->fetchColumn()) continue;

        $stmtInsert = $pdo->prepare("INSERT INTO funciones (pelicula_id, cine_id, horarios, precio, fecha_inicio) VALUES (?, ?, ?, ?, ?)");
        $stmtInsert->execute([
            $peliculaId,
            $cineId,
            json_encode($horariosDefault, JSON_UNESCAPED_UNICODE),
            $precioDefault,
            date('Y-m-d')
        ]);
        $asignados++;
    }

    return $asignados;
}

function cn_save_pelicula(PDO $pdo, array $input): array
{
    $id = (int)($input['id'] ?? 0);
    $data = [
        'titulo' => trim((string)($input['titulo'] ?? '')),
        'genero' => trim((string)($input['genero'] ?? '')),
        'clasificacion' => trim((string)($input['clasificacion'] ?? '')),
        'duracion' => trim((string)($input['duracion'] ?? '')),
        'director' => trim((string)($input['director'] ?? '')),
        'anio' => ($input['anio'] ?? '') !== '' ? (int)$input['anio'] : null,
        'img' => trim((string)($input['img'] ?? '')),
        'descripcion' => trim((string)($input['descripcion'] ?? '')),
        'trailer' => trim((string)($input['trailer'] ?? '')),
        'estado' => $input['estado'] ?? 'cartelera',
        'origen' => $input['origen'] ?? 'manual',
        'tmdb_id' => isset($input['tmdbId']) && $input['tmdbId'] !== '' ? (int)$input['tmdbId'] : null,
    ];

    if ($data['titulo'] === '') cn_json(['ok' => false, 'error' => 'El título es obligatorio'], 422);

    $nueva = false;
    if ($id > 0) {
        $stmt = $pdo->prepare('UPDATE peliculas SET tmdb_id = ?, titulo = ?, genero = ?, clasificacion = ?, duracion = ?, director = ?, anio = ?, img = ?, descripcion = ?, trailer = ?, estado = ?, origen = ? WHERE id = ?');
        $stmt->execute([$data['tmdb_id'], $data['titulo'], $data['genero'], $data['clasificacion'], $data['duracion'], $data['director'], $data['anio'], $data['img'], $data['descripcion'], $data['trailer'], $data['estado'], $data['origen'], $id]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO peliculas (tmdb_id, titulo, genero, clasificacion, duracion, director, anio, img, descripcion, trailer, estado, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$data['tmdb_id'], $data['titulo'], $data['genero'], $data['clasificacion'], $data['duracion'], $data['director'], $data['anio'], $data['img'], $data['descripcion'], $data['trailer'], $data['estado'], $data['origen']]);
        $id = (int)$pdo->lastInsertId();
        $nueva = true;
    }

    // 🔁 Distribuir automáticamente si es nueva y viene de TMDB
    if ($nueva && $data['origen'] === 'tmdb') {
        cn_distribuir_pelicula($pdo, $id);
    }

    $stmt = $pdo->prepare('SELECT id, tmdb_id, titulo, genero, clasificacion, duracion, director, anio, img, descripcion, trailer, estado, origen, creado_en, actualizado_en FROM peliculas WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    return cn_map_pelicula($stmt->fetch());
}

function cn_save_cine(PDO $pdo, array $input): array
{
    $id = (int)($input['id'] ?? 0);
    $nombre = trim((string)($input['nombre'] ?? ''));
    $region = trim((string)($input['region'] ?? ''));
    $direccion = trim((string)($input['direccion'] ?? ''));
    $activo = isset($input['activo']) ? (int)$input['activo'] : 1;

    if ($nombre === '' || $region === '') cn_json(['ok' => false, 'error' => 'Nombre y región son obligatorios'], 422);

    if ($id > 0) {
        $stmt = $pdo->prepare('UPDATE cines SET nombre = ?, region = ?, direccion = ?, activo = ? WHERE id = ?');
        $stmt->execute([$nombre, $region, $direccion, $activo, $id]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO cines (nombre, region, direccion, activo) VALUES (?, ?, ?, ?)');
        $stmt->execute([$nombre, $region, $direccion, $activo]);
        $id = (int)$pdo->lastInsertId();
    }

    $stmt = $pdo->prepare('SELECT id, nombre, region, direccion, activo FROM cines WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    return cn_map_cine($stmt->fetch());
}

function cn_save_funcion(PDO $pdo, array $input): array
{
    $id = (int)($input['id'] ?? 0);
    $peliculaId = (int)($input['peliculaId'] ?? $input['pelicula_id'] ?? 0);
    $cineId = (int)($input['cineId'] ?? $input['cine_id'] ?? 0);
    $horarios = $input['horarios'] ?? [];
    if (is_string($horarios)) {
        $horarios = array_values(array_filter(array_map('trim', explode(',', $horarios))));
    }
    if (!is_array($horarios)) $horarios = [];
    $precio = (float)($input['precio'] ?? 0);
    $fechaInicio = trim((string)($input['fechaInicio'] ?? $input['fecha_inicio'] ?? ''));
    $fechaFin = trim((string)($input['fechaFin'] ?? $input['fecha_fin'] ?? ''));

    if ($peliculaId <= 0 || $cineId <= 0) cn_json(['ok' => false, 'error' => 'Selecciona película y cine'], 422);

    $jsonHorarios = json_encode(array_values($horarios), JSON_UNESCAPED_UNICODE);

    if ($id > 0) {
        $stmt = $pdo->prepare('UPDATE funciones SET pelicula_id = ?, cine_id = ?, horarios = ?, precio = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?');
        $stmt->execute([$peliculaId, $cineId, $jsonHorarios, $precio, $fechaInicio ?: null, $fechaFin ?: null, $id]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO funciones (pelicula_id, cine_id, horarios, precio, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$peliculaId, $cineId, $jsonHorarios, $precio, $fechaInicio ?: null, $fechaFin ?: null]);
        $id = (int)$pdo->lastInsertId();
    }

    $stmt = $pdo->prepare("SELECT f.id, f.pelicula_id, f.cine_id, f.horarios, f.precio, f.fecha_inicio, f.fecha_fin,
                                  p.titulo AS pelicula_titulo,
                                  c.nombre AS cine_nombre, c.region AS cine_region, c.direccion AS cine_direccion
                           FROM funciones f
                           INNER JOIN peliculas p ON p.id = f.pelicula_id
                           INNER JOIN cines c ON c.id = f.cine_id
                           WHERE f.id = ? LIMIT 1");
    $stmt->execute([$id]);
    return cn_map_funcion($stmt->fetch());
}

function cn_save_usuario(PDO $pdo, array $input): array
{
    $id = (int)($input['id'] ?? 0);
    $nombre = trim((string)($input['nombre'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $rol = in_array(($input['rol'] ?? 'usuario'), ['admin', 'usuario'], true) ? $input['rol'] : 'usuario';
    $password = (string)($input['password'] ?? '');

    if ($nombre === '' || $email === '') cn_json(['ok' => false, 'error' => 'Nombre y correo son obligatorios'], 422);

    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1');
        $stmt->execute([$email, $id]);
        if ($stmt->fetchColumn()) cn_json(['ok' => false, 'error' => 'Este correo ya está registrado'], 409);

        if ($password !== '') {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('UPDATE usuarios SET nombre = ?, email = ?, password = ?, rol = ? WHERE id = ?');
            $stmt->execute([$nombre, $email, $hash, $rol, $id]);
        } else {
            $stmt = $pdo->prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?');
            $stmt->execute([$nombre, $email, $rol, $id]);
        }
    } else {
        if ($password === '') cn_json(['ok' => false, 'error' => 'La contraseña es obligatoria'], 422);
        $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        if ($stmt->fetchColumn()) cn_json(['ok' => false, 'error' => 'Este correo ya está registrado'], 409);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO usuarios (nombre, email, password, rol, fecha) VALUES (?, ?, ?, ?, NOW())');
        $stmt->execute([$nombre, $email, $hash, $rol]);
        $id = (int)$pdo->lastInsertId();
    }

    $stmt = $pdo->prepare('SELECT id, nombre, email, rol, fecha FROM usuarios WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return [
        'id' => (int)$row['id'],
        'nombre' => $row['nombre'],
        'email' => $row['email'],
        'rol' => $row['rol'],
        'fecha' => $row['fecha'] ?? null,
    ];
}

// ── Enrutamiento de acciones ────────────────────────
if ($action === 'dashboard') {
    cn_json(['ok' => true, 'data' => cn_dashboard($pdo)]);
}

if ($action === 'list') {
    cn_json(['ok' => true, 'items' => cn_entity_list($pdo, $entity)]);
}

if ($action === 'set_config') {
    $key = trim((string)($input['key'] ?? ''));
    $value = (string)($input['value'] ?? '');
    if ($key === '') cn_json(['ok' => false, 'error' => 'La clave es obligatoria'], 422);
    cn_upsert_config($pdo, $key, $value);
    cn_json(['ok' => true, 'message' => 'Configuración actualizada']);
}

if ($action === 'save') {
    switch ($entity) {
        case 'peliculas':
            cn_json(['ok' => true, 'item' => cn_save_pelicula($pdo, $input)]);
        case 'cines':
            cn_json(['ok' => true, 'item' => cn_save_cine($pdo, $input)]);
        case 'funciones':
            cn_json(['ok' => true, 'item' => cn_save_funcion($pdo, $input)]);
        case 'usuarios':
            cn_json(['ok' => true, 'item' => cn_save_usuario($pdo, $input)]);
        default:
            cn_json(['ok' => false, 'error' => 'Entidad no válida'], 400);
    }
}

if ($action === 'delete') {
    $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) cn_json(['ok' => false, 'error' => 'ID inválido'], 422);

    switch ($entity) {
        case 'peliculas':
            $stmt = $pdo->prepare('DELETE FROM peliculas WHERE id = ?');
            $stmt->execute([$id]);
            break;
        case 'cines':
            $stmt = $pdo->prepare('DELETE FROM cines WHERE id = ?');
            $stmt->execute([$id]);
            break;
        case 'funciones':
            $stmt = $pdo->prepare('DELETE FROM funciones WHERE id = ?');
            $stmt->execute([$id]);
            break;
        case 'usuarios':
            $me = cn_current_user($pdo);
            if ($me && (int)$me['id'] === $id) cn_json(['ok' => false, 'error' => 'No puedes eliminar tu propia sesión'], 422);
            $stmt = $pdo->prepare('DELETE FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            break;
        case 'resenas':
            $stmt = $pdo->prepare('DELETE FROM resenas WHERE id = ?');
            $stmt->execute([$id]);
            break;
        default:
            cn_json(['ok' => false, 'error' => 'Entidad no válida'], 400);
    }

    cn_json(['ok' => true, 'message' => 'Registro eliminado']);
}

// ── NUEVA ACCIÓN: distribuir película en todos los cines activos ──
if ($action === 'distribuir_pelicula') {
    $peliculaId = (int)($input['peliculaId'] ?? 0);
    if ($peliculaId <= 0) cn_json(['ok' => false, 'error' => 'ID de película inválido'], 422);

    $asignados = cn_distribuir_pelicula($pdo, $peliculaId);
    cn_json(['ok' => true, 'asignados' => $asignados, 'message' => "Película asignada a $asignados cines"]);
}

cn_json(['ok' => false, 'error' => 'Acción no válida'], 400);