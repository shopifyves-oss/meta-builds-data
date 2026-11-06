// Подготвя файловете за CDN (GitHub Pages) в public/v1/:
//   index.json            — списък спекове + обобщение по режим
//   specs/<class>-<spec>.json — всички режими за спека (с икони)
//   trees/<specId>.json   — разположение на дървото на талантите (с икони)
//   node pipeline/build-cdn.mjs [--region us]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, args, log } from './lib.mjs';

const opt = args({ region: 'us', out: 'public/v1', minSample: 10 });
const OUT = path.join(ROOT, opt.out);
const CACHE = path.join(ROOT, 'data', 'cache');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const media = readJson(path.join(CACHE, 'media.json'), { spell: {}, item: {}, itemQuality: {}, pvpTalentSpell: {}, spec: {}, cls: {} });
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
const sp = (id) => (id ? media.spell[id] || undefined : undefined);

// дървета
const trees = {};
const treeDir = path.join(CACHE, 'trees');
if (fs.existsSync(treeDir)) for (const f of fs.readdirSync(treeDir)) {
  const t = readJson(path.join(treeDir, f)); if (t) trees[t.specId] = t;
}
const slimNode = (n) => ({
  id: n.id, row: n.row, col: n.col, x: n.x, y: n.y, choice: n.choice || undefined, maxRank: n.maxRank,
  lockedBy: n.lockedBy?.length ? n.lockedBy : undefined,
  unlocks: n.unlocks?.length ? n.unlocks : undefined,
  entries: n.entries.map((e) => ({ id: e.talentId, name: e.name, icon: sp(e.spellId) })),
});
const heroIconFor = (specId, heroName) => {
  const h = trees[specId]?.hero?.find((x) => x.name === heroName);
  if (!h?.nodes?.length) return undefined;
  const top = [...h.nodes].sort((a, b) => (a.row ?? a.y ?? 0) - (b.row ?? b.y ?? 0))[0];
  return sp(top.entries[0]?.spellId);
};

function modeEntry(d) {
  const m = d.meta;
  const specId = m.specId;
  return {
    meta: {
      sampleSize: m.sampleSize, updated: m.rebuiltAt || m.generatedAt,
      ...(m.cutoffScore ? { percentile: 5, cutoffScore: Math.round(m.cutoffScore), specPopulation: m.specPopulation, topPercentSize: m.topPercentSize, scoreRange: m.scoreRange } : {}),
      ...(m.ratingRange ? { ratingRange: m.ratingRange } : {}),
    },
    builds: (d.builds || []).map((b) => ({
      heroTree: b.heroTree, heroIcon: heroIconFor(specId, b.heroTree), players: b.players, pct: b.pct, lowSample: !!b.lowSample,
      recommended: {
        importString: b.recommended.importString, fromPlayer: b.recommended.fromPlayer?.name,
        diff: b.recommended.diffFromConsensus, missing: b.recommended.missing, extra: b.recommended.extra,
        within2: b.recommended.playersWithin2Talents,
      },
      flex: b.flexTalents.map((t) => {
        const full = b.talents.find((x) => x.name === t.name && x.rank === t.rank && x.group === t.group);
        return { name: t.name, rank: t.rank, group: t.group, pct: r1(t.pct), icon: sp(full?.spellId) };
      }),
      talents: b.talents.map((t) => ({ id: t.talentId, name: t.name, rank: t.rank, group: t.group, pct: r1(t.pct), icon: sp(t.spellId) })),
      stats: b.stats && { order: b.stats.order, avg: b.stats.averageRating },
    })),
    pvpTalents: d.pvpTalents?.length ? d.pvpTalents.map((t) => ({ name: t.name, pct: r1(t.pct), icon: sp(media.pvpTalentSpell[t.talentId]) })) : undefined,
    stats: d.stats && { order: d.stats.order, avg: d.stats.averageRating },
    gear: Object.fromEntries(Object.entries(d.gear || {}).map(([s, items]) => [s, items.map((i) => ({
      name: i.name, id: i.itemId, pct: r1(i.pct), icon: media.item[i.itemId] || undefined,
      quality: i.quality || media.itemQuality[i.itemId] || undefined,
    }))])),
    enchants: Object.fromEntries(Object.entries(d.enchants || {}).map(([s, list]) => [s, list.map((e) => ({ name: e.name, pct: r1(e.pct) }))])),
    gems: (d.gems || []).map((g) => ({ name: g.name, perPlayer: g.perPlayer, icon: media.item[g.gemId] || undefined })),
    players: (d.players || []).slice(0, 50).map((p) => ({ name: p.name, realm: p.realm, value: Math.round(p.score ?? p.rating), maxKey: p.maxKey })),
  };
}

const specs = {};
let skipped = 0;
for (const mode of ['mplus', 'pvp']) {
  const dir = path.join(ROOT, 'data', mode);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = readJson(path.join(dir, f));
    if (!d?.builds || d.meta.region !== opt.region) continue;
    if (d.meta.sampleSize < opt.minSample) { skipped++; continue; }
    const id = `${d.meta.class}-${d.meta.spec}`;
    const key = mode === 'mplus' ? 'mplus' : d.meta.mode;
    specs[id] ||= { id, class: d.meta.class, spec: d.meta.spec, classId: d.meta.classId, specId: d.meta.specId, modes: {} };
    specs[id].modes[key] = modeEntry(d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'specs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'trees'), { recursive: true });
let bytes = 0;
const write = (rel, obj) => { const s = JSON.stringify(obj); fs.writeFileSync(path.join(OUT, rel), s); bytes += s.length; };

const index = { version: 1, generatedAt: new Date().toISOString(), region: opt.region, specs: [] };
for (const s of Object.values(specs)) {
  const icon = media.spec[s.specId] || undefined;
  write(`specs/${s.id}.json`, { ...s, icon, classIcon: media.cls[s.classId] || undefined, hasTree: !!trees[s.specId] });
  index.specs.push({
    id: s.id, class: s.class, spec: s.spec, specId: s.specId, classId: s.classId, icon, classIcon: media.cls[s.classId] || undefined,
    modes: Object.fromEntries(Object.entries(s.modes).map(([k, m]) => [k, { sampleSize: m.meta.sampleSize, updated: m.meta.updated, heroTrees: m.builds.map((b) => ({ name: b.heroTree, pct: b.pct, icon: b.heroIcon })) }])),
  });
}
write('index.json', index);
for (const t of Object.values(trees)) {
  const heroIds = new Set(t.hero.flatMap((h) => h.nodes.map((n) => n.id)));
  // без празния възел за избор на hero tree и без hero възлите, които Blizzard добавя и в дървото на спека/класа
  const ok = (n) => n.entries?.length && !heroIds.has(n.id);
  const okHero = (n) => n.entries?.length;
  write(`trees/${t.specId}.json`, { specId: t.specId, class: t.class.filter(ok).map(slimNode), spec: t.spec.filter(ok).map(slimNode), hero: t.hero.map((h) => ({ id: h.id, name: h.name, nodes: h.nodes.filter(okHero).map(slimNode) })) });
}
fs.writeFileSync(path.join(ROOT, 'public', 'index.html'), '<!doctype html><meta charset="utf-8"><title>Meta Builds data</title><p>Meta Builds data CDN. Data from Raider.IO and Blizzard Entertainment. See <a href="v1/index.json">v1/index.json</a>.</p>');
log(`CDN: ${Object.keys(specs).length} спека, ${Object.keys(trees).length} дървета, ${Math.round(bytes / 1024)} KB общо (скрити малки извадки: ${skipped}) → ${path.relative(ROOT, OUT)}`);
