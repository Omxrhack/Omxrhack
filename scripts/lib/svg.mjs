// Piezas compartidas para los SVG del perfil: paletas, escape XML,
// telarañas, araña y skyline. Todo es determinista (semilla fija), así que
// regenerar produce exactamente el mismo archivo si no cambian los parámetros.

export const FONT_SANS =
  "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const FONT_MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/** Dark = Miles Morales (negro + rojo). Light = Peter Parker (rojo + azul). */
export const THEMES = {
  dark: {
    bg0: '#06060B',
    bg1: '#0F1019',
    card: '#0D0E16',
    cardBorder: '#2A1418',
    text: '#F4F4F7',
    muted: '#9BA1B0',
    faint: '#5B6070',
    red: '#E23636',
    redHot: '#FF4A4F',
    redDeep: '#7A0E16',
    blue: '#3D7BFF',
    cyan: '#22D3EE',
    web: '#FFFFFF',
    webOpacity: 0.11,
    skyline: '#030306',
    window: '#FFD9A0',
    spider: '#E23636',
    spiderDetail: '#0A0A0F',
    track: '#1B1D29',
  },
  light: {
    bg0: '#C8102E',
    bg1: '#14307F',
    card: '#FFFFFF',
    cardBorder: '#E6E8EF',
    text: '#FFFFFF',
    muted: '#5A6274',
    faint: '#8A91A3',
    red: '#D3202E',
    redHot: '#E8343F',
    redDeep: '#8E0B18',
    blue: '#1F3D99',
    cyan: '#22D3EE',
    web: '#000000',
    webOpacity: 0.22,
    skyline: '#0A1638',
    window: '#FFE7B3',
    spider: '#0B0F1E',
    spiderDetail: '#D3202E',
    track: '#EEF0F5',
  },
};

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escapa texto para meterlo en nodos o atributos XML. */
export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** PRNG determinista (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Telaraña radial anclada en (cx, cy) entre dos ángulos.
 * Devuelve los `d` de los radios y de los anillos (curvas que cuelgan hacia el centro).
 */
export function webPaths({ cx, cy, startDeg, endDeg, spokes, rings, radius, sag = 0.16, seed = 7 }) {
  const rand = rng(seed);
  const angles = Array.from({ length: spokes }, (_, i) => startDeg + ((endDeg - startDeg) * i) / (spokes - 1));
  const pt = (r, deg) => [r1(cx + r * Math.cos(rad(deg))), r1(cy + r * Math.sin(rad(deg)))];

  const spokePaths = angles.map((a) => {
    const [x, y] = pt(radius * 1.08, a);
    return `M${cx} ${cy}L${x} ${y}`;
  });

  const ringPaths = [];
  for (let k = 1; k <= rings; k++) {
    const base = radius * Math.pow(k / rings, 0.92);
    const rs = angles.map(() => base * (0.97 + rand() * 0.06));
    let d = '';
    angles.forEach((a, i) => {
      const [x, y] = pt(rs[i], a);
      if (i === 0) {
        d += `M${x} ${y}`;
        return;
      }
      const mid = (angles[i - 1] + a) / 2;
      const half = Math.abs(a - angles[i - 1]) / 2;
      const rc = ((rs[i - 1] + rs[i]) / 2) * Math.cos(rad(half)) * (1 - sag);
      const [qx, qy] = pt(rc, mid);
      d += `Q${qx} ${qy} ${x} ${y}`;
    });
    ringPaths.push(d);
  }
  return { spokes: spokePaths, rings: ringPaths };
}

/** Telaraña lista para insertar, con animación de trazado escalonada. */
export function webGroup(opts, { stroke, opacity, width = 1.2, delay = 0, cls = 'strand' }) {
  const { spokes, rings } = webPaths(opts);
  const all = [...spokes, ...rings];
  const paths = all
    .map(
      (d, i) =>
        `<path class="${cls}" pathLength="1" style="animation-delay:${(delay + i * 0.06).toFixed(2)}s" d="${d}"/>`,
    )
    .join('');
  return `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round">${paths}</g>`;
}

/** Araña estilizada (original), centrada en (0,0), mirando hacia abajo. */
export function spider({ body, detail, scale = 1 }) {
  const legs = [
    // [cadera x, cadera y, rodilla x, rodilla y, pata x, pata y] lado derecho; se espeja para el izquierdo
    [5, -6, 22, -24, 30, -2],
    [6, -2, 28, -12, 40, 10],
    [6, 3, 27, 6, 36, 28],
    [5, 7, 20, 20, 24, 40],
  ];
  const legPaths = legs
    .flatMap(([hx, hy, kx, ky, fx, fy]) => [
      `M${hx} ${hy}L${kx} ${ky}L${fx} ${fy}`,
      `M${-hx} ${hy}L${-kx} ${ky}L${-fx} ${fy}`,
    ])
    .join('');
  return `<g transform="scale(${scale})">
    <path d="${legPaths}" fill="none" stroke="${body}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="0" cy="-9" rx="8" ry="7" fill="${body}"/>
    <ellipse cx="0" cy="10" rx="11" ry="14" fill="${body}"/>
    <path d="M0 0L0 22M-6 6L6 6M-7 13L7 13" stroke="${detail}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <circle cx="-3" cy="-11" r="1.8" fill="${detail}" opacity=".9"/>
    <circle cx="3" cy="-11" r="1.8" fill="${detail}" opacity=".9"/>
  </g>`;
}

/**
 * Skyline de edificios con ventanas que parpadean.
 * `baseY` es el suelo; los edificios crecen hacia arriba.
 */
export function skyline({ width, baseY, minH, maxH, fill, window: windowColor, seed = 11, density = 0.22, opacity = 1 }) {
  const rand = rng(seed);
  let x = -10;
  let buildings = '';
  let windows = '';
  while (x < width + 10) {
    const w = 38 + Math.floor(rand() * 70);
    const tall = rand() < 0.18;
    const h = Math.floor(minH + rand() * (maxH - minH) * (tall ? 1 : 0.62));
    const top = baseY - h;
    buildings += `<rect x="${x}" y="${top}" width="${w}" height="${h + 40}"/>`;
    if (tall && rand() < 0.6) {
      const ax = x + Math.floor(w / 2);
      buildings += `<rect x="${ax - 1}" y="${top - 18}" width="2" height="18"/>`;
    }
    for (let wy = top + 10; wy < baseY - 8; wy += 13) {
      for (let wx = x + 7; wx < x + w - 8; wx += 11) {
        if (rand() < density) {
          const c = 1 + Math.floor(rand() * 3);
          const d = (rand() * 6).toFixed(1);
          windows += `<rect class="tw${c}" style="animation-delay:${d}s" x="${wx}" y="${wy}" width="4" height="6"/>`;
        }
      }
    }
    x += w + 2 + Math.floor(rand() * 6);
  }
  return `<g opacity="${opacity}"><g fill="${fill}">${buildings}</g><g fill="${windowColor}">${windows}</g></g>`;
}

/** CSS común a todas las piezas animadas. Respeta prefers-reduced-motion. */
export const BASE_CSS = `
.strand{stroke-dasharray:1 1;animation:draw 2.6s cubic-bezier(.4,0,.2,1) both}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.fade{animation:fade 1.1s ease-out both}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.tw1{opacity:.25;animation:tw 4.5s ease-in-out infinite}
.tw2{opacity:.55;animation:tw 7s ease-in-out infinite}
.tw3{opacity:.8;animation:tw 11s steps(2,jump-none) infinite}
@keyframes tw{0%,100%{opacity:.18}50%{opacity:.95}}
.drop{animation:drop 6.5s ease-in-out infinite}
@keyframes drop{0%,100%{transform:translateY(0)}50%{transform:translateY(34px)}}
.sense{transform-box:fill-box;transform-origin:center;animation:sense 3.2s ease-out infinite}
@keyframes sense{0%{transform:scale(.35);opacity:.85}100%{transform:scale(1.7);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;
