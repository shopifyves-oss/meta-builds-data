// Преизчислява агрегатите от запазените сурови данни (data/raw) без ново теглене.
//   node pipeline/rebuild.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, aggregate, writeOut, log } from './lib.mjs';
const dir = path.join(ROOT, 'data', 'raw');
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const [mode, ...rest] = f.split('-');
  const target = path.join(ROOT, 'data', mode, rest.join('-'));
  if (!fs.existsSync(target)) continue;
  const prev = JSON.parse(fs.readFileSync(target, 'utf8'));
  const agg = aggregate(raw.players, raw.meta.specId);
  if (mode === 'mplus') delete agg.pvpTalents;
  const out = { ...prev, ...agg, meta: { ...prev.meta, rebuiltAt: new Date().toISOString() } };
  writeOut(mode, rest.join('-'), out);
  log(`${f}: ${out.builds.map((b) => `${b.heroTree} ${b.pct}%`).join(', ')}`);
}
