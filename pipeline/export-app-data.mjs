// Събира резултатите от data/mplus и data/pvp в един компактен файл за мобилното приложение.
//   node pipeline/export-app-data.mjs            → app/src/data/specs.json
//   node pipeline/export-app-data.mjs --out mobile/src/data/specs.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = path.join(ROOT, outArg > -1 ? process.argv[outArg + 1] : 'app/src/data/specs.json');
const regArg = process.argv.indexOf('--region');
const REGION = regArg > -1 ? process.argv[regArg + 1] : 'us';

const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
const slimBuild = (b) => ({
  heroTree: b.heroTree, players: b.players, pct: b.pct, lowSample: !!b.lowSample,
  recommended: {
    importString: b.recommended.importString,
    fromPlayer: b.recommended.fromPlayer?.name,
    diff: b.recommended.diffFromConsensus,
    missing: b.recommended.missing, extra: b.recommended.extra,
    within2: b.recommended.playersWithin2Talents,
  },
  flex: b.flexTalents.map((t) => ({ name: t.name, rank: t.rank, group: t.group, pct: r1(t.pct) })),
  talents: b.talents.map((t) => ({ id: t.talentId, name: t.name, rank: t.rank, group: t.group, pct: r1(t.pct) })),
  stats: b.stats && { order: b.stats.order, avg: b.stats.averageRating },
});

function modeEntry(d) {
  const m = d.meta;
  return {
    meta: {
      region: m.region, sampleSize: m.sampleSize, generatedAt: m.rebuiltAt || m.generatedAt,
      ...(m.cutoffScore ? { percentile: 5, cutoffScore: Math.round(m.cutoffScore), specPopulation: m.specPopulation, topPercentSize: m.topPercentSize, coverage: m.coverage, scoreRange: m.scoreRange } : {}),
      ...(m.ratingRange ? { ratingRange: m.ratingRange, leaderboard: m.leaderboard } : {}),
    },
    builds: (d.builds || []).map(slimBuild),
    pvpTalents: d.pvpTalents?.length ? d.pvpTalents.map((t) => ({ name: t.name, pct: r1(t.pct) })) : undefined,
    stats: d.stats && { order: d.stats.order, avg: d.stats.averageRating },
    gear: Object.fromEntries(Object.entries(d.gear || {}).map(([s, items]) => [s, items.map((i) => ({ name: i.name, id: i.itemId, pct: r1(i.pct) }))])),
    enchants: Object.fromEntries(Object.entries(d.enchants || {}).map(([s, list]) => [s, list.map((e) => ({ name: e.name, pct: r1(e.pct) }))])),
    gems: (d.gems || []).map((g) => ({ name: g.name, perPlayer: g.perPlayer })),
    players: (d.players || []).slice(0, 50).map((p) => ({ name: p.name, realm: p.realm, value: Math.round(p.score ?? p.rating), maxKey: p.maxKey })),
  };
}

const MIN_SAMPLE = 10; // режими с по-малко играчи не се показват
const skipped = [];
const specs = {};
for (const mode of ['mplus', 'pvp']) {
  const dir = path.join(ROOT, 'data', mode);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!d.builds) { console.log(`пропускам ${f} (стар формат — пусни rebuild.mjs)`); continue; }
    if (d.meta.region !== REGION) continue;
    if (d.meta.sampleSize < MIN_SAMPLE) { skipped.push(`${d.meta.class}-${d.meta.spec} ${d.meta.mode} (${d.meta.sampleSize})`); continue; }
    const id = `${d.meta.class}-${d.meta.spec}`;
    const key = mode === 'mplus' ? 'mplus' : d.meta.mode; // 'pvp-shuffle', 'pvp-3v3' ...
    specs[id] ||= { id, class: d.meta.class, spec: d.meta.spec, modes: {} };
    specs[id].modes[key] = modeEntry(d);
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ exportedAt: new Date().toISOString(), specs }));
console.log(`Записах ${Object.keys(specs).length} спека → ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
const nModes = Object.values(specs).reduce((n, s) => n + Object.keys(s.modes).length, 0);
console.log(`  режими общо: ${nModes}; скрити заради < ${MIN_SAMPLE} играчи: ${skipped.length}${skipped.length ? ' — ' + skipped.join(', ') : ''}`);
