// Genera la tabla de contribuciones y el panel de actividad del perfil.
//
//   GITHUB_TOKEN=... GH_USER=Omxrhack node scripts/spider-sense.mjs
//   node scripts/spider-sense.mjs --fixture raw.json      (sin red, para probar el diseño)
//   node scripts/spider-sense.mjs --save-raw raw.json     (guarda lo que trajo de la API)
//
// Variables: GH_USER (o GITHUB_REPOSITORY_OWNER), GITHUB_TOKEN, OUT_DIR (dist),
// SPIDER_TZ (America/Mazatlan), LANG_EXCLUDE (lista separada por comas).
// Si algo falla o no cuadra, sale con código 1 y no toca los SVG anteriores.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_TZ, computeStats, fetchRaw, todayIn } from './lib/data.mjs';
import { renderCalendar, renderSense } from './lib/render.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function writeAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

async function main() {
  const fixture = arg('--fixture');
  const saveRaw = arg('--save-raw');
  const outDir = process.env.OUT_DIR || 'dist';
  const tz = process.env.SPIDER_TZ || DEFAULT_TZ;
  const login = process.env.GH_USER || process.env.GITHUB_REPOSITORY_OWNER;
  const langExclude = process.env.LANG_EXCLUDE?.split(',').map((s) => s.trim()).filter(Boolean);

  let raw;
  if (fixture) {
    raw = JSON.parse(await readFile(fixture, 'utf8'));
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!login) throw new Error('Falta GH_USER o GITHUB_REPOSITORY_OWNER');
    if (!token) throw new Error('Falta GITHUB_TOKEN');
    raw = await fetchRaw(login, { token });
    const cc = raw.profile.contributionsCollection;
    console.log(`[spider-sense] ventana ${cc.startedAt} → ${cc.endedAt}`);
  }
  if (saveRaw) await writeFile(saveRaw, JSON.stringify(raw, null, 2));

  const today = arg('--today') || todayIn(tz);
  const stats = computeStats(raw, { today, langExclude });

  const files = {
    'spider-calendar-dark.svg': renderCalendar(stats, 'dark'),
    'spider-calendar-light.svg': renderCalendar(stats, 'light'),
    'spider-sense-dark.svg': renderSense(stats, 'dark'),
    'spider-sense-light.svg': renderSense(stats, 'light'),
  };
  // Primero se renderiza todo en memoria; solo si no hubo errores se escribe.
  await mkdir(outDir, { recursive: true });
  for (const [name, svg] of Object.entries(files)) await writeAtomic(join(outDir, name), svg);

  console.log(
    `[spider-sense] @${stats.login} · hoy ${stats.today} (${tz}) · ${stats.total} contribuciones · ` +
      `${stats.activeDays} días activos · racha actual ${stats.currentStreak}${stats.currentOpen ? '+' : ''} · ` +
      `más larga ${stats.longestStreak}${stats.longestOpen ? '+' : ''} · ${stats.repoCount} repos · ` +
      `lenguajes: ${stats.languages.map((l) => `${l.name} ${l.pct}%`).join(', ') || '—'}`,
  );
  console.log(`[spider-sense] escrito en ${outDir}/: ${Object.keys(files).join(', ')}`);
}

main().catch((err) => {
  console.error(`[spider-sense] ${err?.stack ?? err}`);
  process.exitCode = 1;
});
