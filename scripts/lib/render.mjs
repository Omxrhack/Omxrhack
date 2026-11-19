// Render de las tarjetas generadas a diario: calendario de contribuciones y panel Spider-Sense.
// Funciones puras: reciben las stats ya calculadas (ver data.mjs) y devuelven el SVG como string.

import { FONT_MONO, FONT_SANS, THEMES, escapeXml, spider, webGroup } from './svg.mjs';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Índice 0 = domingo, igual que `weekday` de la API de GitHub. */
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Niveles 0–4 del calendario (0 = sin contribuciones). Mismos colores que la telaraña animada. */
export const LEVEL_COLORS = {
  dark: ['#1A1B26', '#4A0D14', '#8B1520', '#C61F2C', '#FF4A4F'],
  light: ['#EBEDF0', '#F8C9CD', '#EE8790', '#DB3542', '#A50F1C'],
};

const fmtInt = (n) => Math.round(n).toLocaleString('es-MX');

/** "2026-11-19" → "19 nov 2026", sin pasar por Date (evita corrimientos de zona horaria). */
export function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function frame({ w, h, t, title, desc, css, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title>
<desc id="desc">${escapeXml(desc)}</desc>
<style>
.in{animation:in .7s cubic-bezier(.2,.7,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.cell{transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes pop{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.6)}}
.grow{transform-box:fill-box;transform-origin:left center;animation:grow 1.2s cubic-bezier(.2,.7,.2,1) both}
@keyframes grow{from{transform:scaleX(0)}to{transform:none}}
.web-in{transform-box:fill-box;transform-origin:center;animation:webin 1.4s cubic-bezier(.2,.7,.2,1) both}
@keyframes webin{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:none}}
.strand{stroke-dasharray:1 1;animation:draw 2.4s cubic-bezier(.4,0,.2,1) both}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
${css ?? ''}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${t.card}" stroke="${t.cardBorder}"/>
${webGroup(
  { cx: w, cy: 0, startDeg: 90, endDeg: 180, spokes: 7, rings: 5, radius: 150, seed: 17 },
  { stroke: t.red, opacity: 0.18, width: 1, delay: 0.2 },
)}
${body}
</svg>
`;
}

const ink = (themeName) => (themeName === 'dark' ? THEMES.dark.text : '#1F2330');

/** Duración del recorrido de la araña: ~0.6 s por salto, entre 8 y 30 s. */
export const trailSeconds = (points) => Math.min(30, Math.max(8, points * 0.6));

function trailCss(points) {
  if (points < 2) return '';
  const d = trailSeconds(points).toFixed(1);
  // El hilo se teje al mismo ritmo que camina la araña (ambos lineales en longitud);
  // al 88 % llega al día más reciente, descansa y vuelve a empezar.
  return `.trail{stroke-dasharray:1 1;stroke-dashoffset:0;animation:trail ${d}s linear infinite}
@keyframes trail{0%{stroke-dashoffset:1}88%,100%{stroke-dashoffset:0}}`;
}

/** Araña que recorre los días activos en orden, dejando un hilo. Sin días activos no hay araña. */
function spiderTrail(points, t) {
  if (points.length === 0) return '';
  const body = spider({ body: t.red, detail: t.spiderDetail === t.red ? '#FFFFFF' : '#0A0A0F', scale: 0.4 });
  if (points.length === 1) {
    const [x, y] = points[0];
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${body}</g>`;
  }
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const dur = trailSeconds(points.length).toFixed(1);
  return `<path id="trail" class="trail" pathLength="1" d="${d}" fill="none" stroke="${t.red}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round"/>
<g>
  <animateMotion dur="${dur}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;.88;1"><mpath xlink:href="#trail"/></animateMotion>
  <g transform="rotate(90)">${body}</g>
</g>`;
}

