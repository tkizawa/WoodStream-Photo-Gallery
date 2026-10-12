/**
 * LuminaLens - Photography Gallery Application Logic
 * Supports 500px-style Justified Grid, EXIF Extraction, Lightbox & Deep Routing
 */

class PhotoGalleryApp {
  constructor() {
    this.data = null;
    this.currentAlbum = null;
    this.currentDate = null;
    this.currentPhotoList = [];
    this.currentPhotoIndex = -1;
    this.isZoomed = false;

    // DOM Elements
    this.dom = {
      loadingState: document.getElementById('loadingState'),
      viewContainer: document.getElementById('viewContainer'),
      albumsView: document.getElementById('albumsView'),
      datesView: document.getElementById('datesView'),
      photosView: document.getElementById('photosView'),

      breadcrumbList: document.getElementById('breadcrumbList'),
      statsPhotosCount: document.getElementById('statsPhotosCount'),
      heroAlbumCount: document.getElementById('heroAlbumCount'),
      heroPhotoCount: document.getElementById('heroPhotoCount'),

      albumsGrid: document.getElementById('albumsGrid'),
      datesGrid: document.getElementById('datesGrid'),
      justifiedGallery: document.getElementById('justifiedGallery'),

      backToAlbumsBtn: document.getElementById('backToAlbumsBtn'),
      backToDatesBtn: document.getElementById('backToDatesBtn'),
      datesViewTitle: document.getElementById('datesViewTitle'),
      datesViewDesc: document.getElementById('datesViewDesc'),
      photosAlbumTag: document.getElementById('photosAlbumTag'),
      photosDateTag: document.getElementById('photosDateTag'),
      photosViewTitle: document.getElementById('photosViewTitle'),
      photosViewCount: document.getElementById('photosViewCount'),

      // Lightbox
      lightboxModal: document.getElementById('lightboxModal'),
      lightboxBackdrop: document.getElementById('lightboxBackdrop'),
      btnCloseLightbox: document.getElementById('btnCloseLightbox'),
      btnPrevPhoto: document.getElementById('btnPrevPhoto'),
      btnNextPhoto: document.getElementById('btnNextPhoto'),
      lightboxImage: document.getElementById('lightboxImage'),
      lightboxCounter: document.getElementById('lightboxCounter'),
      lightboxFileName: document.getElementById('lightboxFileName'),
      lightboxImgSpinner: document.getElementById('lightboxImgSpinner'),
      btnToggleZoom: document.getElementById('btnToggleZoom'),
      btnToggleSidebar: document.getElementById('btnToggleSidebar'),
      btnDownload: document.getElementById('btnDownload'),
      lightboxSidebar: document.getElementById('lightboxSidebar'),

      // EXIF Fields
      exifCamera: document.getElementById('exifCamera'),
      exifLens: document.getElementById('exifLens'),
      exifFocalLength: document.getElementById('exifFocalLength'),
      exifFocal35: document.getElementById('exifFocal35'),
      exifFNumber: document.getElementById('exifFNumber'),
      exifShutterSpeed: document.getElementById('exifShutterSpeed'),
      exifIso: document.getElementById('exifIso'),
      exifExposureBias: document.getElementById('exifExposureBias'),
      exifExposureProgram: document.getElementById('exifExposureProgram'),
      exifDateTime: document.getElementById('exifDateTime'),
      exifMetering: document.getElementById('exifMetering'),
      exifWhiteBalance: document.getElementById('exifWhiteBalance'),
      exifFlash: document.getElementById('exifFlash'),
      exifResolution: document.getElementById('exifResolution'),
      exifAspectRatio: document.getElementById('exifAspectRatio'),
      exifFileSize: document.getElementById('exifFileSize'),
      exifAlbumName: document.getElementById('exifAlbumName')
    };

    this.init();
  }

  async init() {
    this.bindEvents();
    await Promise.all([
      this.loadGalleryConfig(),
      this.loadGalleryData()
    ]);
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();
  }

