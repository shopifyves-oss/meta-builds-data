// Статични данни за дизайна: дървета на талантите, икони, качество на предметите.
// Кешира се в data/cache/ — при следващо пускане тегли само новото.
//   node pipeline/static.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, args, pool, log, bnet, setBnetRate, blizzardToken } from './lib.mjs';

loadEnv();
const opt = args({ region: 'us', rate: 9.5, concurrency: 10, refreshTrees: false });
setBnetRate(Number(opt.rate));
const R = opt.region, ST = `namespace=static-${R}`;
const CACHE = path.join(ROOT, 'data', 'cache');
fs.mkdirSync(path.join(CACHE, 'trees'), { recursive: true });
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const MEDIA_FILE = path.join(CACHE, 'media.json');
const media = readJson(MEDIA_FILE, { spell: {}, item: {}, itemQuality: {}, pvpTalentSpell: {}, spec: {}, cls: {} });
const saveMedia = () => fs.writeFileSync(MEDIA_FILE, JSON.stringify(media));
const iconName = (m) => {
  const url = (m?.assets || []).find((a) => a.key === 'icon')?.value;
  return url ? url.split('/').pop().replace(/\.(jpg|png)$/, '') : null;
};

// ---- Дървета на талантите --------------------------------------------------
function entriesOf(node) {
  const out = [];
  for (const r of node.ranks || []) {
    const tips = r.choice_of_tooltips || (r.tooltip ? [r.tooltip] : []);
    for (const tp of tips) {
      const id = tp.talent?.id; if (!id || out.some((e) => e.talentId === id)) continue;
      out.push({ talentId: id, name: tp.talent?.name, spellId: tp.spell_tooltip?.spell?.id });
    }
  }
  return out;
}
const normNode = (n) => ({
  id: n.id,
  row: n.display_row ?? null, col: n.display_col ?? null,
  x: n.raw_position_x ?? null, y: n.raw_position_y ?? null,
  type: n.node_type?.type ?? null,
  maxRank: (n.ranks || []).filter((r) => r.tooltip).length || 1,
  choice: (n.ranks || []).some((r) => r.choice_of_tooltips),
  lockedBy: n.locked_by ?? [], unlocks: n.unlocks ?? [],
  entries: entriesOf(n),
});

async function fetchTrees() {
  const idx = await bnet(R, `/data/wow/talent-tree/index?${ST}`);
  const specTrees = idx?.spec_talent_trees || [];
  log(`Дървета за спекове: ${specTrees.length}`);
  let n = 0;
  await pool(specTrees, 4, async (t) => {
    const m = t.key?.href?.match(/talent-tree\/(\d+)\/playable-specialization\/(\d+)/);
    if (!m) return;
    const [, treeId, specId] = m;
    const file = path.join(CACHE, 'trees', `${specId}.json`);
    if (fs.existsSync(file) && !opt.refreshTrees) return;
    const d = await bnet(R, `/data/wow/talent-tree/${treeId}/playable-specialization/${specId}?${ST}`);
    if (!d) return;
    if (!fs.existsSync(path.join(CACHE, 'talent-tree-sample.json'))) fs.writeFileSync(path.join(CACHE, 'talent-tree-sample.json'), JSON.stringify(d, null, 1));
    const out = {
      treeId: Number(treeId), specId: Number(specId), name: t.name,
      class: (d.class_talent_nodes || []).map(normNode),
      spec: (d.spec_talent_nodes || []).map(normNode),
      hero: (d.hero_talent_trees || []).map((h) => ({ id: h.id, name: h.name, nodes: (h.hero_talent_nodes || []).map(normNode) })),
    };
    fs.writeFileSync(file, JSON.stringify(out));
    n++;
  });
  log(`  нови дървета: ${n}`);
}

// ---- Икони -------------------------------------------------------------------
function collectIds() {
  const spells = new Set(), items = new Set(), pvpTalents = new Set(), specs = new Set(), classes = new Set();
  for (const f of fs.readdirSync(path.join(CACHE, 'trees'))) {
    const t = readJson(path.join(CACHE, 'trees', f));
    if (!t) continue;
    specs.add(t.specId);
    for (const n of [...t.class, ...t.spec, ...t.hero.flatMap((h) => h.nodes)]) for (const e of n.entries) if (e.spellId) spells.add(e.spellId);
  }
  for (const mode of ['mplus', 'pvp']) {
    const dir = path.join(ROOT, 'data', mode);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const d = readJson(path.join(dir, f));
      if (!d?.meta) continue;
      if (d.meta.specId) specs.add(d.meta.specId);
      if (d.meta.classId) classes.add(d.meta.classId);
      for (const list of Object.values(d.gear || {})) for (const it of list) if (it.itemId) items.add(it.itemId);
      for (const p of d.pvpTalents || []) if (p.talentId) pvpTalents.add(p.talentId);
      for (const b of d.builds || []) for (const t of b.talents || []) if (t.spellId) spells.add(t.spellId);
    }
  }
  return { spells, items, pvpTalents, specs, classes };
}

async function fetchMedia() {
  const ids = collectIds();
  // PvP таланти → spell id
  const pvpTodo = [...ids.pvpTalents].filter((id) => !(id in media.pvpTalentSpell));
  await pool(pvpTodo, opt.concurrency, async (id) => {
    const d = await bnet(R, `/data/wow/pvp-talent/${id}?${ST}`);
    media.pvpTalentSpell[id] = d?.spell?.id ?? null;
  });
  for (const sid of Object.values(media.pvpTalentSpell)) if (sid) ids.spells.add(sid);

  const jobs = [
    ...[...ids.spells].filter((id) => !(id in media.spell)).map((id) => ['spell', id, `/data/wow/media/spell/${id}`]),
    ...[...ids.items].filter((id) => !(id in media.item)).map((id) => ['item', id, `/data/wow/media/item/${id}`]),
    ...[...ids.specs].filter((id) => !(id in media.spec)).map((id) => ['spec', id, `/data/wow/media/playable-specialization/${id}`]),
    ...[...ids.classes].filter((id) => !(id in media.cls)).map((id) => ['cls', id, `/data/wow/media/playable-class/${id}`]),
  ];
  const qualityTodo = [...ids.items].filter((id) => !(id in media.itemQuality));
  log(`Икони за теглене: ${jobs.length} (заклинания ${ids.spells.size}, предмети ${ids.items.size}); качество на предмети: ${qualityTodo.length}`);
  await pool(jobs, opt.concurrency, async ([kind, id, p]) => {
    const d = await bnet(R, `${p}?${ST}`).catch(() => null);
    media[kind][id] = iconName(d);
  }, (d, t) => { if (d % 500 === 0 || d === t) { log(`  икони ${d}/${t}`); saveMedia(); } });
  await pool(qualityTodo, opt.concurrency, async (id) => {
    const d = await bnet(R, `/data/wow/item/${id}?${ST}`).catch(() => null);
    media.itemQuality[id] = d?.quality?.type ?? null;
  }, (d, t) => { if (d % 500 === 0 || d === t) { log(`  качество ${d}/${t}`); saveMedia(); } });
  saveMedia();
}

async function main() {
  if (!(await blizzardToken())) throw new Error('Липсват Blizzard ключове в .env');
  await fetchTrees();
  await fetchMedia();
  const missing = Object.values(media.spell).filter((v) => !v).length;
  log(`\nГотово. Икони: заклинания ${Object.keys(media.spell).length} (без икона: ${missing}), предмети ${Object.keys(media.item).length}, спекове ${Object.keys(media.spec).length}.`);
}
main().catch((e) => { console.error('\nГРЕШКА:', e.message); process.exit(1); });
