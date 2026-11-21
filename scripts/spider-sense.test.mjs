// Tests del generador de actividad del perfil: node --test scripts/spider-sense.test.mjs
// Cubren los casos borde mapeados antes de escribir el generador, no solo el camino feliz.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FatalError,
  RetryableError,
  addDays,
  aggregateLanguages,
  computeStats,
  computeStreaks,
  fetchRaw,
  gql,
  isIsoDate,
  normalizeDays,
  toWeeks,
  todayIn,
  validateRaw,
  weekdayOf,
} from './lib/data.mjs';
import { WEEKDAYS, fmtDate, renderCalendar, renderSense } from './lib/render.mjs';

// ——— Utilidades ———

/** Calendario estilo API terminando en `end`, con `counts` del más viejo al más nuevo. */
function apiWeeks(end, counts) {
  const start = addDays(end, -(counts.length - 1));
  const weeks = [];
  let week = [];
  counts.forEach((count, i) => {
    const date = addDays(start, i);
    if (weekdayOf(date) === 0 && week.length) {
      weeks.push({ contributionDays: week });
      week = [];
    }
    week.push({ date, contributionCount: count, contributionLevel: count ? 'FIRST_QUARTILE' : 'NONE' });
  });
  if (week.length) weeks.push({ contributionDays: week });
  return weeks;
}

function rawData({ end = '2026-11-19', counts = Array(369).fill(0), repos = [], repoTotal } = {}) {
  return {
    profile: {
      login: 'Omxrhack',
      followers: { totalCount: 2 },
      contributionsCollection: {
        startedAt: '2025-11-16T07:00:00Z',
        endedAt: '2026-11-20T06:59:59Z',
        contributionCalendar: { totalContributions: counts.reduce((a, b) => a + b, 0), weeks: apiWeeks(end, counts) },
      },
    },
    repos,
    repoTotal: repoTotal ?? repos.length,
  };
}

const mkDays = (pairs) => pairs.map(([date, count]) => ({ date, count, level: count ? 1 : 0, weekday: weekdayOf(date) }));
const repo = (name, langs) => ({
  name,
  stargazerCount: 0,
  languages: { totalCount: langs.length, edges: langs.map(([n, size, color = '#123456']) => ({ size, node: { name: n, color } })) },
});

/** Comprobación barata de XML bien formado para lo que generamos. */
function assertCleanSvg(svg) {
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/, 'hay un & sin escapar');
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|\[object/, 'se coló un valor inválido');
}

// ——— Fechas ———

test('todayIn usa la zona horaria de Culiacán, no la del runner (UTC)', () => {
  assert.equal(todayIn('America/Mazatlan', new Date('2026-11-20T05:00:00Z')), '2026-11-19'); // 22:00 del 19 en Culiacán
  assert.equal(todayIn('America/Mazatlan', new Date('2026-11-20T07:30:00Z')), '2026-11-20');
});

test('addDays cruza fin de mes, de año y bisiestos', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekdayOf('2026-11-19'), 4); // jueves
});

test('fmtDate no se corre de día por zona horaria y tolera basura', () => {
  assert.equal(fmtDate('2026-01-01'), '1 ene 2026');
  assert.equal(fmtDate(null), '');
  assert.equal(fmtDate('nope'), '');
});

// ——— Calendario ———

