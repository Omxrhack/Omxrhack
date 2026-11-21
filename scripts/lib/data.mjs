// Datos para las tarjetas de actividad del perfil: consulta a la API GraphQL de GitHub y cálculo de stats.
// Todo lo que no es red es puro y se prueba en scripts/spider-sense.test.mjs.

export const DEFAULT_TZ = 'America/Mazatlan'; // Culiacán, UTC-7 todo el año

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

/** Lenguajes que casi siempre son andamiaje generado, no trabajo propio. */
export const DEFAULT_LANG_EXCLUDE = [
  'CMake', 'C++', 'C', 'Objective-C', 'Objective-C++', 'Ruby', 'Makefile', 'Batchfile', 'Shell', 'Dockerfile', 'Procfile',
];
/** En un repo de Flutter (Dart + CMake/C++), los runners nativos tampoco son trabajo propio. */
const FLUTTER_SCAFFOLD = new Set(['Swift', 'Kotlin', 'Java', 'HTML', 'Objective-C', 'C', 'C++', 'CMake', 'Ruby']);
const FALLBACK_LANG_COLOR = '#8B949E';
/** Runners nativos que generan React Native / Expo (ios/ y android/). */
const RN_NATIVE = new Set(['Swift', 'Kotlin', 'Java', 'Objective-C', 'Objective-C++', 'Ruby', 'C++', 'C', 'CMake', 'Starlark']);
const safeColor = (color) => (typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color) ? color : FALLBACK_LANG_COLOR);

// ——— Fechas: siempre como cadenas YYYY-MM-DD, aritmética con Date.UTC ———

/** Fecha de "hoy" en la zona horaria dada, como YYYY-MM-DD. */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** YYYY-MM-DD real (rechaza 2026-02-30, horas, zonas y basura). */
export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ——— Calendario y rachas ———

/**
 * Aplana las semanas del calendario en días ordenados, sin duplicados ni huecos.
 * Quita los días posteriores a `today` que no tengan contribuciones (el día aún no llega
 * en Culiacán), pero conserva los que sí tienen: un commit con zona horaria adelantada cuenta.
 */
export function normalizeDays(weeks, today) {
  const byDate = new Map();
  for (const week of weeks ?? []) {
    for (const day of week?.contributionDays ?? []) {
      if (!isIsoDate(day?.date)) continue;
      const count = Number(day.contributionCount) || 0;
      const level = LEVELS[day.contributionLevel] ?? (count > 0 ? 1 : 0);
      const prev = byDate.get(day.date);
      if (!prev || count > prev.count) byDate.set(day.date, { date: day.date, count, level });
    }
  }
  const sorted = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  while (sorted.length && sorted[sorted.length - 1].date > today && sorted[sorted.length - 1].count === 0) sorted.pop();
  if (sorted.length === 0) return [];

  const days = [];
  const last = sorted[sorted.length - 1].date;
  for (let date = sorted[0].date, i = 0; i < sorted.length && date <= last; date = addDays(date, 1)) {
    if (sorted[i].date === date) {
      days.push({ ...sorted[i], weekday: weekdayOf(date) });
      i++;
    } else {
      days.push({ date, count: 0, level: 0, weekday: weekdayOf(date) });
    }
  }
  return days;
}

