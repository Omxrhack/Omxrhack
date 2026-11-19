// Genera el arte estático del perfil en assets/: header, footer y divisor.
// Uso: node scripts/art.mjs
// Los textos viven en PROFILE; cambia ahí y vuelve a correr el script.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_CSS, FONT_MONO, FONT_SANS, THEMES, escapeXml, skyline, spider, webGroup } from './lib/svg.mjs';

const PROFILE = {
  name: 'OMAR BERMEJO OSUNA',
  kicker: '// TU AMIGABLE DESARROLLADOR DEL VECINDARIO',
  role: 'Mobile Developer  ·  AI-First Builder',
  stack: 'iOS · Android · React Native · Flutter · Agentes de IA',
  place: 'Culiacán, Sinaloa · MX',
  quote: '“Un gran poder conlleva una gran responsabilidad.”',
  quoteTail: '— en software, eso se llama tests.',
  handle: '@Omxrhack',
};

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const svgOpen = (w, h, title, desc) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title>
<desc id="desc">${escapeXml(desc)}</desc>`;

const GLITCH_CSS = `
.g1{opacity:0;animation:g1 7s steps(1,end) infinite}
.g2{opacity:0;animation:g2 7s steps(1,end) infinite}
@keyframes g1{0%,86%,100%{opacity:0;transform:none}87%{opacity:.9;transform:translate(-6px,1px)}89%{opacity:.9;transform:translate(4px,-2px)}91%{opacity:0;transform:none}}
@keyframes g2{0%,86%,100%{opacity:0;transform:none}87%{opacity:.9;transform:translate(5px,-1px)}89%{opacity:.9;transform:translate(-3px,2px)}91%{opacity:0;transform:none}}
`;

/** Araña colgando de un hilo, con anillos de sentido arácnido. */
function hangingSpider({ x, y, t, scale = 1, threadColor }) {
  return `<g transform="translate(${x} ${y})">
  <circle class="sense" cx="0" cy="0" r="34" fill="none" stroke="${t.red}" stroke-width="1.5"/>
  <circle class="sense" style="animation-delay:1.6s" cx="0" cy="0" r="34" fill="none" stroke="${t.red}" stroke-width="1.5"/>
  <g class="drop">
    <line x1="0" y1="${-y - 60}" x2="0" y2="-14" stroke="${threadColor}" stroke-opacity=".75" stroke-width="1.4"/>
    ${spider({ body: t.spider, detail: t.spiderDetail, scale })}
  </g>
</g>`;
}

function header(themeName) {
  const t = THEMES[themeName];
  const W = 1200;
  const H = 380;
  const dark = themeName === 'dark';
  const textX = 80;

  const background = dark
    ? `<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>`
    : `<rect width="${W}" height="${H}" fill="${t.bg1}"/>
