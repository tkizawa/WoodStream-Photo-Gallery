# WoodStream Photo Gallery

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

写真を美しく公開・閲覧・管理するための、洗練されたWebフォトギャラリーです。  
**500pxスタイルのタイルグリッドレイアウト**、詳細な**EXIF撮影データ（カメラ・レンズ・シャッタースピード・F値・ISOなど）**のインスペクター表示、そして**Webブラウザ管理UI**および**MCP（Model Context Protocol）**による写真のアップロード・管理に対応しています。

---

## ✨ 主な機能・特徴

1. **洗練されたタイルグリッド表示（Justified Gallery）**
   - 縦写真・横写真のアスペクト比を自動計算し、隙間なく美しく整列。
2. **詳細EXIFメタデータインスペクター**
   - 写真をクリックすると拡大表示＆右側に撮影パラメータを一目で見やすく表示。
   - 📷 カメラ機種名 / 🔭 レンズ名 / ⚙️ F値 / SS / ISO / 露出補正 / 焦点距離 / 測光方式など。
3. **Webブラウザからの直接管理（管理者モード）**
   - 画面上の「編集モード」からパスワード認証でログイン。
   - 写真のドラッグ＆ドロップアップロード、新規アルバム作成、日付グループ作成、写真の移動・削除に対応。
4. **AI連携（MCP サーバー機能搭載）**
   - さくらのレンタルサーバ上で Streamable HTTP MCP エンドポイント（`public/mcp.php`）が稼働。
   - AIアシスタント（Claude、Gemini 等）からアルバム作成、写真アップロード、検索、整理が可能。
5. **高速表示（自動WebP変換サムネイル）**
   - アップロードされた高解像度JPEGから自動で軽量WebPサムネイルを生成・キャッシュ。
6. **データベース（MySQL）＋ファイルストレージ**
   - アルバム情報、写真メタデータ、EXIF JSON を MySQL で安全・高速に管理。

---

## 📂 ディレクトリ構成

```text
photo/
  ├── public/                 # 公開 Web ルート（さくらサーバーの www 配下へ配置）
  │     ├── index.html        # ギャラリー SPA フロントエンド
  │     ├── api.php           # REST API エンドポイント
  │     ├── mcp.php           # MCP (Model Context Protocol) エンドポイント
  │     ├── config.php        # サーバー設定（DB接続、認証情報 ※.gitignore）
  │     ├── config.example.php# 設定テンプレート
  │     ├── gallery.config.json # サイト基本情報設定（タイトル、作者名、ロゴ等）
  │     ├── css/              # スタイルシート
  │     ├── js/               # フロントエンドスクリプト
  │     ├── lib/
  │     │     └── GalleryCore.php # バックエンド共通コアクラス
  │     ├── sql/
  │     │     └── schema.sql  # MySQL テーブル初期化スキーマ
  │     └── images/           # 写真アップロード先（サーバー管理）
  ├── generate-icons.js       # アイコン・ファビコン生成スクリプト
  ├── package.json            # 開発用設定
  └── README.md
```

---

## 🚀 さくらのレンタルサーバへの導入方法

### ステップ 1: MySQL データベースの準備
さくらのコントロールパネルで MySQL データベースを作成し、`public/sql/schema.sql` をインポート（または実行）してテーブルを作成します。

### ステップ 2: 設定ファイルの作成
`public/config.example.php` をコピーして `public/config.php` を作成し、DB接続情報・管理者パスワードハッシュ・MCPトークンを設定します。

```php
return [
    'db' => [
        'enabled' => true,
        'host' => 'mysqlXXX.db.sakura.ne.jp',
        'dbname' => 'your_db_name',
        'username' => 'your_db_user',
        'password' => 'your_db_password',
        'charset' => 'utf8mb4',
    ],
    'admin' => [
        'username' => 'admin',
        'password_hash' => '...',
    ],
    'mcp' => [
        'enabled' => true,
        'bearer_token' => 'YOUR_SECRET_TOKEN',
    ],
];
```

### ステップ 3: サーバーへアップロード
`public/` フォルダの中身を、さくらのレンタルサーバの公開ディレクトリ（`www/` やサブドメイン用フォルダ）へ FTP / SFTP 等でアップロードします。

---

## 🎨 アイコンの再生成

アプリアイコンやファビコンを更新したい場合は、Node.js 環境で以下を実行します：

```bash
npm run icons
```

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) の下で公開されています。