  // ギャラリー設定（gallery.config.json）の読み込みと反映
  async loadGalleryConfig() {
    try {
      const res = await fetch('gallery.config.json').catch(() => null);
      if (res && res.ok) {
        const config = await res.json();
        this.applyConfig(config);
      }
    } catch (e) {
      // 読み込み失敗時は既定表示を維持
    }
  }

  // 設定のDOM反映
  applyConfig(config) {
    if (!config) return;
    if (config.siteTitle) {
      document.title = config.siteTitle;
    }
    if (config.logo) {
      const primary = document.getElementById('logoPrimary');
      const accent = document.getElementById('logoAccent');
      const sub = document.getElementById('logoSub');
      if (primary && config.logo.primary !== undefined) primary.textContent = config.logo.primary;
      if (accent && config.logo.accent !== undefined) accent.textContent = config.logo.accent;
      if (sub && config.logo.sub !== undefined) sub.textContent = config.logo.sub;
    }
    if (config.hero) {
      const title = document.getElementById('heroTitle');
      const subtitle = document.getElementById('heroSubtitle');
      if (title && config.hero.title) title.textContent = config.hero.title;
      if (subtitle && config.hero.subtitle) subtitle.textContent = config.hero.subtitle;
    }
    if (config.footer) {
      const copyright = document.getElementById('footerCopyright');
      if (copyright && config.footer.copyright) copyright.textContent = config.footer.copyright;
    }
  }

