/**
 * build-icon.js — Multi-resolution .ico generator for Black Firefox
 * Produces: 16, 32, 48, 128, 256 px layers in a single icon.ico
 *
 * Run:  node build-icon.js
 */

const sharp    = require('sharp');
const _ico     = require('png-to-ico');
const pngToIco = _ico.default || _ico.imagesToIco || _ico;
const fs       = require('fs');
const path     = require('path');

const SOURCE = path.join('C:\\Users\\shiva\\Downloads', 'Gemini_Generated_Image_11t2n711t2n711t2.png');
const OUT    = path.join(__dirname, 'icon.ico');

const TEMP = {
  256: path.join(__dirname, '_icon_256.png'),
  128: path.join(__dirname, '_icon_128.png'),
  48:  path.join(__dirname, '_icon_48.png'),
  32:  path.join(__dirname, '_icon_32.png'),
  16:  path.join(__dirname, '_icon_16.png'),
};

async function buildIcon() {
  console.log('[Black Icon] Source →', SOURCE);

  if (!fs.existsSync(SOURCE)) {
    console.error('[Black Icon] ERROR: source image not found at', SOURCE);
    process.exit(1);
  }

  // ── Standard high-res sizes: clean resize only ─────────────────────────
  await sharp(SOURCE).resize(256, 256, { fit: 'cover' })
    .png().toFile(TEMP[256]);
  console.log('[Black Icon] ✓  256px');

  await sharp(SOURCE).resize(128, 128, { fit: 'cover' })
    .png().toFile(TEMP[128]);
  console.log('[Black Icon] ✓  128px');

  await sharp(SOURCE).resize(48, 48, { fit: 'cover' })
    .png().toFile(TEMP[48]);
  console.log('[Black Icon] ✓   48px');

  // ── Small sizes: boost contrast + saturation so the silhouette pops ─────
  await sharp(SOURCE)
    .resize(32, 32, { fit: 'cover' })
    .modulate({ brightness: 1.8, saturation: 1.6 })
    .linear(1.5, -(128 * 1.5) + 128)   // contrast lift
    .png().toFile(TEMP[32]);
  console.log('[Black Icon] ✓   32px (high-contrast)');

  await sharp(SOURCE)
    .resize(16, 16, { fit: 'cover' })
    .modulate({ brightness: 2.0, saturation: 1.8 })
    .linear(2.0, -(128 * 2.0) + 128)   // extreme contrast for tiny silhouette
    .png().toFile(TEMP[16]);
  console.log('[Black Icon] ✓   16px (extreme-contrast)');

  // ── Compile all PNGs into a single multi-resolution .ico ────────────────
  const buf = await pngToIco([
    TEMP[16],
    TEMP[32],
    TEMP[48],
    TEMP[128],
    TEMP[256],
  ]);

  fs.writeFileSync(OUT, buf);
  console.log('[Black Icon] ✅  icon.ico written →', OUT);

  // ── Cleanup temp files ───────────────────────────────────────────────────
  Object.values(TEMP).forEach(f => {
    try { fs.unlinkSync(f); } catch (_) {}
  });
  console.log('[Black Icon] 🧹  Temp PNGs cleaned up');
}

buildIcon().catch(err => {
  console.error('[Black Icon] FAILED:', err.message);
  process.exit(1);
});
