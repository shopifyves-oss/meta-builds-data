// PvP прототип: мета билд от топ играчите на ладъра (Blizzard API).
//   node pipeline/pvp.mjs --class mage --spec frost --bracket shuffle
//   node pipeline/pvp.mjs --class mage --spec frost --bracket 3v3 --top 50
// bracket: shuffle | blitz | 2v2 | 3v3 | rbg
import { loadEnv, args, pool, log, writeOut, bnet, bnetCharacter, norm, specIdFor, fetchBlizzardDetails, aggregate, saveRaw } from './lib.mjs';

loadEnv();
const opt = args({ class: 'mage', spec: 'frost', region: 'us', bracket: 'shuffle', top: 100, maxScan: 1500, concurrency: 8 });
const R = opt.region, dyn = `namespace=dynamic-${R}`;

async function main() {
  log(`\n== PvP ${opt.bracket} | ${opt.class} ${opt.spec} | ${R.toUpperCase()} ==`);
  const ids = await specIdFor(R, opt.class, opt.spec);
  const seasonId = (await bnet(R, `/data/wow/pvp-season/index?${dyn}`)).current_season.id;
  const names = (await bnet(R, `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/index?${dyn}`)).leaderboards.map((l) => l.name);
  const perSpec = ['shuffle', 'blitz'].includes(opt.bracket);
  const lbName = perSpec
    ? names.find((n) => norm(n) === norm(opt.bracket) + norm(opt.class) + norm(opt.spec))
    : names.find((n) => n.toLowerCase() === opt.bracket.toLowerCase());
  if (!lbName) throw new Error(`Няма ладър за ${opt.bracket}. Налични (част): ${names.slice(0, 15).join(', ')}`);
  log(`Сезон ${seasonId}, ладър: ${lbName}`);

  const lb = await bnet(R, `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/${lbName}?${dyn}`);
  const entries = (lb.entries || []).sort((a, b) => a.rank - b.rank).slice(0, opt.maxScan)
    .map((e) => ({ name: e.character.name, realm: e.character.realm.slug, rating: e.rating, rank: e.rank }));

  // Пазим само играчите, които в момента играят този спек
  const sample = [];
  for (let i = 0; i < entries.length && sample.length < opt.top; i += 50) {
    const res = await pool(entries.slice(i, i + 50), opt.concurrency, async (e) => {
      const s = await bnetCharacter(R, e.realm, e.name, '/specializations');
      return s?.active_specialization?.id === ids.specId ? { ...e, specializations: s } : null;
    });
    for (const r of res) if (r && sample.length < opt.top) sample.push(r);
    log(`  проверени ${Math.min(i + 50, entries.length)}, намерени ${sample.length}/${opt.top}`);
  }
  if (!sample.length) throw new Error('Не намерих играчи с този спек');

  log('Тегля екипировка и статистики...');
  await fetchBlizzardDetails(R, sample);
  const agg = aggregate(sample, ids.specId);
  saveRaw(`pvp-${opt.class}-${opt.spec}-${opt.bracket}-${R}.json`, { ...opt, ...ids }, sample);
  const ratings = sample.map((s) => s.rating);
  const out = {
    meta: {
      mode: `pvp-${opt.bracket}`, class: opt.class, spec: opt.spec, classId: ids.classId, specId: ids.specId,
      region: R, seasonId, leaderboard: lbName,
      method: `Топ ${sample.length} ${ids.specName} ${ids.className} в ладъра ${lbName}`,
      sampleSize: sample.length, ratingRange: [Math.min(...ratings), Math.max(...ratings)],
      generatedAt: new Date().toISOString(), attribution: 'Data from Blizzard Entertainment',
    },
    ...agg,
    players: sample.slice(0, 50).map((c) => ({ name: c.name, realm: c.realm, rating: c.rating, rank: c.rank })),
  };
  const file = writeOut('pvp', `${opt.class}-${opt.spec}-${opt.bracket}-${R}.json`, out);
  log(`\nГотово → ${file}`);
  log(`Извадка: ${out.meta.sampleSize} играчи, rating ${out.meta.ratingRange.join('–')}`);
  log(`Hero tree: ${out.heroTrees.map((h) => `${h.name} ${h.pct}%`).join(', ')}`);
  log(`PvP таланти: ${out.pvpTalents.slice(0, 4).map((t) => `${t.name}${t.rank > 1 ? " (" + t.rank + ")" : ""} ${t.pct}%`).join(', ')}`);
  if (out.stats) log(`Stat priority: ${out.stats.order.join(' > ')}`);
  for (const b of out.builds) {
    log(`\n[${b.heroTree}] ${b.pct}% (${b.players} играчи) — ${b.recommended.playersWithin2Talents}% са на ≤2 таланта от консенсуса`);
    log(`  Препоръчан билд (от ${b.recommended.fromPlayer.name}): ${b.recommended.importString}`);
    if (b.flexTalents.length) log(`  Гъвкави: ${b.flexTalents.slice(0, 6).map((t) => `${t.name}${t.rank > 1 ? " (" + t.rank + ")" : ""} ${t.pct}%`).join(', ')}`);
  }
}
main().catch((e) => { console.error('\nГРЕШКА:', e.message); process.exit(1); });
