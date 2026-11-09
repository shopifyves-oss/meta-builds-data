// Проба: таланти в класацията по подземие + консумативи (бъфове при старта на боя).
//   node pipeline/wcl-probe2.mjs   → записва data/cache/wcl-probe2.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv } from './lib.mjs';
loadEnv();
const tok = await fetch('https://www.warcraftlogs.com/oauth/token', { method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.WCL_CLIENT_ID.trim()}:${process.env.WCL_CLIENT_SECRET.trim()}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials' }).then((r) => r.json());
const gql = async (query, variables = {}) => {
  const j = await fetch('https://www.warcraftlogs.com/api/v2/client', { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) }).then((r) => r.json());
  if (j.errors) return { errors: j.errors.map((e) => e.message) };
  return j.data;
};
const out = {};
const z = await gql(`{ worldData { expansions { zones { id name frozen encounters { id name } } } } }`);
const zone = z.worldData.expansions.flatMap((e) => e.zones).filter((x) => /mythic\+/i.test(x.name) && !x.frozen).sort((a, b) => b.id - a.id)[0];
const enc = zone.encounters[0];
// 1) Класация с таланти
const r = await gql(`query($id: Int!) { worldData { encounter(id: $id) { characterRankings(className: "Mage", specName: "Frost", includeCombatantInfo: true) } } }`, { id: enc.id });
const ranks = r.worldData?.encounter?.characterRankings?.rankings || r;
out.rankingKeys = Array.isArray(ranks) ? Object.keys(ranks[0] || {}) : ranks;
out.rankingSample = Array.isArray(ranks) ? JSON.stringify(ranks[0]).slice(0, 3000) : null;
out.rankingCount = Array.isArray(ranks) ? ranks.length : 0;
// 2) playerDetails (данни за играча в лога) + CombatantInfo събития
const rk = Array.isArray(ranks) ? ranks[0] : null;
if (rk?.report) {
  const code = rk.report.code, f = [rk.report.fightID];
  const pd = await gql(`query($code: String!, $f: [Int]) { reportData { report(code: $code) { playerDetails(fightIDs: $f, includeCombatantInfo: true) } } }`, { code, f });
  const det = pd.reportData?.report?.playerDetails?.data?.playerDetails || {};
  const me = [...(det.tanks || []), ...(det.healers || []), ...(det.dps || [])].find((x) => x.name === rk.name);
  const ci = me?.combatantInfo || {};
  out.pdPlayerKeys = me ? Object.keys(me) : null;
  out.ciKeys = Object.keys(ci);
  for (const k of Object.keys(ci)) out['ci_' + k] = JSON.stringify(ci[k]).slice(0, 700);
  const ev = await gql(`query($code: String!, $f: [Int]) { reportData { report(code: $code) { events(fightIDs: $f, dataType: CombatantInfo, limit: 200) { data } } } }`, { code, f });
  const evs = ev.reportData?.report?.events?.data || [];
  out.ciEventCount = evs.length;
  out.ciEventKeys = evs[0] ? Object.keys(evs[0]) : null;
  const mineEv = evs.find((e) => e.sourceID === me?.id) || evs[0];
  if (mineEv?.auras) { out.ciEventAuras = mineEv.auras.slice(0, 30); }
  const ab = await gql(`query($code: String!) { reportData { report(code: $code) { masterData { abilities { gameID name icon } } } } }`, { code });
  const ids = new Set((mineEv?.auras || []).map((a) => a.ability));
  out.auraNames = (ab.reportData?.report?.masterData?.abilities || []).filter((a) => ids.has(a.gameID)).map((a) => [a.gameID, a.name]);
}
delete out.rankingSample;
fs.writeFileSync(path.join(ROOT, 'data', 'cache', 'wcl-probe2.json'), JSON.stringify(out, null, 1));
console.log('Готово:', out.ciKeys, '; събития:', out.ciEventCount);
