# WoodStream Photo Gallery

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy to GitHub Pages](https://github.com/tkizawa/WoodStream-Photo-Gallery/actions/workflows/deploy.yml/badge.svg)](https://github.com/tkizawa/WoodStream-Photo-Gallery/actions/workflows/deploy.yml)

写真を美しく公開・閲覧するための、洗練されたWebフォトギャラリーです。  
**500pxスタイルのタイルグリッドレイアウト**、スムーズなアニメーション、そして写真の**EXIF撮影データ（カメラ・レンズ・シャッタースピード・F値・ISOなど）**を一覧表示する詳細ビューを搭載しています。

---

## ✨ 主な機能・特徴

1. **フォルダ構造と完全連動**
   - `images/` 配下にフォルダを置くだけで「アルバム」「撮影日」を自動認識。
2. **500px風タイルグリッド表示（Justified Gallery）**
   - 縦写真・横写真のアスペクト比を自動計算し、隙間なく美しく整列。
3. **詳細EXIFメタデータインスペクター**
   - 写真をクリックすると拡大表示＆右側に撮影パラメータを一目で見やすく表示。
   - 📷 カメラ機種名 / 🔭 レンズ名 / ⚙️ F値 / SS / ISO / 露出補正 / 焦点距離 / 測光方式など。
4. **かんたんカスタマイズ**
   - `gallery.config.json` を編集するだけで、サイト名や撮影者名、ロゴを自由に変更可能。
5. **高速表示（自動WebP変換）**
   - 10MB以上の重いRAW現像後JPEGでも、自動で軽量なWebPサムネイルを生成して瞬時に表示。
6. **GitHub Pages 完全自動デプロイ対応**
   - リポジトリに写真をプッシュするだけで、GitHub Actions が自動で静的サイトをビルド・世界中に無料公開。

---

## 🚀 クイックスタート：自分専用のギャラリーを作る

写真仲間の皆さんどなたでも、以下のステップで自分だけのフォトギャラリーを立ち上げられます。

### ステップ 1: リポジトリの作成
1. このページ上部にある緑色の **[Use this template]**（このテンプレートを使用）ボタンをクリックします。
2. **[Create a new repository]** を選択し、ご自身のアカウントに新しいリポジトリを作成します（リポジトリ名は `my-photo-gallery` など自由でOKです）。

### ステップ 2: パソコンにクローン＆写真を配置
リポジトリをご自身のパソコンにダウンロード（Clone）し、`images/` フォルダ内に写真を配置します：

```text
images/
  └── [アルバム名]/
        └── [撮影日 (YYYY-MM-DD)]/
              ├── IMG_0001.JPG
              └── IMG_0002.JPG
```

> **例:** `images/風景/2026-05-02/DSC_0001.JPG`  
> 詳細は [`images/README.md`](images/README.md) をご覧ください。

### ステップ 3: サイト設定の編集
[`public/gallery.config.json`](public/gallery.config.json) を開き、サイト名やお名前を設定します：

```json
{
  "siteTitle": "山田太郎's Photo Gallery",
  "siteDescription": "四季の風景と野鳥写真のポートフォリオ",
  "author": "Taro Yamada",
  "logo": {
    "primary": "Taro",
    "accent": "Photo",
    "sub": "Gallery"
  },
  "hero": {
    "title": "Through My Lens",
    "subtitle": "ファインダー越しに出会った光と色彩の記録。"
  },
  "footer": {
    "copyright": "© 2026 Taro Yamada. All rights reserved."
  }
}
```

### ステップ 4: ローカルで確認する
Node.js（v18以上）がインストールされたパソコンでコマンドを実行します：

```bash
# 依存パッケージのインストール（初回のみ）
npm install

# サーバー起動
npm start
```
ブラウザで `http://localhost:3000` を開くと、あなたの写真が並んだギャラリーが表示されます！

---

## 🌐 無料でインターネットに公開する（GitHub Pages）

サーバー契約なしで、世界中にギャラリーを公開できます。

1. ご自身のリポジトリの **Settings（設定）** タブを開きます。
2. 左メニューの **Pages** をクリックします。
3. **Build and deployment** の **Source** で **「GitHub Actions」** を選択します。
4. あとは `images/` に写真を追加して GitHub に `git push` するだけ！  
   自動的にサイトがビルドされ、数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` にギャラリーが公開されます。

---

## 🛠 その他の公開方法

### さくらのレンタルサーバ / 一般レンタルサーバー
```bash
npm run build
```
を実行すると `dist/` フォルダに静的サイト一式（HTML, CSS, JS, サムネイル画像, JSON）が書き出されます。  
`dist/` の中身を FTP などでサーバーの公開フォルダ（`www/` など）にアップロードするだけで動作します。

---

## 🎨 アイコンのカスタマイズ
新しいアプリアイコンやファビコンを生成したい場合は、以下のコマンドを実行します：

```bash
npm run icons
```
`favicon.svg`, `favicon.ico`, `apple-touch-icon.png` などのマルチサイズアイコンが一括生成されます。

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) の下で公開されています。商用・非商用問わず、どなたでも自由にご利用・改変いただけます。