/** Agrupa días consecutivos en columnas domingo→sábado, como la tabla de GitHub. */
export function toWeeks(days) {
  const weeks = [];
  let current = [];
  for (const day of days) {
    if (day.weekday === 0 && current.length) {
      weeks.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length) weeks.push(current);
  return weeks;
}

/**
 * Racha actual y más larga. Una racha que toca el primer día de la ventana es solo un
 * mínimo (pudo empezar antes): se marca como `open` para mostrarla como "N+".
 */
export function computeStreaks(days, today) {
  let longest = 0;
  let longestOpen = false;
  let run = 0;
  let runStart = 0;
  days.forEach((day, i) => {
    if (day.count > 0) {
      if (run === 0) runStart = i;
      run++;
      if (run > longest) {
        longest = run;
        longestOpen = runStart === 0;
      }
    } else {
      run = 0;
    }
  });

  // Hoy (o días futuros) sin contribuciones todavía no rompen la racha: el día no ha terminado.
  let i = days.length - 1;
  while (i >= 0 && days[i].count === 0 && days[i].date >= today) i--;
  let current = 0;
  if (i >= 0 && days[i].count > 0 && days[i].date >= addDays(today, -1)) {
    while (i >= 0 && days[i].count > 0) {
      current++;
      i--;
    }
  }
  const currentOpen = current > 0 && i < 0;
  return { longest, longestOpen, current, currentOpen };
}

// ——— Lenguajes ———

/**
 * Suma bytes por lenguaje en los repos propios, sin andamiaje ni repos duplicados
 * (dos repos con exactamente los mismos bytes por lenguaje cuentan una sola vez).
 * Devuelve el top N + "Otros", con porcentajes a un decimal que suman exactamente 100.
 */
export function aggregateLanguages(repos, { exclude = DEFAULT_LANG_EXCLUDE, top = 5 } = {}) {
  const excluded = new Set(exclude);
  const seen = new Set();
  const totals = new Map();

  for (const repo of repos ?? []) {
    const edges = (repo?.languages?.edges ?? []).filter((e) => e?.node?.name && Number(e.size) > 0);
    if (edges.length === 0) continue;
    const signature = edges.map((e) => `${e.node.name}:${e.size}`).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const names = new Set(edges.map((e) => e.node.name));
    const repoBytes = edges.reduce((sum, e) => sum + Number(e.size), 0);
    // Flutter: cualquier repo con Dart trae runners nativos generados (ios/, android/, desktop).
    const isFlutter = names.has('Dart');
    // React Native / Expo: JS/TS con un poco de nativo generado (menos del 15 % del repo).
    const nativeBytes = edges.filter((e) => RN_NATIVE.has(e.node.name)).reduce((sum, e) => sum + Number(e.size), 0);
    const isReactNative = (names.has('TypeScript') || names.has('JavaScript')) && nativeBytes > 0 && nativeBytes < repoBytes * 0.15;
    for (const e of edges) {
      const name = e.node.name;
      if (excluded.has(name) || (isFlutter && FLUTTER_SCAFFOLD.has(name)) || (isReactNative && RN_NATIVE.has(name))) continue;
      const prev = totals.get(name) ?? { name, color: safeColor(e.node.color), bytes: 0 };
      prev.bytes += Number(e.size);
      totals.set(name, prev);
    }
  }

  const sorted = [...totals.values()].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, l) => sum + l.bytes, 0);
  if (total === 0) return [];

  const head = sorted.slice(0, top);
  const restBytes = sorted.slice(top).reduce((sum, l) => sum + l.bytes, 0);
  if (restBytes > 0) head.push({ name: 'Otros', color: FALLBACK_LANG_COLOR, bytes: restBytes });

  // Método del mayor residuo en décimas para que la suma sea 100.0 exacto.
  const tenths = head.map((l) => (l.bytes * 1000) / total);
  const floors = tenths.map(Math.floor);
  let missing = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = tenths.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; missing > 0 && k < order.length; k++, missing--) floors[order[k][1]]++;

  return head.map((l, i) => ({ name: l.name, color: l.color, bytes: l.bytes, pct: floors[i] / 10 }));
}

// ——— Validación y stats ———

/** Comprobaciones de cordura: si algo no cuadra, mejor no publicar que publicar mal. */
export function validateRaw(raw) {
  const problems = [];
  const calendar = raw?.profile?.contributionsCollection?.contributionCalendar;
  if (!calendar) problems.push('falta contributionCalendar');
  else {
    const days = (calendar.weeks ?? []).flatMap((w) => w?.contributionDays ?? []);
    const badDates = days.filter((d) => !isIsoDate(d?.date)).length;
    if (badDates) problems.push(`${badDates} días con fecha inválida`);
    if (days.length < 365 || days.length > 372) problems.push(`el calendario trae ${days.length} días (se esperaban 365–372)`);
    const sum = days.reduce((a, d) => a + (Number(d.contributionCount) || 0), 0);
    if (sum !== calendar.totalContributions) {
      problems.push(`la suma diaria (${sum}) no coincide con totalContributions (${calendar.totalContributions})`);
    }
  }
  if (!Array.isArray(raw?.repos)) problems.push('faltan repos');
  else if (raw.repos.length !== raw.repoTotal) problems.push(`se juntaron ${raw.repos.length} de ${raw.repoTotal} repos`);
  if (problems.length) throw new Error(`Datos inconsistentes, no se publica nada:\n- ${problems.join('\n- ')}`);
}

export function computeStats(raw, { today, langExclude } = {}) {
  validateRaw(raw);
  const calendar = raw.profile.contributionsCollection.contributionCalendar;
  const days = normalizeDays(calendar.weeks, today);
  const streaks = computeStreaks(days, today);

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  let bestDay = { date: null, count: 0 };
  let activeDays = 0;
  for (const day of days) {
    byWeekday[day.weekday] += day.count;
    if (day.count > 0) activeDays++;
    if (day.count > 0 && day.count >= bestDay.count) bestDay = { date: day.date, count: day.count };
  }

  return {
    login: raw.profile.login,
    today,
    total: calendar.totalContributions,
    days,
    weeks: toWeeks(days),
    firstDate: days[0]?.date ?? today,
    lastDate: days[days.length - 1]?.date ?? today,
    windowDays: days.length,
    activeDays,
    bestDay,
    byWeekday,
    longestStreak: streaks.longest,
    longestOpen: streaks.longestOpen,
    currentStreak: streaks.current,
    currentOpen: streaks.currentOpen,
    repoCount: raw.repoTotal,
    stars: raw.repos.reduce((a, r) => a + (Number(r.stargazerCount) || 0), 0),
    followers: raw.profile.followers?.totalCount ?? 0,
    languages: aggregateLanguages(raw.repos, langExclude ? { exclude: langExclude } : undefined),
  };
}

