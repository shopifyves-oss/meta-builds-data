// Общи помощни функции за pipeline-а. Без външни зависимости (Node 18+).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- .env -------------------------------------------------------------------
export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// --- CLI аргументи: --class mage --spec frost ----------------------------------
export function args(defaults) {
  const out = { ...defaults };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const key = a[i].slice(2);
      const val = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
      out[key] = typeof defaults[key] === 'number' ? Number(val) : val;
    }
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- HTTP с retry и уважение към 429 / Retry-After ----------------------------
export async function getJson(url, { headers = {}, tries = 5, label = '' } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'wow-meta-builds-prototype', ...headers } });
    } catch (e) {
      if (attempt === tries) throw e;
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 5);
      log(`  429 rate limit${label ? ' (' + label + ')' : ''} — чакам ${wait}s`);
      await sleep(wait * 1000 + 250);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      if (attempt === tries || res.status < 500) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${url.replace(/access_key=[^&]+/, 'access_key=***')}\n${body.slice(0, 300)}`);
      }
      await sleep(1000 * attempt);
      continue;
    }
    return res.json();
  }
  return null;
}

// --- Паралелно изпълнение с ограничение ---------------------------------------
export async function pool(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch (e) { results[i] = null; log(`  ! ${e.message.split('\n')[0]}`); }
      done++;
      if (onProgress && (done % 25 === 0 || done === items.length)) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function log(...m) { console.log(...m); }

// --- Blizzard API ------------------------------------------------------------
let tokenCache = null;
export async function blizzardToken() {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  const id = process.env.BLIZZARD_CLIENT_ID, secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Blizzard token: HTTP ${res.status} — провери BLIZZARD_CLIENT_ID / SECRET в .env`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return tokenCache.token;
}

// Глобален лимит: Blizzard позволява 36 000 заявки/час (=10/сек). Държим се малко под него.
let RATE = Number(process.env.BNET_RATE || 9.5);
export const setBnetRate = (r) => { RATE = r; };
let nextSlot = 0;
export let bnetCalls = 0;
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 1000 / RATE;
  if (at > now) await sleep(at - now);
  bnetCalls++;
}

export async function bnet(region, pathAndQuery) {
  await throttle();
  const token = await blizzardToken();
  if (!token) throw new Error('Липсват BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET в .env');
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  return getJson(`https://${region}.api.blizzard.com${pathAndQuery}${sep}locale=en_US`, {
    headers: { Authorization: `Bearer ${token}` }, label: 'blizzard',
  });
}

const enc = (s) => encodeURIComponent(String(s).toLowerCase());
export const bnetCharacter = (region, realm, name, sub = '') =>
  bnet(region, `/profile/wow/character/${enc(realm)}/${enc(name)}${sub}?namespace=profile-${region}`);

// Вторични статистики от Blizzard /statistics
export function secondaryStats(s) {
  if (!s) return null;
  const r = (x) => (x && typeof x === 'object' ? x.rating ?? x.rating_normalized ?? 0 : 0);
  return {
    crit: Math.max(r(s.melee_crit), r(s.spell_crit), r(s.ranged_crit)),
    haste: Math.max(r(s.melee_haste), r(s.spell_haste), r(s.ranged_haste)),
    mastery: r(s.mastery),
    versatility: typeof s.versatility === 'number' ? s.versatility : r(s.versatility),
  };
}

// --- Агрегиране -------------------------------------------------------------
export class Counter {
  constructor() { this.m = new Map(); }
  add(key, extra) {
    if (key === undefined || key === null || key === '') return;
    const e = this.m.get(key) || { key, count: 0, ...(extra || {}) };
    e.count++;
    this.m.set(key, e);
  }
  top(total, n = 10) {
    return [...this.m.values()].sort((a, b) => b.count - a.count).slice(0, n)
      .map((e) => ({ ...e, pct: total ? Math.round((e.count / total) * 1000) / 10 : 0 }));
  }
}

export function statPriority(statsList) {
  const valid = statsList.filter(Boolean);
  if (!valid.length) return null;
  const keys = ['crit', 'haste', 'mastery', 'versatility'];
  const avg = {};
  for (const k of keys) avg[k] = Math.round(valid.reduce((s, x) => s + (x[k] || 0), 0) / valid.length);
  return { sample: valid.length, averageRating: avg, order: keys.sort((a, b) => avg[b] - avg[a]) };
}