/** Tabla de contribuciones al estilo GitHub, en paleta Spider-Man. */
export function renderCalendar(stats, themeName) {
  const t = THEMES[themeName];
  const colors = LEVEL_COLORS[themeName];
  const text = ink(themeName);
  const W = 1200;
  const left = 64;
  const top = 92;
  const step = 20.4;
  const size = 15.6;
  const weeks = stats.weeks;
  const H = top + 7 * step + 64;

  let cells = '';
  const trailPoints = [];
  let monthLabels = '';
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const x = left + col * step;
    const firstDay = week[0];
    if (firstDay) {
      const month = Number(firstDay.date.slice(5, 7)) - 1;
      // Etiqueta de mes en la primera columna donde aparece ese mes (y no pegada al borde derecho).
      if (month !== lastMonth && col < weeks.length - 2) {
        if (lastMonth !== -1 || Number(firstDay.date.slice(8, 10)) <= 7) {
          monthLabels += `<text x="${x.toFixed(1)}" y="${top - 12}" font-family="${FONT_SANS}" font-size="13" fill="${t.muted}">${MONTHS[month]}</text>`;
        }
        lastMonth = month;
      }
    }
    for (const day of week) {
      const y = top + day.weekday * step;
      const delay = (col * 0.018 + day.weekday * 0.01).toFixed(2);
      const tip = `${plural(day.count, 'contribución', 'contribuciones')} · ${fmtDate(day.date)}`;
      cells += `<rect class="cell" style="animation-delay:${delay}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" rx="3.5" fill="${colors[day.level]}"><title>${escapeXml(tip)}</title></rect>`;
      if (day.count > 0) trailPoints.push([x + size / 2, y + size / 2]);
    }
  });

  // Último día ("hoy" según GitHub): anillo que late.
  const lastWeek = weeks[weeks.length - 1] ?? [];
  const today = lastWeek[lastWeek.length - 1];
  let todayMark = '';
  if (today) {
    const x = left + (weeks.length - 1) * step;
    const y = top + today.weekday * step;
    todayMark = `<rect class="pulse" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" rx="3.5" fill="none" stroke="${t.red}" stroke-width="1.6"/>`;
  }

  const dayLabels = [1, 3, 5]
    .map(
      (wd) =>
        `<text x="${left - 12}" y="${(top + wd * step + size - 3).toFixed(1)}" text-anchor="end" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">${WEEKDAYS[wd]}</text>`,
    )
    .join('');

  const legendY = top + 7 * step + 22;
  const legendRight = left + weeks.length * step - 4;
  const legendCells = colors
    .map(
      (c, i) =>
        `<rect x="${(legendRight - 40 - (4 - i) * step - size).toFixed(1)}" y="${legendY}" width="${size}" height="${size}" rx="3.5" fill="${c}"/>`,
    )
    .join('');

  const headline = `${fmtInt(stats.total)}`;
  const body = `
<g class="in">
  <text x="${left - 34}" y="50" font-family="${FONT_SANS}" font-size="28" font-weight="800" fill="${t.red}">${escapeXml(headline)}<tspan fill="${text}" font-weight="700" dx="10">${stats.total === 1 ? 'contribución' : 'contribuciones'} en los últimos 12 meses</tspan></text>
  <text x="${W - 36}" y="48" text-anchor="end" font-family="${FONT_MONO}" font-size="13" letter-spacing="1.5" fill="${t.muted}">SPIDER-SENSE · @${escapeXml(stats.login)}</text>
</g>
${monthLabels}
${dayLabels}
<g>${cells}</g>
${todayMark}
${spiderTrail(trailPoints, t)}
<text x="${left - 34}" y="${legendY + 12}" font-family="${FONT_MONO}" font-size="12" fill="${t.faint}">actualizado ${escapeXml(fmtDate(stats.today))} · días activos: ${fmtInt(stats.activeDays)} · mejor día: ${fmtInt(stats.bestDay.count)}</text>
<text x="${(legendRight - 40 - 4 * step - size - 10).toFixed(1)}" y="${legendY + 12}" text-anchor="end" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">Menos</text>
${legendCells}
<text x="${(legendRight - 30).toFixed(1)}" y="${legendY + 12}" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">Más</text>`;

  return frame({
    w: W,
    h: Math.round(H),
    t,
    title: `${plural(stats.total, 'contribución', 'contribuciones')} de @${stats.login} en los últimos 12 meses`,
    desc: `Tabla de contribuciones en GitHub, día por día, del ${fmtDate(stats.firstDate)} al ${fmtDate(stats.lastDate)}, con una araña que recorre los días activos tejiendo su hilo. Días activos: ${stats.activeDays}. Racha más larga: ${stats.longestStreak}${stats.longestOpen ? '+' : ''} días.`,
    css: trailCss(trailPoints.length),
    body,
  });
}

