// Събира мета билдове за ВСИЧКИ спекове и режими с една команда.
//
//   node pipeline/run-all.mjs                              → US, всички режими, всички спекове
//   node pipeline/run-all.mjs --regions us,eu
//   node pipeline/run-all.mjs --modes mplus,shuffle --specs mage-frost,priest-holy
//   node pipeline/run-all.mjs --maxPlayers 300             → по-бързо (таван на M+ извадката)
//
// Режими: mplus, shuffle, blitz, 2v2, 3v3, rbg
// Ако спрете скрипта (Ctrl+C), при следващо пускане той прескача спековете, обновени в последните
// --fresh часа (по подразбиране 12). С --force обновява всичко.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROOT, loadEnv, args, getJson, pool, log, writeOut, norm, bnet, bnetCharacter,
  aggregate, saveRaw, setBnetRate, blizzardToken, slimSpecs, slimEquip,
} from './lib.mjs';
import * as lib from './lib.mjs';

loadEnv();
const opt = args({
  regions: 'us', modes: 'mplus,shuffle,blitz,2v2,3v3,rbg', specs: 'all',
  season: 'season-mn-2', percentile: 5, maxPlayers: 0, periods: 4,
  pvpTop: 100, maxScan: 1500, fresh: 12, force: false, rate: 9.5, concurrency: 10,
});
setBnetRate(Number(opt.rate));
const MODES = String(opt.modes).split(',');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const RIO = 'https://raider.io/api/v1';
const rioKey = process.env.RAIDERIO_ACCESS_KEY ? `&access_key=${process.env.RAIDERIO_ACCESS_KEY}` : '';
const t0 = Date.now();
const elapsed = () => { const m = Math.round((Date.now() - t0) / 60000); return `${Math.floor(m / 60)}ч ${m % 60}м`; };

function isFresh(file) {
  if (opt.force) return false;
  const p = path.join(ROOT, 'data', file);
  return fs.existsSync(p) && Date.now() - fs.statSync(p).mtimeMs < opt.fresh * 36e5;
}

// Кеш на детайлите за играч в рамките на пускането (един герой може да е в няколко режима)
const detailCache = new Map();
async function details(region, players) {
  await pool(players, opt.concurrency, async (c) => {
    const k = `${region}/${c.realm}/${c.name}`.toLowerCase();
    let d = detailCache.get(k);
    if (!d) {
      const [sp, eq, st] = await Promise.all([
        c.specializations ? Promise.resolve(c.specializations) : bnetCharacter(region, c.realm, c.name, '/specializations'),
        bnetCharacter(region, c.realm, c.name, '/equipment'),
        bnetCharacter(region, c.realm, c.name, '/statistics'),
      ]);
      d = { specializations: c.specializations ? sp : slimSpecs(sp), equipment: slimEquip(eq), stats: lib.secondaryStats(st) };
      detailCache.set(k, d);
    }
    Object.assign(c, d);
  });
}

async function allSpecs(region) {
  const st = `namespace=static-${region}`;
  const idx = await bnet(region, `/data/wow/playable-class/index?${st}`);
  const out = [];
  for (const cls of idx.classes) {
    const d = await bnet(region, `/data/wow/playable-class/${cls.id}?${st}`);
    for (const sp of d.specializations) out.push({ classId: cls.id, specId: sp.id, className: cls.name, specName: sp.name, cls: slug(cls.name), spec: slug(sp.name) });
  }
  const want = opt.specs === 'all' ? null : new Set(String(opt.specs).split(','));
  return out.filter((s) => !want || want.has(`${s.cls}-${s.spec}`));
}