// ——— Red ———

const API = 'https://api.github.com/graphql';
const FATAL_TYPES = new Set(['NOT_FOUND', 'VALIDATION', 'FORBIDDEN', 'INSUFFICIENT_SCOPES', 'UNAUTHENTICATED']);

export class FatalError extends Error {}
export class RetryableError extends Error {
  constructor(message, waitMs) {
    super(message);
    this.waitMs = waitMs;
  }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Una consulta GraphQL con reintentos acotados. Cualquier `errors` en la respuesta es fallo. */
export async function gql(query, variables, { token, fetchImpl = fetch, sleep = realSleep, attempts = 3, maxWaitMs = 60_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await gqlOnce(query, variables, { token, fetchImpl, maxWaitMs });
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt === attempts) throw err;
      lastError = err;
      const backoff = err.waitMs ?? 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
      console.warn(`[spider-sense] intento ${attempt} falló (${err.message}); reintento en ${backoff} ms`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

async function gqlOnce(query, variables, { token, fetchImpl, maxWaitMs }) {
  let res;
  try {
    res = await fetchImpl(API, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'profile-readme-activity',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new RetryableError(`red: ${err?.name ?? 'Error'} ${err?.message ?? ''}`.trim());
  }

  const waitFromHeaders = () => {
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset)) return Math.max(0, reset * 1000 - Date.now());
    return undefined;
  };
  const rateLimited = (why) => {
    const wait = waitFromHeaders();
    if (wait !== undefined && wait <= maxWaitMs) throw new RetryableError(why, wait + 1000);
    throw new FatalError(`${why}; la espera (${wait === undefined ? 'desconocida' : `${Math.round(wait / 1000)} s`}) excede el límite`);
  };

  if (res.status === 401) throw new FatalError('401: token inválido o sin permisos');
  if (res.status === 403 || res.status === 429) rateLimited(`HTTP ${res.status} (límite de uso)`);
  if (res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
  if (!res.ok) throw new FatalError(`HTTP ${res.status}`);

  let body;
  try {
    body = await res.json();
  } catch {
    throw new RetryableError('respuesta que no es JSON');
  }
  const errors = body?.errors;
  if (errors && (!Array.isArray(errors) || errors.length)) {
    const list = Array.isArray(errors) ? errors : [errors];
    const types = list.map((e) => e?.type).filter(Boolean);
    const message = list.map((e) => e?.message ?? JSON.stringify(e)).join(' | ');
    if (types.some((t) => FATAL_TYPES.has(t))) throw new FatalError(`${types.join(',')}: ${message}`);
    if (types.includes('RATE_LIMITED') || res.headers.get('x-ratelimit-remaining') === '0') rateLimited(`límite de GraphQL: ${message}`);
    if (/timeout|something went wrong/i.test(message)) throw new RetryableError(`GraphQL: ${message}`);
    throw new FatalError(`GraphQL: ${message}`);
  }
  if (!body?.data) throw new RetryableError('respuesta sin data');
  return body.data;
}

const PROFILE_QUERY = `query($login: String!) {
  user(login: $login) {
    login
    followers { totalCount }
    contributionsCollection {
      startedAt
      endedAt
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const REPOS_QUERY = `query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: $first, after: $after,
                 orderBy: { field: CREATED_AT, direction: ASC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        stargazerCount
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
          totalCount
          edges { size node { name color } }
        }
      }
    }
  }
}`;

/** Trae perfil + calendario una vez, y los repos página por página (bajando el tamaño si GitHub se atraganta). */
export async function fetchRaw(login, options) {
  const profileData = await gql(PROFILE_QUERY, { login }, options);
  if (!profileData?.user) throw new FatalError(`el usuario ${login} no existe o no es visible`);
  const profile = profileData.user;

  const repos = [];
  let after = null;
  let repoTotal = 0;
  const pageSizes = [100, 50, 25];
  let sizeIndex = 0;
  for (let page = 0; page < 200; page++) {
    let data;
    try {
      data = await gql(REPOS_QUERY, { login, first: pageSizes[sizeIndex], after }, options);
    } catch (err) {
      if (err instanceof RetryableError && sizeIndex < pageSizes.length - 1) {
        sizeIndex++;
        console.warn(`[spider-sense] bajando la página de repos a ${pageSizes[sizeIndex]}`);
        page--;
        continue;
      }
      throw err;
    }
    const conn = data?.user?.repositories;
    if (!conn) throw new FatalError('la respuesta de repos vino vacía');
    repoTotal = conn.totalCount;
    for (const node of conn.nodes ?? []) {
      if (node?.languages && node.languages.totalCount > (node.languages.edges?.length ?? 0)) {
        console.warn(`[spider-sense] ${node.name} tiene más de ${node.languages.edges.length} lenguajes; se usan los principales`);
      }
      repos.push(node);
    }
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new FatalError('hasNextPage sin endCursor: no se puede paginar');
    after = conn.pageInfo.endCursor;
  }

  return { profile, repos, repoTotal };
}