test('normalizeDays quita días futuros vacíos pero conserva futuros con contribuciones', () => {
  const weeks = [{ contributionDays: [
    { date: '2026-11-18', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
    { date: '2026-11-19', contributionCount: 0, contributionLevel: 'NONE' },
    { date: '2026-11-20', contributionCount: 0, contributionLevel: 'NONE' },
  ] }];
  assert.deepEqual(normalizeDays(weeks, '2026-11-19').map((d) => d.date), ['2026-11-18', '2026-11-19']);

  weeks[0].contributionDays[2].contributionCount = 2; // commit con zona horaria adelantada
  assert.deepEqual(normalizeDays(weeks, '2026-11-19').map((d) => d.date), ['2026-11-18', '2026-11-19', '2026-11-20']);
});

test('normalizeDays deduplica, rellena huecos y calcula el día de la semana', () => {
  const weeks = [
    { contributionDays: [{ date: '2026-11-10', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' }] },
    { contributionDays: [
      { date: '2026-11-10', contributionCount: 3, contributionLevel: 'SECOND_QUARTILE' },
      { date: '2026-11-13', contributionCount: 2, contributionLevel: 'RARE_NEW_LEVEL' },
    ] },
  ];
  const days = normalizeDays(weeks, '2026-11-19');
  assert.deepEqual(days.map((d) => [d.date, d.count, d.level]), [
    ['2026-11-10', 3, 2],
    ['2026-11-11', 0, 0],
    ['2026-11-12', 0, 0],
    ['2026-11-13', 2, 1], // nivel desconocido con contribuciones → 1
  ]);
  assert.deepEqual(days.map((d) => d.weekday), [2, 3, 4, 5]);
  assert.deepEqual(normalizeDays([], '2026-11-19'), []);
  assert.deepEqual(normalizeDays(undefined, '2026-11-19'), []);
});

test('toWeeks arma columnas domingo→sábado aunque la primera semana venga incompleta', () => {
  const days = normalizeDays(apiWeeks('2026-11-19', Array(10).fill(0)), '2026-11-19'); // empieza en martes
  const weeks = toWeeks(days);
  assert.equal(weeks.flat().length, 10);
  assert.equal(weeks[0][0].weekday, 2);
  assert.ok(weeks.slice(1).every((w) => w[0].weekday === 0));
});

// ——— Rachas ———

test('sin contribuciones: todo en cero y nada abierto', () => {
  const days = mkDays([['2026-11-17', 0], ['2026-11-18', 0], ['2026-11-19', 0]]);
  assert.deepEqual(computeStreaks(days, '2026-11-19'), { longest: 0, longestOpen: false, current: 0, currentOpen: false });
  assert.deepEqual(computeStreaks([], '2026-11-19'), { longest: 0, longestOpen: false, current: 0, currentOpen: false });
});

test('hoy en cero no rompe la racha: cuenta desde ayer', () => {
  const days = mkDays([['2026-11-15', 0], ['2026-11-16', 1], ['2026-11-17', 2], ['2026-11-18', 1], ['2026-11-19', 0]]);
  const s = computeStreaks(days, '2026-11-19');
  assert.equal(s.current, 3);
  assert.equal(s.currentOpen, false);
});

test('hoy con contribuciones suma a la racha', () => {
  const days = mkDays([['2026-11-17', 0], ['2026-11-18', 1], ['2026-11-19', 4]]);
  assert.equal(computeStreaks(days, '2026-11-19').current, 2);
});

test('si la última contribución fue antier, la racha actual es 0', () => {
  const days = mkDays([['2026-11-16', 1], ['2026-11-17', 1], ['2026-11-18', 0], ['2026-11-19', 0]]);
  const s = computeStreaks(days, '2026-11-19');
  assert.equal(s.current, 0);
  assert.equal(s.longest, 2);
});

test('un día "futuro" con contribuciones (zona adelantada) cuenta en la racha', () => {
  const days = mkDays([['2026-11-18', 1], ['2026-11-19', 1], ['2026-11-20', 1]]);
  assert.equal(computeStreaks(days, '2026-11-19').current, 3);
});

test('una racha que toca el inicio de la ventana se marca abierta (N+)', () => {
  const all = mkDays([['2026-11-17', 1], ['2026-11-18', 1], ['2026-11-19', 1]]);
  assert.deepEqual(computeStreaks(all, '2026-11-19'), { longest: 3, longestOpen: true, current: 3, currentOpen: true });

  const atStart = mkDays([['2026-11-14', 2], ['2026-11-15', 1], ['2026-11-16', 0], ['2026-11-17', 1], ['2026-11-18', 0], ['2026-11-19', 0]]);
  const s = computeStreaks(atStart, '2026-11-19');
  assert.equal(s.longest, 2);
  assert.equal(s.longestOpen, true);
  assert.equal(s.current, 0);
});

test('la racha más larga del medio no queda marcada como abierta', () => {
  const days = mkDays([['2026-11-13', 0], ['2026-11-14', 1], ['2026-11-15', 1], ['2026-11-16', 1], ['2026-11-17', 0], ['2026-11-18', 1], ['2026-11-19', 0]]);
  const s = computeStreaks(days, '2026-11-19');
  assert.equal(s.longest, 3);
  assert.equal(s.longestOpen, false);
  assert.equal(s.current, 1);
});

// ——— Lenguajes ———

test('el andamiaje de Flutter no cuenta: solo Dart en repos Dart + CMake/C++', () => {
  const langs = aggregateLanguages([
    repo('flutter-app', [['Dart', 500], ['C++', 230], ['CMake', 130], ['Swift', 40], ['Kotlin', 10], ['HTML', 20]]),
    repo('ios-native', [['Swift', 300], ['Ruby', 50]]),
  ]);
  assert.deepEqual(langs.map((l) => [l.name, l.bytes]), [['Dart', 500], ['Swift', 300]]);
});

test('dos repos idénticos (mismos bytes por lenguaje) cuentan una sola vez', () => {
  const langs = aggregateLanguages([repo('Recetas-App-', [['Swift', 66283]]), repo('Recetiin', [['Swift', 66283]]), repo('otro', [['Swift', 10]])]);
  assert.equal(langs[0].bytes, 66293);
});

test('color nulo usa un color de respaldo y los repos sin lenguajes se ignoran', () => {
  const langs = aggregateLanguages([repo('a', [['Nix', 10, null]]), repo('vacio', []), { name: 'roto' }]);
  assert.equal(langs.length, 1);
  assert.match(langs[0].color, /^#[0-9A-F]{6}$/i);
});

test('los porcentajes suman exactamente 100.0 y el resto va a "Otros"', () => {
  const langs = aggregateLanguages(
    [repo('x', [['A', 1], ['B', 1], ['C', 1]]), repo('y', [['D', 1], ['E', 1], ['F', 1], ['G', 1]])],
    { top: 5 },
  );
  assert.equal(langs.length, 6);
  assert.equal(langs.at(-1).name, 'Otros');
  assert.equal(Math.round(langs.reduce((a, l) => a + l.pct * 10, 0)), 1000);
  for (const [repos, top] of [[[repo('t', [['A', 1], ['B', 1], ['C', 1]])], 5], [[repo('u', [['A', 2], ['B', 1]])], 1]]) {
    const out = aggregateLanguages(repos, { top });
    assert.equal(Math.round(out.reduce((a, l) => a + l.pct * 10, 0)), 1000);
  }
});

test('sin bytes no hay lenguajes (y no se divide entre cero)', () => {
  assert.deepEqual(aggregateLanguages([]), []);
  assert.deepEqual(aggregateLanguages([repo('solo-cmake', [['CMake', 10]])]), []);
  assert.deepEqual(aggregateLanguages(undefined), []);
});

// ——— Validación ———

test('validateRaw rechaza calendarios del tamaño equivocado, sumas que no cuadran y repos incompletos', () => {
  assert.doesNotThrow(() => validateRaw(rawData()));
  assert.throws(() => validateRaw(rawData({ counts: Array(364).fill(0) })), /364 días/);
  assert.throws(() => validateRaw(rawData({ counts: Array(373).fill(0) })), /373 días/);
  const mismatch = rawData({ counts: Array(369).fill(1) });
  mismatch.profile.contributionsCollection.contributionCalendar.totalContributions = 1;
  assert.throws(() => validateRaw(mismatch), /no coincide/);
  assert.throws(() => validateRaw(rawData({ repos: [repo('a', [])], repoTotal: 3 })), /1 de 3 repos/);
  assert.throws(() => validateRaw({}), /contributionCalendar/);
});

// ——— Stats + render ———

test('una cuenta sin actividad ni lenguajes se dibuja sin NaN ni huecos', () => {
  const stats = computeStats(rawData(), { today: '2026-11-19' });
  assert.equal(stats.total, 0);
  assert.equal(stats.bestDay.count, 0);
  for (const theme of ['dark', 'light']) {
    const cal = renderCalendar(stats, theme);
    const sense = renderSense(stats, theme);
    assertCleanSvg(cal);
    assertCleanSvg(sense);
    assert.match(sense, /Sin contribuciones públicas/);
    assert.match(sense, /Sin datos de lenguajes/);
    assert.equal((cal.match(/class="cell"/g) ?? []).length, stats.days.length);
  }
});

test('las rachas abiertas se muestran como N+ y los nombres raros se escapan', () => {
  const counts = Array(369).fill(1);
  const stats = computeStats(
    rawData({ counts, repos: [repo('weird', [["Cap'n <Proto> & Co", 100, '#ff0000']])] }),
    { today: '2026-11-19' },
  );
  assert.equal(stats.longestOpen, true);
  const sense = renderSense(stats, 'dark');
  assertCleanSvg(sense);
  assert.match(sense, />369\+</);
  assert.match(sense, /racha actual: 369\+ días/);
  assert.match(sense, /Cap&apos;n &lt;Proto&gt; &amp; Co/);
  assert.doesNotMatch(sense, /<Proto>/);
});

test('el calendario dibuja una celda por día y marca el último día', () => {
  const counts = Array.from({ length: 369 }, (_, i) => (i % 5 === 0 ? i % 13 : 0));
  const stats = computeStats(rawData({ counts }), { today: '2026-11-19' });
  const cal = renderCalendar(stats, 'light');
  assertCleanSvg(cal);
  assert.equal((cal.match(/class="cell"/g) ?? []).length, 369);
  assert.equal((cal.match(/class="today"/g) ?? []).length, 1);
  assert.match(cal, /Actualizado el 19 nov 2026/);
  // La marca de "hoy" cae sobre la última celda (columna y fila del último día).
  const lastCell = [...cal.matchAll(/<rect class="cell" x="([\d.]+)" y="([\d.]+)"/g)].at(-1);
  const mark = cal.match(/<rect class="today" x="([\d.]+)" y="([\d.]+)"/);
  assert.equal(Number(mark[1]), Math.round((Number(lastCell[1]) - 1.5) * 10) / 10);
  assert.equal(Number(mark[2]), Math.round((Number(lastCell[2]) - 1.5) * 10) / 10);
});

// ——— Red: errores, reintentos y paginación ———

function fakeFetch(responses) {
  const calls = [];
  const impl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: no quedan respuestas');
    if (next instanceof Error) throw next;
    const { status = 200, headers = {}, body } = next;
    return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body };
  };
  return { impl, calls };
}
const opts = (impl, extra = {}) => {
  const sleeps = [];
  return { token: 't', fetchImpl: impl, sleep: async (ms) => { sleeps.push(ms); }, sleeps, ...extra };
};

test('un 200 con errors NOT_FOUND es fatal y no se reintenta', async () => {
  const { impl, calls } = fakeFetch([{ body: { data: { user: null }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a User' }] } }]);
  await assert.rejects(gql('q', {}, opts(impl)), FatalError);
  assert.equal(calls.length, 1);
});

test('datos parciales con errors no pasan en silencio', async () => {
  const { impl } = fakeFetch([{ body: { data: { user: { login: 'x' } }, errors: [{ type: 'MAX_NODE_LIMIT_EXCEEDED', message: 'too big' }] } }]);
  await assert.rejects(gql('q', {}, opts(impl)), FatalError);
});

test('502 y errores de red se reintentan con espera', async () => {
  const { impl, calls } = fakeFetch([{ status: 502, body: {} }, new TypeError('fetch failed'), { body: { data: { ok: 1 } } }]);
  const o = opts(impl);
  assert.deepEqual(await gql('q', {}, o), { ok: 1 });
  assert.equal(calls.length, 3);
  assert.equal(o.sleeps.length, 2);
});

test('el mensaje de timeout dentro de un 200 se reintenta y, si persiste, falla', async () => {
  const timeout = { body: { errors: [{ message: 'Something went wrong while executing your query. This may be the result of a timeout' }] } };
  const { impl, calls } = fakeFetch([timeout, timeout, timeout]);
  await assert.rejects(gql('q', {}, opts(impl)), RetryableError);
  assert.equal(calls.length, 3);
});

test('límite de uso: espera si es corta, falla si es larga', async () => {
  const short = fakeFetch([{ status: 403, headers: { 'retry-after': '5' }, body: {} }, { body: { data: { ok: 1 } } }]);
  const o = opts(short.impl);
  assert.deepEqual(await gql('q', {}, o), { ok: 1 });
  assert.ok(o.sleeps[0] >= 5000);

  const long = fakeFetch([{ status: 403, headers: { 'retry-after': '600' }, body: {} }]);
  await assert.rejects(gql('q', {}, opts(long.impl)), FatalError);
  assert.equal(long.calls.length, 1);

  const reset = Math.floor(Date.now() / 1000) + 3600;
  const primary = fakeFetch([{ headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }, body: { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] } }]);
  await assert.rejects(gql('q', {}, opts(primary.impl)), FatalError);
});

test('401 es fatal de inmediato', async () => {
  const { impl, calls } = fakeFetch([{ status: 401, body: {} }]);
  await assert.rejects(gql('q', {}, opts(impl)), /401/);
  assert.equal(calls.length, 1);
});

test('fetchRaw pagina los repos, baja el tamaño de página ante 502 y pide el calendario una sola vez', async () => {
  const profile = { data: { user: { login: 'Omxrhack', followers: { totalCount: 2 }, contributionsCollection: { contributionCalendar: { totalContributions: 0, weeks: [] } } } } };
  const page = (names, hasNextPage, endCursor) => ({
    data: { user: { repositories: { totalCount: 3, pageInfo: { hasNextPage, endCursor }, nodes: names.map((n) => repo(n, [['TypeScript', 1]])) } } },
  });
  const { impl, calls } = fakeFetch([
    { body: profile },
    { status: 502, body: {} }, { status: 502, body: {} }, { status: 502, body: {} }, // página de 100: se rinde
    { body: page(['a', 'b'], true, 'c1') }, // página de 50
    { body: page(['c'], false, null) },
  ]);
  const raw = await fetchRaw('Omxrhack', opts(impl));
  assert.deepEqual(raw.repos.map((r) => r.name), ['a', 'b', 'c']);
  assert.equal(raw.repoTotal, 3);
  const repoCalls = calls.filter((c) => c.query.includes('repositories'));
  assert.deepEqual(repoCalls.map((c) => c.variables.first), [100, 100, 100, 50, 50]);
  assert.equal(repoCalls.at(-1).variables.after, 'c1');
  assert.equal(calls.filter((c) => c.query.includes('contributionCalendar')).length, 1);
});

test('fetchRaw falla claro si el usuario no existe', async () => {
  const { impl } = fakeFetch([{ body: { data: { user: null } } }]);
  await assert.rejects(fetchRaw('nadie', opts(impl)), /no existe/);
});

const statsFor = (counts, repos = []) => computeStats(rawData({ counts, repos }), { today: '2026-11-19' });

test('las tarjetas son estáticas y no quedan restos del tema anterior', () => {
  const one = Array(369).fill(0);
  one[100] = 2;
  const many = Array(369).fill(0);
  [3, 50, 51, 200, 368].forEach((i) => (many[i] = 1));
  for (const counts of [Array(369).fill(0), one, many]) {
    const stats = statsFor(counts, [repo('a', [['Swift', 10]])]);
    for (const theme of ['dark', 'light']) {
      for (const svg of [renderCalendar(stats, theme), renderSense(stats, theme)]) {
        assertCleanSvg(svg);
        assert.doesNotMatch(svg, /<animate|<set |<mpath|@keyframes|animation:|<style/, 'sin animaciones');
        assert.doesNotMatch(svg, /araña|telaraña|spider|sentido arácnido/i);
        assert.doesNotMatch(svg, /<ellipse|class="(walker|trail|pulse)"/);
      }
    }
  }
});

test('las barras por día de la semana van de lunes a domingo, son proporcionales y resaltan el día más activo', () => {
  const start = addDays('2026-11-19', -368);
  // Martes: 4 por día; miércoles: 1 por día; el resto, nada.
  const counts = Array.from({ length: 369 }, (_, i) => ({ 2: 4, 3: 1 })[weekdayOf(addDays(start, i))] ?? 0);
  const stats = statsFor(counts);
  const svg = renderSense(stats, 'light');
  assertCleanSvg(svg);

  const labels = [...svg.matchAll(/>(Dom|Lun|Mar|Mié|Jue|Vie|Sáb)</g)].map((m) => m[1]);
  assert.deepEqual(labels, [...WEEKDAYS.slice(1), WEEKDAYS[0]]);

  const bars = [...svg.matchAll(/<rect class="bar" x="[\d.]+" y="([\d.]+)" width="28" height="([\d.]+)" rx="[\d.]+" fill="[^"]+" fill-opacity="([\d.]+)"/g)];
  assert.equal(bars.length, 2, 'sin contribuciones no hay barra');
  const [tue, wed] = bars.map((m) => ({ y: Number(m[1]), h: Number(m[2]), opacity: Number(m[3]) }));
  assert.equal(tue.h, 84);
  assert.equal(tue.opacity, 1, 'el día más activo va resaltado');
  assert.equal(wed.opacity, 0.45);
  const expected = (84 * stats.byWeekday[3]) / stats.byWeekday[2];
  assert.ok(Math.abs(wed.h - expected) < 0.1, `${wed.h} ≈ ${expected}`);
  assert.equal(tue.y + tue.h, wed.y + wed.h, 'misma línea base');
  assert.match(svg, /Día más activo: martes/);
  assert.match(svg, /\d+% de las contribuciones/);
});

test('una barra con muy pocas contribuciones sigue siendo visible', () => {
  const start = addDays('2026-11-19', -368);
  const counts = Array.from({ length: 369 }, (_, i) => (weekdayOf(addDays(start, i)) === 1 ? 1000 : 0));
  counts[counts.findIndex((_, i) => weekdayOf(addDays(start, i)) === 5)] = 1; // un solo viernes con 1
  const bars = [...renderSense(statsFor(counts), 'dark').matchAll(/<rect class="bar" [^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(bars.length, 2);
  assert.ok(Math.min(...bars) >= 2, 'al menos 2 px');
});

test('singular y plural en los textos, y sin "mejor día" cuando no hubo contribuciones', () => {
  const one = Array(369).fill(0);
  one[368] = 1;
  const cal = renderCalendar(statsFor(one), 'dark');
  assert.match(cal, />1 contribución en los últimos 12 meses</);
  assert.match(cal, /1 día activo  ·  mejor día: 1 contribución</);

  const empty = renderCalendar(statsFor(Array(369).fill(0)), 'light');
  assert.match(empty, />0 contribuciones en los últimos 12 meses</);
  assert.match(empty, /0 días activos</);
  assert.doesNotMatch(empty, /mejor día/);
});

const barsOf = (svg) =>
  [...svg.matchAll(/<rect class="bar" [^>]*height="([\d.]+)"[^>]*fill-opacity="([\d.]+)"/g)].map((m) => ({ h: Number(m[1]), opacity: Number(m[2]) }));
/** 369 días que terminan el 19 nov 2026, con `perWeekday[wd]` contribuciones cada día de ese día de la semana. */
const byWeekdayCounts = (perWeekday) => {
  const start = addDays('2026-11-19', -368);
  return Array.from({ length: 369 }, (_, i) => perWeekday[weekdayOf(addDays(start, i))] ?? 0);
};

test('empates en el día más activo: se resaltan todos y el texto no miente ni se desborda', () => {
  // Lunes y jueves empatan exactamente (mismo número de lunes y jueves en la ventana).
  const counts = byWeekdayCounts({ 1: 3, 4: 3, 5: 1 });
  const stats = statsFor(counts);
  assert.equal(stats.byWeekday[1], stats.byWeekday[4], 'el fixture debe empatar');
  const two = renderSense(stats, 'dark');
  assert.deepEqual(barsOf(two).map((b) => b.opacity), [1, 1, 0.45]);
  assert.match(two, />Días más activos: lunes y jueves</);
  assert.match(two, /% de las contribuciones cada uno</);

  // En la ventana hay 53 de domingo a jueves y 52 viernes y sábados.
  const three = renderSense(statsFor(byWeekdayCounts({ 1: 2, 2: 2, 3: 2 })), 'dark');
  assert.match(three, />Empate entre 3 días</);
  assert.deepEqual(barsOf(three).map((b) => b.opacity), [1, 1, 1]);

  const even = statsFor(byWeekdayCounts({ 0: 52, 1: 52, 2: 52, 3: 52, 4: 52, 5: 53, 6: 53 }));
  assert.equal(new Set(even.byWeekday).size, 1, 'el fixture debe empatar los 7 días');
  const evenSvg = renderSense(even, 'light');
  assert.equal(barsOf(evenSvg).filter((b) => b.opacity === 1 && b.h === 84).length, 7);
  assert.match(evenSvg, />Actividad pareja toda la semana</);
  assert.match(evenSvg, />14% de las contribuciones cada día</);
});

test('el porcentaje del día más activo es el real', () => {
  const stats = statsFor(byWeekdayCounts({ 2: 3, 3: 1 }));
  const total = stats.byWeekday.reduce((a, b) => a + b, 0);
  const pct = Math.round((stats.byWeekday[2] / total) * 100);
  assert.match(renderSense(stats, 'dark'), new RegExp(`>${pct}% de las contribuciones<`));
});

test('nombres de lenguaje largos se recortan y la leyenda cabe en el panel', () => {
  const langs = [
    ['Common Workflow Language', 600],
    ['Jupyter Notebook', 500],
    ['TypeScript', 400],
    ['JavaScript', 300],
    ['Swift', 200],
    ['Kotlin', 100],
    ['Ruby', 50],
  ];
  const stats = statsFor(Array(369).fill(0), [repo('a', langs)]);
  assert.equal(stats.languages.length, 6, 'top 5 + Otros');
  const svg = renderSense(stats, 'light');
  assertCleanSvg(svg);
  assert.match(svg, />Common Workflow Lan…</);
  assert.doesNotMatch(svg, />Common Workflow Language</);
  assert.match(svg, />Jupyter Notebook</, 'los que caben no se tocan');
  const H = Number(svg.match(/height="(\d+)"/)[1]);
  for (const [, y] of svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)) assert.ok(Number(y) <= H - 16, `texto en y=${y} fuera del panel`);
});

test('las descripciones accesibles usan singular cuando toca', () => {
  const one = Array(369).fill(0);
  one[368] = 1;
  const stats = statsFor(one, [repo('a', [['Swift', 10]])]);
  for (const svg of [renderSense(stats, 'dark'), renderCalendar(stats, 'dark')]) {
    assert.doesNotMatch(svg, /\b1 días\b|\b1 repos\b/);
  }
  assert.match(renderSense(stats, 'dark'), /1 día activo, racha más larga de 1 día, 1 repo público/);
  assert.match(renderSense(stats, 'dark'), />de 369 días</);
});

// ——— Hallazgos de la verificación adversarial ———

test('una fecha malformada no cuelga el cálculo y validateRaw la rechaza', () => {
  const weeks = [{ contributionDays: [
    { date: '2026-02-27', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
    { date: '2026-02-30', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
    { date: '2026-03-01T00:00:00Z', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
    { date: '2026-03-02', contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
  ] }];
  const days = normalizeDays(weeks, '2026-11-19');
  assert.deepEqual(days.map((d) => d.date), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  const raw = rawData();
  raw.profile.contributionsCollection.contributionCalendar.weeks[3].contributionDays[0].date = '2026-02-30';
  assert.throws(() => validateRaw(raw), /fecha inválida/);
});

test('"días activos" nunca supera los días de la ventana (aunque haya un día futuro con contribuciones)', () => {
  const raw = rawData({ end: '2026-11-20', counts: Array(370).fill(1) }); // termina "mañana" en Culiacán
  const stats = computeStats(raw, { today: '2026-11-19' });
  assert.ok(stats.activeDays <= stats.windowDays, `${stats.activeDays} de ${stats.windowDays}`);
});

test('NOT_FOUND es fatal aunque llegue junto con un límite de uso', async () => {
  const { impl, calls } = fakeFetch([{
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 5) },
    body: { data: { user: null }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a User' }] },
  }]);
  await assert.rejects(gql('q', {}, opts(impl)), FatalError);
  assert.equal(calls.length, 1);
});

test('errors que no es arreglo también es error, y paginar sin cursor falla al primer intento', async () => {
  const objectErrors = fakeFetch([{ body: { data: { ok: 1 }, errors: { message: 'raro' } } }]);
  await assert.rejects(gql('q', {}, opts(objectErrors.impl)), FatalError);

  const profile = { data: { user: { login: 'x', followers: { totalCount: 0 }, contributionsCollection: { contributionCalendar: { totalContributions: 0, weeks: [] } } } } };
  const noCursor = { data: { user: { repositories: { totalCount: 200, pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] } } } };
  const { impl, calls } = fakeFetch([{ body: profile }, { body: noCursor }]);
  await assert.rejects(fetchRaw('x', opts(impl)), /endCursor/);
  assert.equal(calls.length, 2);
});

test('Flutter solo-móvil y React Native no inflan Swift/Kotlin; Swift nativo sí cuenta', () => {
  const langs = aggregateLanguages([
    repo('flutter-mobile', [['Dart', 600], ['Swift', 200], ['Kotlin', 90], ['HTML', 30]]),
    repo('rn-app', [['TypeScript', 9000], ['Swift', 300], ['Kotlin', 200], ['Ruby', 80]]),
    repo('ios-native', [['Swift', 500], ['JavaScript', 20]]),
  ]);
  assert.deepEqual(langs.map((l) => [l.name, l.bytes]), [['TypeScript', 9000], ['Dart', 600], ['Swift', 500], ['JavaScript', 20]]);
});

test('colores de lenguaje inválidos no se cuelan como atributos', () => {
  const [lang] = aggregateLanguages([repo('x', [['Evil', 10, '#f00" onload="alert(1)']])]);
  assert.equal(lang.color, '#8B949E');
  const stats = computeStats(rawData({ repos: [repo('x', [['Evil', 10, '#f00" onload="alert(1)']])] }), { today: '2026-11-19' });
  assert.doesNotMatch(renderSense(stats, 'dark'), /onload/);
});

test('caracteres de control en nombres no rompen el XML', () => {
  const stats = computeStats(rawData({ repos: [repo('x', [['Raro\u0001\u001F', 10]])] }), { today: '2026-11-19' });
  const svg = renderSense(stats, 'light');
  assertCleanSvg(svg);
  assert.doesNotMatch(svg, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.match(svg, />Raro</);
});