// ---------------- Mythic+ ----------------
async function runMplus(region, specs) {
  detailCache.clear();
  const todo = specs.filter((s) => !isFresh(`mplus/${s.cls}-${s.spec}-${region}.json`));
  log(`\n### M+ ${region.toUpperCase()}: ${todo.length} спека за обновяване (${specs.length - todo.length} са свежи)`);
  if (!todo.length) return;

  const ca = await getJson(`${RIO}/mythic-plus/cutoff-analysis?season=${opt.season}&region=${region}&category=specs&percentile=${opt.percentile}&density=false${rioKey}`, { label: 'raider.io' });
  const cut = new Map();
  for (const c of ca?.cohorts || []) {
    const p = c.percentiles?.find((x) => x.percentile === opt.percentile);
    if (p) cut.set(c.specId, { cutoff: p.cutoffScore, tail: p.tailSize, population: c.population });
  }

  // Едно обхождане на всички реалм ладъри → кандидати за всички спекове
  const dyn = `namespace=dynamic-${region}`;
  const realms = (await bnet(region, `/data/wow/connected-realm/index?${dyn}`)).connected_realms.map((x) => Number(x.href.match(/connected-realm\/(\d+)/)[1]));
  const curPeriod = (await bnet(region, `/data/wow/mythic-keystone/period/index?${dyn}`)).current_period.id;
  const periods = Array.from({ length: opt.periods }, (_, i) => curPeriod - i);
  const wantIds = new Set(todo.map((s) => s.specId));
  const bySpec = new Map([...wantIds].map((id) => [id, new Map()]));
  log(`Обхождам M+ ладъри: ${realms.length} реалма × ${periods.length} седмици...`);
  await pool(realms, opt.concurrency, async (rid) => {
    const idx = await bnet(region, `/data/wow/connected-realm/${rid}/mythic-leaderboard/index?${dyn}`);
    const dungeonIds = [...new Set((idx?.current_leaderboards || []).map((l) => l.id))];
    for (const did of dungeonIds) for (const per of periods) {
      const lb = await bnet(region, `/data/wow/connected-realm/${rid}/mythic-leaderboard/${did}/period/${per}?${dyn}`).catch(() => null);
      for (const g of lb?.leading_groups || []) for (const m of g.members || []) {
        const map = bySpec.get(m.specialization?.id); if (!map) continue;
        const k = `${m.profile?.realm?.slug}/${m.profile?.name}`.toLowerCase();
        const prev = map.get(k);
        if (!prev || g.keystone_level > prev.maxKey) map.set(k, { name: m.profile.name, realm: m.profile.realm.slug, maxKey: g.keystone_level });
      }
    }
  }, (d, t) => d % 20 === 0 || d === t ? log(`  реалми ${d}/${t} (${elapsed()})`) : null);

  let n = 0;
  for (const s of todo) {
    n++;
    const c = cut.get(s.specId);
    if (!c) { log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: няма cutoff от Raider.IO — пропускам`); continue; }
    const want = opt.maxPlayers ? Math.min(c.tail, opt.maxPlayers) : c.tail;
    const cands = [...bySpec.get(s.specId).values()].sort((a, b) => b.maxKey - a.maxKey);
    const scored = [];
    for (let i = 0; i < cands.length && scored.length < want; i += 100) {
      const res = await pool(cands.slice(i, i + 100), opt.concurrency, async (p) => {
        const mk = await bnetCharacter(region, p.realm, p.name, '/mythic-keystone-profile');
        const score = mk?.current_mythic_rating?.rating ?? 0;
        return score >= c.cutoff ? { ...p, score } : null;
      });
      for (const r of res) if (r) scored.push(r);
    }
    const sample = scored.sort((a, b) => b.score - a.score).slice(0, want);
    if (!sample.length) { log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: 0 играчи над прага — пропускам`); continue; }
    await details(region, sample);
    const agg = aggregate(sample, s.specId); delete agg.pvpTalents;
    const file = `${s.cls}-${s.spec}-${region}.json`;
    saveRaw(`mplus-${file}`, { ...s, region }, sample);
    writeOut('mplus', file, {
      meta: {
        mode: 'mythic-plus', class: s.cls, spec: s.spec, classId: s.classId, specId: s.specId, region, season: opt.season,
        method: `Топ ${opt.percentile}% по M+ score в спека (официален праг от Raider.IO)`,
        specPopulation: c.population, topPercentSize: c.tail, cutoffScore: c.cutoff,
        sampleSize: sample.length, coverage: Math.round((sample.length / c.tail) * 1000) / 10,
        scoreRange: [Math.round(sample.at(-1).score), Math.round(sample[0].score)],
        generatedAt: new Date().toISOString(), attribution: 'Data from Raider.IO (https://raider.io) and Blizzard Entertainment',
      },
      ...agg,
      players: sample.slice(0, 50).map((p) => ({ name: p.name, realm: p.realm, region, score: Math.round(p.score), maxKey: p.maxKey })),
    });
    log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: ${sample.length}/${c.tail} играчи · ${agg.heroTrees.map((h) => `${h.name} ${h.pct}%`).join(', ')} (${elapsed()}, ${lib.bnetCalls} заявки)`);
  }
}

// ---------------- PvP ----------------
async function runPvp(region, specs, bracket) {
  detailCache.clear();
  const todo = specs.filter((s) => !isFresh(`pvp/${s.cls}-${s.spec}-${bracket}-${region}.json`));
  log(`\n### PvP ${bracket} ${region.toUpperCase()}: ${todo.length} спека за обновяване`);
  if (!todo.length) return;
  const dyn = `namespace=dynamic-${region}`;
  const seasonId = (await bnet(region, `/data/wow/pvp-season/index?${dyn}`)).current_season.id;
  const names = (await bnet(region, `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/index?${dyn}`)).leaderboards.map((l) => l.name);
  const perSpec = ['shuffle', 'blitz'].includes(bracket);
  const ladder = async (name) => ((await bnet(region, `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/${name}?${dyn}`))?.entries || [])
    .sort((a, b) => a.rank - b.rank).slice(0, opt.maxScan)
    .map((e) => ({ name: e.character.name, realm: e.character.realm.slug, rating: e.rating, rank: e.rank }));
  const specOf = async (e) => {
    const k = `${region}/${e.realm}/${e.name}`.toLowerCase();
    if (detailCache.has(k)) return detailCache.get(k).specializations;
    return slimSpecs(await bnetCharacter(region, e.realm, e.name, '/specializations'));
  };

  // Отборни ладъри: един ладър за всички спекове → проверяваме спека на топ записите веднъж
  let shared = null;
  if (!perSpec) {
    const name = names.find((n) => n.toLowerCase() === bracket);
    if (!name) { log(`  Няма ладър ${bracket}`); return; }
    const entries = await ladder(name);
    log(`  Проверявам спека на ${entries.length} играчи от ${name}...`);
    const withSpec = await pool(entries, opt.concurrency, async (e) => ({ ...e, specializations: await specOf(e) }));
    shared = withSpec.filter((e) => e?.specializations);
  }

  let n = 0;
  for (const s of todo) {
    n++;
    let sample = [];
    if (perSpec) {
      const lbName = names.find((x) => norm(x) === norm(bracket) + norm(s.className) + norm(s.specName));
      if (!lbName) { log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: няма ладър`); continue; }
      const entries = await ladder(lbName);
      for (let i = 0; i < entries.length && sample.length < opt.pvpTop; i += 50) {
        const res = await pool(entries.slice(i, i + 50), opt.concurrency, async (e) => {
          const sp = await specOf(e);
          return sp?.active_specialization?.id === s.specId ? { ...e, specializations: sp } : null;
        });
        for (const r of res) if (r && sample.length < opt.pvpTop) sample.push(r);
      }
    } else {
      sample = shared.filter((e) => e.specializations.active_specialization?.id === s.specId).slice(0, opt.pvpTop).map((e) => ({ ...e }));
    }
    if (sample.length < 5) { log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: само ${sample.length} играчи — пропускам`); continue; }
    await details(region, sample);
    const agg = aggregate(sample, s.specId);
    const file = `${s.cls}-${s.spec}-${bracket}-${region}.json`;
    saveRaw(`pvp-${file}`, { ...s, region, bracket }, sample);
    const ratings = sample.map((x) => x.rating);
    writeOut('pvp', file, {
      meta: {
        mode: `pvp-${bracket}`, class: s.cls, spec: s.spec, classId: s.classId, specId: s.specId, region, seasonId, bracket,
        method: `Топ ${sample.length} ${s.specName} ${s.className} в ${bracket}`,
        sampleSize: sample.length, ratingRange: [Math.min(...ratings), Math.max(...ratings)],
        generatedAt: new Date().toISOString(), attribution: 'Data from Blizzard Entertainment',
      },
      ...agg,
      players: sample.slice(0, 50).map((p) => ({ name: p.name, realm: p.realm, rating: p.rating, rank: p.rank })),
    });
    log(`  [${n}/${todo.length}] ${s.specName} ${s.className}: ${sample.length} играчи · ${agg.heroTrees.map((h) => `${h.name} ${h.pct}%`).join(', ')} (${elapsed()})`);
  }
}

async function main() {
  if (!(await blizzardToken())) throw new Error('Липсват Blizzard ключове в .env');
  for (const region of String(opt.regions).split(',')) {
    const specs = await allSpecs(region);
    log(`\n===== ${region.toUpperCase()}: ${specs.length} спека · режими: ${MODES.join(', ')} =====`);
    if (MODES.includes('mplus')) await runMplus(region, specs);
    for (const b of ['shuffle', 'blitz', '2v2', '3v3', 'rbg']) if (MODES.includes(b)) await runPvp(region, specs, b);
  }
  log(`\nВсичко готово за ${elapsed()} (${lib.bnetCalls} заявки към Blizzard).`);
  if (fs.existsSync(path.join(ROOT, 'app'))) {
    execFileSync('node', [path.join(ROOT, 'pipeline', 'export-app-data.mjs')], { stdio: 'inherit' });
  }
}
main().catch((e) => { console.error('\nГРЕШКА:', e.message); process.exit(1); });
