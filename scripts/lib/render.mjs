// Render de las tarjetas generadas a diario: calendario de contribuciones y panel de actividad.
// Funciones puras: reciben las stats ya calculadas (ver data.mjs) y devuelven el SVG como string.
// Diseño estático (sin animaciones) y con la paleta de GitHub, para que se lea igual en cualquier visor.

import { FONT_SANS, THEMES, escapeXml } from './svg.mjs';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Índice 0 = domingo, igual que `weekday` de la API de GitHub. */
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Niveles 0–4 del calendario (0 = sin contribuciones), en la escala de azules de GitHub. */
export const LEVEL_COLORS = {
  dark: ['#161B22', '#0C2D6B', '#1158C7', '#388BFD', '#79C0FF'],
  light: ['#EFF2F5', '#B6E3FF', '#54AEFF', '#0969DA', '#0A3069'],
};

const PAD = 32;
const W = 1200;

const fmtInt = (n) => Math.round(n).toLocaleString('es-MX');

/** "2026-11-19" → "19 nov 2026", sin pasar por Date (evita corrimientos de zona horaria). */
export function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;
/** "10 días", "1 día", "369+ días" (una racha abierta puede ser más larga). */
const streakText = (n, open) => `${fmtInt(n)}${open ? '+' : ''} ${n === 1 && !open ? 'día' : 'días'}`;
/** "lunes", "lunes y jueves", "lunes, martes y jueves". */
const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`);
/** Recorta nombres largos para que no invadan la columna vecina. */
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const LANG_NAME_MAX = 20;

function frame({ w, h, t, title, desc, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title>
<desc id="desc">${escapeXml(desc)}</desc>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="6" fill="${t.card}" stroke="${t.border}"/>
${body}
</svg>
`;
}

const label = (x, y, text, t, attrs = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT_SANS}" font-size="13" font-weight="600" fill="${t.muted}"${attrs}>${escapeXml(text)}</text>`;

/** Tabla de contribuciones al estilo GitHub. */
export function renderCalendar(stats, themeName) {
  const t = THEMES[themeName];
  const colors = LEVEL_COLORS[themeName];
  const left = 64;
  const top = 92;
  const step = 20.4;
  const size = 15.6;
  const weeks = stats.weeks;
  const H = Math.round(top + 7 * step + 64);

  let cells = '';
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
          monthLabels += `<text x="${x.toFixed(1)}" y="${top - 12}" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">${MONTHS[month]}</text>`;
        }
        lastMonth = month;
      }
    }
    for (const day of week) {
      const y = top + day.weekday * step;
      const tip = `${plural(day.count, 'contribución', 'contribuciones')} · ${fmtDate(day.date)}`;
      cells += `<rect class="cell" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" rx="3" fill="${colors[day.level]}"><title>${escapeXml(tip)}</title></rect>`;
    }
  });

  // Último día ("hoy" según GitHub): contorno discreto.
  const lastWeek = weeks[weeks.length - 1] ?? [];
  const today = lastWeek[lastWeek.length - 1];
  let todayMark = '';
  if (today) {
    const x = left + (weeks.length - 1) * step;
    const y = top + today.weekday * step;
    todayMark = `<rect class="today" x="${(x - 1.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="${size + 3}" height="${size + 3}" rx="4" fill="none" stroke="${t.muted}" stroke-width="1.2"/>`;
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
        `<rect x="${(legendRight - 40 - (4 - i) * step - size).toFixed(1)}" y="${legendY.toFixed(1)}" width="${size}" height="${size}" rx="3" fill="${c}"/>`,
    )
    .join('');

  const footer = [
    `Actualizado el ${fmtDate(stats.today)}`,
    plural(stats.activeDays, 'día activo', 'días activos'),
    ...(stats.bestDay.count > 0 ? [`mejor día: ${plural(stats.bestDay.count, 'contribución', 'contribuciones')}`] : []),
  ].join('  ·  ');

  const body = `
<text x="${PAD}" y="50" font-family="${FONT_SANS}" font-size="18" font-weight="600" fill="${t.text}">${escapeXml(fmtInt(stats.total))} ${stats.total === 1 ? 'contribución' : 'contribuciones'} en los últimos 12 meses</text>
<text x="${legendRight.toFixed(1)}" y="50" text-anchor="end" font-family="${FONT_SANS}" font-size="13" fill="${t.muted}">@${escapeXml(stats.login)}</text>
${monthLabels}
${dayLabels}
<g>${cells}</g>
${todayMark}
<text x="${PAD}" y="${(legendY + 12).toFixed(1)}" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">${escapeXml(footer)}</text>
<text x="${(legendRight - 40 - 4 * step - size - 10).toFixed(1)}" y="${(legendY + 12).toFixed(1)}" text-anchor="end" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">Menos</text>
${legendCells}
<text x="${(legendRight - 30).toFixed(1)}" y="${(legendY + 12).toFixed(1)}" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">Más</text>`;

  return frame({
    w: W,
    h: H,
    t,
    title: `${plural(stats.total, 'contribución', 'contribuciones')} de @${stats.login} en los últimos 12 meses`,
    desc: `Tabla de contribuciones en GitHub, día por día, del ${fmtDate(stats.firstDate)} al ${fmtDate(stats.lastDate)}. Días activos: ${fmtInt(stats.activeDays)}. Racha más larga: ${streakText(stats.longestStreak, stats.longestOpen)}.`,
    body,
  });
}