<path d="M0 0H780L560 ${H}H0Z" fill="url(#suitRed)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>`;

  const webs = dark
    ? webGroup(
        { cx: W, cy: 0, startDeg: 90, endDeg: 180, spokes: 9, rings: 7, radius: 360, seed: 3 },
        { stroke: t.web, opacity: t.webOpacity, width: 1.2, delay: 0.2 },
      ) +
      webGroup(
        { cx: 0, cy: H, startDeg: -90, endDeg: 0, spokes: 7, rings: 5, radius: 230, seed: 5 },
        { stroke: t.red, opacity: 0.22, width: 1.1, delay: 0.6 },
      )
    : `<g clip-path="url(#redSide)">${webGroup(
        { cx: 0, cy: 0, startDeg: 0, endDeg: 90, spokes: 10, rings: 9, radius: 760, seed: 9, sag: 0.12 },
        { stroke: t.web, opacity: t.webOpacity, width: 1.6, delay: 0.1 },
      )}</g>` +
      webGroup(
        { cx: W, cy: 0, startDeg: 90, endDeg: 180, spokes: 8, rings: 6, radius: 300, seed: 4 },
        { stroke: '#FFFFFF', opacity: 0.16, width: 1.1, delay: 0.5 },
      );

  const name = escapeXml(PROFILE.name);
  const nameAttrs = `x="${textX}" y="170" font-family="${FONT_SANS}" font-size="66" font-weight="800" textLength="720" lengthAdjust="spacing"`;
  const nameBlock = dark
    ? `<text class="g1" ${nameAttrs} fill="${t.cyan}">${name}</text>
<text class="g2" ${nameAttrs} fill="${t.redHot}">${name}</text>
<text ${nameAttrs} fill="${t.text}">${name}</text>`
    : `<text ${nameAttrs} fill="#0A1638" opacity=".35" transform="translate(4 4)">${name}</text>
<text ${nameAttrs} fill="${t.text}">${name}</text>`;

  const kickerColor = dark ? t.red : '#FFFFFF';
  const subColor = dark ? '#D9DBE3' : '#FFFFFF';
  const stackColor = dark ? t.muted : '#E9EDFF';

  return `${svgOpen(
    W,
    H,
    'Omar Bermejo Osuna — Mobile Developer · AI-First Builder',
    'Banner animado con temática de Spider-Man: telarañas que se tejen solas, una araña colgando de su hilo con sentido arácnido y el skyline de la ciudad de noche.',
  )}
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg0}"/></linearGradient>
  <linearGradient id="suitRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0262F"/><stop offset="1" stop-color="#A50F1C"/></linearGradient>
  <radialGradient id="glow" cx=".3" cy=".42" r=".6"><stop offset="0" stop-color="${dark ? t.red : '#FFFFFF'}" stop-opacity="${dark ? 0.26 : 0.12}"/><stop offset="1" stop-color="${dark ? t.red : '#FFFFFF'}" stop-opacity="0"/></radialGradient>
  <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.skyline}" stop-opacity="0"/><stop offset="1" stop-color="${t.skyline}" stop-opacity=".9"/></linearGradient>
  <clipPath id="redSide"><path d="M0 0H780L560 ${H}H0Z"/></clipPath>
</defs>
<style>${BASE_CSS}${GLITCH_CSS}</style>
${background}
${webs}
${skyline({ width: W, baseY: H, minH: 30, maxH: 120, fill: t.skyline, window: t.window, seed: 21, density: 0.2, opacity: dark ? 1 : 0.6 })}
<rect y="${H - 70}" width="${W}" height="70" fill="url(#ground)"/>
${hangingSpider({ x: 1010, y: 182, t, scale: 1.25, threadColor: dark ? '#FFFFFF' : '#FFFFFF' })}
<g class="fade" style="animation-delay:.2s">
  <text x="${textX}" y="98" font-family="${FONT_MONO}" font-size="15" font-weight="600" letter-spacing="3.2" fill="${kickerColor}">${escapeXml(PROFILE.kicker)}</text>
</g>
<g class="fade" style="animation-delay:.45s">
${nameBlock}
</g>
<g class="fade" style="animation-delay:.75s">
  <text x="${textX}" y="216" font-family="${FONT_SANS}" font-size="27" font-weight="600" fill="${subColor}">${escapeXml(PROFILE.role)}</text>
</g>
<g class="fade" style="animation-delay:1s">
  <text x="${textX}" y="254" font-family="${FONT_MONO}" font-size="16" fill="${stackColor}">${escapeXml(PROFILE.stack)}</text>
  <circle cx="${textX + 5}" cy="283" r="4.5" fill="${dark ? t.red : '#FFFFFF'}"/>
  <text x="${textX + 18}" y="288" font-family="${FONT_SANS}" font-size="15" font-weight="600" fill="${stackColor}">${escapeXml(PROFILE.place)}</text>
</g>
</svg>
`;
}

