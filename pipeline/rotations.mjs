// Ротации на топ играчите в Mythic+ от Warcraft Logs (API v2, GraphQL).
//   node pipeline/rotations.mjs --probe              → тест: проверява формата, записва data/cache/wcl-probe.json
//   node pipeline/rotations.mjs                      → всички спекове
//   node pipeline/rotations.mjs --specs mage-frost   → само един спек
// Нужни в .env: WCL_CLIENT_ID, WCL_CLIENT_SECRET (https://www.warcraftlogs.com/api/clients/)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, args, log, sleep, writeOut } from './lib.mjs';
import { CLASS_SPECS } from './wcl-specs.mjs';

loadEnv();
const opt = args({ specs: 'all', perDungeon: 3, maxFights: 20, talentLogs: 10, maxMinutes: 85, probe: false, minPoints: 300 });
const T0 = Date.now();
const timeUp = () => (Date.now() - T0) / 60000 > opt.maxMinutes;
const CACHE = path.join(ROOT, 'data', 'cache', 'wcl');
fs.mkdirSync(CACHE, { recursive: true });

// ---------- GraphQL ----------
let token = null, pointsLeft = Infinity;
async function getToken() {
  const id = process.env.WCL_CLIENT_ID, secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Липсват WCL_CLIENT_ID / WCL_CLIENT_SECRET в .env');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id.trim()}:${secret.trim()}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`WCL token: HTTP ${res.status} — провери WCL_CLIENT_ID / WCL_CLIENT_SECRET`);
  token = (await res.json()).access_token;
}
async function gql(query, variables = {}) {
  if (!token) await getToken();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query + '\n', variables }),
    });
    if (res.status === 429) { log('  WCL лимит — чакам 60s'); await sleep(60000); continue; }
    if (res.status >= 500) { await sleep(2000 * attempt); continue; }
    const j = await res.json();
    if (j.errors?.length) throw new Error('WCL: ' + j.errors.map((e) => e.message).join('; '));
    return j.data;
  }
  throw new Error('WCL: твърде много неуспешни опити');
}
async function checkPoints() {
  const d = await gql(`{ rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }`);
  const r = d.rateLimitData;
  pointsLeft = r.limitPerHour - r.pointsSpentThisHour;
  if (pointsLeft < opt.minPoints) { log(`  WCL точки: остават ${Math.round(pointsLeft)} — чакам ${r.pointsResetIn}s до нулиране`); await sleep((r.pointsResetIn + 5) * 1000); pointsLeft = r.limitPerHour; }
  return r;
}

// ---------- Сезонът на M+ ----------
async function mplusZone() {
  const d = await gql(`{ worldData { expansions { id name zones { id name frozen encounters { id name } } } } }`);
  const zones = d.worldData.expansions.flatMap((e) => e.zones.map((z) => ({ ...z, expansion: e.name, expansionId: e.id })));
  const mp = zones.filter((z) => /mythic\+/i.test(z.name) && !z.frozen).sort((a, b) => b.id - a.id);
  return { zone: mp[0], all: zones };
}

