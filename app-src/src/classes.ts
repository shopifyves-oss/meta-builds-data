// 13 класа с официалните им цветове и спекове (Midnight).
export type ClassDef = { slug: string; name: string; color: string; specs: { slug: string; name: string; role: 'tank' | 'healer' | 'dps' }[] };

export const CLASSES: ClassDef[] = [
  { slug: 'death-knight', name: 'Death Knight', color: '#C41E3A', specs: [
    { slug: 'blood', name: 'Blood', role: 'tank' }, { slug: 'frost', name: 'Frost', role: 'dps' }, { slug: 'unholy', name: 'Unholy', role: 'dps' }] },
  { slug: 'demon-hunter', name: 'Demon Hunter', color: '#A330C9', specs: [
    { slug: 'devourer', name: 'Devourer', role: 'dps' }, { slug: 'havoc', name: 'Havoc', role: 'dps' }, { slug: 'vengeance', name: 'Vengeance', role: 'tank' }] },
  { slug: 'druid', name: 'Druid', color: '#FF7C0A', specs: [
    { slug: 'balance', name: 'Balance', role: 'dps' }, { slug: 'feral', name: 'Feral', role: 'dps' }, { slug: 'guardian', name: 'Guardian', role: 'tank' }, { slug: 'restoration', name: 'Restoration', role: 'healer' }] },
  { slug: 'evoker', name: 'Evoker', color: '#33937F', specs: [
    { slug: 'augmentation', name: 'Augmentation', role: 'dps' }, { slug: 'devastation', name: 'Devastation', role: 'dps' }, { slug: 'preservation', name: 'Preservation', role: 'healer' }] },
  { slug: 'hunter', name: 'Hunter', color: '#AAD372', specs: [
    { slug: 'beast-mastery', name: 'Beast Mastery', role: 'dps' }, { slug: 'marksmanship', name: 'Marksmanship', role: 'dps' }, { slug: 'survival', name: 'Survival', role: 'dps' }] },
  { slug: 'mage', name: 'Mage', color: '#3FC7EB', specs: [
    { slug: 'arcane', name: 'Arcane', role: 'dps' }, { slug: 'fire', name: 'Fire', role: 'dps' }, { slug: 'frost', name: 'Frost', role: 'dps' }] },
  { slug: 'monk', name: 'Monk', color: '#00FF98', specs: [
    { slug: 'brewmaster', name: 'Brewmaster', role: 'tank' }, { slug: 'mistweaver', name: 'Mistweaver', role: 'healer' }, { slug: 'windwalker', name: 'Windwalker', role: 'dps' }] },
  { slug: 'paladin', name: 'Paladin', color: '#F48CBA', specs: [
    { slug: 'holy', name: 'Holy', role: 'healer' }, { slug: 'protection', name: 'Protection', role: 'tank' }, { slug: 'retribution', name: 'Retribution', role: 'dps' }] },
  { slug: 'priest', name: 'Priest', color: '#FFFFFF', specs: [
    { slug: 'discipline', name: 'Discipline', role: 'healer' }, { slug: 'holy', name: 'Holy', role: 'healer' }, { slug: 'shadow', name: 'Shadow', role: 'dps' }] },
  { slug: 'rogue', name: 'Rogue', color: '#FFF468', specs: [
    { slug: 'assassination', name: 'Assassination', role: 'dps' }, { slug: 'outlaw', name: 'Outlaw', role: 'dps' }, { slug: 'subtlety', name: 'Subtlety', role: 'dps' }] },
  { slug: 'shaman', name: 'Shaman', color: '#0070DD', specs: [
    { slug: 'elemental', name: 'Elemental', role: 'dps' }, { slug: 'enhancement', name: 'Enhancement', role: 'dps' }, { slug: 'restoration', name: 'Restoration', role: 'healer' }] },
  { slug: 'warlock', name: 'Warlock', color: '#8788EE', specs: [
    { slug: 'affliction', name: 'Affliction', role: 'dps' }, { slug: 'demonology', name: 'Demonology', role: 'dps' }, { slug: 'destruction', name: 'Destruction', role: 'dps' }] },
  { slug: 'warrior', name: 'Warrior', color: '#C69B6D', specs: [
    { slug: 'arms', name: 'Arms', role: 'dps' }, { slug: 'fury', name: 'Fury', role: 'dps' }, { slug: 'protection', name: 'Protection', role: 'tank' }] },
];

export const classBySlug = (slug: string) => CLASSES.find((c) => c.slug === slug);
