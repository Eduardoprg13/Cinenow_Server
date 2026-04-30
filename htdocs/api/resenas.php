<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$pdo = cn_pdo();
$input = cn_input();
$action = $input['action'] ?? $_GET['action'] ?? 'list';

if ($action === 'list') {
    $where = '';
    $params = [];
    if (!empty($_GET['peliculaId'])) {
        $where = 'WHERE r.pelicula_id = ?';
        $params[] = (int)$_GET['peliculaId'];
    }
    $sql = "SELECT r.id, r.pelicula_id, r.usuario_id, r.rating, r.texto,
                   DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha_formato,
                   u.nombre AS autor
            FROM resenas r
            INNER JOIN usuarios u ON u.id = r.usuario_id
            $where
            ORDER BY r.fecha DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array_map('cn_map_resena', $stmt->fetchAll());
    cn_json(['ok' => true, 'items' => $rows]);
}

if ($action === 'create') {
    $user = cn_require_login($pdo);
    $peliculaId = (int)($input['peliculaId'] ?? 0);
    $rating = (int)($input['rating'] ?? 0);
    $texto = trim((string)($input['texto'] ?? ''));

    if ($peliculaId <= 0 || $rating < 1 || $rating > 5 || $texto === '') {
        cn_json(['ok' => false, 'error' => 'Datos de reseña inválidos'], 422);
    }

    $stmt = $pdo->prepare('SELECT id FROM resenas WHERE pelicula_id = ? AND usuario_id = ? LIMIT 1');
    $stmt->execute([$peliculaId, (int)$user['id']]);
    if ($stmt->fetchColumn()) {
        cn_json(['ok' => false, 'error' => 'Ya dejaste una reseña para esta película'], 409);
    }

    $stmt = $pdo->prepare('INSERT INTO resenas (pelicula_id, usuario_id, rating, texto, fecha) VALUES (?, ?, ?, ?, NOW())');
    $stmt->execute([$peliculaId, (int)$user['id'], $rating, $texto]);

    $id = (int)$pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT r.id, r.pelicula_id, r.usuario_id, r.rating, r.texto,
                                   DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha_formato,
                                   u.nombre AS autor
                            FROM resenas r
                            INNER JOIN usuarios u ON u.id = r.usuario_id
                            WHERE r.id = ? LIMIT 1");
    $stmt->execute([$id]);
    $item = cn_map_resena($stmt->fetch());

    cn_json(['ok' => true, 'item' => $item]);
}

if ($action === 'delete') {
    $user = cn_require_login($pdo);
    $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) cn_json(['ok' => false, 'error' => 'ID inválido'], 422);

    $stmt = $pdo->prepare('SELECT usuario_id FROM resenas WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $ownerId = $stmt->fetchColumn();
    if (!$ownerId) cn_json(['ok' => false, 'error' => 'Reseña no encontrada'], 404);

    if ($user['rol'] !== 'admin' && (int)$ownerId !== (int)$user['id']) {
        cn_json(['ok' => false, 'error' => 'No puedes eliminar esta reseña'], 403);
    }

    $stmt = $pdo->prepare('DELETE FROM resenas WHERE id = ?');
    $stmt->execute([$id]);
    cn_json(['ok' => true, 'message' => 'Reseña eliminada']);
}

cn_json(['ok' => false, 'error' => 'Acción no válida'], 400);
