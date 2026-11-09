import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Build, TreeData } from '../data';
import { compareTalents, TalentDiff } from '../lib/compare';
import { colors, font, radius, space } from '../theme';
import Icon from './Icon';
import TalentTree from './TalentTree';
import { Card, Chip, Segmented, fmtPct } from './ui';

type Group = 'class' | 'spec' | 'hero';

// Резултат от сравнение на твоите таланти с топ играчите (общ за „Сравни билда“ и „Провери героя“)
export default function CompareResult({ talents, builds, detectedHero, tree, ignore, accent, onResult }: {
  talents: Map<number, number>; builds: Build[]; detectedHero?: string; tree?: TreeData; ignore: number[]; accent: string;
  onResult?: (matchPct: number) => void;
}) {
  const [hero, setHero] = useState(detectedHero && builds.some((b) => b.heroTree === detectedHero) ? detectedHero : builds[0]?.heroTree);
  const [group, setGroup] = useState<Group>('spec');
  const build = builds.find((b) => b.heroTree === hero) ?? builds[0];
  const r = useMemo(() => (build ? compareTalents(talents, build, tree, ignore) : null), [talents, build, tree, ignore]);
  useEffect(() => { if (r && hero === detectedHero) onResult?.(r.matchPct); }, [r?.matchPct, hero]);
  if (!build || !r) return null;
  const nodes = !tree ? [] : group === 'hero' ? tree.hero.find((h) => h.name === build.heroTree)?.nodes ?? [] : tree[group];
  const scoreColor = r.matchPct >= 90 ? colors.good : r.matchPct >= 75 ? colors.warn : colors.bad;

  return (
    <>
      <Card title="Talent match" hint={`Compared with top players on ${build.heroTree}`}>
        {builds.length > 1 ? (
          <View style={{ flexDirection: 'row', marginBottom: space(3) }}>
            {builds.map((b) => <Chip key={b.heroTree} icon={b.heroIcon ?? ''} label={b.heroTree} sub={b.heroTree === detectedHero ? 'yours' : undefined} on={b.heroTree === hero} accent={accent} onPress={() => setHero(b.heroTree)} />)}
          </View>
        ) : null}
        <View style={s.scoreRow}>
          <Text style={[s.score, { color: scoreColor }]}>{r.matchPct}%</Text>
          <Text style={s.scoreText}>{r.coreHave} of {r.coreTotal} talents that most top players take</Text>
        </View>
        <DiffList title="Missing — most top players take these" items={r.missing} color={colors.bad} />
        <DiffList title="Different choice — top players are split" items={r.differs} color={colors.warn} />
        <DiffList title="Rare picks — few top players take these" items={r.unusual} color={colors.warn} rare />
        {!r.missing.length && !r.unusual.length ? <Text style={s.great}>✓ Your talents match the meta.</Text> : null}
      </Card>
      {tree ? (
        <Card title="Your tree vs. meta">
          <View style={{ marginBottom: space(4) }}>
            <Segmented accent={accent} value={group} onChange={setGroup} options={(['class', 'spec', 'hero'] as Group[]).map((g) => ({ value: g, label: g === 'hero' ? build.heroTree : g === 'class' ? 'Class' : 'Spec' }))} />
          </View>
          <TalentTree nodes={nodes} talents={build.talents} accent={accent} mine={r.mine} />
        </Card>
      ) : null}
    </>
  );
}

function DiffList({ title, items, color, rare }: { title: string; items: TalentDiff[]; color: string; rare?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: space(3) }}>
      <Text style={[s.listTitle, { color }]}>{title}</Text>
      {items.map((x, i) => (
        <View key={`${x.name}-${i}`} style={s.diffRow}>
          <Icon name={x.icon} size={28} border={color} fallback={x.name} />
          <Text style={s.diffName}>{x.name}{x.rank > 1 ? ` (${x.rank})` : ''}</Text>
          <Text style={s.diffPct}>{rare ? `${fmtPct(x.pct)} take it` : fmtPct(x.pct)}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  score: { fontSize: 40, fontWeight: '800', marginRight: space(3), fontVariant: ['tabular-nums'] },
  scoreText: { color: colors.muted, fontSize: font.small, flex: 1 },
  listTitle: { fontSize: font.tiny, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(2) },
  diffRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  diffName: { color: colors.text, fontSize: font.body, flex: 1, marginLeft: space(3) },
  diffPct: { color: colors.muted, fontSize: font.small, fontVariant: ['tabular-nums'] },
  great: { color: colors.good, fontSize: font.body, fontWeight: '700', marginTop: space(3) },
});
