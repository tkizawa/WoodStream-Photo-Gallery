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
    this.isAdmin = false;
    this.adminUser = null;
    this.selectedPhotoIds = new Set();
    this.uploadQueueFiles = [];

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
      exifAlbumName: document.getElementById('exifAlbumName'),

      // Edit Mode / Admin UI
      btnEditMode: document.getElementById('btnEditMode'),
      btnEditModeLabel: document.getElementById('btnEditModeLabel'),
      adminToolbar: document.getElementById('adminToolbar'),
      adminUserLabel: document.getElementById('adminUserLabel'),
      btnOpenUpload: document.getElementById('btnOpenUpload'),
      btnNewAlbum: document.getElementById('btnNewAlbum'),
      btnSyncFolders: document.getElementById('btnSyncFolders'),
      btnLogout: document.getElementById('btnLogout'),

      loginModal: document.getElementById('loginModal'),
      loginForm: document.getElementById('loginForm'),
      loginUsername: document.getElementById('loginUsername'),
      loginPassword: document.getElementById('loginPassword'),
      loginError: document.getElementById('loginError'),

      uploadModal: document.getElementById('uploadModal'),
      uploadForm: document.getElementById('uploadForm'),
      uploadDropzone: document.getElementById('uploadDropzone'),
      uploadFilesInput: document.getElementById('uploadFilesInput'),
      uploadFileList: document.getElementById('uploadFileList'),
      uploadAlbumSelect: document.getElementById('uploadAlbumSelect'),
      uploadNewAlbumWrap: document.getElementById('uploadNewAlbumWrap'),
      uploadNewAlbumName: document.getElementById('uploadNewAlbumName'),
      uploadDateGroup: document.getElementById('uploadDateGroup'),
      uploadTags: document.getElementById('uploadTags'),
      uploadStatus: document.getElementById('uploadStatus'),
      btnSubmitUpload: document.getElementById('btnSubmitUpload'),

      albumModal: document.getElementById('albumModal'),
      albumModalTitle: document.getElementById('albumModalTitle'),
      albumForm: document.getElementById('albumForm'),
      albumFormId: document.getElementById('albumFormId'),
      albumFormName: document.getElementById('albumFormName'),
      albumFormDesc: document.getElementById('albumFormDesc'),

      movePhotosModal: document.getElementById('movePhotosModal'),
      movePhotosForm: document.getElementById('movePhotosForm'),
      moveTargetAlbum: document.getElementById('moveTargetAlbum'),
      moveNewAlbumWrap: document.getElementById('moveNewAlbumWrap'),
      moveNewAlbumName: document.getElementById('moveNewAlbumName'),
      moveTargetDateGroup: document.getElementById('moveTargetDateGroup'),

      batchBar: document.getElementById('batchBar'),
      batchCount: document.getElementById('batchCount'),
      btnBatchMove: document.getElementById('btnBatchMove'),
      btnBatchDelete: document.getElementById('btnBatchDelete'),
      btnBatchClear: document.getElementById('btnBatchClear'),
      btnSelectAllPhotos: document.getElementById('btnSelectAllPhotos'),

      adminPhotoEditor: document.getElementById('adminPhotoEditor'),
      photoEditForm: document.getElementById('photoEditForm'),
      editPhotoTitle: document.getElementById('editPhotoTitle'),
      editPhotoCaption: document.getElementById('editPhotoCaption'),
      editPhotoTags: document.getElementById('editPhotoTags'),
      editPhotoAlbum: document.getElementById('editPhotoAlbum'),
      editPhotoDateGroup: document.getElementById('editPhotoDateGroup'),
      editPhotoPublic: document.getElementById('editPhotoPublic'),
      btnDeleteSinglePhoto: document.getElementById('btnDeleteSinglePhoto')
    };

    this.init();
  }

  async init() {
    this.bindEvents();
    this.bindAdminEvents();
    await Promise.all([
      this.loadGalleryConfig(),
      this.loadGalleryData()
    ]);
    if (this.backendMode === 'php') {
      await this.checkAuthStatus();
    }
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

  // ギャラリーデータのロード（PHP API -> Node API -> 静的data.json の順で自動判別）
  async loadGalleryData() {
    this.backendMode = 'static';
    try {
      let res = null;
      let parsedData = null;

      // 1. さくらのレンタルサーバ（PHP環境）のチェック（古いdata.jsonが残っていてもPHPを優先）
      const phpRes = await fetch('api.php').catch(() => null);
      if (phpRes && phpRes.ok && (phpRes.headers.get('content-type') || '').includes('application/json')) {
        parsedData = await phpRes.json().catch(() => null);
        if (parsedData && Array.isArray(parsedData.albums)) {
          res = phpRes;
          this.backendMode = 'php';
        }
      }

      // 2. Node.js 開発サーバー (/api/data) のチェック
      if (!res) {
        const nodeRes = await fetch('/api/data').catch(() => null);
        if (nodeRes && nodeRes.ok && (nodeRes.headers.get('content-type') || '').includes('application/json')) {
          parsedData = await nodeRes.json().catch(() => null);
          if (parsedData && Array.isArray(parsedData.albums)) {
            res = nodeRes;
            this.backendMode = 'node';
          }
        }
      }

      // 3. 静的ビルド (data.json) のチェック
      if (!res) {
        const staticRes = await fetch('data.json').catch(() => null);
        if (staticRes && staticRes.ok) {
          parsedData = await staticRes.json().catch(() => null);
          if (parsedData) {
            res = staticRes;
            this.backendMode = 'static';
          }
        }
      }

      if (!res || !parsedData) {
        throw new Error('No valid photo data source found');
      }

      this.data = parsedData;
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
        ${this.isAdmin && album.albumId ? `
          <div class="album-admin-actions">
            <button type="button" class="album-admin-btn edit" data-album-edit="${album.albumId}">編集</button>
            <button type="button" class="album-admin-btn delete" data-album-delete="${album.albumId}">削除</button>
          </div>
        ` : ''}
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

      if (this.isAdmin && album.albumId) {
        card.querySelector('[data-album-edit]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openAlbumModal(album);
        });
        card.querySelector('[data-album-delete]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteAlbum(album);
        });
      }

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
        ${this.isAdmin && album.albumId ? `
          <div class="album-admin-actions">
            <button type="button" class="album-admin-btn edit" data-date-rename="${this.escapeHtml(dateGroup.date)}">名前変更</button>
            <button type="button" class="album-admin-btn delete" data-date-delete="${this.escapeHtml(dateGroup.date)}">削除</button>
          </div>
        ` : ''}
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

      if (this.isAdmin && album.albumId) {
        card.querySelector('[data-date-rename]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newName = prompt('新しい撮影日グループ名を入力してください:', dateGroup.date);
          if (!newName || newName.trim() === '' || newName.trim() === dateGroup.date) return;
          try {
            await this.adminFetch('api.php?action=date_group_rename', {
              albumId: album.albumId,
              oldDateGroup: dateGroup.date,
              newDateGroup: newName.trim()
            });
            await this.reloadGalleryAndRender();
          } catch (err) {
            alert('変更エラー: ' + err.message);
          }
        });
        card.querySelector('[data-date-delete]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`「${dateGroup.date}」（${dateGroup.photoCount}枚）をサーバーから完全に削除しますか？`)) return;
          try {
            await this.adminFetch('api.php?action=date_group_delete', {
              albumId: album.albumId,
              dateGroup: dateGroup.date
            });
            await this.reloadGalleryAndRender();
          } catch (err) {
            alert('削除エラー: ' + err.message);
          }
        });
      }

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

    if (this.dom.btnSelectAllPhotos) {
      this.dom.btnSelectAllPhotos.style.display = this.isAdmin ? 'inline-flex' : 'none';
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

      const isSelected = photo.id && this.selectedPhotoIds.has(photo.id);
      if (isSelected) tile.classList.add('selected');

      tile.innerHTML = `
        ${this.isAdmin && photo.id ? `<input type="checkbox" class="photo-select-cb" data-photo-id="${photo.id}" ${isSelected ? 'checked' : ''} title="選択">` : ''}
        ${this.isAdmin && photo.isPublic === false ? `<span class="photo-hidden-badge">非公開</span>` : ''}
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

      if (this.isAdmin && photo.id) {
        const cb = tile.querySelector('.photo-select-cb');
        cb?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (cb.checked) {
            this.selectedPhotoIds.add(photo.id);
            tile.classList.add('selected');
          } else {
            this.selectedPhotoIds.delete(photo.id);
            tile.classList.remove('selected');
          }
          this.updateBatchBar();
        });
      }

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

    // 編集モード：写真メタデータ編集フォームへ流し込み
    if (this.dom.adminPhotoEditor) {
      if (this.isAdmin && photo.id) {
        this.dom.adminPhotoEditor.style.display = 'block';
        this.dom.editPhotoTitle.value = photo.title || '';
        this.dom.editPhotoCaption.value = photo.caption || '';
        this.dom.editPhotoTags.value = photo.tags || '';
        this.dom.editPhotoDateGroup.value = photo.date || '';
        this.dom.editPhotoPublic.checked = photo.isPublic !== false;
        this.populateAlbumSelect(this.dom.editPhotoAlbum, photo.albumId, false);
      } else {
        this.dom.adminPhotoEditor.style.display = 'none';
      }
    }
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

  // =========================================================================
  // 編集モード & 管理者機能（PHP + MySQL バックエンド用）
  // =========================================================================
  bindAdminEvents() {
    // 編集モードボタン（クリック時にライブでPHPバックエンドを確認）
    this.dom.btnEditMode?.addEventListener('click', async () => {
      if (this.backendMode !== 'php') {
        try {
          const chk = await fetch('api.php?action=auth_status');
          if (chk.ok && (chk.headers.get('content-type') || '').includes('application/json')) {
            const st = await chk.json();
            if (typeof st.dbConnected === 'boolean') {
              this.backendMode = 'php';
              if (st.authenticated) {
                this.setAdminState(true, st.username || null);
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (this.backendMode !== 'php') {
        alert('編集モードは PHP + MySQL 環境（さくらインターネット等）でのみ利用できます。');
        return;
      }
      if (this.isAdmin) {
        const visible = this.dom.adminToolbar.style.display !== 'none';
        this.dom.adminToolbar.style.display = visible ? 'none' : 'block';
      } else {
        this.openModal('loginModal');
        setTimeout(() => this.dom.loginUsername?.focus(), 50);
      }
    });

    // モーダル閉じる汎用ハンドラ
    document.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => {
        this.closeModal(el.getAttribute('data-close-modal'));
      });
    });

    // ログインフォーム
    this.dom.loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.dom.loginError.style.display = 'none';
      const username = this.dom.loginUsername.value.trim();
      const password = this.dom.loginPassword.value;

      try {
        const res = await fetch('api.php?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'ログインに失敗しました');
        }
        this.dom.loginPassword.value = '';
        this.closeModal('loginModal');
        this.setAdminState(true, data.username);
        await this.reloadGalleryAndRender();
      } catch (err) {
        this.dom.loginError.textContent = err.message;
        this.dom.loginError.style.display = 'block';
      }
    });

    // ログアウト
    this.dom.btnLogout?.addEventListener('click', async () => {
      await fetch('api.php?action=logout', { method: 'POST' });
      this.setAdminState(false, null);
      this.selectedPhotoIds.clear();
      this.updateBatchBar();
      await this.reloadGalleryAndRender();
    });

    // フォルダ同期
    this.dom.btnSyncFolders?.addEventListener('click', async () => {
      if (!confirm('サーバー上の images/ フォルダをスキャンし、未登録の写真をデータベースに取り込みますか？')) return;
      try {
        const res = await this.adminFetch('api.php?action=sync', {});
        alert(`同期完了：アルバム +${res.result.addedAlbums} 件 / 写真 +${res.result.addedPhotos} 枚`);
        await this.reloadGalleryAndRender();
      } catch (err) {
        alert('同期エラー: ' + err.message);
      }
    });

    // 新規アルバムボタン
    this.dom.btnNewAlbum?.addEventListener('click', () => this.openAlbumModal(null));

    // アルバム作成・編集フォーム
    this.dom.albumForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const albumId = this.dom.albumFormId.value;
      const name = this.dom.albumFormName.value.trim();
      const description = this.dom.albumFormDesc.value.trim();
      if (!name) return;

      try {
        if (albumId) {
          await this.adminFetch('api.php?action=album_update', { albumId: Number(albumId), name, description });
        } else {
          await this.adminFetch('api.php?action=album_create', { name, description });
        }
        this.closeModal('albumModal');
        await this.reloadGalleryAndRender();
      } catch (err) {
        alert('アルバム保存エラー: ' + err.message);
      }
    });

    // アップロードモーダルを開く
    this.dom.btnOpenUpload?.addEventListener('click', () => {
      this.uploadQueueFiles = [];
      this.renderUploadFileList();
      this.dom.uploadStatus.style.display = 'none';
      const defaultAlbumId = this.currentAlbum?.albumId || null;
      this.populateAlbumSelect(this.dom.uploadAlbumSelect, defaultAlbumId, true);
      this.dom.uploadNewAlbumWrap.style.display = this.dom.uploadAlbumSelect.value === '__new__' ? 'flex' : 'none';
      this.dom.uploadDateGroup.value = this.currentDate?.date || new Date().toISOString().slice(0, 10);
      this.openModal('uploadModal');
    });

    this.dom.uploadAlbumSelect?.addEventListener('change', () => {
      this.dom.uploadNewAlbumWrap.style.display = this.dom.uploadAlbumSelect.value === '__new__' ? 'flex' : 'none';
    });

    // ドロップゾーン
    this.dom.uploadDropzone?.addEventListener('click', () => this.dom.uploadFilesInput?.click());
    this.dom.uploadFilesInput?.addEventListener('change', (e) => {
      this.addUploadFiles(e.target.files);
      e.target.value = '';
    });
    this.dom.uploadDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dom.uploadDropzone.classList.add('dragover');
    });
    this.dom.uploadDropzone?.addEventListener('dragleave', () => {
      this.dom.uploadDropzone.classList.remove('dragover');
    });
    this.dom.uploadDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dom.uploadDropzone.classList.remove('dragover');
      this.addUploadFiles(e.dataTransfer.files);
    });

    // アップロード実行
    this.dom.uploadForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.uploadQueueFiles.length === 0) {
        alert('アップロードする写真を選択してください。');
        return;
      }

      const albumVal = this.dom.uploadAlbumSelect.value;
      const newAlbumName = this.dom.uploadNewAlbumName.value.trim();
      if (albumVal === '__new__' && !newAlbumName) {
        alert('新規アルバム名を入力してください。');
        return;
      }

      const formData = new FormData();
      this.uploadQueueFiles.forEach(file => formData.append('files[]', file));
      if (albumVal !== '__new__') {
        formData.append('albumId', albumVal);
      } else {
        formData.append('newAlbumName', newAlbumName);
      }
      formData.append('dateGroup', this.dom.uploadDateGroup.value.trim() || new Date().toISOString().slice(0, 10));
      formData.append('tags', this.dom.uploadTags.value.trim());

      this.dom.btnSubmitUpload.disabled = true;
      this.dom.uploadStatus.style.display = 'block';
      this.dom.uploadStatus.textContent = `${this.uploadQueueFiles.length} 枚をアップロード中...`;

      try {
        const res = await fetch('api.php?action=upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました');

        const errMsg = data.errors && data.errors.length ? `（エラー: ${data.errors.join(', ')}）` : '';
        this.dom.uploadStatus.textContent = `${data.uploaded.length} 枚のアップロードが完了しました ${errMsg}`;
        this.uploadQueueFiles = [];
        this.renderUploadFileList();
        await this.reloadGalleryAndRender();
      } catch (err) {
        this.dom.uploadStatus.textContent = 'エラー: ' + err.message;
      } finally {
        this.dom.btnSubmitUpload.disabled = false;
      }
    });

    // 一括操作バー
    this.dom.btnBatchClear?.addEventListener('click', () => {
      this.selectedPhotoIds.clear();
      this.updateBatchBar();
      if (this.currentAlbum && this.currentDate) {
        this.showPhotosView(this.currentAlbum.id, this.currentDate.date);
      }
    });

    this.dom.btnSelectAllPhotos?.addEventListener('click', () => {
      if (!this.isAdmin || !this.currentPhotoList.length) return;
      this.currentPhotoList.forEach(p => {
        if (p.id) this.selectedPhotoIds.add(p.id);
      });
      this.updateBatchBar();
      this.showPhotosView(this.currentAlbum.id, this.currentDate.date);
    });

    this.dom.btnBatchMove?.addEventListener('click', () => {
      if (this.selectedPhotoIds.size === 0) return;
      this.populateAlbumSelect(this.dom.moveTargetAlbum, this.currentAlbum?.albumId || null, true);
      this.dom.moveNewAlbumWrap.style.display = this.dom.moveTargetAlbum.value === '__new__' ? 'flex' : 'none';
      this.dom.moveTargetDateGroup.value = this.currentDate?.date || new Date().toISOString().slice(0, 10);
      this.openModal('movePhotosModal');
    });

    this.dom.moveTargetAlbum?.addEventListener('change', () => {
      this.dom.moveNewAlbumWrap.style.display = this.dom.moveTargetAlbum.value === '__new__' ? 'flex' : 'none';
    });

    this.dom.movePhotosForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const albumVal = this.dom.moveTargetAlbum.value;
      const newAlbumName = this.dom.moveNewAlbumName.value.trim();
      const dateGroup = this.dom.moveTargetDateGroup.value.trim();
      if (!dateGroup) return;

      try {
        await this.adminFetch('api.php?action=photo_move', {
          photoIds: Array.from(this.selectedPhotoIds),
          targetAlbumId: albumVal !== '__new__' ? Number(albumVal) : null,
          targetAlbumName: albumVal === '__new__' ? newAlbumName : null,
          targetDateGroup: dateGroup
        });
        this.closeModal('movePhotosModal');
        this.selectedPhotoIds.clear();
        this.updateBatchBar();
        await this.reloadGalleryAndRender();
      } catch (err) {
        alert('移動エラー: ' + err.message);
      }
    });

    this.dom.btnBatchDelete?.addEventListener('click', async () => {
      const count = this.selectedPhotoIds.size;
      if (count === 0) return;
      if (!confirm(`選択した ${count} 枚の写真をサーバーから完全に削除しますか？`)) return;

      try {
        await this.adminFetch('api.php?action=photo_delete', {
          photoIds: Array.from(this.selectedPhotoIds)
        });
        this.selectedPhotoIds.clear();
        this.updateBatchBar();
        await this.reloadGalleryAndRender();
      } catch (err) {
        alert('削除エラー: ' + err.message);
      }
    });

    // Lightbox 内の単体写真編集・削除
    this.dom.photoEditForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const photo = this.currentPhotoList[this.currentPhotoIndex];
      if (!photo || !photo.id) return;

      try {
        await this.adminFetch('api.php?action=photo_update', {
          photoId: photo.id,
          title: this.dom.editPhotoTitle.value.trim(),
          caption: this.dom.editPhotoCaption.value.trim(),
          tags: this.dom.editPhotoTags.value.trim(),
          album_id: Number(this.dom.editPhotoAlbum.value),
          date_group: this.dom.editPhotoDateGroup.value.trim(),
          is_public: this.dom.editPhotoPublic.checked
        });
        await this.reloadGalleryAndRender();
        alert('写真情報を保存しました。');
      } catch (err) {
        alert('保存エラー: ' + err.message);
      }
    });

    this.dom.btnDeleteSinglePhoto?.addEventListener('click', async () => {
      const photo = this.currentPhotoList[this.currentPhotoIndex];
      if (!photo || !photo.id) return;
      if (!confirm(`「${photo.fileName}」をサーバーから完全に削除しますか？`)) return;

      try {
        await this.adminFetch('api.php?action=photo_delete', { photoIds: [photo.id] });
        this.closeLightbox();
        await this.reloadGalleryAndRender();
      } catch (err) {
        alert('削除エラー: ' + err.message);
      }
    });
  }

  async checkAuthStatus() {
    try {
      const res = await fetch('api.php?action=auth_status');
      if (res.ok) {
        const data = await res.json();
        this.setAdminState(Boolean(data.authenticated), data.username || null);
      }
    } catch {
      // ignore
    }
  }

  setAdminState(isAdmin, username) {
    this.isAdmin = isAdmin;
    this.adminUser = username;
    if (this.dom.btnEditMode) {
      this.dom.btnEditMode.classList.toggle('active', isAdmin);
      if (this.dom.btnEditModeLabel) {
        this.dom.btnEditModeLabel.textContent = isAdmin ? '編集中' : '編集モード';
      }
    }
    if (this.dom.adminToolbar) {
      this.dom.adminToolbar.style.display = isAdmin ? 'block' : 'none';
    }
    if (this.dom.adminUserLabel && username) {
      this.dom.adminUserLabel.textContent = `ログイン中: ${username}`;
    }
  }

  async adminFetch(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'リクエストに失敗しました');
    }
    return data;
  }

  async reloadGalleryAndRender() {
    await this.loadGalleryData();
    this.handleRouting();
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  openAlbumModal(album) {
    this.dom.albumFormId.value = album ? String(album.albumId) : '';
    this.dom.albumFormName.value = album ? album.name : '';
    this.dom.albumFormDesc.value = album ? (album.description || '') : '';
    this.dom.albumModalTitle.textContent = album ? 'アルバムを編集' : '新規アルバム作成';
    this.openModal('albumModal');
  }

  async deleteAlbum(album) {
    if (!confirm(`アルバム「${album.name}」（写真 ${album.totalPhotos} 枚）を完全に削除しますか？`)) return;
    try {
      await this.adminFetch('api.php?action=album_delete', { albumId: album.albumId });
      await this.reloadGalleryAndRender();
    } catch (err) {
      alert('アルバム削除エラー: ' + err.message);
    }
  }

  populateAlbumSelect(selectEl, selectedAlbumId = null, allowNew = true) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const albums = this.data?.albums || [];
    albums.forEach(a => {
      if (!a.albumId) return;
      const opt = document.createElement('option');
      opt.value = String(a.albumId);
      opt.textContent = `${a.name} (${a.totalPhotos}枚)`;
      if (selectedAlbumId && Number(selectedAlbumId) === Number(a.albumId)) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });
    if (allowNew) {
      const optNew = document.createElement('option');
      optNew.value = '__new__';
      optNew.textContent = '+ 新しいアルバムを作成...';
      if (albums.length === 0) optNew.selected = true;
      selectEl.appendChild(optNew);
    }
  }

  addUploadFiles(fileList) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    Array.from(fileList).forEach(f => {
      if (allowed.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name)) {
        this.uploadQueueFiles.push(f);
      }
    });
    this.renderUploadFileList();
  }

  renderUploadFileList() {
    if (!this.dom.uploadFileList) return;
    if (this.uploadQueueFiles.length === 0) {
      this.dom.uploadFileList.innerHTML = '';
      return;
    }
    this.dom.uploadFileList.innerHTML = this.uploadQueueFiles
      .map((f, idx) => `<div>${idx + 1}. ${this.escapeHtml(f.name)} (${Math.round(f.size / 1024)} KB)</div>`)
      .join('');
  }

  updateBatchBar() {
    if (!this.dom.batchBar) return;
    const count = this.selectedPhotoIds.size;
    this.dom.batchBar.style.display = (this.isAdmin && count > 0) ? 'flex' : 'none';
    if (this.dom.batchCount) {
      this.dom.batchCount.textContent = `${count} 枚選択中`;
    }
  }
}

// 起動
document.addEventListener('DOMContentLoaded', () => {
  window.galleryApp = new PhotoGalleryApp();
});
