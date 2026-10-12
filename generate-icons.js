const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 512x512のマスターSVG（ダークプレミアムな背景 + シアン〜ブルーグラデーションの絞り羽根アイコン）
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- 背景グラデーション -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#090a0f" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <!-- 絞り羽根のシアン〜ブルー〜パープル グラデーション -->
    <linearGradient id="apertureGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>

    <!-- 発光グロー効果 -->
    <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- アイコン背景（ダーク角丸スクエア） -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <rect width="504" height="504" x="4" y="4" rx="108" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="4" />

  <!-- 絞り羽根（Aperture）シンボル -->
  <g transform="translate(256, 256) scale(15.5) translate(-12, -12)"
     fill="none"
     stroke="url(#apertureGrad)"
     stroke-width="1.8"
     stroke-linecap="round"
     stroke-linejoin="round"
     filter="url(#subtleGlow)">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M14.31 8l5.74 9.94"></path>
    <path d="M9.69 8h11.48"></path>
    <path d="M7.38 12l5.74-9.94"></path>
    <path d="M9.69 16L3.95 6.06"></path>
    <path d="M14.31 16H2.83"></path>
    <path d="M16.62 12l-5.74 9.94"></path>
  </g>
</svg>`;

async function generateIcons() {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. favicon.svg の出力
  const svgPath = path.join(publicDir, 'favicon.svg');
  fs.writeFileSync(svgPath, svgIcon, 'utf8');
  console.log('Created:', svgPath);

  const svgBuffer = Buffer.from(svgIcon);

  // 2. PNG各種解像度の出力
  const targets = [
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];

  for (const t of targets) {
    const dest = path.join(publicDir, t.name);
    await sharp(svgBuffer)
      .resize(t.size, t.size)
      .png()
      .toFile(dest);
    console.log(`Created: ${t.name} (${t.size}x${t.size})`);
  }

  // 3. favicon.ico の作成（32x32 PNGベース）
  // 現代のブラウザはPNG形式のICOまたは直接PNGをICO名で保存したものをサポート
  // ここでは32x32 PNGからICOを生成（sharpで32x32 PNGを出力し、標準的なICOヘッダーを付与）
  const png32Buffer = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  
  // ICOバイナリ形式の生成 (ICONDIR + 1つのICONDIRENTRY + PNGデータ)
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(1, 4); // 1 image

  const icoEntry = Buffer.alloc(16);
  icoEntry.writeUInt8(32, 0);  // Width 32
  icoEntry.writeUInt8(32, 1);  // Height 32
  icoEntry.writeUInt8(0, 2);   // Color palette
  icoEntry.writeUInt8(0, 3);   // Reserved
  icoEntry.writeUInt16LE(1, 4); // Color planes
  icoEntry.writeUInt16LE(32, 6); // Bits per pixel
  icoEntry.writeUInt32LE(png32Buffer.length, 8); // Size of image data
  icoEntry.writeUInt32LE(22, 12); // Offset of image data (6 + 16 = 22)

  const icoBuffer = Buffer.concat([icoHeader, icoEntry, png32Buffer]);
  const icoPath = path.join(publicDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Created: favicon.ico');

  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
