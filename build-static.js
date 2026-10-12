const fs = require('fs');
const path = require('path');
const exifr = require('exifr');
const sharp = require('sharp');

// images ディレクトリ探索
function findImagesDir() {
  const candidates = ['images', 'imeges', 'Images', 'Imeges'];
  for (const c of candidates) {
    const full = path.join(__dirname, c);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return full;
  }
  return path.join(__dirname, 'images');
}

const IMAGES_DIR = findImagesDir();
const DIST_DIR = path.join(__dirname, 'dist');
const DIST_IMAGES = path.join(DIST_DIR, 'images');
const DIST_THUMBS = path.join(DIST_DIR, 'thumbnails');
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'metadata_cache.json');

// メタデータキャッシュの読み込み
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
let metadataCache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    metadataCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    metadataCache = {};
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
  } catch (e) {
    console.warn('キャッシュ保存に失敗しました:', e.message);
  }
}

function formatShutterSpeed(seconds) {
  if (!seconds || typeof seconds !== 'number') return null;
  if (seconds >= 1) return `${Number(seconds.toFixed(1))}s`;
  const denom = Math.round(1 / seconds);
  return `1/${denom}s`;
}

function formatExposureBias(bias) {
  if (bias === undefined || bias === null || typeof bias !== 'number') return '0 EV';
  if (bias === 0) return '0 EV';
  const sign = bias > 0 ? '+' : '';
  return `${sign}${bias.toFixed(1)} EV`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// タイムスタンプ・サイズ比較による差分コピー
function copyDirSyncIncremental(srcDir, destDir, filter) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (filter && !filter(srcPath)) continue;

    if (entry.isDirectory()) {
      copyDirSyncIncremental(srcPath, destPath, filter);
    } else if (entry.isFile()) {
      let needCopy = true;
      if (fs.existsSync(destPath)) {
        const srcStat = fs.statSync(srcPath);
        const destStat = fs.statSync(destPath);
        if (srcStat.mtimeMs <= destStat.mtimeMs && srcStat.size === destStat.size) {
          needCopy = false;
        }
      }
      if (needCopy) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// 孤立した（元フォルダから削除された）ファイルのクリーンアップ
function cleanOrphanFiles(dir, validSet) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += cleanOrphanFiles(fullPath, validSet);
      try {
        if (fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
        }
      } catch {}
    } else if (entry.isFile()) {
      if (!validSet.has(path.normalize(fullPath))) {
        try {
          fs.unlinkSync(fullPath);
          count++;
        } catch {}
      }
    }
  }
  return count;
}

