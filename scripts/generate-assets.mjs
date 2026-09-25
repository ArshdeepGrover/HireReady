/**
 * Renders the raster brand assets from SVG: the Open Graph card, the PWA icons
 * and the Apple touch icon.
 *
 * Run it when the branding changes:
 *   npm run assets
 *
 * The output is committed, so deploys need neither sharp nor any font installed.
 * A temporary fontconfig file points at the vendored webfonts, which lets the
 * renderer use the real brand typefaces; if that fails it falls back to a
 * system grotesque, which still looks correct.
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';

const publicDir = fileURLToPath(new NodeURL('../public/', import.meta.url));
const fontsDir = join(publicDir, 'fonts');

const INK = '#15181F';
const PAPER = '#F4F2EC';
const PAPER_ALT = '#EBE8E0';
const SURFACE = '#FDFCF9';
const ACCENT = '#2A3F9D';
const MARK = '#F2CD2C';
const MUTED = '#4A5061';
const FAINT = '#5F6574';
const LINE = '#DCD8CE';
const LINE_STRONG = '#BDB8AB';
const BAD = '#B3261E';
const WARN = '#7A5D00';

const DISPLAY = "Newsreader, Iowan Old Style, Charter, Georgia, DejaVu Serif, serif";
const BODY = "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif";
const MONO = "IBM Plex Mono, Menlo, DejaVu Sans Mono, monospace";

/**
 * Points the renderer at the vendored fonts. Without this the brand typeface is
 * simply unavailable and the fallback in each font-family list is used.
 */