/** Radar de 7 hilos (uno por día de la semana) dibujado como telaraña. */
function weekdayWeb({ cx, cy, r, values, t, text }) {
  // Orden de lunes a domingo, empezando arriba y en sentido horario.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...values, 0);
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
  const pt = (radius, i) => [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
  const fmt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

  let grid = '';
  for (const k of [0.25, 0.5, 0.75, 1]) {
    // Anillos con una ligera caída hacia el centro, como hilo real.
    let d = '';
    order.forEach((_, i) => {
      const a = pt(r * k, i);
      const b = pt(r * k, (i + 1) % order.length);
      const mid = pt(r * k * 0.86, i + 0.5);
      d += `${i === 0 ? `M${fmt(a)}` : ''}Q${fmt(mid)} ${fmt(b)}`;
    });
    grid += `<path class="strand" pathLength="1" d="${d}"/>`;
  }
  const spokes = order.map((_, i) => `<path class="strand" pathLength="1" d="M${cx} ${cy}L${fmt(pt(r, i))}"/>`).join('');

  const shape = order
    .map((wd, i) => pt(max > 0 ? Math.max(r * 0.08, (r * values[wd]) / max) : r * 0.08, i))
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p)}`)
    .join('');
  const dots = order
    .map((wd, i) => {
      const p = pt(max > 0 ? Math.max(r * 0.08, (r * values[wd]) / max) : r * 0.08, i);
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${t.red}"/>`;
    })
    .join('');
  const labels = order
    .map((wd, i) => {
      const [x, y] = pt(r + 18, i);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" font-weight="600" fill="${t.muted}">${WEEKDAYS[wd]}</text>`;
    })
    .join('');

  return `<g fill="none" stroke="${text}" stroke-opacity=".16" stroke-width="1">${grid}${spokes}</g>
<g class="web-in" style="animation-delay:.5s"><path d="${shape}Z" fill="${t.red}" fill-opacity=".28" stroke="${t.red}" stroke-width="2" stroke-linejoin="round"/>${dots}</g>
${labels}`;
}

