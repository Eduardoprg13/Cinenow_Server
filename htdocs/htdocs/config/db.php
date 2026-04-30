<?php
declare(strict_types=1);

define('DB_HOST', 'sql208.infinityfree.com');
define('DB_NAME', 'if0_41780615_cinenow');
define('DB_USER', 'if0_41780615');
define('DB_PASS', 'Cinenow67');
define('DB_CHARSET', 'utf8mb4');

function cn_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok'=>false,'error'=>'No se pudo conectar a MySQL','detail'=>$e->getMessage()], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
