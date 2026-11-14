<?php
/**
 * WoodStream Photo Gallery - サーバー設定テンプレート
 *
 * このファイルを `config.php` にコピーし、さくらインターネットの
 * MySQL 接続情報および MCP トークンを設定してください。
 */

return [
    'db' => [
        'enabled' => true,
        'host' => 'mysqlXXX.db.sakura.ne.jp',
        'port' => 3306,
        'dbname' => 'your_database_name',
        'username' => 'your_db_user',
        'password' => 'your_db_password',
        'charset' => 'utf8mb4',
    ],
    'admin' => [
        'username' => 'kizawa',
        // パスワード変更時は php -r "echo password_hash('新パスワード', PASSWORD_DEFAULT);" で生成
        'password_hash' => '$2y$12$mk5vlg1VjKnfheFY.hwJmOhjXicrmh9Lm/PLX37hgXF73BOMOnZ1G',
    ],
    'mcp' => [
        'enabled' => true,
        // MCP クライアントからの Authorization: Bearer <token> 認証用トークン
        'bearer_token' => 'CHANGE_THIS_TO_A_SECURE_RANDOM_TOKEN',
    ],
    'paths' => [
        'images_dir' => __DIR__ . '/images',
        'cache_dir' => __DIR__ . '/.cache',
    ],
];