/** Barras de contribuciones por día de la semana, de lunes a domingo. Resalta el día más activo. */
function weekdayBars({ x0, baseY, maxH, values, topDays, t }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const barW = 28;
  const gap = 14;
  const max = Math.max(...values, 0);
  return order
    .map((wd, i) => {
      const x = x0 + i * (barW + gap);
      const v = values[wd];
      // Sin contribuciones no hay barra (y no se divide entre cero); con alguna, al menos 2 px para que se vea.
      const h = max > 0 && v > 0 ? Math.max(2, (maxH * v) / max) : 0;
      const bar =
        h > 0
          ? `<rect class="bar" x="${x}" y="${(baseY - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="${Math.min(3, h / 2).toFixed(1)}" fill="${t.accent}" fill-opacity="${topDays.includes(wd) ? 1 : 0.45}"/>`
          : '';
      return `<rect x="${x}" y="${baseY - maxH}" width="${barW}" height="${maxH}" rx="3" fill="${t.track}"/>${bar}<text x="${x + barW / 2}" y="${baseY + 20}" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" fill="${t.muted}">${WEEKDAYS[wd]}</text>`;
    })
    .join('\n');
}

/** Panel de actividad: números clave, contribuciones por día de la semana y lenguajes. */
export function renderSense(stats, themeName) {
  const t = THEMES[themeName];
  const H = 400;

  const tiles = [
    { value: fmtInt(stats.total), label: 'Contribuciones', caption: 'últimos 12 meses' },
    { value: fmtInt(stats.activeDays), label: 'Días activos', caption: `de ${plural(stats.windowDays, 'día', 'días')}` },
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
  const colW = (W - 2 * PAD) / tiles.length;
  const tileSvg = tiles
    .map((tile, i) => {
      const x = PAD + i * colW + (i === 0 ? 0 : 24);
      const sep = i === 0 ? '' : `<line x1="${PAD + i * colW}" y1="96" x2="${PAD + i * colW}" y2="180" stroke="${t.border}"/>`;
      return `${sep}<text x="${x}" y="130" font-family="${FONT_SANS}" font-size="34" font-weight="700" fill="${t.text}">${escapeXml(tile.value)}</text>
<text x="${x}" y="156" font-family="${FONT_SANS}" font-size="14" font-weight="600" fill="${t.text}">${escapeXml(tile.label)}</text>
<text x="${x}" y="176" font-family="${FONT_SANS}" font-size="13" fill="${t.muted}">${escapeXml(tile.caption)}</text>`;
    })
    .join('\n');

  // Día de la semana.
  const wd = stats.byWeekday;
  const totalWd = wd.reduce((a, b) => a + b, 0);
  const maxWd = Math.max(...wd);
  // Todos los días empatados en el máximo, de lunes a domingo (el orden de las barras).
  const topDays = totalWd > 0 ? [1, 2, 3, 4, 5, 6, 0].filter((d) => wd[d] === maxWd) : [];
  const pct = totalWd > 0 ? Math.round((maxWd / totalWd) * 100) : 0;
  const topLine =
    topDays.length === 1
      ? [`Día más activo: ${WEEKDAYS_LONG[topDays[0]]}`, `${pct}% de las contribuciones`]
      : topDays.length === 2
        ? [`Días más activos: ${listJoin(topDays.map((d) => WEEKDAYS_LONG[d]))}`, `${pct}% de las contribuciones cada uno`]
        : topDays.length === 7
          ? ['Actividad pareja toda la semana', `${pct}% de las contribuciones cada día`]
          : // Con 3 a 6 empatados la lista no cabe junto a las barras; las barras resaltadas dicen cuáles son.
            [`Empate entre ${topDays.length} días`, `${pct}% de las contribuciones cada uno`];
  const summary =
    topDays.length > 0
      ? [
          ...topLine,
          `Mejor día: ${plural(stats.bestDay.count, 'contribución', 'contribuciones')}`,
          `el ${fmtDate(stats.bestDay.date)}`,
        ]
      : ['Sin contribuciones públicas', 'en los últimos 12 meses'];
  const summarySvg = summary
    .map(
      (line, i) =>
        `<text x="344" y="${282 + i * 22 + (i >= 2 ? 14 : 0)}" font-family="${FONT_SANS}" font-size="${i % 2 === 0 ? 15 : 13}" font-weight="${i % 2 === 0 ? 600 : 400}" fill="${i % 2 === 0 ? t.text : t.muted}">${escapeXml(line)}</text>`,
    )
    .join('\n');

  // Lenguajes.
  const langX = 640;
  const langW = W - PAD - langX;
  let langSvg = '';
  if (stats.languages.length === 0) {
    langSvg = `<text x="${langX}" y="282" font-family="${FONT_SANS}" font-size="14" fill="${t.muted}">Sin datos de lenguajes todavía.</text>`;
  } else {
    let x = langX;
    const segs = stats.languages
      .map((l) => {
        const w = Math.max(0, (langW * l.pct) / 100);
        const seg = `<rect x="${x.toFixed(1)}" y="262" width="${w.toFixed(1)}" height="10" fill="${l.color}"/>`;
        x += w;
        return seg;
      })
      .join('');
    const legend = stats.languages
      .map((l, i) => {
        const lx = langX + (i % 2) * 264;
        const ly = 306 + Math.floor(i / 2) * 30;
        return `<circle cx="${lx + 5}" cy="${ly - 5}" r="5" fill="${l.color}"/><text x="${lx + 18}" y="${ly}" font-family="${FONT_SANS}" font-size="14" font-weight="600" fill="${t.text}">${escapeXml(clip(l.name, LANG_NAME_MAX))}<tspan fill="${t.muted}" font-weight="400" dx="8">${l.pct.toFixed(1)}%</tspan></text>`;
      })
      .join('\n');
    langSvg = `<clipPath id="bar"><rect x="${langX}" y="262" width="${langW}" height="10" rx="5"/></clipPath>
<rect x="${langX}" y="262" width="${langW}" height="10" rx="5" fill="${t.track}"/>
<g clip-path="url(#bar)">${segs}</g>
${legend}`;
  }

  const body = `
<text x="${PAD}" y="50" font-family="${FONT_SANS}" font-size="18" font-weight="600" fill="${t.text}">Actividad pública en GitHub</text>
<text x="${W - PAD}" y="50" text-anchor="end" font-family="${FONT_SANS}" font-size="13" fill="${t.muted}">@${escapeXml(stats.login)}  ·  actualizado el ${escapeXml(fmtDate(stats.today))}</text>
<line x1="${PAD}" y1="72" x2="${W - PAD}" y2="72" stroke="${t.border}"/>
${tileSvg}
<line x1="${PAD}" y1="204" x2="${W - PAD}" y2="204" stroke="${t.border}"/>
${label(PAD, 238, 'Contribuciones por día de la semana', t)}
${weekdayBars({ x0: PAD, baseY: 352, maxH: 84, values: wd, topDays, t })}
${summarySvg}
${label(langX, 238, 'Lenguajes en repos públicos', t)}
${langSvg}`;

  return frame({
    w: W,
    h: H,
    t,
    title: `Actividad pública de @${stats.login} en GitHub`,
    desc: `${plural(stats.total, 'contribución', 'contribuciones')} en 12 meses, ${plural(stats.activeDays, 'día activo', 'días activos')}, racha más larga de ${streakText(stats.longestStreak, stats.longestOpen)}, ${plural(stats.repoCount, 'repo público', 'repos públicos')}. Lenguajes: ${stats.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', ') || 'sin datos'}.`,
    body,
  });
}
