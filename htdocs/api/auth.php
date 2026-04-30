<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$pdo = cn_pdo();
$input = cn_input();
$action = $input['action'] ?? $_GET['action'] ?? 'me';

if ($action === 'me') {
    cn_json(['ok' => true, 'user' => cn_current_user($pdo)]);
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    session_destroy();
    cn_json(['ok' => true, 'message' => 'Sesión cerrada']);
}

if ($action === 'login') {
    $email = trim((string)($input['email'] ?? ''));
    $password = (string)($input['password'] ?? '');
    if ($email === '' || $password === '') {
        cn_json(['ok' => false, 'error' => 'Completa correo y contraseña'], 422);
    }

    $stmt = $pdo->prepare('SELECT id, nombre, email, password, rol, fecha FROM usuarios WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        cn_json(['ok' => false, 'error' => 'Correo o contraseña incorrectos'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    cn_json(['ok' => true, 'user' => cn_safe_user($user)]);
}

if ($action === 'register') {
    $nombre = trim((string)($input['nombre'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if ($nombre === '' || $email === '' || $password === '') {
        cn_json(['ok' => false, 'error' => 'Completa todos los campos'], 422);
    }
    if (mb_strlen($password) < 6) {
        cn_json(['ok' => false, 'error' => 'La contraseña debe tener al menos 6 caracteres'], 422);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        cn_json(['ok' => false, 'error' => 'Correo no válido'], 422);
    }

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetchColumn()) {
        cn_json(['ok' => false, 'error' => 'Este correo ya está registrado'], 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO usuarios (nombre, email, password, rol, fecha) VALUES (?, ?, ?, ?, NOW())');
    $stmt->execute([$nombre, $email, $hash, 'usuario']);

    $id = (int)$pdo->lastInsertId();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $id;

    cn_json(['ok' => true, 'user' => cn_current_user($pdo)]);
}

cn_json(['ok' => false, 'error' => 'Acción no válida'], 400);