// ---------- Един бой: кастове на играча ----------
async function fightCasts(code, fightID, playerName) {
  const file = path.join(CACHE, `${code}-${fightID}-${playerName}.json`);
  if (fs.existsSync(file)) { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.talentNodes) return c; }
  const meta = await gql(`query($code: String!, $f: [Int]) { reportData { report(code: $code) {
    fights(fightIDs: $f) { id startTime endTime keystoneLevel }
    masterData { actors(type: "Player") { id name } abilities { gameID name icon type } }
    playerDetails(fightIDs: $f, includeCombatantInfo: true) } } }`, { code, f: [fightID] });
  const rep = meta.reportData.report;
  const fight = rep.fights[0];
  const actor = rep.masterData.actors.find((a) => a.name === playerName);
  if (!fight || !actor) return null;
  const casts = [];
  let start = fight.startTime;
  while (start != null) {
    const ev = await gql(`query($code: String!, $f: [Int], $s: Int, $st: Float, $en: Float) { reportData { report(code: $code) {
      events(fightIDs: $f, sourceID: $s, dataType: Casts, startTime: $st, endTime: $en, limit: 10000) { data nextPageTimestamp } } } }`,
      { code, f: [fightID], s: actor.id, st: start, en: fight.endTime });
    const e = ev.reportData.report.events;
    for (const x of e.data || []) if (x.type === 'cast' && x.sourceID === actor.id) casts.push([Math.round((x.timestamp - fight.startTime) / 100) / 10, x.abilityGameID]);
    start = e.nextPageTimestamp ?? null;
  }
  const used = new Set(casts.map((c) => c[1]));
  const abilities = Object.fromEntries(rep.masterData.abilities.filter((a) => used.has(a.gameID)).map((a) => [a.gameID, { name: a.name, icon: (a.icon || '').replace(/\.(jpg|png)$/, '') }]));
  const pd = rep.playerDetails?.data?.playerDetails || {};
  const me = [...(pd.tanks || []), ...(pd.healers || []), ...(pd.dps || [])].find((x) => x.name === playerName);
  const talentNodes = (me?.combatantInfo?.talentTree || []).map((t) => t.nodeID).filter(Boolean);
  const out = { durationSec: Math.round((fight.endTime - fight.startTime) / 1000), keyLevel: fight.keystoneLevel, casts, abilities, talentNodes, potionUse: me?.potionUse ?? null, healthstoneUse: me?.healthstoneUse ?? null };
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// ---------- Таланти на играч в лог (само playerDetails, без кастове) ----------
async function fightTalents(code, fightID, playerName) {
  const castFile = path.join(CACHE, `${code}-${fightID}-${playerName}.json`);
  if (fs.existsSync(castFile)) { const c = JSON.parse(fs.readFileSync(castFile, 'utf8')); if (c.talentNodes) return c; }
  const file = path.join(CACHE, `pd-${code}-${fightID}-${playerName}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = await gql(`query($code: String!, $f: [Int]) { reportData { report(code: $code) { playerDetails(fightIDs: $f, includeCombatantInfo: true) } } }`, { code, f: [fightID] });
  const pd = d.reportData?.report?.playerDetails?.data?.playerDetails || {};
  const me = [...(pd.tanks || []), ...(pd.healers || []), ...(pd.dps || [])].find((x) => x.name === playerName);
  const out = { talentNodes: (me?.combatantInfo?.talentTree || []).map((t) => t.nodeID).filter(Boolean), potionUse: me?.potionUse ?? null, healthstoneUse: me?.healthstoneUse ?? null };
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// Таланти по подземие: колко често се взима всеки възел тук спрямо всички подземия
function dungeonTalents(byDungeon, specSlug) {
  const tree = treeFor(specSlug);
  if (!tree) return [];
  const heroIds = new Set(tree.hero.flatMap((h) => h.nodes.map((n) => n.id)));
  const nodes = [...tree.class, ...tree.spec].filter((n) => n.entries?.length && !heroIds.has(n.id));
  const all = Object.values(byDungeon).flat();
  if (all.length < 10) return [];
  const rate = (logs, id) => logs.filter((l) => l.talentNodes.includes(id)).length / logs.length;
  const out = [];
  for (const [dungeon, logs] of Object.entries(byDungeon)) {
    if (logs.length < 5) continue;
    const diffs = nodes.map((n) => ({ nodeId: n.id, name: n.entries.map((e) => e.name).join(' / '), spellId: n.entries[0]?.spellId, here: rate(logs, n.id), overall: rate(all, n.id) }))
      .map((x) => ({ ...x, delta: x.here - x.overall }));
    const pick = (arr) => arr.slice(0, 6).map((x) => ({ nodeId: x.nodeId, name: x.name, spellId: x.spellId, here: Math.round(x.here * 100), overall: Math.round(x.overall * 100) }));
    out.push({ dungeon, logs: logs.length,
      more: pick(diffs.filter((x) => x.delta >= 0.2).sort((a, b) => b.delta - a.delta)),
      less: pick(diffs.filter((x) => x.delta <= -0.2).sort((a, b) => a.delta - b.delta)) });
  }
  return out;
}

// Консумативи от логовете с кастове
function consumables(fights) {
  const N = fights.length; if (!N) return null;
  const pots = new Map(), heal = new Map();
  for (const f of fights) {
    const seen = new Map();
    for (const [, id] of f.casts) { const a = f.abilities[id]; if (!a || !/potion|healthstone/i.test(a.name)) continue; seen.set(a.name, { n: (seen.get(a.name)?.n || 0) + 1, icon: a.icon }); }
    for (const [name, v] of seen) { const m = /healing|health/i.test(name) ? heal : pots; const e = m.get(name) || { name, icon: v.icon, runs: 0, uses: 0 }; e.runs++; e.uses += v.n; m.set(name, e); }
  }
  const fmt = (m) => [...m.values()].sort((a, b) => b.runs - a.runs).slice(0, 3).map((e) => ({ name: e.name, icon: e.icon, usage: Math.round((e.runs / N) * 100), perRun: Math.round((e.uses / e.runs) * 10) / 10 }));
  const avg = (k) => { const v = fights.map((f) => f[k]).filter((x) => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  return { combatPotions: fmt(pots), healing: fmt(heal), potionsPerRun: avg('potionUse'), healthstonesPerRun: avg('healthstoneUse') };
}

// ---------- Агрегиране ----------
const IGNORE = new Set([1, 6603, 75, 5019]); // авто атаки / wand / shoot
// Бъфове, пускани преди боя — не са част от ротацията
const BUFFS = /^(arcane intellect|battle shout|power word: fortitude|mark of the wild|blessing of the bronze|skyfury|devotion aura|retribution aura|concentration aura|crusader aura|windfury totem|.*flask.*|.*augment rune.*|.*food.*|.*feast.*|summon water elemental|summon felhunter|summon imp|summon voidwalker|summon felguard|summon succubus|call pet.*|raise dead|summon demonic tyrant_never)$/i;
// Помощни умения: прекъсвания, lust, движение, защитни — показват се отделно, не са част от ротацията
const UTILITY = /^(counterspell|kick|wind shear|pummel|mind freeze|rebuke|skull bash|spear hand strike|muzzle|counter shot|quell|disrupt|solar beam|silence|spell lock|axe toss|time warp|bloodlust|heroism|primal rage|fury of the aspects|shimmer|blink|greater invisibility|invisibility|ice block|ice barrier|mirror image|alter time|prismatic barrier|blazing barrier|ice cold|spellsteal|remove curse|dispel magic|purify|cleanse|detox|nature's cure|remove corruption|soothe|tranquilizing shot|purge|arcane torrent|shadowmeld|stoneform|fireblood|war stomp|quaking palm|rocket barrage|bag of tricks|light's judgment|arcane pulse|ancestral call|berserking|blood fury|will to survive|every man for himself|gift of the naaru|cannibalize|darkflight|escape artist|hyper organic light originator|haymaker|regeneratin'|rocket jump|healthstone|.*potion.*|.*healing.*potion.*|algari healing potion|death's advance|anti-magic shell|anti-magic zone|icebound fortitude|lichborne|blur|netherwalk|darkness|fel rush|vengeful retreat|barkskin|survival instincts|dash|stampeding roar|wild charge|obsidian scales|renewing blaze|hover|rescue|aspect of the turtle|exhilaration|feign death|disengage|fortifying brew|diffuse magic|roll|chi torpedo|transcendence|transcendence: transfer|divine shield|divine protection|blessing of freedom|blessing of protection|lay on hands|desperate prayer|fade|dispersion|vanish|cloak of shadows|evasion|feint|sprint|crimson vial|astral shift|spirit walk|ghost wolf|unending resolve|dark pact|demonic gateway|burning rush|rallying cry|defensive stance|spell reflection|heroic leap|charge|intervene|ignore pain|die by the sword|enraged regeneration|bitter immunity)$/i;
export function aggregate(input) {
  // Еднакви имена → едно ID; махаме авто атаки и бъфове
  const fights = input.map((f) => {
    const byName = new Map(), abilities = {};
    for (const [id, a] of Object.entries(f.abilities)) { if (!byName.has(a.name)) { byName.set(a.name, Number(id)); abilities[id] = a; } }
    const canon = (id) => byName.get(f.abilities[id]?.name) ?? id;
    const casts = f.casts.map(([t, id]) => [t, canon(id)]).filter(([, id]) => !IGNORE.has(id) && !BUFFS.test(f.abilities[id]?.name || ''));
    return { ...f, casts, abilities };
  });
  const N = fights.length;
  const names = {};
  for (const f of fights) Object.assign(names, f.abilities);
  const per = new Map(); // id → [cpm на бой]
  for (const f of fights) {
    const min = f.durationSec / 60, counts = new Map();
    for (const [, id] of f.casts) if (!IGNORE.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, c] of counts) { if (!per.has(id)) per.set(id, []); per.get(id).push({ cpm: c / min, first: f.casts.find((x) => x[1] === id)[0] }); }
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const abilities = [...per].map(([id, arr]) => ({
    id: Number(id), name: names[id]?.name ?? `Spell ${id}`, icon: names[id]?.icon,
    usage: Math.round((arr.length / N) * 100), cpm: Math.round(median(arr.map((x) => x.cpm)) * 100) / 100,
    firstUse: Math.round(median(arr.map((x) => x.first))),
  })).filter((a) => a.usage >= 30).sort((a, b) => b.cpm - a.cpm);
  const utility = abilities.filter((a) => UTILITY.test(a.name)).slice(0, 8);
  const rotational = abilities.filter((a) => !UTILITY.test(a.name));
  // Opener: първите 15 каста — най-честата магия на всяка позиция
  const opener = [];
  for (let i = 0; i < 15; i++) {
    const c = new Map();
    for (const f of fights) { const seq = f.casts.filter((x) => !IGNORE.has(x[1]) && !UTILITY.test(f.abilities[x[1]]?.name || '')); if (seq[i]) c.set(seq[i][1], (c.get(seq[i][1]) || 0) + 1); }
    const best = [...c].sort((a, b) => b[1] - a[1])[0];
    if (best) opener.push({ id: best[0], name: names[best[0]]?.name, icon: names[best[0]]?.icon, agree: Math.round((best[1] / N) * 100) });
  }
  // Големи cooldown-и: рядко пускани, но от повечето играчи
  const cooldowns = rotational.filter((a) => a.cpm > 0.03 && a.cpm <= 0.75 && a.usage >= 60)
    .map((a) => ({ ...a, per5min: Math.round(a.cpm * 5 * 10) / 10 })).sort((a, b) => a.cpm - b.cpm).slice(0, 8);
  const core = rotational.filter((a) => a.cpm > 0.75).slice(0, 14);
  return { fights: N, avgKey: Math.round(fights.reduce((s, f) => s + (f.keyLevel || 0), 0) / N), core, cooldowns, utility, opener };
}

function treeFor(specSlug) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mplus', `${specSlug}-us.json`), 'utf8')).meta;
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'trees', `${meta.specId}.json`), 'utf8'));
  } catch { return null; }
}
// Hero trees на спека (възли) от кеша на дърветата
function heroTreesFor(specSlug) {
  const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mplus', `${specSlug}-us.json`), 'utf8')).meta; } catch { return null; } })();
  if (!meta?.specId) return [];
  try {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'trees', `${meta.specId}.json`), 'utf8'));
    return t.hero.map((h) => ({ name: h.name, nodes: h.nodes.map((n) => n.id) }));
  } catch { return []; }
}

// ---------- Главна функция ----------
async function main() {
  await getToken();
  const rl = await checkPoints();
  log(`WCL: лимит ${rl.limitPerHour} точки/час, похарчени ${Math.round(rl.pointsSpentThisHour)}`);
  const { zone, all } = await mplusZone();
  if (!zone) { log('Не намерих M+ зона. Зони:', all.slice(-10).map((z) => `${z.id}:${z.name}`).join(', ')); return; }
  log(`M+ зона: ${zone.name} (${zone.id}), подземия: ${zone.encounters.map((e) => e.name).join(', ')}`);

  let specs = CLASS_SPECS;
  if (opt.probe) specs = specs.filter((s) => s.id === 'mage-frost');
  else if (opt.specs !== 'all') { const want = new Set(String(opt.specs).split(',')); specs = specs.filter((s) => want.has(s.id)); }

  for (const s of specs) {
    if (timeUp()) { log(`  Времето изтече — останалите спекове при следващото пускане (логовете са в кеша)`); break; }
    const picks = [], talentPicks = [];
    for (const enc of zone.encounters) {
      const d = await gql(`query($id: Int!, $c: String, $s: String) { worldData { encounter(id: $id) { characterRankings(className: $c, specName: $s) } } }`,
        { id: enc.id, c: s.wclClass, s: s.wclSpec });
      const ranks = d.worldData.encounter?.characterRankings?.rankings || [];
      if (opt.probe && !picks.length) fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'wcl-probe.json'), JSON.stringify({ zone, sampleRankings: ranks.slice(0, 3) }, null, 1));
      for (const r of ranks.slice(0, opt.perDungeon)) if (r.report?.code) picks.push({ code: r.report.code, fightID: r.report.fightID, name: r.name, dungeon: enc.name });
      for (const r of ranks.slice(0, opt.talentLogs)) if (r.report?.code) talentPicks.push({ code: r.report.code, fightID: r.report.fightID, name: r.name, dungeon: enc.name });
    }
    const fights = [];
    for (const p of picks.slice(0, opt.maxFights)) {
      try { if (pointsLeft < opt.minPoints) await checkPoints(); const f = await fightCasts(p.code, p.fightID, p.name); if (f?.casts.length) fights.push({ ...f, player: p.name, dungeon: p.dungeon }); }
      catch (e) { log(`  ! ${p.code}/${p.fightID}: ${e.message.split('\n')[0]}`); }
      if (opt.probe && fights.length) {
        const pr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'wcl-probe.json'), 'utf8'));
        pr.sampleFight = { ...fights[0], casts: fights[0].casts.slice(0, 30) };
        fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'wcl-probe.json'), JSON.stringify(pr, null, 1));
        log(`Тест OK: ${fights[0].player}, ${fights[0].dungeon} +${fights[0].keyLevel}, ${fights[0].casts.length} каста за ${fights[0].durationSec}s`);
        return;
      }
    }
    if (fights.length < 3) { log(`  ${s.id}: само ${fights.length} лога — пропускам`); continue; }
    // Hero tree на всеки лог по талантите (възли) на играча
    const heroTrees = heroTreesFor(s.id);
    for (const f of fights) {
      const nodes = new Set(f.talentNodes || []);
      let best = null, bestN = 0;
      for (const h of heroTrees) { const n = h.nodes.filter((id) => nodes.has(id)).length; if (n > bestN) { bestN = n; best = h.name; } }
      f.hero = best;
    }
    // Таланти по подземие (евтини заявки; кешират се)
    const byDungeon = {};
    for (const p of talentPicks) {
      if (timeUp()) break;
      try { if (pointsLeft < opt.minPoints) await checkPoints(); const t = await fightTalents(p.code, p.fightID, p.name); if (t?.talentNodes?.length) (byDungeon[p.dungeon] ||= []).push(t); }
      catch (e) { log(`  ! таланти ${p.code}/${p.fightID}: ${e.message.split('\n')[0]}`); }
    }
    const dungeons = dungeonTalents(byDungeon, s.id);
    const cons = consumables(fights);
    const agg = aggregate(fights);
    const byHero = {};
    for (const name of [...new Set(fights.map((f) => f.hero).filter(Boolean))]) {
      const fs2 = fights.filter((f) => f.hero === name);
      if (fs2.length >= 3) byHero[name] = aggregate(fs2);
    }
    writeOut('rotations', `${s.id}.json`, { spec: s.id, generatedAt: new Date().toISOString(), source: 'Warcraft Logs', ...agg, byHero, dungeons, consumables: cons, logs: fights.map((f) => ({ player: f.player, dungeon: f.dungeon, key: f.keyLevel, sec: f.durationSec, hero: f.hero })) });
    log(`  ${s.id}: ${fights.length} лога (${Object.entries(byHero).map(([h, a]) => `${h} ${a.fights}`).join(', ') || 'без разбивка'}), основни: ${agg.core.slice(0, 4).map((a) => `${a.name} ${a.cpm}/мин`).join(', ')}`);
  }
}
if (process.argv[1]?.endsWith('rotations.mjs')) main().catch((e) => { console.error('\nГРЕШКА:', e.message); process.exit(1); });
