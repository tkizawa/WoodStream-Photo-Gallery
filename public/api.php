<?php
/**
 * LuminaLens - さくらのレンタルサーバ用 PHP バックエンド
 * サーバー上の images フォルダを自動解析し、EXIF抽出 & サムネイル生成キャッシュを行います。
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

$imagesDir = __DIR__ . '/images';
if (!is_dir($imagesDir)) {
    $imagesDir = __DIR__ . '/imeges';
}

$cacheDir = __DIR__ . '/.cache';
$thumbDir = $cacheDir . '/thumbnails';

if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
if (!is_dir($thumbDir)) @mkdir($thumbDir, 0755, true);

// サムネイル配信モード (?thumb=1&path=...&w=600)
if (isset($_GET['thumb']) && isset($_GET['path'])) {
    serveThumbnail($_GET['path'], isset($_GET['w']) ? (int)$_GET['w'] : 600, $imagesDir, $thumbDir);
    exit;
}

// データ一覧取得モード
function formatShutterSpeed($exp) {
    if (!$exp) return null;
    if (strpos($exp, '/') !== false) return $exp . 's';
    $val = (float)$exp;
    if ($val <= 0) return null;
    if ($val >= 1) return round($val, 1) . 's';
    $denom = round(1 / $val);
    return "1/{$denom}s";
}

function formatFileSize($bytes) {
    if (!$bytes) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB'];
    $pow = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $pow), 1) . ' ' . $units[$pow];
}

function getExifData($filePath, $relPath) {
    $size = filesize($filePath);
    $imgSize = @getimagesize($filePath);
    $width = $imgSize ? $imgSize[0] : 1920;
    $height = $imgSize ? $imgSize[1] : 1080;

    $exif = @exif_read_data($filePath, 'EXIF', true);

    $make = isset($exif['IFD0']['Make']) ? trim($exif['IFD0']['Make']) : '';
    $model = isset($exif['IFD0']['Model']) ? trim($exif['IFD0']['Model']) : 'Unknown Camera';
    $lens = isset($exif['EXIF']['UndefinedTag:0xA434']) ? trim($exif['EXIF']['UndefinedTag:0xA434']) : (isset($exif['EXIF']['LensModel']) ? trim($exif['EXIF']['LensModel']) : '');

    // 撮影日時
    $dt = isset($exif['EXIF']['DateTimeOriginal']) ? $exif['EXIF']['DateTimeOriginal'] : (isset($exif['IFD0']['DateTime']) ? $exif['IFD0']['DateTime'] : date('c', filemtime($filePath)));
    if (preg_match('/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/', $dt, $m)) {
        $dt = "{$m[1]}-{$m[2]}-{$m[3]}T{$m[4]}+09:00";
    }

    // パラメータ
    $focal = isset($exif['EXIF']['FocalLength']) ? $exif['EXIF']['FocalLength'] : null;
    if ($focal && strpos($focal, '/') !== false) {
        $parts = explode('/', $focal);
        $focal = ((float)$parts[1] > 0) ? round((float)$parts[0] / (float)$parts[1]) . 'mm' : null;
    } elseif ($focal) {
        $focal = round((float)$focal) . 'mm';
    }

    $fNum = isset($exif['EXIF']['FNumber']) ? $exif['EXIF']['FNumber'] : null;
    if ($fNum && strpos($fNum, '/') !== false) {
        $parts = explode('/', $fNum);
        $fNum = ((float)$parts[1] > 0) ? 'f/' . round((float)$parts[0] / (float)$parts[1], 1) : null;
    }

    $shutter = isset($exif['EXIF']['ExposureTime']) ? formatShutterSpeed($exif['EXIF']['ExposureTime']) : null;
    $iso = isset($exif['EXIF']['ISOSpeedRatings']) ? 'ISO ' . $exif['EXIF']['ISOSpeedRatings'] : null;

    $bias = isset($exif['EXIF']['ExposureBiasValue']) ? $exif['EXIF']['ExposureBiasValue'] : null;
    $biasStr = '0 EV';
    if ($bias) {
        if (strpos($bias, '/') !== false) {
            $parts = explode('/', $bias);
            $val = ((float)$parts[1] > 0) ? (float)$parts[0] / (float)$parts[1] : 0;
            $biasStr = ($val > 0 ? '+' : '') . round($val, 1) . ' EV';
        }
    }

    // オリエンテーションによる回転
    $orientation = isset($exif['IFD0']['Orientation']) ? $exif['IFD0']['Orientation'] : 1;
    if (in_array($orientation, [6, 8])) {
        $tmp = $width; $width = $height; $height = $tmp;
    }

    $aspectRatio = ($height > 0) ? round($width / $height, 4) : 1.5;

    return [
        'fileName' => basename($filePath),
        'relPath' => str_replace('\\', '/', $relPath),
        'fileSize' => $size,
        'fileSizeFormatted' => formatFileSize($size),
        'width' => $width,
        'height' => $height,
        'aspectRatio' => $aspectRatio,
        'dateTime' => $dt,
        'camera' => [
            'make' => $make,
            'model' => $model,
            'lens' => $lens ?: 'Lens'
        ],
        'params' => [
            'focalLength' => $focal,
            'focalLengthIn35mm' => null,
            'fNumber' => $fNum,
            'shutterSpeed' => $shutter,
            'iso' => $iso,
            'exposureCompensation' => $biasStr,
            'exposureProgram' => isset($exif['EXIF']['ExposureProgram']) ? 'AE' : null,
            'meteringMode' => isset($exif['EXIF']['MeteringMode']) ? 'Evaluative' : null,
            'whiteBalance' => isset($exif['EXIF']['WhiteBalance']) && $exif['EXIF']['WhiteBalance'] == 1 ? 'Manual' : 'Auto',
            'flash' => isset($exif['EXIF']['Flash']) && ($exif['EXIF']['Flash'] & 1) ? 'Fired' : 'Did not fire'
        ]
    ];
}

// サムネイル配信
function serveThumbnail($relPath, $targetWidth, $imagesDir, $thumbDir) {
    $cleanPath = str_replace(['..', '\\'], ['', '/'], $relPath);
    $fullPath = $imagesDir . '/' . ltrim($cleanPath, '/');

    if (!file_exists($fullPath)) {
        header('HTTP/1.1 404 Not Found');
        echo 'Not found';
        exit;
    }

    $mtime = filemtime($fullPath);
    $cacheName = md5($cleanPath . '_' . $mtime . '_' . $targetWidth) . '.jpg';
    $cachedFile = $thumbDir . '/' . $cacheName;

    if (file_exists($cachedFile)) {
        header('Content-Type: image/jpeg');
        header('Cache-Control: public, max-age=86400, immutable');
        readfile($cachedFile);
        exit;
    }

    // GDでリサイズ生成
    $source = @imagecreatefromjpeg($fullPath);
    if (!$source) {
        header('Content-Type: image/jpeg');
        readfile($fullPath);
        exit;
    }

    // EXIF orientation
    $exif = @exif_read_data($fullPath);
    $ort = isset($exif['Orientation']) ? $exif['Orientation'] : 1;
    if ($ort == 6) {
        $source = imagerotate($source, -90, 0);
    } elseif ($ort == 8) {
        $source = imagerotate($source, 90, 0);
    } elseif ($ort == 3) {
        $source = imagerotate($source, 180, 0);
    }

    $origW = imagesx($source);
    $origH = imagesy($source);

    if ($origW > $targetWidth) {
        $targetHeight = (int)round(($origH / $origW) * $targetWidth);
        $thumb = imagecreatetruecolor($targetWidth, $targetHeight);
        imagecopyresampled($thumb, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $origW, $origH);
        imagedestroy($source);
        imagejpeg($thumb, $cachedFile, 82);
        imagedestroy($thumb);
    } else {
        imagejpeg($source, $cachedFile, 85);
        imagedestroy($source);
    }

    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=86400, immutable');
    readfile($cachedFile);
    exit;
}

// アルバム一覧スキャン
$albums = [];
if (is_dir($imagesDir)) {
    $albumDirs = scandir($imagesDir);
    foreach ($albumDirs as $aDir) {
        if ($aDir === '.' || $aDir === '..' || !is_dir($imagesDir . '/' . $aDir)) continue;

        $albumPath = $imagesDir . '/' . $aDir;
        $dateDirs = scandir($albumPath);
        rsort($dateDirs);

        $dates = [];
        $albumPhotos = [];

        foreach ($dateDirs as $dDir) {
            if ($dDir === '.' || $dDir === '..' || !is_dir($albumPath . '/' . $dDir)) continue;

            $datePath = $albumPath . '/' . $dDir;
            $files = scandir($datePath);
            $photos = [];

            foreach ($files as $file) {
                if (preg_match('/\.(jpe?g|png|webp)$/i', $file)) {
                    $fullPath = $datePath . '/' . $file;
                    $relPath = $aDir . '/' . $dDir . '/' . $file;
                    $meta = getExifData($fullPath, $relPath);
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
                    'photos' => $photos
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
                'latestDate' => isset($dates[0]) ? $dates[0]['date'] : null,
                'dates' => $dates
            ];
        }
    }
}

echo json_encode(['albums' => $albums], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