async function buildStatic() {
  console.log('Building static photo gallery to ./dist (差分ビルド) ...');

  // dist フォルダを丸ごと削除せず、存在しなければ作成（既存ファイルのタイムスタンプを維持）
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DIST_IMAGES, { recursive: true });
  fs.mkdirSync(DIST_THUMBS, { recursive: true });

  // public フォルダの差分同期（静的成果物に不要な api.php は除外）
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    copyDirSyncIncremental(publicDir, DIST_DIR, (src) => !src.endsWith('api.php'));
  }

  const albumDirs = fs.readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const albums = [];
  const validThumbFiles = new Set();
  const validImageFiles = new Set();

  let totalPhotosCount = 0;
  let generatedThumbsCount = 0;
  let generatedLargeCount = 0;
  let copiedOriginalCount = 0;
  let skippedPhotosCount = 0;

  for (const albumName of albumDirs) {
    const albumPath = path.join(IMAGES_DIR, albumName);
    const dateDirs = fs.readdirSync(albumPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort((a, b) => b.localeCompare(a));

    const dates = [];
    let albumPhotos = [];

    for (const dateName of dateDirs) {
      const datePath = path.join(albumPath, dateName);
      const photoFiles = fs.readdirSync(datePath, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && /\.(jpe?g|png|webp|tiff?|avif)$/i.test(dirent.name))
        .map(dirent => dirent.name);

      const photos = [];
      for (const fileName of photoFiles) {
        totalPhotosCount++;
        const fullPhotoPath = path.join(datePath, fileName);
        const relPath = path.relative(IMAGES_DIR, fullPhotoPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPhotoPath);

        // 1. メタデータキャッシュの確認
        const cacheKey = `${relPath}_${stat.mtimeMs}_${stat.size}`;
        let meta = metadataCache[cacheKey];

        if (!meta) {
          let exif = {};
          try {
            exif = await exifr.parse(fullPhotoPath, { tiff: true, exif: true, gps: true }) || {};
          } catch (e) {
            console.warn(`EXIF解析失敗: ${relPath}`);
          }

          let width = exif.ExifImageWidth || exif.ImageWidth;
          let height = exif.ExifImageHeight || exif.ImageHeight;
          if (!width || !height) {
            try {
              const m = await sharp(fullPhotoPath).metadata();
              width = m.width;
              height = m.height;
            } catch {
              width = 1920; height = 1080;
            }
          }
          const orientation = exif.Orientation;
          if (orientation && (orientation === 6 || orientation === 8 || orientation === 'Rotate 90 CW' || orientation === 'Rotate 270 CW')) {
            const tmp = width; width = height; height = tmp;
          }

          const aspectRatio = width && height ? parseFloat((width / height).toFixed(4)) : 1.5;
          let dateTime = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || stat.mtime;
          if (dateTime instanceof Date) dateTime = dateTime.toISOString();

          meta = {
            width,
            height,
            aspectRatio,
            dateTime: dateTime ? String(dateTime) : null,
            camera: {
              make: exif.Make || '',
              model: exif.Model || 'Unknown Camera',
              lens: exif.LensModel || (Array.isArray(exif.LensInfo) ? `${exif.LensInfo[0]}-${exif.LensInfo[1]}mm` : 'Unknown Lens')
            },
            params: {
              focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : null,
              focalLengthIn35mm: exif.FocalLengthIn35mmFormat ? `${exif.FocalLengthIn35mmFormat}mm (35mm eq.)` : null,
              fNumber: exif.FNumber ? `f/${Number(exif.FNumber.toFixed(1))}` : null,
              shutterSpeed: formatShutterSpeed(exif.ExposureTime),
              iso: exif.ISO ? `ISO ${exif.ISO}` : (exif.RecommendedExposureIndex ? `ISO ${exif.RecommendedExposureIndex}` : null),
              exposureCompensation: formatExposureBias(exif.ExposureCompensation),
              exposureProgram: exif.ExposureProgram || null,
              meteringMode: exif.MeteringMode || null,
              whiteBalance: exif.WhiteBalance || null,
              flash: exif.Flash || null
            }
          };
          metadataCache[cacheKey] = meta;
        }

        const hashName = Buffer.from(relPath).toString('base64url');
        const thumbName = `${hashName}.webp`;
        const thumbDest = path.join(DIST_THUMBS, thumbName);

        const largeName = `large_${hashName}.webp`;
        const largeDest = path.join(DIST_THUMBS, largeName);

        const destPhotoPath = path.join(DIST_IMAGES, relPath);

        validThumbFiles.add(thumbName);
        validThumbFiles.add(largeName);
        validImageFiles.add(path.normalize(destPhotoPath));

        let isModified = false;

        // 2. 一覧タイル用サムネイル生成 (幅800px) - 存在＆更新日時チェック
        const needThumb = !fs.existsSync(thumbDest) || fs.statSync(thumbDest).mtimeMs < stat.mtimeMs;
        if (needThumb) {
          isModified = true;
          await sharp(fullPhotoPath)
            .rotate()
            .resize({ width: 800, withoutEnlargement: true, fit: 'inside' })
            .webp({ quality: 82 })
            .toFile(thumbDest);
          generatedThumbsCount++;
        }

        // 3. Lightbox拡大表示用 超高精細画像生成 (幅2560px, 高品質88) - 存在＆更新日時チェック
        const needLarge = !fs.existsSync(largeDest) || fs.statSync(largeDest).mtimeMs < stat.mtimeMs;
        if (needLarge) {
          isModified = true;
          await sharp(fullPhotoPath)
            .rotate()
            .resize({ width: 2560, withoutEnlargement: true, fit: 'inside' })
            .webp({ quality: 88 })
            .toFile(largeDest);
          generatedLargeCount++;
        }

        // 4. 原寸画像の差分コピー（オリジナル保存用）
        let needCopyOriginal = true;
        if (fs.existsSync(destPhotoPath)) {
          const destStat = fs.statSync(destPhotoPath);
          if (destStat.size === stat.size && destStat.mtimeMs >= stat.mtimeMs) {
            needCopyOriginal = false;
          }
        }
        if (needCopyOriginal) {
          isModified = true;
          fs.mkdirSync(path.dirname(destPhotoPath), { recursive: true });
          fs.copyFileSync(fullPhotoPath, destPhotoPath);
          copiedOriginalCount++;
        }

        if (!isModified) {
          skippedPhotosCount++;
        }

        const photoObj = {
          fileName: fileName,
          relPath: relPath.replace(/\\/g, '/'),
          thumbUrl: `thumbnails/${thumbName}`,
          largeUrl: `thumbnails/${largeName}`,
          fullUrl: encodeURI(`images/${relPath.replace(/\\/g, '/')}`),
          fileSize: stat.size,
          fileSizeFormatted: formatFileSize(stat.size),
          width: meta.width,
          height: meta.height,
          aspectRatio: meta.aspectRatio,
          dateTime: meta.dateTime,
          album: albumName,
          date: dateName,
          camera: meta.camera,
          params: meta.params
        };
        photos.push(photoObj);
      }

      photos.sort((a, b) => {
        if (a.dateTime && b.dateTime) return new Date(b.dateTime) - new Date(a.dateTime);
        return a.fileName.localeCompare(b.fileName);
      });

      if (photos.length > 0) {
        dates.push({
          date: dateName,
          photoCount: photos.length,
          coverPhoto: photos[0],
          photos: photos
        });
        albumPhotos = albumPhotos.concat(photos);
      }
    }

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
        coverPhoto: albumPhotos[0],
        latestDate: dates[0] ? dates[0].date : null,
        dates: dates
      });
    }
  }

  // 5. 元フォルダから削除された古いファイルのクリーンアップ
  let cleanedThumbsCount = 0;
  if (fs.existsSync(DIST_THUMBS)) {
    const existingThumbs = fs.readdirSync(DIST_THUMBS);
    for (const f of existingThumbs) {
      if (!validThumbFiles.has(f)) {
        try {
          fs.unlinkSync(path.join(DIST_THUMBS, f));
          cleanedThumbsCount++;
        } catch {}
      }
    }
  }
  const cleanedImagesCount = cleanOrphanFiles(DIST_IMAGES, validImageFiles);

  // 6. data.json の保存
  const exportData = { albums, builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(DIST_DIR, 'data.json'), JSON.stringify(exportData, null, 2), 'utf8');

  // 7. さくらのレンタルサーバ（Apache）向け .htaccess（変更がある場合のみ上書き）
  const htaccessPath = path.join(DIST_DIR, '.htaccess');
  const htaccessContent = `# WoodStream Photo Gallery - さくらのレンタルサーバ用 最適化設定
# MIMEタイプ設定
AddType image/webp .webp

# ブラウザキャッシュ設定（mod_expires）
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresDefault "access plus 1 day"
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/json "access plus 0 seconds"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
  ExpiresByType image/webp "access plus 1 month"
  ExpiresByType image/jpeg "access plus 1 month"
  ExpiresByType image/png "access plus 1 month"
</IfModule>

# Gzip圧縮（mod_deflate）
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>
`;
  if (!fs.existsSync(htaccessPath) || fs.readFileSync(htaccessPath, 'utf8') !== htaccessContent) {
    fs.writeFileSync(htaccessPath, htaccessContent, 'utf8');
  }

  // メタデータキャッシュ保存
  saveCache();

  console.log(`\n================ ビルドサマリー ================`);
  console.log(`総写真枚数: ${totalPhotosCount} 枚`);
  console.log(`新規/更新サムネイル生成: ${generatedThumbsCount} 枚 (スキップ: ${totalPhotosCount - generatedThumbsCount} 枚)`);
  console.log(`新規/更新拡大画像生成: ${generatedLargeCount} 枚 (スキップ: ${totalPhotosCount - generatedLargeCount} 枚)`);
  console.log(`新規/更新元画像コピー: ${copiedOriginalCount} 枚 (スキップ: ${totalPhotosCount - copiedOriginalCount} 枚)`);
  if (cleanedThumbsCount > 0 || cleanedImagesCount > 0) {
    console.log(`削除された写真のクリーンアップ: サムネイル ${cleanedThumbsCount} 件, 元画像 ${cleanedImagesCount} 件`);
  }
  console.log(`出力先: ${DIST_DIR}`);
  console.log(`================================================\n`);
  console.log(`Static build complete!`);
}

buildStatic().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