  // イベントリスナーの登録
  bindEvents() {
    // 戻るボタン
    this.dom.backToAlbumsBtn?.addEventListener('click', () => {
      window.location.hash = '#/';
    });

    this.dom.backToDatesBtn?.addEventListener('click', () => {
      if (this.currentAlbum) {
        window.location.hash = `#/album/${encodeURIComponent(this.currentAlbum.id)}`;
      } else {
        window.location.hash = '#/';
      }
    });

    // Lightbox操作
    this.dom.btnCloseLightbox?.addEventListener('click', () => this.closeLightbox());
    this.dom.lightboxBackdrop?.addEventListener('click', () => this.closeLightbox());
    this.dom.btnPrevPhoto?.addEventListener('click', () => this.navigatePhoto(-1));
    this.dom.btnNextPhoto?.addEventListener('click', () => this.navigatePhoto(1));

    // ズーム切替
    this.dom.btnToggleZoom?.addEventListener('click', () => this.toggleZoom());
    this.dom.lightboxImage?.addEventListener('click', () => this.toggleZoom());

    // サイドバー切替
    this.dom.btnToggleSidebar?.addEventListener('click', () => {
      this.dom.lightboxSidebar?.classList.toggle('collapsed');
      this.dom.btnToggleSidebar?.classList.toggle('active');
    });

    // キーボード操作
    window.addEventListener('keydown', (e) => {
      if (!this.dom.lightboxModal?.classList.contains('active')) return;
      if (e.key === 'Escape') this.closeLightbox();
      if (e.key === 'ArrowLeft') this.navigatePhoto(-1);
      if (e.key === 'ArrowRight') this.navigatePhoto(1);
      if (e.key === 'f' || e.key === 'F') this.toggleZoom();
    });

    // リサイズ時にJustifiedグリッドを再調整
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.currentDate && this.currentPhotoList.length > 0) {
          this.applyJustifiedLayout();
        }
      }, 150);
    });
  }

  // ギャラリーデータのロード（静的data.json -> Node API -> PHP の順で確実に自動判別）
  async loadGalleryData() {
    this.backendMode = 'static';
    try {
      // 1. 静的ビルド (data.json) のチェック（最優先）
      let res = await fetch('data.json').catch(() => null);
      if (res && res.ok) {
        this.backendMode = 'static';
      } else {
        // 2. Node.js 開発サーバー (/api/data) のチェック
        res = await fetch('/api/data').catch(() => null);
        if (res && res.ok) {
          this.backendMode = 'node';
        } else {
          // 3. さくらのレンタルサーバ（PHP環境）のチェック
          res = await fetch('api.php').catch(() => null);
          if (res && res.ok) {
            this.backendMode = 'php';
          }
        }
      }

      if (!res || !res.ok) {
        throw new Error('No valid photo data source found');
      }

      this.data = await res.json();
      this.updateGlobalStats();
      this.dom.loadingState.style.display = 'none';
      this.dom.viewContainer.style.display = 'block';
    } catch (err) {
      console.error('Failed to load gallery data:', err);
      this.dom.loadingState.innerHTML = `
        <div style="text-align: center; color: #f87171;">
          <p style="font-weight: 600; font-size: 1.2rem;">写真データの読み込みに失敗しました</p>
          <p style="font-size: 0.9rem; color: #94a3b8; margin-top: 8px;">データファイル（data.json）またはサーバー接続をご確認ください。</p>
        </div>
      `;
    }
  }

  // 全体統計表示
  updateGlobalStats() {
    if (!this.data || !this.data.albums) return;
    const albumCount = this.data.albums.length;
    let totalPhotos = 0;
    this.data.albums.forEach(a => { totalPhotos += a.totalPhotos || 0; });

    if (this.dom.heroAlbumCount) this.dom.heroAlbumCount.textContent = albumCount;
    if (this.dom.heroPhotoCount) this.dom.heroPhotoCount.textContent = totalPhotos;
    if (this.dom.statsPhotosCount) this.dom.statsPhotosCount.textContent = `${totalPhotos} 枚`;
  }

  // サムネイル画像URLの決定
  getThumbnailUrl(photo, width = 600) {
    if (photo.thumbUrl) return photo.thumbUrl; // 静的ビルド時
    if (this.backendMode === 'php') {
      return `api.php?thumb=1&path=${encodeURIComponent(photo.relPath)}&w=${width}`;
    }
    return `/api/thumbnail?path=${encodeURIComponent(photo.relPath)}&w=${width}&q=82`;
  }

  // 拡大表示用（Lightbox）の高精細画像URL（2560px WebP）
  getLargeImageUrl(photo) {
    if (photo.largeUrl) return photo.largeUrl; // 静的ビルド済みの2560px超高精細WebP
    if (this.backendMode === 'php') {
      return `api.php?thumb=1&path=${encodeURIComponent(photo.relPath)}&w=2560`;
    }
    if (this.backendMode === 'node') {
      return `/api/thumbnail?path=${encodeURIComponent(photo.relPath)}&w=2560&q=88`;
    }
    return this.getFullImageUrl(photo);
  }

  // 原寸大画像URLの決定（ダウンロード用など）
  getFullImageUrl(photo) {
    if (photo.fullUrl) {
      return photo.fullUrl.includes('%') ? photo.fullUrl : encodeURI(photo.fullUrl);
    }
    return encodeURI(`images/${photo.relPath}`);
  }

  // ルーティングハンドラ（ハッシュ監視）
  handleRouting() {
    if (!this.data) return;

    const hash = window.location.hash || '#/';
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

    if (parts.length === 0) {
      // トップページ: アルバム一覧
      this.showAlbumsView();
    } else if (parts[0] === 'album' && parts.length === 2) {
      // アルバム詳細: 撮影日一覧
      const albumId = decodeURIComponent(parts[1]);
      this.showDatesView(albumId);
    } else if (parts[0] === 'album' && parts.length >= 3) {
      // 撮影日詳細: 写真タイル一覧
      const albumId = decodeURIComponent(parts[1]);
      const dateName = decodeURIComponent(parts[2]);
      this.showPhotosView(albumId, dateName);

      // モーダル指定がある場合
      if (parts.length >= 4 && parts[3] === 'photo') {
        const fileName = decodeURIComponent(parts[4]);
        this.openLightboxByFileName(fileName);
      } else {
        this.closeLightbox(false);
      }
    } else {
      this.showAlbumsView();
    }
  }

  // パンくずリストの更新
  updateBreadcrumbs(items) {
    if (!this.dom.breadcrumbList) return;
    this.dom.breadcrumbList.innerHTML = '';

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'breadcrumb-item';
      if (index === items.length - 1) {
        li.classList.add('active');
        li.textContent = item.label;
      } else {
        const a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
      }
      this.dom.breadcrumbList.appendChild(li);

      if (index < items.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '/';
        this.dom.breadcrumbList.appendChild(sep);
      }
    });
  }

  // =========================================================================
  // ビュー 1: アルバム一覧（トップページ）
  // =========================================================================
  showAlbumsView() {
    this.currentAlbum = null;
    this.currentDate = null;
    this.currentPhotoList = [];

    this.dom.albumsView.style.display = 'block';
    this.dom.datesView.style.display = 'none';
    this.dom.photosView.style.display = 'none';
    this.closeLightbox(false);

    this.updateBreadcrumbs([
      { label: 'Albums', href: '#/' }
    ]);

    this.renderAlbums();
  }

  renderAlbums() {
    if (!this.dom.albumsGrid || !this.data) return;
    this.dom.albumsGrid.innerHTML = '';

    if (this.data.albums.length === 0) {
      this.dom.albumsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
          アルバムが見つかりませんでした。<br>images フォルダにサブフォルダを追加してください。
        </div>
      `;
      return;
    }

    this.data.albums.forEach((album, idx) => {
      const card = document.createElement('div');
      card.className = 'album-card';
      card.style.animation = `photoStaggerFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards ${idx * 0.08}s`;

      const coverPhoto = album.coverPhoto;
      const thumbUrl = coverPhoto ? this.getThumbnailUrl(coverPhoto, 800) : '';

      card.innerHTML = `
        <div class="album-thumb-wrap">
          ${coverPhoto ? `<img src="${thumbUrl}" alt="${album.name}" loading="lazy">` : '<div class="no-img">No Photo</div>'}
          <div class="album-badge-overlay">
            <span class="album-count-badge">${album.totalPhotos} 枚</span>
          </div>
        </div>
        <div class="album-info-body">
          <h3 class="album-name">${this.escapeHtml(album.name)}</h3>
          <div class="album-stats-row">
            <span>${album.totalDates} 回の撮影</span>
            ${album.latestDate ? `<span class="album-latest-tag">最新: ${album.latestDate}</span>` : ''}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        window.location.hash = `#/album/${encodeURIComponent(album.id)}`;
      });

      this.dom.albumsGrid.appendChild(card);
    });
  }

  // =========================================================================
  // ビュー 2: 撮影日一覧（アルバム詳細）
  // =========================================================================
  showDatesView(albumId) {
    const album = this.data.albums.find(a => a.id === albumId);
    if (!album) {
      this.showAlbumsView();
      return;
    }

    this.currentAlbum = album;
    this.currentDate = null;
    this.currentPhotoList = [];

    this.dom.albumsView.style.display = 'none';
    this.dom.datesView.style.display = 'block';
    this.dom.photosView.style.display = 'none';
    this.closeLightbox(false);

    this.updateBreadcrumbs([
      { label: 'Albums', href: '#/' },
      { label: album.name, href: `#/album/${encodeURIComponent(album.id)}` }
    ]);

    this.dom.datesViewTitle.textContent = album.name;
    this.dom.datesViewDesc.textContent = `${album.totalDates} 個の撮影日フォルダー (${album.totalPhotos} 枚の写真)`;

    this.renderDates(album);
  }

  renderDates(album) {
    if (!this.dom.datesGrid) return;
    this.dom.datesGrid.innerHTML = '';

    album.dates.forEach((dateGroup, idx) => {
      const card = document.createElement('div');
      card.className = 'date-card';
      card.style.animation = `photoStaggerFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards ${idx * 0.08}s`;

      const coverPhoto = dateGroup.coverPhoto;
      const thumbUrl = coverPhoto ? this.getThumbnailUrl(coverPhoto, 700) : '';

      card.innerHTML = `
        <div class="date-thumb-wrap">
          ${coverPhoto ? `<img src="${thumbUrl}" alt="${dateGroup.date}" loading="lazy">` : ''}
        </div>
        <div class="date-info-body">
          <div class="date-title-group">
            <span class="date-folder-name">${this.formatDateDisplay(dateGroup.date)}</span>
            <span class="date-relative">${dateGroup.date}</span>
          </div>
          <span class="date-photo-count">${dateGroup.photoCount} 枚</span>
        </div>
      `;

      card.addEventListener('click', () => {
        window.location.hash = `#/album/${encodeURIComponent(album.id)}/${encodeURIComponent(dateGroup.date)}`;
      });

      this.dom.datesGrid.appendChild(card);
    });
  }

  // =========================================================================
  // ビュー 3: 写真タイル一覧（500px風 Justified Grid）
  // =========================================================================
  showPhotosView(albumId, dateName) {
    const album = this.data.albums.find(a => a.id === albumId);
    if (!album) {
      this.showAlbumsView();
      return;
    }

    const dateGroup = album.dates.find(d => d.date === dateName);
    if (!dateGroup) {
      this.showDatesView(albumId);
      return;
    }

    this.currentAlbum = album;
    this.currentDate = dateGroup;
    this.currentPhotoList = dateGroup.photos;

    this.dom.albumsView.style.display = 'none';
    this.dom.datesView.style.display = 'none';
    this.dom.photosView.style.display = 'block';

    this.updateBreadcrumbs([
      { label: 'Albums', href: '#/' },
      { label: album.name, href: `#/album/${encodeURIComponent(album.id)}` },
      { label: dateGroup.date, href: `#/album/${encodeURIComponent(album.id)}/${encodeURIComponent(dateGroup.date)}` }
    ]);

    this.dom.photosAlbumTag.textContent = album.name;
    this.dom.photosDateTag.textContent = dateGroup.date;
    this.dom.photosViewTitle.textContent = this.formatDateDisplay(dateGroup.date);
    this.dom.photosViewCount.textContent = `${dateGroup.photoCount} 枚の写真`;

    this.renderPhotos(dateGroup.photos);
  }

  // 500px風のタイル表示と「順にジワッと表示させる」演出
  renderPhotos(photos) {
    if (!this.dom.justifiedGallery) return;
    this.dom.justifiedGallery.innerHTML = '';

    photos.forEach((photo, index) => {
      const tile = document.createElement('div');
      tile.className = 'gallery-tile';
      // 順にジワッと出現するアニメーション用ディレイインデックス
      tile.style.setProperty('--i', index);

      // アスペクト比に基づく幅の初期目安
      const ratio = photo.aspectRatio || 1.5;
      const targetHeight = 280;
      const calculatedWidth = Math.round(targetHeight * ratio);

      tile.style.height = `${targetHeight}px`;
      tile.style.flex = `${ratio} 1 ${calculatedWidth}px`;
      tile.style.maxWidth = `${Math.round(targetHeight * ratio * 1.5)}px`;

      const thumbUrl = this.getThumbnailUrl(photo, 800);

      // パラメータ pill の簡易文字列
      const paramList = [];
      if (photo.params.fNumber) paramList.push(photo.params.fNumber);
      if (photo.params.shutterSpeed) paramList.push(photo.params.shutterSpeed);
      if (photo.params.iso) paramList.push(photo.params.iso);
      if (photo.params.focalLength) paramList.push(photo.params.focalLength);

      let cameraName = photo.camera.model || photo.fileName;
      if (photo.camera.make && photo.camera.model && !photo.camera.model.toLowerCase().startsWith(photo.camera.make.toLowerCase())) {
        cameraName = `${photo.camera.make} ${photo.camera.model}`;
      }

      tile.innerHTML = `
        <img src="${thumbUrl}" alt="${photo.fileName}" loading="lazy">
        <div class="tile-overlay">
          <div class="tile-overlay-content">
            <div class="tile-meta-camera">${cameraName}</div>
            <div class="tile-meta-params">
              ${paramList.map(p => `<span class="tile-param-pill">${p}</span>`).join('')}
            </div>
          </div>
        </div>
      `;

      tile.addEventListener('click', () => {
        window.location.hash = `#/album/${encodeURIComponent(this.currentAlbum.id)}/${encodeURIComponent(this.currentDate.date)}/photo/${encodeURIComponent(photo.fileName)}`;
      });

      this.dom.justifiedGallery.appendChild(tile);
    });

    this.applyJustifiedLayout();
  }

  // 画面幅に応じたJustifiedグリッドの微調整
  applyJustifiedLayout() {
    if (!this.dom.justifiedGallery) return;
    const containerWidth = this.dom.justifiedGallery.clientWidth;
    const tiles = this.dom.justifiedGallery.querySelectorAll('.gallery-tile');
    const isMobile = containerWidth < 600;
    const baseHeight = isMobile ? 180 : (containerWidth < 1200 ? 240 : 300);

    tiles.forEach((tile, idx) => {
      const photo = this.currentPhotoList[idx];
      if (photo) {
        const ratio = photo.aspectRatio || 1.5;
        tile.style.height = `${baseHeight}px`;
        tile.style.flex = `${ratio * 100} 1 ${Math.round(baseHeight * ratio)}px`;
      }
    });
  }

  // =========================================================================
  // ビュー 4: 拡大表示（Lightbox モーダル & EXIFサイドパネル）
  // =========================================================================
  openLightboxByFileName(fileName) {
    if (!this.currentPhotoList || this.currentPhotoList.length === 0) return;
    const index = this.currentPhotoList.findIndex(p => p.fileName === fileName);
    if (index !== -1) {
      this.openLightbox(index);
    }
  }

  openLightbox(index) {
    this.currentPhotoIndex = index;
    const photo = this.currentPhotoList[index];
    if (!photo) return;

    this.isZoomed = false;
    this.dom.lightboxImage.classList.remove('zoomed');
    this.dom.btnToggleZoom?.classList.remove('active');

    this.dom.lightboxModal.classList.add('active');
    this.dom.lightboxModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // カウンター & ファイル名
    this.dom.lightboxCounter.textContent = `${index + 1} / ${this.currentPhotoList.length}`;
    this.dom.lightboxFileName.textContent = photo.fileName;

    // ダウンロードリンク
    const fullUrl = this.getFullImageUrl(photo);
    if (this.dom.btnDownload) {
      this.dom.btnDownload.href = fullUrl;
      this.dom.btnDownload.setAttribute('download', photo.fileName);
    }

    // 画像の表示（一覧サムネイルを即座に当てたあと、2560px高精細画像へ高速プログレッシブ切替）
    const thumbUrl = this.getThumbnailUrl(photo, 800);
    const largeUrl = this.getLargeImageUrl(photo);
    this.dom.lightboxImage.src = thumbUrl;

    if (this.dom.lightboxImgSpinner) this.dom.lightboxImgSpinner.style.display = 'block';

    const highRes = new Image();
    highRes.src = largeUrl;
    highRes.onload = () => {
      // 拡大画像が超高画質版（2560px）にシームレスに切り替わる
      if (this.currentPhotoIndex === index) {
        this.dom.lightboxImage.src = largeUrl;
        if (this.dom.lightboxImgSpinner) this.dom.lightboxImgSpinner.style.display = 'none';
      }
    };
    highRes.onerror = () => {
      // フォールバック: もし失敗した場合は原寸画像を試す
      const orig = new Image();
      orig.src = fullUrl;
      orig.onload = () => {
        if (this.currentPhotoIndex === index) {
          this.dom.lightboxImage.src = fullUrl;
        }
      };
      if (this.dom.lightboxImgSpinner) this.dom.lightboxImgSpinner.style.display = 'none';
    };

    // EXIF情報の流し込み
    this.populateExifData(photo);
  }

  // EXIFサイドバーにデータを充填
  populateExifData(photo) {
    const c = photo.camera || {};
    const p = photo.params || {};

    // カメラ & レンズ
    let cameraName = c.model || 'カメラ情報なし';
    if (c.make && c.model && !c.model.toLowerCase().startsWith(c.make.toLowerCase())) {
      cameraName = `${c.make} ${c.model}`;
    }
    this.dom.exifCamera.textContent = cameraName;
    this.dom.exifLens.textContent = c.lens || 'レンズ情報なし';

    // 撮影パラメータ
    this.dom.exifFocalLength.textContent = p.focalLength || '--';
    this.dom.exifFocal35.textContent = p.focalLengthIn35mm ? `(${p.focalLengthIn35mm})` : '';

    this.dom.exifFNumber.textContent = p.fNumber || '--';
    this.dom.exifShutterSpeed.textContent = p.shutterSpeed || '--';
    this.dom.exifIso.textContent = p.iso || '--';
    this.dom.exifExposureBias.textContent = p.exposureCompensation || '0 EV';
    this.dom.exifExposureProgram.textContent = p.exposureProgram || 'プログラムAE';

    // 詳細メタ情報
    this.dom.exifDateTime.textContent = this.formatFullDateTime(photo.dateTime);
    this.dom.exifMetering.textContent = p.meteringMode || '評価測光';
    this.dom.exifWhiteBalance.textContent = p.whiteBalance || 'オート';
    this.dom.exifFlash.textContent = p.flash || '非発光';

    this.dom.exifResolution.textContent = photo.width && photo.height ? `${photo.width} × ${photo.height}` : '--';
    this.dom.exifAspectRatio.textContent = photo.aspectRatio ? `${photo.aspectRatio}:1` : '--';
    this.dom.exifFileSize.textContent = photo.fileSizeFormatted || '--';
    this.dom.exifAlbumName.textContent = photo.album || '--';
  }

  // 前後の写真ナビゲーション
  navigatePhoto(direction) {
    if (!this.currentPhotoList || this.currentPhotoList.length <= 1) return;
    let newIndex = this.currentPhotoIndex + direction;
    if (newIndex < 0) newIndex = this.currentPhotoList.length - 1;
    if (newIndex >= this.currentPhotoList.length) newIndex = 0;

    const nextPhoto = this.currentPhotoList[newIndex];
    if (nextPhoto) {
      window.location.hash = `#/album/${encodeURIComponent(this.currentAlbum.id)}/${encodeURIComponent(this.currentDate.date)}/photo/${encodeURIComponent(nextPhoto.fileName)}`;
    }
  }

  // ズーム切替
  toggleZoom() {
    this.isZoomed = !this.isZoomed;
    this.dom.lightboxImage?.classList.toggle('zoomed', this.isZoomed);
    this.dom.btnToggleZoom?.classList.toggle('active', this.isZoomed);
  }

  // Lightboxを閉じる
  closeLightbox(updateHash = true) {
    this.dom.lightboxModal?.classList.remove('active');
    this.dom.lightboxModal?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    this.isZoomed = false;
    this.dom.lightboxImage?.classList.remove('zoomed');

    if (updateHash && this.currentAlbum && this.currentDate) {
      window.location.hash = `#/album/${encodeURIComponent(this.currentAlbum.id)}/${encodeURIComponent(this.currentDate.date)}`;
    }
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================
  formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    // 例: 2026-05-02 -> 2026年5月2日
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = match[1];
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      return `${year}年${month}月${day}日`;
    }
    return dateStr;
  }

  formatFullDateTime(dtStr) {
    if (!dtStr) return '--';
    try {
      const d = new Date(dtStr);
      if (isNaN(d.getTime())) return dtStr;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${y}年${m}月${day}日 ${hh}:${mm}:${ss}`;
    } catch {
      return dtStr;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
}

// 起動
document.addEventListener('DOMContentLoaded', () => {
  window.galleryApp = new PhotoGalleryApp();
});
