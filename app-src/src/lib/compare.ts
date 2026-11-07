import type { Build, GearItem, ModeData, TreeData } from '../data';

export type TalentDiff = { name: string; rank: number; pct: number; icon?: string };
export type TalentReport = {
  mine: Map<number, number>;   // talentId → rank (само активните дървета)
  coreTotal: number; coreHave: number; matchPct: number;
  missing: TalentDiff[];       // ≥75% от топ играчите, но ги нямаш
  differs: TalentDiff[];       // 50–75%: гъвкав избор, в който се различаваш
  unusual: TalentDiff[];       // имаш ги, но <15% от топ играчите ги вземат
};

// Сравнява избраните таланти с билда на топ играчите за същия hero tree.
export function compareTalents(all: Map<number, number>, build: Build, tree: TreeData | undefined, ignore: number[]): TalentReport {
  const ignoreSet = new Set(ignore);
  // Само таланти от class/spec дървото и активното hero дърво
  let allowed: Set<number> | null = null;
  if (tree) {
    allowed = new Set<number>();
    for (const n of [...tree.class, ...tree.spec, ...(tree.hero.find((h) => h.name === build.heroTree)?.nodes ?? [])]) for (const e of n.entries) allowed.add(e.id);
  }
  const mine = new Map([...all].filter(([id]) => !allowed || allowed.has(id)));
  const byKey = new Map(build.talents.map((t) => [`${t.id}:${t.rank}`, t]));
  const core = build.talents.filter((t) => t.pct >= 50 && !ignoreSet.has(t.id));
  const missing: TalentDiff[] = [], differs: TalentDiff[] = [];
  let coreHave = 0;
  for (const t of core) {
    if (mine.get(t.id) === t.rank) coreHave++;
    else (t.pct >= 75 ? missing : differs).push({ name: t.name, rank: t.rank, pct: t.pct, icon: t.icon });
  }
  const unusual: TalentDiff[] = [];
  for (const [id, rank] of mine) {
    const t = byKey.get(`${id}:${rank}`);
    const pct = t?.pct ?? 0;
    if (pct < 15) {
      const any = build.talents.find((x) => x.id === id);
      unusual.push({ name: any?.name ?? `Talent ${id}`, rank, pct, icon: any?.icon });
    }
  }
  missing.sort((a, b) => b.pct - a.pct); unusual.sort((a, b) => a.pct - b.pct);
  differs.sort((a, b) => b.pct - a.pct);
  return { mine, coreTotal: core.length, coreHave, matchPct: core.length ? Math.round((coreHave / core.length) * 100) : 100, missing, differs, unusual };
}

// ---- Екипировка (профил от Raider.IO) ----
export type RioItem = { item_id: number; item_level: number; name: string; icon?: string; item_quality?: number; enchant?: number; gems?: number[] };
export type GearCheck = {
  slot: string; item: RioItem; popularity?: number; topItem?: GearItem;
  enchantStatus: 'ok' | 'missing' | 'different' | 'none';
  topEnchant?: { name: string; pct: number };
};
const QUALITY = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];
export const rioQuality = (q?: number) => (q != null ? QUALITY[q] : undefined);
export const rioSlot = (k: string) => k.replace('mainhand', 'main_hand').replace('offhand', 'off_hand').replace(/^(finger|trinket)(\d)$/, '$1_$2');

export function checkGear(items: Record<string, RioItem>, md: ModeData): GearCheck[] {
  const out: GearCheck[] = [];
  for (const [k, item] of Object.entries(items || {})) {
    const slot = rioSlot(k);
    if (slot === 'shirt' || slot === 'tabard') continue;
    const list = md.gear[slot] ?? (slot.startsWith('finger') ? [...(md.gear.finger_1 || []), ...(md.gear.finger_2 || [])] : slot.startsWith('trinket') ? [...(md.gear.trinket_1 || []), ...(md.gear.trinket_2 || [])] : []);
    const pop = list.find((g) => g.id === item.item_id)?.pct;
    const ench = md.enchants[slot] || [];
    const top = ench[0];
    let enchantStatus: GearCheck['enchantStatus'] = 'none';
    if (top && top.pct >= 40) {
      if (!item.enchant) enchantStatus = 'missing';
      else if (ench.some((e) => e.id === item.enchant)) enchantStatus = 'ok';
      else enchantStatus = 'different';
    } else if (item.enchant) enchantStatus = 'ok';
    out.push({ slot, item, popularity: pop, topItem: list[0], enchantStatus, topEnchant: top });
  }
  return out;
}
