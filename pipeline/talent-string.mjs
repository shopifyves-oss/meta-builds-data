// Декодер на talent import string (формат на играта, версия 2).
// Възлите се четат по възходящ ID на цялото дърво на класа (всички спекове + hero trees).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeLoadout(str, nodes /* [{id,maxRank,entries:[talentId]}] сортирани по id */) {
  const vals = [...String(str).trim()].map((c) => B64.indexOf(c));
  if (vals.some((v) => v < 0)) throw new Error('Invalid character in import string');
  let pos = 0;
  const read = (n) => {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const ci = Math.floor(pos / 6), bi = pos % 6;
      if (ci >= vals.length) throw new Error('Import string is too short');
      out |= ((vals[ci] >> bi) & 1) << i; pos++;
    }
    return out >>> 0;
  };
  const version = read(8), specId = read(16);
  for (let i = 0; i < 16; i++) read(8);
  const talents = new Map(), picked = new Map();
  for (const n of nodes) {
    if (!read(1)) continue;
    const purchased = version >= 2 ? !!read(1) : true;
    let rank = n.maxRank, entry = 0;
    if (purchased) { if (read(1)) rank = read(6); if (read(1)) entry = read(2); }
    picked.set(n.id, { rank, entry });
    const tid = n.entries[entry] ?? n.entries[0];
    if (tid) talents.set(tid, rank);
  }
  return { version, specId, talents, picked };
}
