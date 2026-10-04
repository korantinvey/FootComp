// "Choisis ton camp": draws every jersey from one definition and writes
//  - the default app icon (iOS, Android adaptive + monochrome, splash, favicon)
//  - one alternate icon per jersey (iOS 1024 PNG, Android adaptive foreground)
//  - a rounded preview per jersey for the in-app picker
//  - src/ui/jerseys.generated.ts and the expo-alternate-app-icons entry in app.json
// Usage: npm run icons
//
// Jerseys only borrow generic patterns (stripes, centre band, sleeves…):
// no crest, star, sponsor, motto or club / city name.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const font = opentype.parse(
  readFileSync(join(root, 'node_modules/@expo-google-fonts/outfit/900Black/Outfit_900Black.ttf')).buffer,
);

const SHIRT = 'M32 22 L42 22 Q50 30 58 22 L68 22 L86 33 L77 49 L70 45 L70 84 L30 84 L30 45 L23 49 L14 33 Z';
const SLEEVES = '<path d="M14 33 L32 22 L32 46 L23 49 Z"/><path d="M86 33 L68 22 L68 46 L77 49 Z"/>';
const collar = (color, width = 5) => `<path d="M42 22 Q50 30 58 22" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const stripes = (a, b, w, offset) => {
  let s = `<rect width="100" height="100" fill="${a}"/>`;
  for (let x = offset; x < 100; x += w * 2) s += `<rect x="${x}" y="0" width="${w}" height="100" fill="${b}"/>`;
  return s;
};
const band = (body, edge, inner) =>
  `<rect width="100" height="100" fill="${body}"/><rect x="38" width="24" height="100" fill="${edge}"/><rect x="41" width="18" height="100" fill="${inner}"/>`;

/** First entry is the default icon. ids become the native icon names (PascalCase). */
const KITS = [
  { id: 'IndigoOrange', name: 'Indigo, bande orange', bg: '#12A150', body: band('#4F46E5', '#fff', '#F26B00'), num: '#fff' },
  {
    id: 'WhiteSky',
    name: 'Blanc et ciel',
    bg: '#2FA4E0',
    body: `${band('#fff', '#2FA4E0', '#fff')}<rect x="45" width="10" height="100" fill="#2FA4E0"/>`,
    num: '#1B2A4A',
  },
  { id: 'RedBlackStripes', name: 'Rayé rouge et noir', bg: '#111827', body: stripes('#D7192A', '#111111', 6, 17), num: '#fff' },
  { id: 'BlackWhiteStripes', name: 'Rayé noir et blanc', bg: '#E5E7EB', body: stripes('#fff', '#111111', 6, 17), num: '#D4A017' },
  { id: 'BlueBlackStripes', name: 'Rayé bleu et noir', bg: '#111827', body: stripes('#1E5BC6', '#111111', 6, 17), num: '#fff' },
  { id: 'GarnetBlueStripes', name: 'Rayé grenat et bleu', bg: '#F6F7F9', body: stripes('#A50044', '#1D3E8F', 8, 14), num: '#FFD23F' },
  { id: 'AllRed', name: 'Rouge intégral', bg: '#F6F7F9', body: `<rect width="100" height="100" fill="#C8102E"/>${collar('#8E0C21')}`, num: '#fff' },
  { id: 'RedWhiteCollar', name: 'Rouge, col blanc', bg: '#111827', body: `<rect width="100" height="100" fill="#DA291C"/>${collar('#fff', 6)}`, num: '#fff' },
  { id: 'SkyNavy', name: 'Bleu ciel, col marine', bg: '#F6F7F9', body: `<rect width="100" height="100" fill="#6CABDD"/>${collar('#1C2C5B', 6)}`, num: '#1C2C5B' },
  { id: 'AllWhiteGold', name: 'Tout blanc, filet or', bg: '#1B2A4A', body: `<rect width="100" height="100" fill="#fff"/>${collar('#C9A227')}`, num: '#C9A227' },
  { id: 'RedWhiteSleeves', name: 'Rouge, manches blanches', bg: '#F6F7F9', body: `<rect width="100" height="100" fill="#D7192A"/><g fill="#fff">${SLEEVES}</g>`, num: '#fff' },
  { id: 'YellowBlack', name: 'Jaune et noir', bg: '#111827', body: `<rect width="100" height="100" fill="#FFD100"/>${collar('#111111', 6)}<g fill="#111111">${SLEEVES}</g>`, num: '#111111' },
  {
    id: 'GoldRed',
    name: 'Or et rouge',
    bg: '#B91C1C',
    body: `<rect width="100" height="100" fill="#FFC72C"/><g fill="#D7192A">${SLEEVES}</g><rect x="30" y="74" width="40" height="10" fill="#D7192A"/>`,
    num: '#D7192A',
  },
  { id: 'RedWhiteSplit', name: 'Coupé rouge et blanc', bg: '#F6F7F9', body: `<rect width="100" height="100" fill="#fff"/><polygon points="0,0 100,0 100,40 0,70" fill="#E30613"/>`, num: '#111111', numY: 74 },
  { id: 'ForestGreen', name: 'Vert forêt', bg: '#F6F7F9', body: `<rect width="100" height="100" fill="#0B7A3B"/>${collar('#fff')}`, num: '#fff' },
  {
    id: 'WhiteChevron',
    name: 'Blanc, chevron bicolore',
    bg: '#1B2A4A',
    body: `<rect width="100" height="100" fill="#fff"/><polyline points="20,40 50,60 80,40" fill="none" stroke="#1D3E8F" stroke-width="6"/><polyline points="20,48 50,68 80,48" fill="none" stroke="#D7192A" stroke-width="6"/>`,
    num: null,
  },
];

/** Draws "10" glyph by glyph (opentype.js can't run this font's substitution tables). */
function numberPath(color, y) {
  const size = 20;
  const scale = size / font.unitsPerEm;
  const glyphs = [...'10'].map((c) => font.charToGlyph(c));
  const width = glyphs.reduce((w, g) => w + g.advanceWidth * scale, 0);
  let x = 50 - width / 2;
  const d = glyphs
    .map((g) => {
      const path = g.getPath(x, y, size).toPathData(2);
      x += g.advanceWidth * scale;
      return path;
    })
    .join(' ');
  return `<path d="${d}" fill="${color}"/>`;
}

/** The jersey, centred on (50, 50) in a 100×100 box, scaled by `scale`. */
function shirt(kit, scale, clipId, { mono = false } = {}) {
  const inner = mono
    ? `<path d="${SHIRT}" fill="#fff"/>`
    : `<clipPath id="${clipId}"><path d="${SHIRT}"/></clipPath><g clip-path="url(#${clipId})">${kit.body}</g>` +
      `<path d="${SHIRT}" fill="none" stroke="#0F172A" stroke-opacity="0.15" stroke-width="1.2"/>` +
      (kit.num ? numberPath(kit.num, kit.numY ?? 66) : '');
  return `<g transform="translate(50 50) scale(${scale}) translate(-50 -53)">${inner}</g>`;
}

const svg = (content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`);
const png = (content, size) => sharp(svg(content), { density: 1200 }).resize(size, size).png();

