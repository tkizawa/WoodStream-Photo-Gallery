<?php
/**
 * WoodStream Photo Gallery - さくらのレンタルサーバ用 PHP バックエンド API
 * MySQL 連携・Web編集モード認証・アップロード・整理・削除・サムネイル配信を提供します。
 */

require_once __DIR__ . '/lib/GalleryCore.php';

$core = new GalleryCore();

// サムネイル配信モード (?thumb=1&path=...&w=600)
if (isset($_GET['thumb']) && isset($_GET['path'])) {
    $core->serveThumbnail((string)$_GET['path'], isset($_GET['w']) ? (int)$_GET['w'] : 600);
    exit;
}

header('Content-Type: application/json; charset=UTF-8');

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function jsonInput(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function requireAdminAuth(GalleryCore $core): void
{
    if (!$core->isAdmin()) {
        respond(['error' => '管理者認証が必要です。編集モードにログインしてください。'], 401);
    }
}

try {
    // 1. 認証ステータス確認
    if ($action === 'auth_status') {
        respond([
            'authenticated' => $core->isAdmin(),
            'username' => $core->getAdminUsername(),
            'dbConnected' => $core->getDb() !== null,
        ]);
    }

    // 2. ログイン
    if ($action === 'login' && $method === 'POST') {
        $input = jsonInput();
        $username = trim((string)($input['username'] ?? ''));
        $password = (string)($input['password'] ?? '');

        if ($core->login($username, $password)) {
            respond([
                'authenticated' => true,
                'username' => $core->getAdminUsername(),
                'dbConnected' => $core->getDb() !== null,
            ]);
        }
        respond(['error' => 'アカウント名またはパスワードが正しくありません。'], 401);
    }

    // 3. ログアウト
    if ($action === 'logout' && $method === 'POST') {
        $core->logout();
        respond(['authenticated' => false]);
    }

    // 4. 管理者操作系
    if ($action === 'sync' && $method === 'POST') {
        requireAdminAuth($core);
        $res = $core->syncFromFilesystem();
        respond(['success' => true, 'result' => $res]);
    }

    if ($action === 'album_create' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $album = $core->createAlbum((string)($input['name'] ?? ''), (string)($input['description'] ?? ''));
        respond(['success' => true, 'album' => $album]);
    }

    if ($action === 'album_update' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $album = $core->updateAlbum(
            (int)($input['albumId'] ?? 0),
            isset($input['name']) ? (string)$input['name'] : null,
            isset($input['description']) ? (string)$input['description'] : null
        );
        respond(['success' => true, 'album' => $album]);
    }

    if ($action === 'album_delete' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $res = $core->deleteAlbum((int)($input['albumId'] ?? 0));
        respond(['success' => true, 'result' => $res]);
    }

    if ($action === 'date_group_rename' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $res = $core->renameDateGroup(
            (int)($input['albumId'] ?? 0),
            (string)($input['oldDateGroup'] ?? ''),
            (string)($input['newDateGroup'] ?? '')
        );
        respond(['success' => true, 'result' => $res]);
    }

    if ($action === 'date_group_delete' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $res = $core->deleteDateGroup(
            (int)($input['albumId'] ?? 0),
            (string)($input['dateGroup'] ?? '')
        );
        respond(['success' => true, 'result' => $res]);
    }

    if ($action === 'upload' && $method === 'POST') {
        requireAdminAuth($core);

        $albumId = !empty($_POST['albumId']) ? (int)$_POST['albumId'] : null;
        $albumName = trim((string)($_POST['newAlbumName'] ?? ''));
        $dateGroup = trim((string)($_POST['dateGroup'] ?? date('Y-m-d')));
        $title = trim((string)($_POST['title'] ?? ''));
        $caption = trim((string)($_POST['caption'] ?? ''));
        $tags = trim((string)($_POST['tags'] ?? ''));

        if (empty($_FILES['files'])) {
            respond(['error' => 'アップロードする画像ファイルが選択されていません。'], 400);
        }

        $files = $_FILES['files'];
        $uploaded = [];
        $errors = [];

        $count = is_array($files['name']) ? count($files['name']) : 1;
        for ($i = 0; $i < $count; $i++) {
            $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
            $tmpName = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
            $errCode = is_array($files['error']) ? $files['error'][$i] : $files['error'];

            if ($errCode !== UPLOAD_ERR_OK) {
                $errors[] = "{$name}: アップロードエラー (code {$errCode})";
                continue;
            }

            try {
                $photo = $core->uploadPhoto($tmpName, $name, $albumId, $albumName, $dateGroup, $title, $caption, $tags);
                if (!$albumId && !empty($photo['albumId'])) {
                    $albumId = (int)$photo['albumId'];
                    $albumName = '';
                }
                $uploaded[] = $photo;
            } catch (Throwable $e) {
                $errors[] = "{$name}: " . $e->getMessage();
            }
        }

        respond([
            'success' => count($uploaded) > 0,
            'uploaded' => $uploaded,
            'errors' => $errors,
        ], count($uploaded) > 0 ? 200 : 400);
    }

    if ($action === 'photo_update' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $photoId = (int)($input['photoId'] ?? 0);
        $photo = $core->updatePhoto($photoId, $input);
        respond(['success' => true, 'photo' => $photo]);
    }

    if ($action === 'photo_move' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $photoIds = $input['photoIds'] ?? [];
        $targetAlbumId = !empty($input['targetAlbumId']) ? (int)$input['targetAlbumId'] : null;
        $targetAlbumName = isset($input['targetAlbumName']) ? trim((string)$input['targetAlbumName']) : null;
        $targetDateGroup = trim((string)($input['targetDateGroup'] ?? ''));

        $moved = $core->movePhotos($photoIds, $targetAlbumId, $targetAlbumName, $targetDateGroup);
        respond(['success' => true, 'moved' => $moved]);
    }

    if ($action === 'photo_delete' && $method === 'POST') {
        requireAdminAuth($core);
        $input = jsonInput();
        $photoIds = $input['photoIds'] ?? [];
        $res = $core->deletePhotos($photoIds);
        respond(['success' => true, 'result' => $res]);
    }

    // 5. デフォルト: ギャラリーデータ一覧取得
    $includeHidden = $core->isAdmin();
    $data = $core->getGalleryData($includeHidden);
    respond($data);
} catch (Throwable $e) {
    respond(['error' => $e->getMessage()], 500);
}
