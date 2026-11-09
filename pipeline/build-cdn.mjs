// Подготвя файловете за CDN (GitHub Pages) в public/v1/:
//   index.json            — списък спекове + обобщение по режим
//   specs/<class>-<spec>.json — всички режими за спека (с икони)
//   trees/<specId>.json   — разположение на дървото на талантите (с икони)
//   node pipeline/build-cdn.mjs [--region us]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, args, log } from './lib.mjs';
import { decodeLoadout } from './talent-string.mjs';

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
    enchants: Object.fromEntries(Object.entries(d.enchants || {}).map(([s, list]) => [s, list.map((e) => ({ name: e.name, id: e.enchantId, pct: r1(e.pct) }))])),
    weaponBuffs: d.weaponBuffs || [],
    gems: (d.gems || []).map((g) => ({ name: g.name, id: g.gemId, perPlayer: g.perPlayer, icon: media.item[g.gemId] || undefined })),
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
    if (key === 'mplus') {
      const rot = readJson(path.join(ROOT, 'data', 'rotations', `${id}.json`));
      if (rot?.core) specs[id].modes[key].rotation = { fights: rot.fights, avgKey: rot.avgKey, updated: rot.generatedAt, core: rot.core, cooldowns: rot.cooldowns, utility: rot.utility || [], opener: rot.opener,
        dungeons: (rot.dungeons || []).map((d) => ({ ...d, more: d.more.map((x) => ({ ...x, icon: sp(x.spellId) })), less: d.less.map((x) => ({ ...x, icon: sp(x.spellId) })) })),
        consumables: rot.consumables || null,
        byHero: Object.fromEntries(Object.entries(rot.byHero || {}).map(([h, a]) => [h, { fights: a.fights, avgKey: a.avgKey, core: a.core, cooldowns: a.cooldowns, utility: a.utility || [], opener: a.opener }])) };
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'specs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'trees'), { recursive: true });
let bytes = 0;
const write = (rel, obj) => { const s = JSON.stringify(obj); fs.writeFileSync(path.join(OUT, rel), s); bytes += s.length; };

// Кратък подпис на мета билда (най-популярния hero tree + препоръчания string) → приложението разбира кога метата се е сменила
const sig = (b) => { if (!b) return undefined; const core = b.talents.filter((t) => t.pct >= 50).map((t) => `${t.id}:${t.rank}`).sort().join(','); const str = `${b.heroTree}|${core}`; let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const index = { version: 1, generatedAt: new Date().toISOString(), region: opt.region, specs: [] };
for (const s of Object.values(specs)) {
  const icon = media.spec[s.specId] || undefined;
  write(`specs/${s.id}.json`, { ...s, icon, classIcon: media.cls[s.classId] || undefined, hasTree: !!trees[s.specId] });
  index.specs.push({
    id: s.id, class: s.class, spec: s.spec, specId: s.specId, classId: s.classId, icon, classIcon: media.cls[s.classId] || undefined,
    modes: Object.fromEntries(Object.entries(s.modes).map(([k, m]) => [k, { sampleSize: m.meta.sampleSize, updated: m.meta.updated, sig: sig(m.builds[0]), heroTrees: m.builds.map((b) => ({ name: b.heroTree, pct: b.pct, icon: b.heroIcon })) }])),
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
// ---- Пълни дървета на класовете (за декодиране на import string) ----
function guessHero(d, selNodes, heroSel) {
  const score = {};
  for (const id of selNodes) { const pk = d.picked.get(id); const v = pk && heroSel[`${id}:${pk.entry}`]; if (v) for (const [h, c] of Object.entries(v)) score[h] = (score[h] || 0) + c; }
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0];
}
function guessHeroByCount(d, heroTrees) {
  let best, bestN = -1;
  for (const h of heroTrees) { const n = h.nodes.filter((x) => d.picked.has(x.id)).length; if (n > bestN) { bestN = n; best = h.name; } }
  return best;
}
fs.mkdirSync(path.join(OUT, 'classes'), { recursive: true });
const byClass = new Map();
for (const s of Object.values(specs)) { if (!byClass.has(s.classId)) byClass.set(s.classId, []); byClass.get(s.classId).push(s); }
for (const [classId, list] of byClass) {
  const nodeMap = new Map();
  for (const sp of list) {
    const t = trees[sp.specId]; if (!t) continue;
    for (const n of [...t.class, ...t.spec, ...t.hero.flatMap((h) => h.nodes)]) {
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, { id: n.id, maxRank: n.maxRank, entries: n.entries.map((e) => e.talentId) });
    }
  }
  const nodes = [...nodeMap.values()].sort((a, b) => a.id - b.id);
  const selNodes = nodes.filter((n) => !n.entries.length).map((n) => n.id);
  const specInfo = {};
  for (const sp of list) {
    // Учим от суровите данни: кой възел/избор = кой hero tree и кои таланти никога не са в string-а
    const rawFiles = fs.existsSync(path.join(ROOT, 'data', 'raw')) ? fs.readdirSync(path.join(ROOT, 'data', 'raw')).filter((f) => f.includes(`-${sp.class}-${sp.spec}-`)) : [];
    const heroVotes = {}, absent = new Map(), holders = new Map(); let N = 0;
    for (const f of rawFiles) {
      const raw = readJson(path.join(ROOT, 'data', 'raw', f)); if (!raw) continue;
      for (const p of raw.players) {
        const lo = p.specializations?.specializations?.find((x) => x.specialization?.id === sp.specId)?.loadouts?.[0];
        if (!lo?.talent_loadout_code) continue;
        let d; try { d = decodeLoadout(lo.talent_loadout_code, nodes); } catch { continue; }
        if (d.specId !== sp.specId) continue;
        N++;
        const hero = lo.selected_hero_talent_tree?.name;
        for (const id of selNodes) { const pk = d.picked.get(id); if (pk && hero) { const k = `${id}:${pk.entry}`; (heroVotes[k] ||= {})[hero] = (heroVotes[k][hero] || 0) + 1; } }
        for (const k of ['selected_class_talents', 'selected_spec_talents', 'selected_hero_talents']) for (const tl of lo[k] || []) {
          const id = tl.tooltip?.talent?.id; if (!id) continue;
          holders.set(id, (holders.get(id) || 0) + 1);
          if (!d.talents.has(id)) absent.set(id, (absent.get(id) || 0) + 1);
        }
      }
    }
    // heroSel: "възел:избор" → {hero: брой}. Приложението сумира гласовете на избраните възли.
    const heroSel = heroVotes;
    // Проверка на точността върху същите данни
    const heroTrees = (trees[sp.specId]?.hero || []).filter((h) => (sp.modes ? Object.values(sp.modes).some((m) => m.builds.some((b) => b.heroTree === h.name)) : true));
    let hit = 0, hit2 = 0, tot = 0;
    for (const f of rawFiles) {
      const raw = readJson(path.join(ROOT, 'data', 'raw', f)); if (!raw) continue;
      for (const p of raw.players) {
        const lo = p.specializations?.specializations?.find((x) => x.specialization?.id === sp.specId)?.loadouts?.[0];
        if (!lo?.talent_loadout_code || !lo.selected_hero_talent_tree) continue;
        let d; try { d = decodeLoadout(lo.talent_loadout_code, nodes); } catch { continue; }
        tot++; if (guessHero(d, selNodes, heroSel) === lo.selected_hero_talent_tree.name) hit++;
        if (guessHeroByCount(d, heroTrees) === lo.selected_hero_talent_tree.name) hit2++;
      }
    }
    const heroMethod = hit2 > hit ? 'count' : 'sel';
    const acc = tot ? Math.max(hit, hit2) / tot : null;
    if (acc !== null && acc < 0.97) log(`  ! ${sp.class}-${sp.spec}: hero tree от string-а е познат в ${Math.round(acc * 100)}% (sel ${Math.round(hit / tot * 100)}%, count ${Math.round(hit2 / tot * 100)}%)`);
    specInfo[sp.specId] = { heroSel, heroMethod, heroTrees: heroTrees.map((h) => h.name), notInString: [...absent].filter(([id, c]) => c / (holders.get(id) || 1) >= 0.05 && c >= 3).map(([id]) => id), sample: N, heroAccuracy: acc === null ? null : Math.round(acc * 1000) / 10 };
  }
  write(`classes/${classId}.json`, { classId, nodes: nodes.map((n) => [n.id, n.maxRank, n.entries]), specs: specInfo });
}

fs.writeFileSync(path.join(ROOT, 'public', 'index.html'), '<!doctype html><meta charset="utf-8"><title>Meta Builds data</title><p>Meta Builds data CDN. Data from Raider.IO and Blizzard Entertainment. See <a href="v1/index.json">v1/index.json</a>.</p>');
log(`CDN: ${Object.keys(specs).length} спека, ${Object.keys(trees).length} дървета, ${Math.round(bytes / 1024)} KB общо (скрити малки извадки: ${skipped}) → ${path.relative(ROOT, OUT)}`);
