// Mythic+ прототип: мета билд от топ 5% играчи на даден спек (по M+ score).
// Прагът (cutoff score) и размерът на топ 5% идват официално от Raider.IO cutoff-analysis.
// Пример:  node pipeline/mplus.mjs --class mage --spec frost --region us
import {
  loadEnv, args, getJson, pool, log, writeOut, norm,
  bnet, bnetCharacter, specIdFor, fetchBlizzardDetails, aggregate, saveRaw,
} from './lib.mjs';

loadEnv();
const opt = args({
  class: 'mage', spec: 'frost', region: 'us', season: 'season-mn-2',
  percentile: 5,        // топ %: 0.1, 1, 5, 10, 25, 40
  periods: 4,           // последните N седмици ладъри
  bnetConcurrency: 10,
  maxPlayers: 0,        // 0 = целият топ % (напр. 859); число = таван за по-бързо пускане
  concurrency: 4,
});
const RIO = 'https://raider.io/api/v1';
const key = process.env.RAIDERIO_ACCESS_KEY ? `&access_key=${process.env.RAIDERIO_ACCESS_KEY}` : '';
const rio = (p) => getJson(`${RIO}${p}${key}`, { label: 'raider.io' });

async function main() {
  const R = opt.region;
  log(`\n== M+ | ${opt.class} ${opt.spec} | ${R.toUpperCase()} | ${opt.season} | топ ${opt.percentile}% ==`);
  const ids = await specIdFor(R, opt.class, opt.spec);

  // 1) Официален праг за топ X% в спека
  const ca = await rio(`/mythic-plus/cutoff-analysis?season=${opt.season}&region=${R}&category=specs&percentile=${opt.percentile}&density=false`);
  const cohort = ca?.cohorts?.find((c) => c.specId === ids.specId);
  const pc = cohort?.percentiles?.find((p) => p.percentile === opt.percentile);
  if (!pc) throw new Error(`Няма cutoff за ${ids.specName} ${ids.className} (spec ${ids.specId})`);
  const cutoff = pc.cutoffScore, tail = pc.tailSize;
  const want = opt.maxPlayers ? Math.min(tail, opt.maxPlayers) : tail;
  log(`${cohort.label}: популация ${cohort.population}, топ ${opt.percentile}% = ${tail} играчи със score ≥ ${cutoff}`);
  log(`Цел за извадката: ${want} играчи`);

  // 2) Откриване на играчи: M+ ладъри по connected realm (Blizzard) — стигат много по-дълбоко от глобалния топ
  const dyn = `namespace=dynamic-${R}`;
  const realms = (await bnet(R, `/data/wow/connected-realm/index?${dyn}`)).connected_realms
    .map((x) => Number(x.href.match(/connected-realm\/(\d+)/)[1]));
  const curPeriod = (await bnet(R, `/data/wow/mythic-keystone/period/index?${dyn}`)).current_period.id;
  const periods = Array.from({ length: opt.periods }, (_, i) => curPeriod - i);
  log(`Connected realms: ${realms.length}, седмици (periods): ${periods.join(', ')}`);

  const found = new Map();
  let lbCalls = 0, lbEmpty = 0;
  await pool(realms, opt.bnetConcurrency, async (rid) => {
    const idx = await bnet(R, `/data/wow/connected-realm/${rid}/mythic-leaderboard/index?${dyn}`);
    const dungeonIds = [...new Set((idx?.current_leaderboards || []).map((l) => l.id))];
    for (const did of dungeonIds) for (const per of periods) {
      lbCalls++;
      const lb = await bnet(R, `/data/wow/connected-realm/${rid}/mythic-leaderboard/${did}/period/${per}?${dyn}`).catch(() => null);
      if (!lb?.leading_groups?.length) { lbEmpty++; continue; }
      for (const g of lb.leading_groups) for (const m of g.members || []) {
        if (m.specialization?.id !== ids.specId) continue;
        const k = `${m.profile?.realm?.slug}/${m.profile?.name}`.toLowerCase();
        const prev = found.get(k);
        if (!prev || g.keystone_level > prev.maxKey) found.set(k, { name: m.profile.name, realm: m.profile.realm.slug, maxKey: g.keystone_level });
      }
    }
  }, (d, t) => log(`  реалми ${d}/${t} — намерени ${found.size} ${ids.specName} ${ids.className}`));
  log(`Ладъри: ${lbCalls} заявки (${lbEmpty} празни). Кандидати: ${found.size}`);

  // 3) Текущ M+ rating на всеки кандидат (Blizzard) → само тези над прага
  const cands = [...found.values()].sort((a, b) => b.maxKey - a.maxKey);
  const scored = [];
  for (let i = 0; i < cands.length && scored.length < want; i += 100) {
    const res = await pool(cands.slice(i, i + 100), opt.bnetConcurrency, async (c) => {
      const p = await bnetCharacter(R, c.realm, c.name, '/mythic-keystone-profile');
      const score = p?.current_mythic_rating?.rating ?? 0;
      return score >= cutoff ? { ...c, score } : null;
    });
    for (const r of res) if (r) scored.push(r);
    log(`  проверени ${Math.min(i + 100, cands.length)}/${cands.length}, над прага: ${scored.length}`);
  }
  const sample = scored.sort((a, b) => b.score - a.score).slice(0, want);
  if (!sample.length) throw new Error('Няма играчи над прага — увеличи --periods');
  if (sample.length < want) log(`  ! Намерени ${sample.length} от целта ${want}.`);

  // 5) Детайли от Blizzard и агрегиране
  log(`Тегля таланти, екипировка и статистики от Blizzard за ${sample.length} играчи...`);
  await fetchBlizzardDetails(R, sample);
  const agg = aggregate(sample, ids.specId);
  saveRaw(`mplus-${opt.class}-${opt.spec}-${R}.json`, { ...opt, ...ids }, sample);

  const out = {
    meta: {
      mode: 'mythic-plus', class: opt.class, spec: opt.spec, classId: ids.classId, specId: ids.specId,
      region: R, season: opt.season,
      method: `Топ ${opt.percentile}% по M+ score в спека (официален праг от Raider.IO)`,
      specPopulation: cohort.population, topPercentSize: tail, cutoffScore: cutoff,
      sampleSize: sample.length, coverage: Math.round((sample.length / tail) * 1000) / 10,
      scoreRange: [Math.round(sample.at(-1).score), Math.round(sample[0].score)],
      generatedAt: new Date().toISOString(),
      attribution: 'Data from Raider.IO (https://raider.io) and Blizzard Entertainment',
    },
    ...agg,
    pvpTalents: undefined,
    players: sample.slice(0, 50).map((c) => ({ name: c.name, realm: c.realm, region: R, score: Math.round(c.score), maxKey: c.maxKey })),
  };
  const file = writeOut('mplus', `${opt.class}-${opt.spec}-${R}.json`, out);
  log(`\nГотово → ${file}`);
  log(`Извадка: ${out.meta.sampleSize} играчи (${out.meta.coverage}% от топ ${opt.percentile}%), score ${out.meta.scoreRange.join('–')}`);
  log(`Hero tree: ${out.heroTrees.map((h) => `${h.name} ${h.pct}%`).join(', ')}`);
  if (out.stats) log(`Stat priority: ${out.stats.order.join(' > ')}`);
  for (const b of out.builds) {
    log(`\n[${b.heroTree}] ${b.pct}% (${b.players} играчи) — ${b.recommended.playersWithin2Talents}% са на ≤2 таланта от консенсуса`);
    log(`  Препоръчан билд (от ${b.recommended.fromPlayer.name}): ${b.recommended.importString}`);
    if (b.flexTalents.length) log(`  Гъвкави: ${b.flexTalents.slice(0, 6).map((t) => `${t.name}${t.rank > 1 ? " (" + t.rank + ")" : ""} ${t.pct}%`).join(', ')}`);
  }
}
main().catch((e) => { console.error('\nГРЕШКА:', e.message); process.exit(1); });
