const express = require('express');
const fs = require('fs');
const path = require('path');
const exifr = require('exifr');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// 画像フォルダの特定（images または imeges）
function findImagesDir() {
  const candidates = ['images', 'imeges', 'Images', 'Imeges'];
  for (const c of candidates) {
    const full = path.join(__dirname, c);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return full;
    }
  }
  return path.join(__dirname, 'images');
}

const IMAGES_DIR = findImagesDir();
const CACHE_DIR = path.join(__dirname, '.cache');
const THUMB_CACHE_DIR = path.join(CACHE_DIR, 'thumbnails');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(THUMB_CACHE_DIR)) fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMAGES_DIR));

// EXIFキャッシュ
const exifCacheFile = path.join(CACHE_DIR, 'metadata_cache.json');
let metadataCache = {};

if (fs.existsSync(exifCacheFile)) {
  try {
    metadataCache = JSON.parse(fs.readFileSync(exifCacheFile, 'utf8'));
  } catch (err) {
    console.error('Failed to load cache:', err);
    metadataCache = {};
  }
}

function saveCache() {
  try {
    fs.writeFileSync(exifCacheFile, JSON.stringify(metadataCache, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save cache:', err);
  }
}

// シャッタースピードの分数表記変換
function formatShutterSpeed(seconds) {
  if (!seconds || typeof seconds !== 'number') return null;
  if (seconds >= 1) {
    return `${Number(seconds.toFixed(1))}s`;
  }
  const denom = Math.round(1 / seconds);
  return `1/${denom}s`;
}

// 露出補正のフォーマット
function formatExposureBias(bias) {
  if (bias === undefined || bias === null || typeof bias !== 'number') return '0 EV';
  if (bias === 0) return '0 EV';
  const sign = bias > 0 ? '+' : '';
  return `${sign}${bias.toFixed(1)} EV`;
}

// ファイルサイズフォーマット
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// EXIFメタデータの取得と整形
async function getPhotoMetadata(fullPath, relPath) {
  const stat = fs.statSync(fullPath);
  const cacheKey = `${relPath}_${stat.mtimeMs}_${stat.size}`;

  if (metadataCache[cacheKey]) {
    return metadataCache[cacheKey];
  }

  let exif = {};
  try {
    exif = await exifr.parse(fullPath, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: false
    }) || {};
  } catch (err) {
    console.warn(`Failed to parse EXIF for ${relPath}:`, err.message);
  }

  // アスペクト比や寸法の取得
  let width = exif.ExifImageWidth || exif.ImageWidth;
  let height = exif.ExifImageHeight || exif.ImageHeight;

  if (!width || !height) {
    try {
      const meta = await sharp(fullPath).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      width = 1920;
      height = 1080;
    }
  }

  // オリエンテーションが回転の場合、縦横を反転
  const orientation = exif.Orientation;
  if (orientation && (orientation === 6 || orientation === 8 || orientation === 'Rotate 90 CW' || orientation === 'Rotate 270 CW')) {
    const tmp = width;
    width = height;
    height = tmp;
  }

  const aspectRatio = width && height ? parseFloat((width / height).toFixed(4)) : 1.5;

  // 撮影日時のフォーマット
  let dateTime = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || stat.mtime;
  if (dateTime instanceof Date) {
    dateTime = dateTime.toISOString();
  }

  const data = {
    fileName: path.basename(fullPath),
    relPath: relPath.replace(/\\/g, '/'),
    fileSize: stat.size,
    fileSizeFormatted: formatFileSize(stat.size),
    width,
    height,
    aspectRatio,
    dateTime: dateTime ? String(dateTime) : null,
    // カメラ情報
    camera: {
      make: exif.Make || '',
      model: exif.Model || 'Unknown Camera',
      lens: exif.LensModel || (Array.isArray(exif.LensInfo) ? `${exif.LensInfo[0]}-${exif.LensInfo[1]}mm` : 'Unknown Lens')
    },
    // 撮影パラメータ（サツエオパラメータ）
    params: {
      focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : null,
      focalLengthIn35mm: exif.FocalLengthIn35mmFormat ? `${exif.FocalLengthIn35mmFormat}mm (35mm eq.)` : null,
      fNumber: exif.FNumber ? `f/${Number(exif.FNumber.toFixed(1))}` : null,
      shutterSpeed: formatShutterSpeed(exif.ExposureTime),
      exposureTimeRaw: exif.ExposureTime,
      iso: exif.ISO ? `ISO ${exif.ISO}` : (exif.RecommendedExposureIndex ? `ISO ${exif.RecommendedExposureIndex}` : null),
      exposureCompensation: formatExposureBias(exif.ExposureCompensation),
      exposureProgram: exif.ExposureProgram || null,
      meteringMode: exif.MeteringMode || null,
      whiteBalance: exif.WhiteBalance || null,
      flash: exif.Flash || null
    }
  };

  metadataCache[cacheKey] = data;
  return data;
}

// ディレクトリツリー全体の解析
async function scanPhotoLibrary() {
  if (!fs.existsSync(IMAGES_DIR)) return { albums: [] };

  const albumDirs = fs.readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const albums = [];

  for (const albumName of albumDirs) {
    const albumPath = path.join(IMAGES_DIR, albumName);
    const dateDirs = fs.readdirSync(albumPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort((a, b) => b.localeCompare(a)); // 日付降順

    const dates = [];
    let albumPhotos = [];

    for (const dateName of dateDirs) {
      const datePath = path.join(albumPath, dateName);
      const photoFiles = fs.readdirSync(datePath, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && /\.(jpe?g|png|webp|tiff?|avif)$/i.test(dirent.name))
        .map(dirent => dirent.name);

      const photos = [];
      for (const fileName of photoFiles) {
        const fullPhotoPath = path.join(datePath, fileName);
        const relPath = path.relative(IMAGES_DIR, fullPhotoPath);
        const meta = await getPhotoMetadata(fullPhotoPath, relPath);
        meta.album = albumName;
        meta.date = dateName;
        photos.push(meta);
      }

      // 日付内の写真を撮影日時（またはファイル名）でソート
      photos.sort((a, b) => {
        if (a.dateTime && b.dateTime) return new Date(b.dateTime) - new Date(a.dateTime);
        return a.fileName.localeCompare(b.fileName);
      });

      if (photos.length > 0) {
        dates.push({
          date: dateName,
          photoCount: photos.length,
          coverPhoto: photos[0], // 最新または先頭の写真
          photos: photos
        });
        albumPhotos = albumPhotos.concat(photos);
      }
    }

    // アルバム全体の最新写真を決定
    albumPhotos.sort((a, b) => {
      if (a.dateTime && b.dateTime) return new Date(b.dateTime) - new Date(a.dateTime);
      return a.fileName.localeCompare(b.fileName);
    });

    if (albumPhotos.length > 0) {
      albums.push({
        id: albumName,
        name: albumName,
        totalPhotos: albumPhotos.length,
        totalDates: dates.length,
        coverPhoto: albumPhotos[0], // アルバムの最新写真
        latestDate: dates[0] ? dates[0].date : null,
        dates: dates
      });
    }
  }

  saveCache();
  return { albums };
}

// API: 全データ取得
app.get('/api/data', async (req, res) => {
  try {
    const data = await scanPhotoLibrary();
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API: サムネイル生成・高速配信
app.get('/api/thumbnail', async (req, res) => {
  try {
    const relPath = req.query.path;
    const width = parseInt(req.query.w, 10) || 600;
    const quality = parseInt(req.query.q, 10) || 82;

    if (!relPath) return res.status(400).send('Missing path parameter');

    const cleanPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
    const sourcePath = path.join(IMAGES_DIR, cleanPath);

    if (!fs.existsSync(sourcePath)) {
      return res.status(404).send('Image not found');
    }

    // サムネイルキャッシュキー
    const stat = fs.statSync(sourcePath);
    const hash = Buffer.from(`${cleanPath}_${stat.mtimeMs}_${width}_${quality}`).toString('base64url');
    const thumbPath = path.join(THUMB_CACHE_DIR, `${hash}.webp`);

    if (fs.existsSync(thumbPath)) {
      res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'public, max-age=86400, immutable');
      return fs.createReadStream(thumbPath).pipe(res);
    }

    // sharpで最適化リサイズ
    const imageStream = sharp(sourcePath)
      .rotate() // EXIFの回転を適用
      .resize({
        width: width,
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality: quality });

    const buffer = await imageStream.toBuffer();
    fs.writeFileSync(thumbPath, buffer);

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.send(buffer);
  } catch (err) {
    console.error('Thumbnail generation error:', err);
    res.status(500).send('Error generating thumbnail');
  }
});

app.listen(PORT, () => {
  console.log(`\n==========================================`);
  console.log(`Photo Gallery Server running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Images Directory: ${IMAGES_DIR}`);
  console.log(`==========================================\n`);
});
