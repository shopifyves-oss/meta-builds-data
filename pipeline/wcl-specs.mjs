// Имена на класове/спекове, както ги очаква Warcraft Logs (без интервали)
const C = {
  'death-knight': ['DeathKnight', ['blood', 'frost', 'unholy']],
  'demon-hunter': ['DemonHunter', ['devourer', 'havoc', 'vengeance']],
  druid: ['Druid', ['balance', 'feral', 'guardian', 'restoration']],
  evoker: ['Evoker', ['augmentation', 'devastation', 'preservation']],
  hunter: ['Hunter', ['beast-mastery', 'marksmanship', 'survival']],
  mage: ['Mage', ['arcane', 'fire', 'frost']],
  monk: ['Monk', ['brewmaster', 'mistweaver', 'windwalker']],
  paladin: ['Paladin', ['holy', 'protection', 'retribution']],
  priest: ['Priest', ['discipline', 'holy', 'shadow']],
  rogue: ['Rogue', ['assassination', 'outlaw', 'subtlety']],
  shaman: ['Shaman', ['elemental', 'enhancement', 'restoration']],
  warlock: ['Warlock', ['affliction', 'demonology', 'destruction']],
  warrior: ['Warrior', ['arms', 'fury', 'protection']],
};
const pascal = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
export const CLASS_SPECS = Object.entries(C).flatMap(([cls, [wclClass, specs]]) =>
  specs.map((sp) => ({ id: `${cls}-${sp}`, wclClass, wclSpec: pascal(sp) })));