/** Panel Spider-Sense: números clave, telaraña semanal y lenguajes. */
export function renderSense(stats, themeName) {
  const t = THEMES[themeName];
  const text = ink(themeName);
  const W = 1200;
  const H = 440;

  const tiles = [
    { value: fmtInt(stats.total), label: 'Contribuciones', caption: 'últimos 12 meses' },
    { value: fmtInt(stats.activeDays), label: 'Días activos', caption: `de ${fmtInt(stats.windowDays)} en la ventana` },
    {
      value: `${fmtInt(stats.longestStreak)}${stats.longestOpen ? '+' : ''}`,
      label: 'Racha más larga',
      caption:
        stats.currentStreak > 1
          ? `racha actual: ${fmtInt(stats.currentStreak)}${stats.currentOpen ? '+' : ''} días`
          : 'días seguidos contribuyendo',
    },
    { value: fmtInt(stats.repoCount), label: 'Repos públicos', caption: 'propios, sin forks' },
  ];
  const tileW = 266;
  const gap = 18;
  const tileSvg = tiles
    .map((tile, i) => {
      const x = 40 + i * (tileW + gap);
      return `<g class="in" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
  <rect x="${x}" y="78" width="${tileW}" height="112" rx="12" fill="${t.track}"/>
  <rect x="${x}" y="78" width="4" height="112" rx="2" fill="${i % 2 === 0 ? t.red : t.blue}"/>
  <text x="${x + 24}" y="128" font-family="${FONT_SANS}" font-size="40" font-weight="800" fill="${text}">${escapeXml(tile.value)}</text>
  <text x="${x + 24}" y="154" font-family="${FONT_SANS}" font-size="15" font-weight="700" fill="${text}">${escapeXml(tile.label)}</text>
  <text x="${x + 24}" y="176" font-family="${FONT_SANS}" font-size="13" fill="${t.muted}">${escapeXml(tile.caption)}</text>
</g>`;
    })
    .join('\n');

  // Telaraña semanal.
  const wd = stats.byWeekday;
  const totalWd = wd.reduce((a, b) => a + b, 0);
  const topDay = totalWd > 0 ? wd.indexOf(Math.max(...wd)) : -1;
  const webSummary =
    topDay >= 0
      ? [
          `Día más activo: ${WEEKDAYS_LONG[topDay]}`,
          `${Math.round((wd[topDay] / totalWd) * 100)}% de las contribuciones`,
          `Mejor día: ${plural(stats.bestDay.count, 'contribución', 'contribuciones')}`,
          `el ${fmtDate(stats.bestDay.date)}`,
        ]
      : ['Sin contribuciones públicas', 'en los últimos 12 meses'];
  const summarySvg = webSummary
    .map(
      (line, i) =>
        `<text x="300" y="${282 + i * 24 + (i >= 2 ? 10 : 0)}" font-family="${FONT_SANS}" font-size="${i % 2 === 0 ? 16 : 14}" font-weight="${i % 2 === 0 ? 700 : 400}" fill="${i % 2 === 0 ? text : t.muted}">${escapeXml(line)}</text>`,
    )
    .join('');

  // Lenguajes.
  const langX = 640;
  const langW = 520;
  let langSvg = '';
  if (stats.languages.length === 0) {
    langSvg = `<text x="${langX}" y="300" font-family="${FONT_SANS}" font-size="14" fill="${t.muted}">Sin datos de lenguajes todavía.</text>`;
  } else {
    let x = langX;
    const segs = stats.languages
      .map((l, i) => {
        const w = Math.max(0, (langW * l.pct) / 100);
        const seg = `<rect class="grow" style="animation-delay:${(0.4 + i * 0.1).toFixed(2)}s" x="${x.toFixed(1)}" y="262" width="${w.toFixed(1)}" height="14" fill="${l.color}"/>`;
        x += w;
        return seg;
      })
      .join('');
    const legend = stats.languages
      .map((l, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const lx = langX + col * 270;
        const ly = 312 + row * 30;
        return `<g class="in" style="animation-delay:${(0.6 + i * 0.08).toFixed(2)}s"><circle cx="${lx + 6}" cy="${ly - 5}" r="6" fill="${l.color}"/><text x="${lx + 20}" y="${ly}" font-family="${FONT_SANS}" font-size="14" font-weight="600" fill="${text}">${escapeXml(l.name)}<tspan fill="${t.muted}" font-weight="400" dx="8">${l.pct.toFixed(1)}%</tspan></text></g>`;
      })
      .join('');
    langSvg = `<clipPath id="bar"><rect x="${langX}" y="262" width="${langW}" height="14" rx="7"/></clipPath>
<rect x="${langX}" y="262" width="${langW}" height="14" rx="7" fill="${t.track}"/>
<g clip-path="url(#bar)">${segs}</g>
${legend}`;
  }

  const body = `
<g class="in">
  <text x="40" y="50" font-family="${FONT_SANS}" font-size="22" font-weight="800" letter-spacing="1" fill="${t.red}">SPIDER-SENSE<tspan fill="${t.muted}" font-family="${FONT_MONO}" font-size="14" font-weight="400" letter-spacing="0" dx="12">// actividad pública en GitHub</tspan></text>
  <circle cx="${W - 250}" cy="44" r="5" fill="${t.red}"/>
  <circle class="pulse" cx="${W - 250}" cy="44" r="5" fill="${t.red}"/>
  <text x="${W - 40}" y="49" text-anchor="end" font-family="${FONT_MONO}" font-size="13" fill="${t.muted}">sentido arácnido activo</text>
</g>
${tileSvg}
<text x="40" y="232" font-family="${FONT_MONO}" font-size="12" letter-spacing="2" fill="${t.muted}">TELARAÑA SEMANAL</text>
${weekdayWeb({ cx: 150, cy: 340, r: 66, values: wd, t, text })}
<g class="in" style="animation-delay:.7s">${summarySvg}</g>
<text x="${langX}" y="232" font-family="${FONT_MONO}" font-size="12" letter-spacing="2" fill="${t.muted}">LENGUAJES · REPOS PÚBLICOS</text>
${langSvg}
<text x="${W - 36}" y="${H - 18}" text-anchor="end" font-family="${FONT_MONO}" font-size="11" fill="${t.faint}">actualizado ${escapeXml(fmtDate(stats.today))}</text>`;

  return frame({
    w: W,
    h: H,
    t,
    title: `Spider-Sense de @${stats.login}: actividad pública en GitHub`,
    desc: `${plural(stats.total, 'contribución', 'contribuciones')} en 12 meses, ${stats.activeDays} días activos, racha más larga de ${stats.longestStreak}${stats.longestOpen ? '+' : ''} días, ${stats.repoCount} repos públicos. Lenguajes: ${stats.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', ') || 'sin datos'}.`,
    body,
  });
}