async function configureFonts() {
  if (!existsSync(fontsDir)) return;
  try {
    const dir = await mkdtemp(join(tmpdir(), 'hireready-fonts-'));
    const conf = join(dir, 'fonts.conf');
    await writeFile(
      conf,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <dir>/System/Library/Fonts</dir>
  <dir>/Library/Fonts</dir>
  <dir>/usr/share/fonts</dir>
  <cachedir>${dir}/cache</cachedir>
</fontconfig>
`,
      'utf8',
    );
    process.env['FONTCONFIG_FILE'] = conf;
  } catch {
    // Fall back to whatever fonts the system already exposes.
  }
}

/** The H-with-a-highlighter-dot mark, scaled from its native 32x32 box. */
function mark({ x, y, size, ink, dot }) {
  const scale = size / 32;
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M8.5 8.5V23.5M18 8.5V23.5" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
      <path d="M8.5 16H18" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="24.5" cy="23" r="3.5" fill="${dot}"/>
    </g>
  `;
}

/** Vertical rhythm of the check rows inside the OG card. */
const OG_ROW_STEP = 56;

/** A single check row. Occupies roughly 36px below its own origin. */
function ogRow(index, colour, glyph, label, detail) {
  return `
    <g transform="translate(0 ${index * OG_ROW_STEP})">
      <text x="10" y="17" font-family="${MONO}" font-size="16" font-weight="500"
            fill="${colour}" text-anchor="middle">${glyph}</text>
      <text x="30" y="14" font-family="${BODY}" font-size="16.5" font-weight="600" fill="${INK}">${label}</text>
      <text x="30" y="34" font-family="${BODY}" font-size="14.5" fill="${MUTED}">${detail}</text>
    </g>
  `;
}

function openGraphSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>

  <!-- wordmark, with a ruled line under the masthead -->
  <g transform="translate(72 58)">
    <rect width="40" height="40" rx="4" fill="${INK}"/>
    ${mark({ x: 4, y: 4, size: 32, ink: PAPER, dot: MARK })}
    <text x="56" y="29" font-family="${DISPLAY}" font-size="30" font-weight="600"
          letter-spacing="-0.3" fill="${INK}">Hire<tspan font-style="italic" font-weight="500">Ready</tspan></text>
  </g>
  <line x1="72" y1="122" x2="1128" y2="122" stroke="${INK}" stroke-width="1.5"/>

  <!--
    Left column is budgeted to 580px so the headline cannot collide with the
    card, which occupies x 700..1128.
  -->
  <text x="72" y="222" font-family="${DISPLAY}" font-size="62" font-weight="500"
        letter-spacing="-1.6" fill="${INK}">Your resume is</text>
  <rect x="66" y="254" width="334" height="26" fill="${MARK}"/>
  <text x="72" y="286" font-family="${DISPLAY}" font-size="62" font-weight="500" font-style="italic"
        letter-spacing="-1.6" fill="${INK}">parsed before</text>
  <rect x="66" y="318" width="222" height="26" fill="${MARK}"/>
  <text x="72" y="350" font-family="${DISPLAY}" font-size="62" font-weight="500" font-style="italic"
        letter-spacing="-1.6" fill="${INK}">it is read</text>

  <text x="72" y="410" font-family="${BODY}" font-size="21" fill="${MUTED}">A free resume checker that runs entirely</text>
  <text x="72" y="440" font-family="${BODY}" font-size="21" fill="${MUTED}">in your browser. Nothing is uploaded.</text>

  <!-- footer strip -->
  <g transform="translate(72 506)">
    <rect x="3" y="3" width="212" height="50" rx="3" fill="${INK}"/>
    <rect width="212" height="50" rx="3" fill="${ACCENT}"/>
    <text x="106" y="31" font-family="${BODY}" font-size="17" font-weight="500"
          fill="#FFFFFF" text-anchor="middle">Check my resume</text>
    <text x="240" y="31" font-family="${MONO}" font-size="14" fill="${FAINT}">hireready.arshdeepgrover.dev</text>
  </g>

  <!-- the report sheet, with a second sheet peeking out underneath -->
  <g transform="translate(700 168) rotate(0.8)">
    <rect x="8" y="8" width="428" height="360" rx="4" fill="${PAPER_ALT}" stroke="${LINE_STRONG}" stroke-width="1.5"/>
    <rect x="0" y="0" width="428" height="360" rx="4" fill="${SURFACE}" stroke="${INK}" stroke-width="1.5"/>
    <line x1="0" y1="46" x2="428" y2="46" stroke="${LINE}" stroke-width="1.5"/>
    <text x="28" y="29" font-family="${MONO}" font-size="12" letter-spacing="1.4" fill="${FAINT}">HIREREADY · REPORT</text>

    <g transform="translate(28 66)">
      <!-- score, circled in red pen -->
      <ellipse cx="50" cy="38" rx="48" ry="36" fill="none" stroke="${BAD}" stroke-width="2.4" transform="rotate(-5 50 38)"/>
      <text x="50" y="56" font-family="${DISPLAY}" font-size="50" font-weight="500"
            fill="${BAD}" text-anchor="middle">42</text>
      <text x="104" y="60" font-family="${MONO}" font-size="13" fill="${FAINT}">/100</text>
      <text x="156" y="38" font-family="${DISPLAY}" font-size="28" font-weight="500"
            letter-spacing="-0.4" fill="${INK}">Rebuild it</text>
      <text x="156" y="62" font-family="${BODY}" font-size="14" fill="${MUTED}">3 failing · 4 need work</text>

      <line x1="0" y1="96" x2="372" y2="96" stroke="${LINE}" stroke-width="1.5"/>

      <g transform="translate(0 116)">
        ${ogRow(0, BAD, '✕', 'Text boxes and tables', 'Parsers skip shapes entirely')}
        ${ogRow(1, BAD, '✕', 'Results with numbers', 'Nothing is quantified')}
        ${ogRow(2, WARN, '!', 'Dated personal details', "Father's name, date of birth")}
      </g>
    </g>
  </g>
</svg>`;
}

function iconSvg(size) {
  const radius = Math.round(size * 0.14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${(radius / size) * 32}" fill="${INK}"/>
  <path d="M8.5 8.5V23.5M18 8.5V23.5" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>
  <path d="M8.5 16H18" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24.5" cy="23" r="3.5" fill="${MARK}"/>
</svg>`;
}

/** Apple ignores rounded corners and applies its own mask, so keep it square. */
function appleIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${INK}"/>
  <path d="M8.5 8.5V23.5M18 8.5V23.5" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>
  <path d="M8.5 16H18" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24.5" cy="23" r="3.5" fill="${MARK}"/>
</svg>`;
}

async function main() {
  await configureFonts();
  const { default: sharp } = await import('sharp');

  const jobs = [
    ['og.png', openGraphSvg(), 1200, 630],
    ['icon-192.png', iconSvg(192), 192, 192],
    ['icon-512.png', iconSvg(512), 512, 512],
    ['apple-touch-icon.png', appleIconSvg(180), 180, 180],
  ];

  for (const [name, svg, width, height] of jobs) {
    const buffer = await sharp(Buffer.from(svg), { density: 384 })
      .resize(width, height, { fit: 'fill' })
      .png({ compressionLevel: 9, palette: name !== 'og.png' })
      .toBuffer();
    await writeFile(join(publicDir, name), buffer);
    console.log(`  ${name.padEnd(22)} ${width}x${height}  ${(buffer.length / 1024).toFixed(1)}kB`);
  }

  console.log('\nWrote brand assets to public/.');
}

main().catch((error) => {
  console.error(`\nAsset generation failed: ${error.message}`);
  process.exit(1);
});