function footer(themeName) {
  const t = THEMES[themeName];
  const W = 1200;
  const H = 260;
  const dark = themeName === 'dark';
  const quoteColor = dark ? t.text : '#FFFFFF';
  const tailColor = dark ? t.red : '#FFE3E5';

  const background = dark
    ? `<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`
    : `<rect width="${W}" height="${H}" fill="url(#suit)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;

  return `${svgOpen(
    W,
    H,
    'Un gran poder conlleva una gran responsabilidad',
    'Pie de página animado con temática de Spider-Man: telarañas en las esquinas, una araña colgando y el skyline nocturno.',
  )}
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/></linearGradient>
  <linearGradient id="suit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B3121F"/><stop offset=".5" stop-color="#7E1430"/><stop offset="1" stop-color="#14307F"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".35" r=".55"><stop offset="0" stop-color="${dark ? t.red : '#FFFFFF'}" stop-opacity="${dark ? 0.2 : 0.1}"/><stop offset="1" stop-color="${dark ? t.red : '#FFFFFF'}" stop-opacity="0"/></radialGradient>
</defs>
<style>${BASE_CSS}</style>
${background}
${webGroup(
  { cx: 0, cy: 0, startDeg: 0, endDeg: 90, spokes: 7, rings: 5, radius: 210, seed: 12 },
  { stroke: dark ? t.web : '#000000', opacity: dark ? t.webOpacity : 0.25, width: 1.1, delay: 0.1 },
)}
${webGroup(
  { cx: W, cy: 0, startDeg: 90, endDeg: 180, spokes: 7, rings: 5, radius: 210, seed: 13 },
  { stroke: dark ? t.web : '#FFFFFF', opacity: dark ? t.webOpacity : 0.2, width: 1.1, delay: 0.3 },
)}
${skyline({ width: W, baseY: H, minH: 18, maxH: 85, fill: t.skyline, window: t.window, seed: 33, density: 0.2, opacity: dark ? 1 : 0.65 })}
${hangingSpider({ x: 1060, y: 118, t, scale: 0.85, threadColor: '#FFFFFF' })}
<g class="fade" style="animation-delay:.3s">
  <text x="600" y="84" text-anchor="middle" font-family="${FONT_SANS}" font-size="30" font-weight="700" fill="${quoteColor}">${escapeXml(PROFILE.quote)}</text>
</g>
<g class="fade" style="animation-delay:.8s">
  <text x="600" y="120" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="600" letter-spacing="1" fill="${tailColor}">${escapeXml(PROFILE.quoteTail)}</text>
  <text x="600" y="150" text-anchor="middle" font-family="${FONT_MONO}" font-size="13" letter-spacing="2" fill="${dark ? t.muted : '#E9EDFF'}">${escapeXml(`${PROFILE.handle}  ·  ${PROFILE.place}`)}</text>
</g>
</svg>
`;
}

/** Divisor neutro (sirve en tema claro y oscuro): un hilo con una araña que lo recorre. */
function divider() {
  const t = THEMES.dark;
  const W = 1200;
  const H = 40;
  const knots = Array.from({ length: 9 }, (_, i) => 160 + i * 110)
    .map((x) => `<circle cx="${x}" cy="20" r="2" fill="${t.red}" opacity=".55"/>`)
    .join('');
  return `${svgOpen(W, H, 'Divisor', 'Un hilo de telaraña con una pequeña araña que lo recorre.')}
<defs>
  <linearGradient id="thread" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${t.red}" stop-opacity="0"/>
    <stop offset=".5" stop-color="${t.red}" stop-opacity=".85"/>
    <stop offset="1" stop-color="${t.red}" stop-opacity="0"/>
  </linearGradient>
</defs>
<style>
.walk{animation:walk 18s ease-in-out infinite alternate}
@keyframes walk{from{transform:translateX(90px)}to{transform:translateX(1110px)}}
@media (prefers-reduced-motion:reduce){.walk{animation:none;transform:translateX(600px)}}
</style>
<path d="M30 20Q600 27 1170 20" fill="none" stroke="url(#thread)" stroke-width="1.6"/>
${knots}
<g class="walk"><g transform="translate(0 20) rotate(-90)">${spider({ body: t.red, detail: '#0A0A0F', scale: 0.42 })}</g></g>
</svg>
`;
}

await mkdir(OUT, { recursive: true });
const files = {
  'header-dark.svg': header('dark'),
  'header-light.svg': header('light'),
  'footer-dark.svg': footer('dark'),
  'footer-light.svg': footer('light'),
  'divider.svg': divider(),
};
for (const [file, svg] of Object.entries(files)) {
  await writeFile(join(OUT, file), svg);
  console.log(`assets/${file}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
}