export function writeOut(mode, file, data, compact = false) {
  const dir = path.join(ROOT, 'data', mode);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, file);
  fs.writeFileSync(p, compact ? JSON.stringify(data) : JSON.stringify(data, null, 2));
  return p;
}

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// --- Общо агрегиране от Blizzard профили (ползва се и от M+, и от PvP) ----------
const SKIP_SLOTS = new Set(['shirt', 'tabard']);
const clean = (s) => String(s || '').replace(/\|A:[^|]*\|a/g, '').replace(/\|c[^:|]*:?/g, '').replace(/\|r/g, '').replace(/^Enchanted:\s*/, '').replace(/^Enchant \w+ - /, '').trim();

export async function fetchBlizzardDetails(region, players, concurrency = 8) {
  await pool(players, concurrency, async (c) => {
    const [sp, eq, st] = await Promise.all([
      bnetCharacter(region, c.realm, c.name, '/specializations'),
      bnetCharacter(region, c.realm, c.name, '/equipment'),
      bnetCharacter(region, c.realm, c.name, '/statistics'),
    ]);
    c.specializations = slimSpecs(sp); c.equipment = slimEquip(eq); c.stats = secondaryStats(st);
  }, (d, t) => log(`  Blizzard профили ${d}/${t}`));
}

export function aggregate(players, specId) {
  const N = players.length;
  const builds = new Counter(), talents = new Counter(), pvpTalents = new Counter(), hero = new Counter();
  const slots = {}, enchants = new Counter(), gems = new Counter(), tempEnch = new Counter();
  let withTalents = 0, gearN = 0;
  for (const c of players) {
    const active = c.specializations?.specializations?.find((x) => x.specialization?.id === specId);
    const lo = active?.loadouts?.find((l) => l.is_active) || active?.loadouts?.[0];
    if (lo) withTalents++;
    if (lo?.talent_loadout_code) builds.add(lo.talent_loadout_code);
    if (lo?.selected_hero_talent_tree?.name) hero.add(lo.selected_hero_talent_tree.name);
    for (const [group, list] of [['class', lo?.selected_class_talents], ['spec', lo?.selected_spec_talents], ['hero', lo?.selected_hero_talents]]) {
      for (const t of list || []) {
        const name = t.tooltip?.talent?.name;
        if (name) talents.add(name, { group, talentId: t.tooltip.talent.id, spellId: t.tooltip?.spell_tooltip?.spell?.id });
      }
    }
    for (const p of active?.pvp_talent_slots || []) {
      const name = p.selected?.talent?.name; if (name) pvpTalents.add(name, { talentId: p.selected.talent.id });
    }
    const activeId = c.specializations?.active_specialization?.id;
    const gearOk = !activeId || activeId === specId; // иначе екипировката е от друг спек
    if (gearOk) gearN++;
    for (const it of gearOk ? c.equipment?.equipped_items || [] : []) {
      const slot = it.slot?.type?.toLowerCase();
      if (!slot || SKIP_SLOTS.has(slot)) continue;
      (slots[slot] ||= new Counter()).add(it.name, { itemId: it.item?.id, quality: it.quality });
      for (const en of it.enchantments || []) {
        if (en.enchantment_slot?.type === 'TEMPORARY') { if (en.display_string && (slot === 'main_hand' || slot === 'off_hand')) tempEnch.add(clean(en.display_string).replace(/\s*\(\d+ (min|sec|hour)s?\)$/i, '')); continue; }
        if (!en.display_string) continue;
        enchants.add(`${slot}|${clean(en.display_string)}`, { slot, name: clean(en.display_string), enchantId: en.enchantment_id });
      }
      for (const s of it.sockets || []) if (s.item?.name) gems.add(s.item.name, { gemId: s.item.id });
    }
  }
  // Enchants групирани по слот (топ 2 на слот)
  const GN = gearN || 1;
  const enchBySlot = {};
  for (const e of enchants.top(GN, 200)) (enchBySlot[e.slot] ||= []).length < 2 && enchBySlot[e.slot].push({ name: e.name, enchantId: e.enchantId, pct: e.pct });
  // „Консенсусен“ списък: таланти, взети от ≥50% от играчите
  const tal = talents.top(withTalents, 300);
  return {
    heroTrees: hero.top(N, 5).map((h) => ({ name: h.key, pct: h.pct })),
    topBuilds: builds.top(N, 5).map((b) => ({ importString: b.key, count: b.count, pct: b.pct })),
    talents: tal.map((t) => ({ name: t.key, group: t.group, talentId: t.talentId, spellId: t.spellId, pct: t.pct, core: t.pct >= 50 })),
    builds: heroTreeBuilds(players, specId),
    pvpTalents: pvpTalents.top(N, 15).map((t) => ({ name: t.key, talentId: t.talentId, pct: t.pct })),
    stats: statPriority(players.filter((c) => { const a = c.specializations?.active_specialization?.id; return !a || a === specId; }).map((s) => s.stats)),
    gearSample: gearN,
    gear: Object.fromEntries(Object.entries(slots).map(([s, cn]) => [s, cn.top(GN, 3).map((i) => ({ name: i.key, itemId: i.itemId, quality: i.quality, pct: i.pct }))])),
    enchants: enchBySlot,
    gems: gems.top(GN, 8).map((g) => ({ name: g.key, gemId: g.gemId, perPlayer: Math.round((g.count / GN) * 10) / 10 })),
    weaponBuffs: tempEnch.top(GN, 4).map((w) => ({ name: w.key, pct: w.pct })),
  };
}

