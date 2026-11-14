<?php
/**
 * WoodStream Photo Gallery - MCP Server (Pattern A: Streamable HTTP)
 * さくらのレンタルサーバ上で動作する JSON-RPC 2.0 準拠 MCP エンドポイント。
 * Authorization: Bearer <token> で認証し、AIアシスタントからギャラリーを操作できます。
 */

require_once __DIR__ . '/lib/GalleryCore.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Expose-Headers: Mcp-Session-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed. Use POST for MCP Streamable HTTP.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$core = new GalleryCore();

// Bearer トークン検証（さくらサーバー等で HTTP_AUTHORIZATION が渡らないケースにも対応）
$authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';
if ($authHeader === '' && function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
}

if (!$core->verifyBearerToken($authHeader)) {
    http_response_code(401);
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => null,
        'error' => ['code' => -32001, 'message' => 'Unauthorized: Invalid or missing Bearer token'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$req = json_decode($raw ?: '', true);

if (!is_array($req) || empty($req['method'])) {
    http_response_code(400);
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => null,
        'error' => ['code' => -32600, 'message' => 'Invalid JSON-RPC request'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$id = $req['id'] ?? null;
$method = $req['method'];
$params = $req['params'] ?? [];

function mcpResult($id, array $result): void
{
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'result' => $result,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mcpError($id, int $code, string $message): void
{
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'error' => [
            'code' => $code,
            'message' => $message,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mcpToolText($id, $payload, bool $isError = false): void
{
    $text = is_string($payload) ? $payload : json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    mcpResult($id, [
        'content' => [
            ['type' => 'text', 'text' => $text],
        ],
        'isError' => $isError,
    ]);
}

// 通知（レスポンス不要）
if ($method === 'notifications/initialized') {
    http_response_code(202);
    exit;
}

if ($method === 'ping') {
    mcpResult($id, new stdClass());
}

if ($method === 'initialize') {
    $sessionId = $_SERVER['HTTP_MCP_SESSION_ID'] ?? bin2hex(random_bytes(16));
    header('Mcp-Session-Id: ' . $sessionId);
    mcpResult($id, [
        'protocolVersion' => $params['protocolVersion'] ?? '2025-03-26',
        'capabilities' => [
            'tools' => ['listChanged' => false],
        ],
        'serverInfo' => [
            'name' => 'WoodStream Photo Gallery MCP',
            'version' => '1.0.0',
        ],
    ]);
}

if ($method === 'tools/list') {
    $tools = [
        [
            'name' => 'list_albums',
            'description' => 'ギャラリー内のアルバム一覧と各アルバムの写真枚数・最新撮影日を取得します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => new stdClass(),
            ],
        ],
        [
            'name' => 'search_photos',
            'description' => 'キーワード、アルバム名、撮影日、カメラ、レンズ、タグで写真を検索します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'フリーワード（ファイル名、タイトル、メモ、タグ、EXIF等）'],
                    'album' => ['type' => 'string', 'description' => 'アルバム名（部分一致）'],
                    'date' => ['type' => 'string', 'description' => '撮影日グループ（例: 2026-05）'],
                    'camera' => ['type' => 'string', 'description' => 'カメラ機種名（部分一致）'],
                    'lens' => ['type' => 'string', 'description' => 'レンズ名（部分一致）'],
                    'tag' => ['type' => 'string', 'description' => 'タグ（部分一致）'],
                    'limit' => ['type' => 'integer', 'description' => '取得件数上限（デフォルト50、最大200）'],
                ],
            ],
        ],
        [
            'name' => 'get_photo_detail',
            'description' => '指定した写真IDの詳細情報とEXIFデータを取得します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'photo_id' => ['type' => 'integer', 'description' => '写真ID'],
                ],
                'required' => ['photo_id'],
            ],
        ],
        [
            'name' => 'create_album',
            'description' => '新しいアルバムを作成します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'アルバム名'],
                    'description' => ['type' => 'string', 'description' => 'アルバムの説明（任意）'],
                ],
                'required' => ['name'],
            ],
        ],
        [
            'name' => 'rename_album',
            'description' => '既存アルバムの名前または説明を変更します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'album_id' => ['type' => 'integer', 'description' => 'アルバムID'],
                    'name' => ['type' => 'string', 'description' => '新しいアルバム名'],
                    'description' => ['type' => 'string', 'description' => '新しい説明'],
                ],
                'required' => ['album_id'],
            ],
        ],
        [
            'name' => 'upload_photo',
            'description' => 'Base64画像データまたは画像URLから写真をアップロードして登録します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'file_name' => ['type' => 'string', 'description' => '保存するファイル名（例: IMG_001.jpg）'],
                    'album_id' => ['type' => 'integer', 'description' => '登録先アルバムID（album_nameとどちらか指定）'],
                    'album_name' => ['type' => 'string', 'description' => '登録先アルバム名（存在しない場合は新規作成）'],
                    'date_group' => ['type' => 'string', 'description' => '撮影日グループ（例: 2026-11-13）'],
                    'image_base64' => ['type' => 'string', 'description' => 'Base64エンコードされた画像データ'],
                    'image_url' => ['type' => 'string', 'description' => '取得元画像のhttp/https URL'],
                    'title' => ['type' => 'string', 'description' => '写真タイトル'],
                    'caption' => ['type' => 'string', 'description' => '撮影メモ・キャプション'],
                    'tags' => ['type' => 'string', 'description' => 'カンマ区切りタグ'],
                ],
                'required' => ['file_name', 'date_group'],
            ],
        ],
        [
            'name' => 'update_photo',
            'description' => '写真のタイトル、キャプション、タグ、公開設定などを更新します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'photo_id' => ['type' => 'integer', 'description' => '写真ID'],
                    'title' => ['type' => 'string', 'description' => 'タイトル'],
                    'caption' => ['type' => 'string', 'description' => 'キャプション・メモ'],
                    'tags' => ['type' => 'string', 'description' => 'タグ'],
                    'is_public' => ['type' => 'boolean', 'description' => '公開するかどうか'],
                ],
                'required' => ['photo_id'],
            ],
        ],
        [
            'name' => 'move_photos',
            'description' => '複数の写真を指定したアルバム・撮影日グループへ移動して分類します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'photo_ids' => [
                        'type' => 'array',
                        'items' => ['type' => 'integer'],
                        'description' => '移動する写真IDの配列',
                    ],
                    'target_album_id' => ['type' => 'integer', 'description' => '移動先アルバムID'],
                    'target_album_name' => ['type' => 'string', 'description' => '移動先アルバム名（未存在時は新規作成）'],
                    'target_date_group' => ['type' => 'string', 'description' => '移動先の撮影日グループ（例: 2026-11-13）'],
                ],
                'required' => ['photo_ids', 'target_date_group'],
            ],
        ],
        [
            'name' => 'delete_photos',
            'description' => '指定した写真IDのデータをDBとサーバーから削除します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'photo_ids' => [
                        'type' => 'array',
                        'items' => ['type' => 'integer'],
                        'description' => '削除する写真IDの配列',
                    ],
                ],
                'required' => ['photo_ids'],
            ],
        ],
        [
            'name' => 'sync_filesystem',
            'description' => 'images/ フォルダ内の未登録写真をスキャンしてMySQLに一括登録します。',
            'inputSchema' => [
                'type' => 'object',
                'properties' => new stdClass(),
            ],
        ],
    ];

    mcpResult($id, ['tools' => $tools]);
}

