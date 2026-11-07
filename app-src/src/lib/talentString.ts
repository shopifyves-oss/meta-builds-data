// Декодер на talent import string от играта (версия 2) + разпознаване на hero tree.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type ClassInfo = {
  classId: number;
  nodes: [number, number, number[]][]; // [nodeId, maxRank, talentIds] сортирани по nodeId
  specs: Record<string, { heroSel: Record<string, Record<string, number>>; heroMethod: 'sel' | 'count'; heroTrees: string[]; notInString: number[] }>;
};
export type Decoded = { specId: number; talents: Map<number, number>; picked: Map<number, { rank: number; entry: number }> };

export function decodeLoadout(str: string, info: ClassInfo): Decoded {
  const clean = str.trim().replace(/\s+/g, '');
  const vals = [...clean].map((c) => B64.indexOf(c));
  if (!clean || vals.some((v) => v < 0)) throw new Error('This is not a valid talent import string');
  let pos = 0;
  const read = (n: number) => {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const ci = Math.floor(pos / 6), bi = pos % 6;
      if (ci >= vals.length) throw new Error('The import string is incomplete');
      out |= ((vals[ci] >> bi) & 1) << i; pos++;
    }
    return out >>> 0;
  };
  const version = read(8), specId = read(16);
  for (let i = 0; i < 16; i++) read(8);
  const talents = new Map<number, number>(), picked = new Map<number, { rank: number; entry: number }>();
  for (const [id, maxRank, entries] of info.nodes) {
    if (!read(1)) continue;
    const purchased = version >= 2 ? !!read(1) : true;
    let rank = maxRank, entry = 0;
    if (purchased) { if (read(1)) rank = read(6); if (read(1)) entry = read(2); }
    picked.set(id, { rank, entry });
    const tid = entries[entry] ?? entries[0];
    if (tid) talents.set(tid, rank);
  }
  return { specId, talents, picked };
}

export function detectHero(d: Decoded, info: ClassInfo, heroTrees: { name: string; nodes: { id: number }[] }[]): string | undefined {
  const si = info.specs[String(d.specId)];
  if (!si) return undefined;
  if (si.heroMethod === 'sel') {
    const score: Record<string, number> = {};
    for (const [id, , entries] of info.nodes) {
      if (entries.length) continue;
      const pk = d.picked.get(id); if (!pk) continue;
      const v = si.heroSel[`${id}:${pk.entry}`];
      if (v) for (const [h, c] of Object.entries(v)) score[h] = (score[h] || 0) + c;
    }
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) return best;
  }
  let best: string | undefined, bestN = -1;
  for (const h of heroTrees.filter((x) => si.heroTrees.includes(x.name))) {
    const n = h.nodes.filter((x) => d.picked.has(x.id)).length;
    if (n > bestN) { bestN = n; best = h.name; }
  }
  return best;
}