export async function specIdFor(region, className, specName) {
  const st = `namespace=static-${region}`;
  const idx = await bnet(region, `/data/wow/playable-class/index?${st}`);
  const cls = idx.classes.find((c) => norm(c.name) === norm(className));
  if (!cls) throw new Error(`Непознат клас: ${className}`);
  const detail = await bnet(region, `/data/wow/playable-class/${cls.id}?${st}`);
  const sp = detail.specializations.find((s) => norm(s.name) === norm(specName));
  if (!sp) throw new Error(`Непознат спек ${specName} за ${cls.name}`);
  return { classId: cls.id, specId: sp.id, className: cls.name, specName: sp.name };
}

// --- Билдове по hero tree ---------------------------------------------------
// За всеки hero tree:
//  1) % на всеки талант (само сред играчите с този hero tree)
//  2) „консенсус“ = талантите, взети от ≥50% от тях
//  3) препоръчан import string = РЕАЛНИЯТ билд на играча, който е най-близо до консенсуса
//     (валиден string от топ играч; при равенство печели по-високият score/rating)
//  4) най-честите точни билдове (import strings) в групата
function loadoutOf(c, specId) {
  const active = c.specializations?.specializations?.find((x) => x.specialization?.id === specId);
  return active?.loadouts?.find((l) => l.is_active) || active?.loadouts?.[0];
}
function talentSet(lo) {
  const m = new Map();
  for (const [group, list] of [['class', lo?.selected_class_talents], ['spec', lo?.selected_spec_talents], ['hero', lo?.selected_hero_talents]]) {
    for (const t of list || []) {
      const tal = t.tooltip?.talent; if (!tal?.name) continue;
      const rank = t.rank || 1;
      m.set(`${tal.id}:${rank}`, { name: tal.name, rank, group, talentId: tal.id, spellId: t.tooltip?.spell_tooltip?.spell?.id });
    }
  }
  return m;
}
export function heroTreeBuilds(players, specId) {
  const groups = new Map();
  for (const c of players) {
    const lo = loadoutOf(c, specId);
    if (!lo?.selected_hero_talent_tree?.name || !lo.talent_loadout_code) continue;
    const name = lo.selected_hero_talent_tree.name;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ c, lo, set: talentSet(lo) });
  }
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0);
  const out = [];
  for (const [heroTree, list] of groups) {
    const n = list.length;
    const freq = new Map();
    for (const { set } of list) for (const [k, v] of set) {
      const e = freq.get(k) || { ...v, count: 0 }; e.count++; freq.set(k, e);
    }
    const talents = [...freq.entries()].map(([k, e]) => ({ key: k, ...e, pct: Math.round((e.count / n) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);
    const consensus = new Set(talents.filter((t) => t.pct >= 50).map((t) => t.key));
    // Най-близкият реален билд до консенсуса
    let best = null;
    for (const p of list) {
      let diff = 0;
      for (const k of consensus) if (!p.set.has(k)) diff++;
      for (const k of p.set.keys()) if (!consensus.has(k)) diff++;
      const sc = p.c.score ?? p.c.rating ?? 0;
      if (!best || diff < best.diff || (diff === best.diff && sc > best.sc)) best = { p, diff, sc };
    }
    const missing = [...consensus].filter((k) => !best.p.set.has(k)).map((k) => freq.get(k).name);
    const extra = [...best.p.set.keys()].filter((k) => !consensus.has(k)).map((k) => freq.get(k).name);
    // Колко играчи са на ≤2 таланта от консенсуса
    let near = 0;
    for (const p of list) {
      let d = 0;
      for (const k of consensus) if (!p.set.has(k)) d++;
      for (const k of p.set.keys()) if (!consensus.has(k)) d++;
      if (d <= 2) near++;
    }
    const exact = new Counter();
    for (const p of list) exact.add(p.lo.talent_loadout_code);
    out.push({
      heroTree,
      players: n,
      lowSample: n < 20, // под 20 играчи — показваме, но с предупреждение
      pct: Math.round((n / total) * 1000) / 10,
      recommended: {
        importString: best.p.lo.talent_loadout_code,
        fromPlayer: { name: best.p.c.name, realm: best.p.c.realm, score: best.p.c.score, rating: best.p.c.rating },
        diffFromConsensus: best.diff, missing, extra,
        playersWithin2Talents: Math.round((near / n) * 1000) / 10,
      },
      // Таланти, по които топ играчите се разделят (20–80%) — „гъвкави“ избори
      flexTalents: talents.filter((t) => t.pct >= 20 && t.pct < 80).map((t) => ({ name: t.name, rank: t.rank, group: t.group, pct: t.pct })),
      talents: talents.map((t) => ({ name: t.name, rank: t.rank, group: t.group, talentId: t.talentId, spellId: t.spellId, pct: t.pct, core: t.pct >= 50 })),
      popularExactBuilds: exact.top(n, 3).map((b) => ({ importString: b.key, count: b.count, pct: b.pct })),
      stats: statPriority(list.filter((p) => { const a = p.c.specializations?.active_specialization?.id; return !a || a === specId; }).map((p) => p.c.stats)),
    });
  }
  return out.sort((a, b) => b.players - a.players);
}

// --- Сурови данни (за преизчисляване без ново теглене) ---------------------------
// Олекотяване на отговорите от Blizzard: пазим само полетата, които aggregate() ползва.
// (Пълните отговори са ~100+ KB на играч и при хиляди играчи изчерпват паметта.)
const slimTal = (list) => (list || []).map((t) => ({ rank: t.rank, tooltip: {
  talent: t.tooltip?.talent && { id: t.tooltip.talent.id, name: t.tooltip.talent.name },
  spell_tooltip: { spell: { id: t.tooltip?.spell_tooltip?.spell?.id } } } }));
export function slimSpecs(sp, onlySpecId) {
  if (!sp) return sp;
  return {
    active_specialization: { id: sp.active_specialization?.id },
    specializations: (sp.specializations || []).filter((x) => !onlySpecId || x.specialization?.id === onlySpecId).map((x) => ({
      specialization: { id: x.specialization?.id },
      pvp_talent_slots: (x.pvp_talent_slots || []).map((p) => ({ selected: { talent: p.selected?.talent && { id: p.selected.talent.id, name: p.selected.talent.name } } })),
      loadouts: (x.loadouts || []).filter((l) => l.is_active).map((l) => ({
        is_active: true, talent_loadout_code: l.talent_loadout_code,
        selected_hero_talent_tree: l.selected_hero_talent_tree && { name: l.selected_hero_talent_tree.name, id: l.selected_hero_talent_tree.id },
        selected_class_talents: slimTal(l.selected_class_talents), selected_spec_talents: slimTal(l.selected_spec_talents), selected_hero_talents: slimTal(l.selected_hero_talents),
      })),
    })),
  };
}
export function slimEquip(eq) {
  if (!eq) return eq;
  return { equipped_items: (eq.equipped_items || []).map((it) => ({
    slot: { type: it.slot?.type }, name: it.name, item: { id: it.item?.id }, quality: it.quality?.type,
    enchantments: (it.enchantments || []).map((e) => ({ display_string: e.display_string, enchantment_id: e.enchantment_id, enchantment_slot: { type: e.enchantment_slot?.type } })),
    sockets: (it.sockets || []).filter((x) => x.item).map((x) => ({ item: { id: x.item.id, name: x.item.name } })),
  })) };
}

export function saveRaw(name, meta, players) {
  const keep = players.map((c) => ({
    name: c.name, realm: c.realm, score: c.score, rating: c.rating, rank: c.rank, maxKey: c.maxKey,
    specializations: slimSpecs(c.specializations, meta.specId), equipment: slimEquip(c.equipment), stats: c.stats,
  }));
  return writeOut('raw', name, { meta, players: keep }, true);
}
