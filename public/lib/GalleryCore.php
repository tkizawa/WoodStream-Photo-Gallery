<?php
/**
 * WoodStream Photo Gallery - 共通バックエンドコア
 * MySQL連携、EXIF解析、サムネイル生成、管理者認証、アルバム/写真CRUDを提供。
 * api.php（Web管理UI）および mcp.php（MCPサーバー）の両方から利用されます。
 */

class GalleryCore
{
    private array $config;
    private ?PDO $pdo = null;
    private bool $dbChecked = false;
    private string $imagesDir;
    private string $cacheDir;
    private string $thumbDir;

    public function __construct(?string $configPath = null)
    {
        $publicDir = dirname(__DIR__);
        $defaultConfig = $publicDir . '/config.php';
        $exampleConfig = $publicDir . '/config.example.php';

        if ($configPath && file_exists($configPath)) {
            $this->config = require $configPath;
        } elseif (file_exists($defaultConfig)) {
            $this->config = require $defaultConfig;
        } elseif (file_exists($exampleConfig)) {
            $this->config = require $exampleConfig;
        } else {
            $this->config = [];
        }

        $this->imagesDir = $this->config['paths']['images_dir'] ?? ($publicDir . '/images');
        if (!is_dir($this->imagesDir)) {
            @mkdir($this->imagesDir, 0755, true);
        }

        $this->cacheDir = $this->config['paths']['cache_dir'] ?? ($publicDir . '/.cache');
        $this->thumbDir = $this->cacheDir . '/thumbnails';
        if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir, 0755, true);
        if (!is_dir($this->thumbDir)) @mkdir($this->thumbDir, 0755, true);
    }

    public function getConfig(): array
    {
        return $this->config;
    }

    public function getImagesDir(): string
    {
        return $this->imagesDir;
    }

    /**
     * MySQL PDO接続を取得（未設定・接続不可時は null を返す）
     */
    public function getDb(): ?PDO
    {
        if ($this->dbChecked) {
            return $this->pdo;
        }
        $this->dbChecked = true;

        $db = $this->config['db'] ?? [];
        if (empty($db['enabled']) || empty($db['host']) || empty($db['dbname']) || $db['dbname'] === 'your_database_name') {
            return null;
        }

        try {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                $db['host'],
                (int)($db['port'] ?? 3306),
                $db['dbname'],
                $db['charset'] ?? 'utf8mb4'
            );
            $this->pdo = new PDO($dsn, $db['username'] ?? '', $db['password'] ?? '', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $this->ensureSchema();
        } catch (Throwable $e) {
            $this->pdo = null;
        }

        return $this->pdo;
    }

    /**
     * DB接続を必須とする（接続不可時は例外を送出）
     */
    public function requireDb(): PDO
    {
        $pdo = $this->getDb();
        if (!$pdo) {
            throw new RuntimeException('MySQLデータベースに接続できません。public/config.php の接続設定を確認してください。');
        }
        return $pdo;
    }

    /**
     * テーブルが存在しない場合に自動作成する
     */
    public function ensureSchema(): void
    {
        if (!$this->pdo) return;

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS `albums` (
              `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
              `name` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `sort_order` INT NOT NULL DEFAULT 0,
              `cover_photo_id` INT UNSIGNED NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_album_name` (`name`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS `photos` (
              `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
              `album_id` INT UNSIGNED NOT NULL,
              `date_group` VARCHAR(100) NOT NULL,
              `file_name` VARCHAR(255) NOT NULL,
              `rel_path` VARCHAR(512) NOT NULL,
              `title` VARCHAR(255) NULL,
              `caption` TEXT NULL,
              `tags` VARCHAR(500) NULL,
              `file_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
              `width` INT UNSIGNED NOT NULL DEFAULT 0,
              `height` INT UNSIGNED NOT NULL DEFAULT 0,
              `aspect_ratio` DECIMAL(8,4) NOT NULL DEFAULT 1.5000,
              `taken_at` VARCHAR(64) NULL,
              `exif_json` LONGTEXT NULL,
              `sort_order` INT NOT NULL DEFAULT 0,
              `is_public` TINYINT(1) NOT NULL DEFAULT 1,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_rel_path` (`rel_path`),
              KEY `idx_album_date` (`album_id`, `date_group`),
              KEY `idx_taken_at` (`taken_at`),
              CONSTRAINT `fk_photos_album` FOREIGN KEY (`album_id`) REFERENCES `albums` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    // ==================== 管理者認証（セッション） ====================

    public function startSession(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || (($_SERVER['SERVER_PORT'] ?? 80) == 443);
            session_set_cookie_params([
                'lifetime' => 86400 * 7,
                'path' => '/',
                'secure' => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            @session_start();
        }
    }

    public function isAdmin(): bool
    {
        $this->startSession();
        return !empty($_SESSION['ws_admin_authenticated']) && !empty($_SESSION['ws_admin_user']);
    }

    public function getAdminUsername(): ?string
    {
        $this->startSession();
        return $this->isAdmin() ? (string)$_SESSION['ws_admin_user'] : null;
    }

    public function login(string $username, string $password): bool
    {
        $admin = $this->config['admin'] ?? [];
        $expectedUser = $admin['username'] ?? 'kizawa';
        $expectedHash = $admin['password_hash'] ?? '';

        if ($username !== $expectedUser || $expectedHash === '') {
            return false;
        }
        if (!password_verify($password, $expectedHash)) {
            return false;
        }

        $this->startSession();
        session_regenerate_id(true);
        $_SESSION['ws_admin_authenticated'] = true;
        $_SESSION['ws_admin_user'] = $expectedUser;
        return true;
    }

    public function logout(): void
    {
        $this->startSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        @session_destroy();
    }

    public function verifyBearerToken(?string $authHeader): bool
    {
        $mcp = $this->config['mcp'] ?? [];
        if (empty($mcp['enabled'])) return false;
        $token = $mcp['bearer_token'] ?? '';
        if ($token === '' || $token === 'CHANGE_THIS_TO_A_SECURE_RANDOM_TOKEN') {
            return false;
        }
        if (!$authHeader) {
            return false;
        }
        // クライアント側で "Bearer " が二重付与された場合も許容する
        $provided = trim(preg_replace('/^(?:\s*Bearer\s+)+/i', '', $authHeader));
        return $provided !== '' && hash_equals($token, $provided);
    }

    // ==================== EXIF & サムネイル処理 ====================

    public static function formatShutterSpeed($exp): ?string
    {
        if (!$exp) return null;
        if (is_string($exp) && strpos($exp, '/') !== false) {
            $parts = explode('/', $exp);
            if (count($parts) === 2 && (float)$parts[1] > 0) {
                $val = (float)$parts[0] / (float)$parts[1];
                if ($val >= 1) return round($val, 1) . 's';
                if ($val > 0) return '1/' . round(1 / $val) . 's';
            }
            return $exp . 's';
        }
        $val = (float)$exp;
        if ($val <= 0) return null;
        if ($val >= 1) return round($val, 1) . 's';
        $denom = round(1 / $val);
        return "1/{$denom}s";
    }

    public static function formatFileSize($bytes): string
    {
        if (!$bytes) return '0 B';
        $units = ['B', 'KB', 'MB', 'GB'];
        $pow = (int)floor(log((float)$bytes, 1024));
        $pow = min($pow, count($units) - 1);
        return round($bytes / pow(1024, $pow), 1) . ' ' . $units[$pow];
    }

    public static function extractExifData(string $filePath, string $relPath): array
    {
        $size = @filesize($filePath) ?: 0;
        $imgSize = @getimagesize($filePath);
        $width = $imgSize ? (int)$imgSize[0] : 1920;
        $height = $imgSize ? (int)$imgSize[1] : 1080;

        // 全セクション（IFD0, EXIF, GPS等）を解析
        // 第2引数に 'EXIF' を渡すと IFD0（Make, Model, Orientation等）が読まれないため null を指定
        $exif = @exif_read_data($filePath, null, true) ?: [];

        $make = isset($exif['IFD0']['Make']) ? trim((string)$exif['IFD0']['Make']) : (isset($exif['Make']) ? trim((string)$exif['Make']) : '');
        $model = isset($exif['IFD0']['Model']) ? trim((string)$exif['IFD0']['Model']) : (isset($exif['Model']) ? trim((string)$exif['Model']) : '');
        if ($model === '') {
            $model = 'Unknown Camera';
        }

        $lens = '';
        if (!empty($exif['EXIF']['UndefinedTag:0xA434'])) {
            $lens = trim((string)$exif['EXIF']['UndefinedTag:0xA434']);
        } elseif (!empty($exif['EXIF']['LensModel'])) {
            $lens = trim((string)$exif['EXIF']['LensModel']);
        } elseif (!empty($exif['LensModel'])) {
            $lens = trim((string)$exif['LensModel']);
        }

        $dt = $exif['EXIF']['DateTimeOriginal']
            ?? ($exif['DateTimeOriginal']
            ?? ($exif['IFD0']['DateTime']
            ?? ($exif['DateTime']
            ?? date('c', @filemtime($filePath) ?: time()))));
        if (preg_match('/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/', (string)$dt, $m)) {
            $dt = "{$m[1]}-{$m[2]}-{$m[3]}T{$m[4]}+09:00";
        }

        $focal = $exif['EXIF']['FocalLength'] ?? ($exif['FocalLength'] ?? null);
        if ($focal && strpos((string)$focal, '/') !== false) {
            $parts = explode('/', (string)$focal);
            $focal = ((float)$parts[1] > 0) ? round((float)$parts[0] / (float)$parts[1]) . 'mm' : null;
        } elseif ($focal) {
            $focal = round((float)$focal) . 'mm';
        }

        $focal35 = isset($exif['EXIF']['FocalLengthIn35mmFilm'])
            ? ((int)$exif['EXIF']['FocalLengthIn35mmFilm'] . 'mm')
            : (isset($exif['FocalLengthIn35mmFilm']) ? ((int)$exif['FocalLengthIn35mmFilm'] . 'mm') : null);

        $fNum = $exif['EXIF']['FNumber'] ?? ($exif['FNumber'] ?? null);
        if ($fNum && strpos((string)$fNum, '/') !== false) {
            $parts = explode('/', (string)$fNum);
            $fNum = ((float)$parts[1] > 0) ? 'f/' . round((float)$parts[0] / (float)$parts[1], 1) : null;
        } elseif ($fNum) {
            $fNum = 'f/' . round((float)$fNum, 1);
        }

        $rawShutter = $exif['EXIF']['ExposureTime'] ?? ($exif['ExposureTime'] ?? null);
        $shutter = $rawShutter !== null ? self::formatShutterSpeed($rawShutter) : null;

        $isoVal = $exif['EXIF']['ISOSpeedRatings'] ?? ($exif['ISOSpeedRatings'] ?? null);
        if (is_array($isoVal)) $isoVal = $isoVal[0] ?? null;
        $iso = $isoVal ? 'ISO ' . $isoVal : null;

        $bias = $exif['EXIF']['ExposureBiasValue'] ?? ($exif['ExposureBiasValue'] ?? null);
        $biasStr = '0 EV';
        if ($bias !== null && $bias !== '') {
            if (strpos((string)$bias, '/') !== false) {
                $parts = explode('/', (string)$bias);
                $val = ((float)$parts[1] > 0) ? (float)$parts[0] / (float)$parts[1] : 0;
                $biasStr = ($val > 0 ? '+' : '') . round($val, 1) . ' EV';
            } else {
                $val = (float)$bias;
                $biasStr = ($val > 0 ? '+' : '') . round($val, 1) . ' EV';
            }
        }

        $orientation = (int)($exif['IFD0']['Orientation'] ?? ($exif['Orientation'] ?? 1));
        if (in_array($orientation, [6, 8], true)) {
            $tmp = $width;
            $width = $height;
            $height = $tmp;
        }

        $aspectRatio = ($height > 0) ? round($width / $height, 4) : 1.5;

        return [
            'fileName' => basename($filePath),
            'relPath' => str_replace('\\', '/', $relPath),
            'fileSize' => $size,
            'fileSizeFormatted' => self::formatFileSize($size),
            'width' => $width,
            'height' => $height,
            'aspectRatio' => $aspectRatio,
            'dateTime' => $dt,
            'camera' => [
                'make' => $make,
                'model' => $model,
                'lens' => $lens ?: 'Lens',
            ],
            'params' => [
                'focalLength' => $focal,
                'focalLengthIn35mm' => $focal35,
                'fNumber' => $fNum,
                'shutterSpeed' => $shutter,
                'iso' => $iso,
                'exposureCompensation' => $biasStr,
                'exposureProgram' => isset($exif['EXIF']['ExposureProgram']) || isset($exif['ExposureProgram']) ? 'AE' : null,
                'meteringMode' => isset($exif['EXIF']['MeteringMode']) || isset($exif['MeteringMode']) ? 'Evaluative' : null,
                'whiteBalance' => (isset($exif['EXIF']['WhiteBalance']) && $exif['EXIF']['WhiteBalance'] == 1) || (isset($exif['WhiteBalance']) && $exif['WhiteBalance'] == 1) ? 'Manual' : 'Auto',
                'flash' => ((isset($exif['EXIF']['Flash']) && ($exif['EXIF']['Flash'] & 1)) || (isset($exif['Flash']) && ($exif['Flash'] & 1))) ? 'Fired' : 'Did not fire',
            ],
        ];
    }

    /**
     * サムネイルを配信（WebP対応時はWebP生成、非対応時はJPEG）
     */
    public function serveThumbnail(string $relPath, int $targetWidth = 600): void
    {
        $cleanPath = $this->sanitizeRelPath($relPath);
        $fullPath = $this->resolveDiskPath($cleanPath);

        if ($cleanPath === '' || !file_exists($fullPath) || !is_file($fullPath)) {
            header('HTTP/1.1 404 Not Found');
            echo 'Not found';
            exit;
        }

        $targetWidth = max(100, min(3200, $targetWidth));
        $mtime = filemtime($fullPath);
        $useWebp = function_exists('imagewebp');
        $ext = $useWebp ? 'webp' : 'jpg';
        $mime = $useWebp ? 'image/webp' : 'image/jpeg';

        $cacheName = md5($cleanPath . '_' . $mtime . '_' . $targetWidth) . '.' . $ext;
        $cachedFile = $this->thumbDir . '/' . $cacheName;

        if (file_exists($cachedFile)) {
            header('Content-Type: ' . $mime);
            header('Cache-Control: public, max-age=86400, immutable');
            readfile($cachedFile);
            exit;
        }

        $imgInfo = @getimagesize($fullPath);
        $imgType = $imgInfo[2] ?? IMAGETYPE_JPEG;
        $source = null;
        if ($imgType === IMAGETYPE_JPEG) {
            $source = @imagecreatefromjpeg($fullPath);
        } elseif ($imgType === IMAGETYPE_PNG) {
            $source = @imagecreatefrompng($fullPath);
        } elseif ($imgType === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) {
            $source = @imagecreatefromwebp($fullPath);
        }

        if (!$source) {
            header('Content-Type: ' . ($imgInfo['mime'] ?? 'image/jpeg'));
            readfile($fullPath);
            exit;
        }

        if ($imgType === IMAGETYPE_JPEG) {
            $exif = @exif_read_data($fullPath);
            $ort = (int)($exif['Orientation'] ?? 1);
            if ($ort === 6) {
                $source = imagerotate($source, -90, 0);
            } elseif ($ort === 8) {
                $source = imagerotate($source, 90, 0);
            } elseif ($ort === 3) {
                $source = imagerotate($source, 180, 0);
            }
        }

        $origW = imagesx($source);
        $origH = imagesy($source);

        $outputImg = $source;
        if ($origW > $targetWidth) {
            $targetHeight = (int)round(($origH / $origW) * $targetWidth);
            $thumb = imagecreatetruecolor($targetWidth, $targetHeight);
            imagealphablending($thumb, false);
            imagesavealpha($thumb, true);
            imagecopyresampled($thumb, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $origW, $origH);
            imagedestroy($source);
            $outputImg = $thumb;
        }

        if ($useWebp) {
            @imagewebp($outputImg, $cachedFile, 82);
        } else {
            @imagejpeg($outputImg, $cachedFile, 84);
        }
        imagedestroy($outputImg);

        if (file_exists($cachedFile)) {
            header('Content-Type: ' . $mime);
            header('Cache-Control: public, max-age=86400, immutable');
            readfile($cachedFile);
        } else {
            header('Content-Type: ' . ($imgInfo['mime'] ?? 'image/jpeg'));
            readfile($fullPath);
        }
        exit;
    }

    // ==================== 既存フォルダ同期・マイグレーション ====================

    public function ensureInitialSync(): void
    {
        $pdo = $this->getDb();
        if (!$pdo) return;
        $count = (int)$pdo->query('SELECT COUNT(*) FROM `albums`')->fetchColumn();
        if ($count === 0) {
            $this->syncFromFilesystem();
        }
    }

    /**
     * images/[アルバム]/[撮影日]/ の既存写真をスキャンし、未登録分をMySQLへ取り込む
     */
    public function syncFromFilesystem(): array
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '256M');
        $pdo = $this->requireDb();
        $addedAlbums = 0;
        $addedPhotos = 0;

        if (!is_dir($this->imagesDir)) {
            return ['addedAlbums' => 0, 'addedPhotos' => 0];
        }

        foreach (scandir($this->imagesDir) as $aDir) {
            if ($aDir === '.' || $aDir === '..' || !is_dir($this->imagesDir . '/' . $aDir)) {
                continue;
            }
            $aNameUtf8 = self::toUtf8($aDir);

            $stmt = $pdo->prepare('SELECT id FROM `albums` WHERE `name` = ?');
            $stmt->execute([$aNameUtf8]);
            $albumId = $stmt->fetchColumn();

            if (!$albumId) {
                $ins = $pdo->prepare('INSERT INTO `albums` (`name`, `sort_order`) VALUES (?, 0)');
                $ins->execute([$aNameUtf8]);
                $albumId = (int)$pdo->lastInsertId();
                $addedAlbums++;
            } else {
                $albumId = (int)$albumId;
            }

            $albumPath = $this->imagesDir . '/' . $aDir;
            foreach (scandir($albumPath) as $dDir) {
                if ($dDir === '.' || $dDir === '..' || !is_dir($albumPath . '/' . $dDir)) {
                    continue;
                }
                $dNameUtf8 = self::toUtf8($dDir);

                $datePath = $albumPath . '/' . $dDir;
                foreach (scandir($datePath) as $file) {
                    if (!preg_match('/\.(jpe?g|png|webp)$/i', $file)) {
                        continue;
                    }
                    $fileUtf8 = self::toUtf8($file);
                    $fullPath = $datePath . '/' . $file;
                    $relPathUtf8 = $aNameUtf8 . '/' . $dNameUtf8 . '/' . $fileUtf8;

                    $chk = $pdo->prepare('SELECT id FROM `photos` WHERE `rel_path` = ?');
                    $chk->execute([$relPathUtf8]);
                    if ($chk->fetchColumn()) {
                        continue;
                    }

                    $meta = self::extractExifData($fullPath, $relPathUtf8);
                    $exifJson = json_encode([
                        'camera' => $meta['camera'],
                        'params' => $meta['params'],
                    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

                    $insPhoto = $pdo->prepare('
                        INSERT INTO `photos`
                        (`album_id`, `date_group`, `file_name`, `rel_path`, `file_size`, `width`, `height`, `aspect_ratio`, `taken_at`, `exif_json`, `is_public`)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ');
                    $insPhoto->execute([
                        $albumId,
                        $dNameUtf8,
                        $fileUtf8,
                        $relPathUtf8,
                        $meta['fileSize'],
                        $meta['width'],
                        $meta['height'],
                        $meta['aspectRatio'],
                        $meta['dateTime'],
                        $exifJson ?: '{}',
                    ]);
                    $addedPhotos++;
                }
            }
        }

        return [
            'addedAlbums' => $addedAlbums,
            'addedPhotos' => $addedPhotos,
        ];
    }

    // ==================== データ取得 ====================

    public function getGalleryData(bool $includeHidden = false): array
    {
        $pdo = $this->getDb();
        if (!$pdo) {
            return [
                'albums' => $this->scanFilesystemFallback(),
                'dbConnected' => false,
            ];
        }

        $this->ensureInitialSync();

        $albumsStmt = $pdo->query('SELECT * FROM `albums` ORDER BY `sort_order` ASC, `id` ASC');
        $albumRows = $albumsStmt->fetchAll();

        $sqlPhotos = 'SELECT * FROM `photos`';
        if (!$includeHidden) {
            $sqlPhotos .= ' WHERE `is_public` = 1';
        }
        $sqlPhotos .= ' ORDER BY `date_group` DESC, `sort_order` ASC, `id` ASC';
        $photoRows = $pdo->query($sqlPhotos)->fetchAll();

        $photosByAlbum = [];
        foreach ($photoRows as $row) {
            $aid = (int)$row['album_id'];
            $photosByAlbum[$aid][] = $row;
        }

        $albums = [];
        foreach ($albumRows as $aRow) {
            $aid = (int)$aRow['id'];
            $aName = $aRow['name'];
            $rows = $photosByAlbum[$aid] ?? [];

            if (empty($rows) && !$includeHidden) {
                continue;
            }

            $byDate = [];
            $allPhotos = [];
            foreach ($rows as $pRow) {
                $photoObj = $this->formatPhotoRow($pRow, $aName);
                $dGroup = $pRow['date_group'];
                $byDate[$dGroup][] = $photoObj;
                $allPhotos[] = $photoObj;
            }

            krsort($byDate, SORT_NATURAL);
            $dates = [];
            foreach ($byDate as $dGroup => $dPhotos) {
                $dates[] = [
                    'date' => $dGroup,
                    'photoCount' => count($dPhotos),
                    'coverPhoto' => $dPhotos[0],
                    'photos' => $dPhotos,
                ];
            }

            $coverPhoto = $allPhotos[0] ?? null;
            if (!empty($aRow['cover_photo_id'])) {
                foreach ($allPhotos as $p) {
                    if ((int)$p['id'] === (int)$aRow['cover_photo_id']) {
                        $coverPhoto = $p;
                        break;
                    }
                }
            }

            $albums[] = [
                'id' => $aName,
                'albumId' => $aid,
                'name' => $aName,
                'description' => $aRow['description'] ?? '',
                'sortOrder' => (int)$aRow['sort_order'],
                'totalPhotos' => count($allPhotos),
                'totalDates' => count($dates),
                'coverPhoto' => $coverPhoto,
                'latestDate' => $dates[0]['date'] ?? null,
                'dates' => $dates,
            ];
        }

        return [
            'albums' => $albums,
            'dbConnected' => true,
        ];
    }

    /**
     * アルバム一覧のみを軽量取得（MCP等向け）
     */
    public function listAlbumsSummary(): array
    {
        $pdo = $this->requireDb();
        $this->ensureInitialSync();
        $sql = '
            SELECT a.id, a.name, a.description, a.sort_order,
                   COUNT(p.id) AS total_photos,
                   MAX(p.date_group) AS latest_date
            FROM `albums` a
            LEFT JOIN `photos` p ON p.album_id = a.id
            GROUP BY a.id
            ORDER BY a.sort_order ASC, a.id ASC
        ';
        return $pdo->query($sql)->fetchAll();
    }

    private function formatPhotoRow(array $row, string $albumName): array
    {
        $exif = json_decode($row['exif_json'] ?? '{}', true) ?: [];
        return [
            'id' => (int)$row['id'],
            'albumId' => (int)$row['album_id'],
            'album' => $albumName,
            'date' => $row['date_group'],
            'fileName' => $row['file_name'],
            'relPath' => $row['rel_path'],
            'title' => $row['title'] ?? '',
            'caption' => $row['caption'] ?? '',
            'tags' => $row['tags'] ?? '',
            'isPublic' => (bool)$row['is_public'],
            'fileSize' => (int)$row['file_size'],
            'fileSizeFormatted' => self::formatFileSize((int)$row['file_size']),
            'width' => (int)$row['width'],
            'height' => (int)$row['height'],
            'aspectRatio' => (float)$row['aspect_ratio'],
            'dateTime' => $row['taken_at'],
            'camera' => $exif['camera'] ?? ['make' => '', 'model' => 'Unknown Camera', 'lens' => 'Lens'],
            'params' => $exif['params'] ?? [],
        ];
    }

    private function scanFilesystemFallback(): array
    {
        $albums = [];
        if (!is_dir($this->imagesDir)) return $albums;

        foreach (scandir($this->imagesDir) as $aDir) {
            if ($aDir === '.' || $aDir === '..' || !is_dir($this->imagesDir . '/' . $aDir)) continue;
            $albumPath = $this->imagesDir . '/' . $aDir;
            $dateDirs = scandir($albumPath);
            rsort($dateDirs);

            $dates = [];
            $albumPhotos = [];
            foreach ($dateDirs as $dDir) {
                if ($dDir === '.' || $dDir === '..' || !is_dir($albumPath . '/' . $dDir)) continue;
                $datePath = $albumPath . '/' . $dDir;
                $photos = [];
                foreach (scandir($datePath) as $file) {
                    if (preg_match('/\.(jpe?g|png|webp)$/i', $file)) {
                        $meta = self::extractExifData($datePath . '/' . $file, $aDir . '/' . $dDir . '/' . $file);
                        $meta['album'] = $aDir;
                        $meta['date'] = $dDir;
                        $photos[] = $meta;
                    }
                }
                if (!empty($photos)) {
                    $dates[] = [
                        'date' => $dDir,
                        'photoCount' => count($photos),
                        'coverPhoto' => $photos[0],
                        'photos' => $photos,
                    ];
                    $albumPhotos = array_merge($albumPhotos, $photos);
                }
            }
            if (!empty($albumPhotos)) {
                $albums[] = [
                    'id' => $aDir,
                    'name' => $aDir,
                    'totalPhotos' => count($albumPhotos),
                    'totalDates' => count($dates),
                    'coverPhoto' => $albumPhotos[0],
                    'latestDate' => $dates[0]['date'] ?? null,
                    'dates' => $dates,
                ];
            }
        }
        return $albums;
    }

    // ==================== CRUD 操作（アルバム・写真） ====================

    public function createAlbum(string $name, string $description = ''): array
    {
        $pdo = $this->requireDb();
        $cleanName = $this->sanitizeSegment($name);
        if ($cleanName === '') {
            throw new InvalidArgumentException('アルバム名が無効です。');
        }

        $chk = $pdo->prepare('SELECT id FROM `albums` WHERE `name` = ?');
        $chk->execute([$cleanName]);
        if ($chk->fetchColumn()) {
            throw new RuntimeException('同名のアルバムがすでに存在します。');
        }

        $stmt = $pdo->prepare('INSERT INTO `albums` (`name`, `description`) VALUES (?, ?)');
        $stmt->execute([$cleanName, $description]);
        $id = (int)$pdo->lastInsertId();

        $dir = $this->imagesDir . '/' . $cleanName;
        if (!is_dir($dir)) @mkdir($dir, 0755, true);

        return ['id' => $id, 'name' => $cleanName, 'description' => $description];
    }

    public function updateAlbum(int $albumId, ?string $newName = null, ?string $description = null): array
    {
        $pdo = $this->requireDb();
        $stmt = $pdo->prepare('SELECT * FROM `albums` WHERE `id` = ?');
        $stmt->execute([$albumId]);
        $album = $stmt->fetch();
        if (!$album) {
            throw new RuntimeException('指定されたアルバムが見つかりません。');
        }

        $targetName = $album['name'];
        if ($newName !== null && trim($newName) !== '' && trim($newName) !== $album['name']) {
            $cleanName = $this->sanitizeSegment($newName);
            if ($cleanName === '') {
                throw new InvalidArgumentException('新しいアルバム名が無効です。');
            }
            $oldDir = $this->imagesDir . '/' . $album['name'];
            $newDir = $this->imagesDir . '/' . $cleanName;
            if (is_dir($oldDir) && !file_exists($newDir)) {
                @rename($oldDir, $newDir);
            }

            $pStmt = $pdo->prepare('SELECT id, date_group, file_name FROM `photos` WHERE `album_id` = ?');
            $pStmt->execute([$albumId]);
            $updPath = $pdo->prepare('UPDATE `photos` SET `rel_path` = ? WHERE `id` = ?');
            foreach ($pStmt->fetchAll() as $p) {
                $newRel = $cleanName . '/' . $p['date_group'] . '/' . $p['file_name'];
                $updPath->execute([$newRel, $p['id']]);
            }
            $targetName = $cleanName;
        }

        $targetDesc = $description !== null ? $description : ($album['description'] ?? '');
        $upd = $pdo->prepare('UPDATE `albums` SET `name` = ?, `description` = ? WHERE `id` = ?');
        $upd->execute([$targetName, $targetDesc, $albumId]);

        return ['id' => $albumId, 'name' => $targetName, 'description' => $targetDesc];
    }

    public function deleteAlbum(int $albumId): array
    {
        $pdo = $this->requireDb();
        $stmt = $pdo->prepare('SELECT * FROM `albums` WHERE `id` = ?');
        $stmt->execute([$albumId]);
        $album = $stmt->fetch();
        if (!$album) {
            throw new RuntimeException('指定されたアルバムが見つかりません。');
        }

        $pStmt = $pdo->prepare('SELECT id, rel_path FROM `photos` WHERE `album_id` = ?');
        $pStmt->execute([$albumId]);
        $photos = $pStmt->fetchAll();

        foreach ($photos as $p) {
            $full = $this->imagesDir . '/' . $p['rel_path'];
            if (file_exists($full)) @unlink($full);
        }

        $del = $pdo->prepare('DELETE FROM `albums` WHERE `id` = ?');
        $del->execute([$albumId]);

        $albumDir = $this->imagesDir . '/' . $album['name'];
        $this->removeEmptyDirs($albumDir);

        return ['deletedAlbumId' => $albumId, 'deletedPhotosCount' => count($photos)];
    }

    public function renameDateGroup(int $albumId, string $oldDateGroup, string $newDateGroup): array
    {
        $pdo = $this->requireDb();
        $cleanNew = $this->sanitizeSegment($newDateGroup);
        if ($cleanNew === '') {
            throw new InvalidArgumentException('新しい撮影日グループ名が無効です。');
        }

        $stmt = $pdo->prepare('SELECT id FROM `photos` WHERE `album_id` = ? AND `date_group` = ?');
        $stmt->execute([$albumId, $oldDateGroup]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($ids as $id) {
            $this->updatePhoto((int)$id, ['date_group' => $cleanNew]);
        }

        return ['updatedCount' => count($ids), 'dateGroup' => $cleanNew];
    }

    public function deleteDateGroup(int $albumId, string $dateGroup): array
    {
        $pdo = $this->requireDb();
        $stmt = $pdo->prepare('SELECT id FROM `photos` WHERE `album_id` = ? AND `date_group` = ?');
        $stmt->execute([$albumId, $dateGroup]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $res = $this->deletePhotos($ids);

        $aStmt = $pdo->prepare('SELECT name FROM `albums` WHERE `id` = ?');
        $aStmt->execute([$albumId]);
        $albumName = $aStmt->fetchColumn();
        if ($albumName) {
            $dir = $this->resolveDiskPath($albumName . '/' . $dateGroup);
            $this->removeEmptyDirs($dir);
        }

        return $res;
    }

    public function uploadPhoto(
        string $sourcePath,
        string $originalName,
        ?int $albumId,
        ?string $albumName,
        string $dateGroup,
        string $title = '',
        string $caption = '',
        string $tags = ''
    ): array {
        $pdo = $this->requireDb();

        if ($albumId) {
            $stmt = $pdo->prepare('SELECT * FROM `albums` WHERE `id` = ?');
            $stmt->execute([$albumId]);
            $album = $stmt->fetch();
            if (!$album) {
                throw new RuntimeException('指定されたアルバムが存在しません。');
            }
            $resolvedAlbumId = (int)$album['id'];
            $resolvedAlbumName = $album['name'];
        } elseif ($albumName !== null && trim($albumName) !== '') {
            $cleanAlbum = $this->sanitizeSegment($albumName);
            $stmt = $pdo->prepare('SELECT * FROM `albums` WHERE `name` = ?');
            $stmt->execute([$cleanAlbum]);
            $album = $stmt->fetch();
            if ($album) {
                $resolvedAlbumId = (int)$album['id'];
                $resolvedAlbumName = $album['name'];
            } else {
                $created = $this->createAlbum($cleanAlbum);
                $resolvedAlbumId = $created['id'];
                $resolvedAlbumName = $created['name'];
            }
        } else {
            throw new InvalidArgumentException('アルバムを指定してください。');
        }

        $cleanDate = $this->sanitizeSegment($dateGroup);
        if ($cleanDate === '') {
            $cleanDate = date('Y-m-d');
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            throw new InvalidArgumentException('対応している画像形式は JPG / PNG / WebP のみです。');
        }

        $baseName = $this->sanitizeSegment(pathinfo($originalName, PATHINFO_FILENAME));
        if ($baseName === '') $baseName = 'photo_' . date('Ymd_His');

        $targetDir = $this->imagesDir . '/' . $resolvedAlbumName . '/' . $cleanDate;
        if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true)) {
            throw new RuntimeException('保存先ディレクトリの作成に失敗しました。');
        }

        $fileName = $baseName . '.' . $ext;
        $counter = 1;
        while (file_exists($targetDir . '/' . $fileName)) {
            $fileName = $baseName . '_' . $counter . '.' . $ext;
            $counter++;
        }

        $destPath = $targetDir . '/' . $fileName;
        if (is_uploaded_file($sourcePath)) {
            if (!move_uploaded_file($sourcePath, $destPath)) {
                throw new RuntimeException('アップロードファイルの保存に失敗しました。');
            }
        } else {
            if (!@copy($sourcePath, $destPath)) {
                throw new RuntimeException('画像ファイルの保存に失敗しました。');
            }
        }

        $relPath = $resolvedAlbumName . '/' . $cleanDate . '/' . $fileName;
        $meta = self::extractExifData($destPath, $relPath);
        $exifJson = json_encode([
            'camera' => $meta['camera'],
            'params' => $meta['params'],
        ], JSON_UNESCAPED_UNICODE);

        $ins = $pdo->prepare('
            INSERT INTO `photos`
            (`album_id`, `date_group`, `file_name`, `rel_path`, `title`, `caption`, `tags`, `file_size`, `width`, `height`, `aspect_ratio`, `taken_at`, `exif_json`, `is_public`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ');
        $ins->execute([
            $resolvedAlbumId,
            $cleanDate,
            $fileName,
            $relPath,
            $title !== '' ? $title : null,
            $caption !== '' ? $caption : null,
            $tags !== '' ? $tags : null,
            $meta['fileSize'],
            $meta['width'],
            $meta['height'],
            $meta['aspectRatio'],
            $meta['dateTime'],
            $exifJson,
        ]);

        $photoId = (int)$pdo->lastInsertId();
        return $this->getPhotoById($photoId);
    }

    /**
     * Base64文字列またはURLから一時ファイルを作成して登録（MCPサーバー向け）
     */
    public function uploadPhotoFromPayload(
        ?string $imageBase64,
        ?string $imageUrl,
        string $fileName,
        ?int $albumId,
        ?string $albumName,
        string $dateGroup,
        string $title = '',
        string $caption = '',
        string $tags = ''
    ): array {
        $tmpFile = tempnam(sys_get_temp_dir(), 'ws_mcp_');
        if (!$tmpFile) {
            throw new RuntimeException('一時ファイルの作成に失敗しました。');
        }

        try {
            if ($imageBase64 !== null && $imageBase64 !== '') {
                if (preg_match('/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/', $imageBase64, $m)) {
                    $imageBase64 = $m[2];
                }
                $binary = base64_decode($imageBase64, true);
                if ($binary === false) {
                    throw new InvalidArgumentException('image_base64 のデコードに失敗しました。');
                }
                file_put_contents($tmpFile, $binary);
            } elseif ($imageUrl !== null && $imageUrl !== '') {
                if (!preg_match('/^https?:\/\//i', $imageUrl)) {
                    throw new InvalidArgumentException('image_url は http:// または https:// のみ対応しています。');
                }
                $ctx = stream_context_create(['http' => ['timeout' => 20]]);
                $binary = @file_get_contents($imageUrl, false, $ctx);
                if ($binary === false) {
                    throw new RuntimeException('image_url からの画像取得に失敗しました。');
                }
                file_put_contents($tmpFile, $binary);
            } else {
                throw new InvalidArgumentException('image_base64 または image_url のどちらかを指定してください。');
            }

            return $this->uploadPhoto($tmpFile, $fileName, $albumId, $albumName, $dateGroup, $title, $caption, $tags);
        } finally {
            if (file_exists($tmpFile)) @unlink($tmpFile);
        }
    }

    public function getPhotoById(int $photoId): ?array
    {
        $pdo = $this->requireDb();
        $stmt = $pdo->prepare('
            SELECT p.*, a.name AS album_name
            FROM `photos` p
            JOIN `albums` a ON a.id = p.album_id
            WHERE p.id = ?
        ');
        $stmt->execute([$photoId]);
        $row = $stmt->fetch();
        return $row ? $this->formatPhotoRow($row, $row['album_name']) : null;
    }

    public function updatePhoto(int $photoId, array $fields): array
    {
        $pdo = $this->requireDb();
        $stmt = $pdo->prepare('
            SELECT p.*, a.name AS album_name
            FROM `photos` p
            JOIN `albums` a ON a.id = p.album_id
            WHERE p.id = ?
        ');
        $stmt->execute([$photoId]);
        $current = $stmt->fetch();
        if (!$current) {
            throw new RuntimeException('指定された写真が見つかりません。');
        }

        $targetAlbumId = isset($fields['album_id']) ? (int)$fields['album_id'] : (int)$current['album_id'];
        $targetDateGroup = isset($fields['date_group']) ? $this->sanitizeSegment((string)$fields['date_group']) : $current['date_group'];
        if ($targetDateGroup === '') $targetDateGroup = $current['date_group'];

        $newRelPath = $current['rel_path'];
        $newFileName = $current['file_name'];
        if ($targetAlbumId !== (int)$current['album_id'] || $targetDateGroup !== $current['date_group']) {
            $aStmt = $pdo->prepare('SELECT name FROM `albums` WHERE `id` = ?');
            $aStmt->execute([$targetAlbumId]);
            $targetAlbumName = $aStmt->fetchColumn();
            if (!$targetAlbumName) {
                throw new RuntimeException('移動先アルバムが見つかりません。');
            }

            $oldFull = $this->resolveDiskPath($current['rel_path']);
            $destDir = $this->imagesDir . '/' . $targetAlbumName . '/' . $targetDateGroup;
            if (!is_dir($destDir)) @mkdir($destDir, 0755, true);

            $ext = pathinfo($current['file_name'], PATHINFO_EXTENSION);
            $base = pathinfo($current['file_name'], PATHINFO_FILENAME);
            $candidate = $current['file_name'];
            $c = 1;
            while (file_exists($destDir . '/' . $candidate) && ($destDir . '/' . $candidate) !== $oldFull) {
                $candidate = $base . '_' . $c . '.' . $ext;
                $c++;
            }

            $newFull = $destDir . '/' . $candidate;
            if (file_exists($oldFull)) {
                @rename($oldFull, $newFull);
            }
            $newFileName = $candidate;
            $newRelPath = $targetAlbumName . '/' . $targetDateGroup . '/' . $candidate;
        }

        $title = array_key_exists('title', $fields) ? ($fields['title'] !== '' ? (string)$fields['title'] : null) : $current['title'];
        $caption = array_key_exists('caption', $fields) ? ($fields['caption'] !== '' ? (string)$fields['caption'] : null) : $current['caption'];
        $tags = array_key_exists('tags', $fields) ? ($fields['tags'] !== '' ? (string)$fields['tags'] : null) : $current['tags'];
        $isPublic = array_key_exists('is_public', $fields) ? ((int)(bool)$fields['is_public']) : (int)$current['is_public'];
        $sortOrder = array_key_exists('sort_order', $fields) ? (int)$fields['sort_order'] : (int)$current['sort_order'];

        $upd = $pdo->prepare('
            UPDATE `photos`
            SET `album_id` = ?, `date_group` = ?, `file_name` = ?, `rel_path` = ?,
                `title` = ?, `caption` = ?, `tags` = ?, `is_public` = ?, `sort_order` = ?
            WHERE `id` = ?
        ');
        $upd->execute([
            $targetAlbumId,
            $targetDateGroup,
            $newFileName,
            $newRelPath,
            $title,
            $caption,
            $tags,
            $isPublic,
            $sortOrder,
            $photoId,
        ]);

        return $this->getPhotoById($photoId);
    }

    public function movePhotos(array $photoIds, ?int $targetAlbumId, ?string $targetAlbumName, string $targetDateGroup): array
    {
        $pdo = $this->requireDb();
        if (!$targetAlbumId && $targetAlbumName) {
            $cleanName = $this->sanitizeSegment($targetAlbumName);
            $stmt = $pdo->prepare('SELECT id FROM `albums` WHERE `name` = ?');
            $stmt->execute([$cleanName]);
            $existingId = $stmt->fetchColumn();
            if ($existingId) {
                $targetAlbumId = (int)$existingId;
            } else {
                $created = $this->createAlbum($cleanName);
                $targetAlbumId = $created['id'];
            }
        }

        $moved = [];
        foreach ($photoIds as $id) {
            $moved[] = $this->updatePhoto((int)$id, [
                'album_id' => $targetAlbumId,
                'date_group' => $targetDateGroup,
            ]);
        }
        return $moved;
    }

    public function deletePhotos(array $photoIds): array
    {
        $pdo = $this->requireDb();
        $deleted = 0;

        foreach ($photoIds as $rawId) {
            $id = (int)$rawId;
            $stmt = $pdo->prepare('SELECT `rel_path` FROM `photos` WHERE `id` = ?');
            $stmt->execute([$id]);
            $relPath = $stmt->fetchColumn();
            if (!$relPath) continue;

            $fullPath = $this->resolveDiskPath($relPath);
            if (file_exists($fullPath) && is_file($fullPath)) {
                @unlink($fullPath);
            }

            $del = $pdo->prepare('DELETE FROM `photos` WHERE `id` = ?');
            $del->execute([$id]);
            $deleted++;
        }

        return ['deletedCount' => $deleted];
    }

    public function searchPhotos(array $filters = []): array
    {
        $pdo = $this->requireDb();
        $where = ['1=1'];
        $params = [];

        if (!empty($filters['album'])) {
            $where[] = 'a.name LIKE ?';
            $params[] = '%' . $filters['album'] . '%';
        }
        if (!empty($filters['date'])) {
            $where[] = 'p.date_group LIKE ?';
            $params[] = '%' . $filters['date'] . '%';
        }
        if (!empty($filters['tag'])) {
            $where[] = 'p.tags LIKE ?';
            $params[] = '%' . $filters['tag'] . '%';
        }
        if (!empty($filters['camera'])) {
            $where[] = 'p.exif_json LIKE ?';
            $params[] = '%' . $filters['camera'] . '%';
        }
        if (!empty($filters['lens'])) {
            $where[] = 'p.exif_json LIKE ?';
            $params[] = '%' . $filters['lens'] . '%';
        }
        if (!empty($filters['query'])) {
            $q = '%' . $filters['query'] . '%';
            $where[] = '(p.file_name LIKE ? OR p.title LIKE ? OR p.caption LIKE ? OR p.tags LIKE ? OR p.exif_json LIKE ? OR a.name LIKE ?)';
            array_push($params, $q, $q, $q, $q, $q, $q);
        }

        $limit = isset($filters['limit']) ? max(1, min(200, (int)$filters['limit'])) : 50;
        $sql = '
            SELECT p.*, a.name AS album_name
            FROM `photos` p
            JOIN `albums` a ON a.id = p.album_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY p.taken_at DESC, p.id DESC
            LIMIT ' . $limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = [];
        foreach ($stmt->fetchAll() as $row) {
            $results[] = $this->formatPhotoRow($row, $row['album_name']);
        }
        return $results;
    }

    // ==================== ヘルパー ====================

    private function sanitizeRelPath(string $relPath): string
    {
        $clean = str_replace(['\\', "\0"], ['/', ''], $relPath);
        $parts = array_filter(explode('/', $clean), fn($p) => $p !== '' && $p !== '.' && $p !== '..');
        return implode('/', $parts);
    }

    private function sanitizeSegment(string $seg): string
    {
        return str_replace(['/', '\\', '..', "\0"], '', trim($seg));
    }

    private static function toUtf8(string $str): string
    {
        if (function_exists('mb_check_encoding') && mb_check_encoding($str, 'UTF-8')) {
            return $str;
        }
        if (preg_match('//u', $str) === 1) {
            return $str;
        }
        if (function_exists('mb_convert_encoding')) {
            $converted = @mb_convert_encoding($str, 'UTF-8', 'SJIS-win, CP932, EUC-JP, UTF-8');
            if ($converted !== false) {
                return $converted;
            }
        }
        if (function_exists('iconv')) {
            $converted = @iconv('CP932', 'UTF-8//IGNORE', $str);
            if ($converted !== false) {
                return $converted;
            }
        }
        return $str;
    }

    private function resolveDiskPath(string $relPath): string
    {
        $utf8Full = $this->imagesDir . '/' . $relPath;
        if (file_exists($utf8Full)) {
            return $utf8Full;
        }
        if (function_exists('mb_convert_encoding')) {
            $sjisRel = @mb_convert_encoding($relPath, 'SJIS-win', 'UTF-8');
            if ($sjisRel && file_exists($this->imagesDir . '/' . $sjisRel)) {
                return $this->imagesDir . '/' . $sjisRel;
            }
        }
        if (function_exists('iconv')) {
            $sjisRel = @iconv('UTF-8', 'CP932//IGNORE', $relPath);
            if ($sjisRel && file_exists($this->imagesDir . '/' . $sjisRel)) {
                return $this->imagesDir . '/' . $sjisRel;
            }
        }
        return $utf8Full;
    }

    private function removeEmptyDirs(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (array_diff(scandir($dir), ['.', '..']) as $item) {
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->removeEmptyDirs($path);
            }
        }
        if (empty(array_diff(scandir($dir), ['.', '..']))) {
            @rmdir($dir);
        }
    }
}