const assets = join(root, 'assets/icons');
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });

const plugin = [];
for (const kit of KITS) {
  const dir = join(assets, kit.id);
  mkdirSync(dir, { recursive: true });
  // iOS: full-bleed square, no transparency (the system rounds the corners).
  await png(`<rect width="100" height="100" fill="${kit.bg}"/>${shirt(kit, 1.08, 'i')}`, 1024)
    .flatten({ background: kit.bg })
    .toFile(join(dir, 'ios.png'));
  // Android adaptive foreground: keep the jersey inside the 66 % safe zone.
  await png(shirt(kit, 0.66, 'a'), 1024).toFile(join(dir, 'android-foreground.png'));
  // Picker preview, rounded like an app icon.
  const light = ['#F6F7F9', '#E5E7EB'].includes(kit.bg);
  await png(
    `<rect x="1" y="1" width="98" height="98" rx="22" fill="${kit.bg}" ${light ? 'stroke="#E5E7EB" stroke-width="2"' : ''}/>${shirt(kit, 1, 'p')}`,
    256,
  ).toFile(join(dir, 'preview.png'));

  if (kit !== KITS[0]) {
    plugin.push({
      name: kit.id,
      ios: `./assets/icons/${kit.id}/ios.png`,
      android: { foregroundImage: `./assets/icons/${kit.id}/android-foreground.png`, backgroundColor: kit.bg },
    });
  }
}

// Default icon, splash and favicon come from the first jersey.
const main = KITS[0];
const images = join(root, 'assets/images');
await sharp(join(assets, main.id, 'ios.png')).toFile(join(images, 'icon.png'));
await sharp(join(assets, main.id, 'android-foreground.png')).toFile(join(images, 'android-icon-foreground.png'));
await png(`<rect width="100" height="100" fill="${main.bg}"/>`, 1024).toFile(join(images, 'android-icon-background.png'));
await png(shirt(main, 0.66, 'm', { mono: true }), 1024).toFile(join(images, 'android-icon-monochrome.png'));
await png(shirt(main, 1, 's'), 1024).toFile(join(images, 'splash-icon.png'));
await png(`<rect width="100" height="100" rx="22" fill="${main.bg}"/>${shirt(main, 1.08, 'f')}`, 48).toFile(join(images, 'favicon.png'));

writeFileSync(
  join(root, 'src/ui/jerseys.generated.ts'),
  `// Generated by scripts/build-icons.mjs. Do not edit by hand.
import type { ImageSourcePropType } from 'react-native';

export type Jersey = { id: string; name: string; preview: ImageSourcePropType };

/** The first jersey is the default app icon. */
export const JERSEYS: Jersey[] = [
${KITS.map((k) => `  { id: '${k.id}', name: '${k.name.replace(/'/g, "\\'")}', preview: require('../../assets/icons/${k.id}/preview.png') },`).join('\n')}
];
`,
);

const appJsonPath = join(root, 'app.json');
const app = JSON.parse(readFileSync(appJsonPath, 'utf8'));
app.expo.icon = './assets/images/icon.png';
app.expo.ios.icon = './assets/images/icon.png';
app.expo.android.adaptiveIcon.backgroundColor = main.bg;
app.expo.plugins = app.expo.plugins.filter((p) => !(p === 'expo-alternate-app-icons' || (Array.isArray(p) && p[0] === 'expo-alternate-app-icons')));
app.expo.plugins.push(['expo-alternate-app-icons', plugin]);
writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n');

console.log(`${KITS.length} maillots générés (${plugin.length} icônes alternatives).`);