if ($method === 'tools/call') {
    $toolName = $params['name'] ?? '';
    $args = $params['arguments'] ?? [];

    try {
        switch ($toolName) {
            case 'list_albums':
                mcpToolText($id, $core->listAlbumsSummary());
                break;

            case 'search_photos':
                mcpToolText($id, $core->searchPhotos($args));
                break;

            case 'get_photo_detail':
                $photo = $core->getPhotoById((int)($args['photo_id'] ?? 0));
                if (!$photo) {
                    mcpToolText($id, '指定された写真が見つかりません。', true);
                }
                mcpToolText($id, $photo);
                break;

            case 'create_album':
                $album = $core->createAlbum((string)($args['name'] ?? ''), (string)($args['description'] ?? ''));
                mcpToolText($id, $album);
                break;

            case 'rename_album':
                $album = $core->updateAlbum(
                    (int)($args['album_id'] ?? 0),
                    isset($args['name']) ? (string)$args['name'] : null,
                    isset($args['description']) ? (string)$args['description'] : null
                );
                mcpToolText($id, $album);
                break;

            case 'upload_photo':
                $photo = $core->uploadPhotoFromPayload(
                    $args['image_base64'] ?? null,
                    $args['image_url'] ?? null,
                    (string)($args['file_name'] ?? 'upload.jpg'),
                    isset($args['album_id']) ? (int)$args['album_id'] : null,
                    isset($args['album_name']) ? (string)$args['album_name'] : null,
                    (string)($args['date_group'] ?? date('Y-m-d')),
                    (string)($args['title'] ?? ''),
                    (string)($args['caption'] ?? ''),
                    (string)($args['tags'] ?? '')
                );
                mcpToolText($id, $photo);
                break;

            case 'update_photo':
                $fields = [];
                foreach (['title', 'caption', 'tags', 'is_public'] as $k) {
                    if (array_key_exists($k, $args)) {
                        $fields[$k] = $args[$k];
                    }
                }
                $photo = $core->updatePhoto((int)($args['photo_id'] ?? 0), $fields);
                mcpToolText($id, $photo);
                break;

            case 'move_photos':
                $moved = $core->movePhotos(
                    $args['photo_ids'] ?? [],
                    isset($args['target_album_id']) ? (int)$args['target_album_id'] : null,
                    isset($args['target_album_name']) ? (string)$args['target_album_name'] : null,
                    (string)($args['target_date_group'] ?? date('Y-m-d'))
                );
                mcpToolText($id, $moved);
                break;

            case 'delete_photos':
                $res = $core->deletePhotos($args['photo_ids'] ?? []);
                mcpToolText($id, $res);
                break;

            case 'sync_filesystem':
                $res = $core->syncFromFilesystem();
                mcpToolText($id, $res);
                break;

            default:
                mcpError($id, -32601, "Unknown tool: {$toolName}");
        }
    } catch (Throwable $e) {
        mcpToolText($id, 'Error: ' . $e->getMessage(), true);
    }
}

mcpError($id, -32601, "Method not found: {$method}");

