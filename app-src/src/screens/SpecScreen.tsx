import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { classBySlug } from '../classes';
import Icon from '../components/Icon';
import TalentTree from '../components/TalentTree';
import { Card, Chip, ErrorBox, Loading, PctRow, Segmented, Tabs, fmtPct } from '../components/ui';
import { Build, ModeData, SpecData, TreeData, useCdn } from '../data';
import { slotNames, slotOrder, t } from '../strings';
import { alpha, colors, font, mono, quality, radius, space } from '../theme';

type Tab = 'talents' | 'stats' | 'gear' | 'enchants' | 'players';
type Group = 'class' | 'spec' | 'hero';

const MODE_LABELS: Record<string, string> = { mplus: t.mplus, 'pvp-shuffle': t.shuffle, 'pvp-blitz': 'Blitz', 'pvp-2v2': '2v2', 'pvp-3v3': '3v3', 'pvp-rbg': 'RBG' };
const PVP_ORDER = ['pvp-shuffle', 'pvp-blitz', 'pvp-3v3', 'pvp-2v2', 'pvp-rbg'];
const modeLabel = (k: string) => MODE_LABELS[k] ?? k.replace('pvp-', '');
const hoursSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);

export default function SpecScreen({ cls, spec, onBack }: { cls: string; spec: string; onBack: () => void }) {
  const c = classBySlug(cls)!;
  const specName = c.specs.find((s) => s.slug === spec)?.name ?? spec;
  const accent = c.color;
  const { data, error, loading, reload } = useCdn<SpecData>(`specs/${cls}-${spec}.json`);
  const tree = useCdn<TreeData>(data?.hasTree ? `trees/${data.specId}.json` : null);

  return (
    <View style={s.screen}>
      {!data ? (
        <>
          <Header c={c} specName={specName} onBack={onBack} />
          {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : null}
        </>
      ) : (
        <SpecBody data={data} tree={tree.data} c={c} specName={specName} onBack={onBack} />
      )}
    </View>
  );
}

function Header({ c, specName, onBack, icon, children }: { c: { name: string; color: string }; specName: string; onBack: () => void; icon?: string; children?: React.ReactNode }) {
  return (
    <LinearGradient colors={[alpha(c.color, 0.28), alpha(c.color, 0.06), colors.bg]} locations={[0, 0.55, 1]} style={s.header}>
      <Pressable onPress={onBack} hitSlop={12}><Text style={s.back}>‹ {t.back}</Text></Pressable>
      <View style={s.headRow}>
        <View style={[s.specIconWrap, { shadowColor: c.color }]}>
          <Icon name={icon} size={60} border={c.color} fallback={specName} />
        </View>
        <View style={{ marginLeft: space(4), flex: 1 }}>
          <Text style={[s.className, { color: c.color }]}>{c.name}</Text>
          <Text style={s.title}>{specName}</Text>
        </View>
      </View>
      {children}
    </LinearGradient>
  );
}

function SpecBody({ data, tree, c, specName, onBack }: { data: SpecData; tree?: TreeData; c: { name: string; color: string }; specName: string; onBack: () => void }) {
  const accent = c.color;
  const modeKeys = Object.keys(data.modes).sort((a, b) => (a === 'mplus' ? -1 : b === 'mplus' ? 1 : PVP_ORDER.indexOf(a) - PVP_ORDER.indexOf(b)));
  const [mode, setMode] = useState(modeKeys[0]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [tab, setTab] = useState<Tab>('talents');
  const md: ModeData = data.modes[mode];
  const build: Build | undefined = md.builds[Math.min(heroIdx, md.builds.length - 1)];
  const isPvp = mode !== 'mplus';
  const pvpKeys = modeKeys.filter((k) => k !== 'mplus');
  const changeMode = (m: string) => { setMode(m); setHeroIdx(0); };

  return (
    <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: space(12) }}>
      <Header c={c} specName={specName} onBack={onBack} icon={data.icon}>
        <View style={{ marginTop: space(5) }}>
          {pvpKeys.length > 0 && modeKeys.includes('mplus') ? (
            <Segmented accent={accent} value={isPvp ? 'pvp' : 'mplus'} onChange={(v) => changeMode(v === 'mplus' ? 'mplus' : pvpKeys[0])}
              options={[{ value: 'mplus', label: t.mplus }, { value: 'pvp', label: t.pvp }]} />
          ) : null}
          {isPvp && (pvpKeys.length > 1 || !modeKeys.includes('mplus')) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space(3) }}>
              {pvpKeys.map((k) => <Chip key={k} label={modeLabel(k)} on={k === mode} accent={accent} onPress={() => changeMode(k)} />)}
            </ScrollView>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space(3) }}>
            {md.builds.map((b, i) => (
              <Chip key={b.heroTree} icon={b.heroIcon ?? ''} label={b.heroTree} sub={fmtPct(b.pct)} warn={b.lowSample} on={i === heroIdx} accent={accent} onPress={() => setHeroIdx(i)} />
            ))}
          </ScrollView>
          <SampleLine md={md} isPvp={isPvp} mode={mode} />
        </View>
      </Header>

      <View style={{ backgroundColor: colors.bg }}>
        <Tabs accent={accent} value={tab} onChange={setTab} options={(['talents', 'stats', 'gear', 'enchants', 'players'] as Tab[]).map((k) => ({ value: k, label: t.tabs[k] }))} />
      </View>

      <View style={s.body}>
        {build?.lowSample ? <Text style={s.warn}>⚠ {t.lowSample} ({build.players} {t.players})</Text> : null}
        {tab === 'talents' && build ? <TalentsTab build={build} md={md} tree={tree} accent={accent} isPvp={isPvp} /> : null}
        {tab === 'stats' ? <StatsTab stats={build?.stats ?? md.stats} accent={accent} /> : null}
        {tab === 'gear' ? <GearTab md={md} accent={accent} /> : null}
        {tab === 'enchants' ? <EnchantsTab md={md} accent={accent} /> : null}
        {tab === 'players' ? <PlayersTab md={md} /> : null}
        <Pressable onPress={() => Linking.openURL('https://raider.io')}><Text style={s.attr}>{t.attribution} · raider.io</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function SampleLine({ md, isPvp, mode }: { md: ModeData; isPvp: boolean; mode: string }) {
  const m = md.meta, range = isPvp ? m.ratingRange : m.scoreRange;
  return (
    <View style={s.sample}>
      <Text style={s.sampleMain}>{isPvp ? `${t.topLadder(m.sampleSize)} · ${modeLabel(mode)}` : `${t.top5} · ${m.sampleSize} ${t.players}`}</Text>
      <Text style={s.sampleSub}>{isPvp ? t.ratingRange : t.scoreRange} {range?.[0]}–{range?.[1]} · {t.updated} {t.ago(hoursSince(m.updated))}</Text>
    </View>
  );
}

function TalentsTab({ build, md, tree, accent, isPvp }: { build: Build; md: ModeData; tree?: TreeData; accent: string; isPvp: boolean }) {
  const [group, setGroup] = useState<Group>('spec');
  const [copied, setCopied] = useState(false);
  const [allFlex, setAllFlex] = useState(false);
  const r = build.recommended;
  const flex = allFlex ? build.flex : build.flex.slice(0, 6);
  const nodes = useMemo(() => {
    if (!tree) return [];
    if (group === 'hero') return tree.hero.find((h) => h.name === build.heroTree)?.nodes ?? [];
    return tree[group];
  }, [tree, group, build.heroTree]);
  const copy = async () => {
    await Clipboard.setStringAsync(r.importString);
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };
  const list = build.talents.filter((x) => x.group === group && x.pct >= 5);

  return (
    <>
      <View style={[s.recCard, { borderColor: alpha(colors.gold, 0.35) }]}>
        <LinearGradient colors={[alpha(colors.gold, 0.1), 'transparent']} style={StyleSheet.absoluteFill} />
        <View style={s.recHead}>
          <Icon name={build.heroIcon} size={40} round border={colors.gold} fallback={build.heroTree} />
          <View style={{ marginLeft: space(3), flex: 1 }}>
            <Text style={s.recKicker}>{t.recommended}</Text>
            <Text style={s.recTitle}>{build.heroTree}</Text>
          </View>
        </View>
        <View style={s.importBox}><Text style={s.importText} numberOfLines={2}>{r.importString}</Text></View>
        <Pressable onPress={copy} style={({ pressed }) => [s.copyBtn, { backgroundColor: copied ? colors.good : colors.gold, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={s.copyText}>{copied ? `✓ ${t.copied}` : t.copy}</Text>
        </Pressable>
        <Text style={s.note}>{t.fromPlayer(r.fromPlayer)} · {r.within2 >= 40 ? t.consensusHint : t.variedBuilds}</Text>
        {r.diff > 0 ? <Text style={s.note}>{t.differs}: {[...r.extra.map((x) => `+ ${x}`), ...r.missing.map((x) => `− ${x}`)].join(', ')}</Text> : null}
      </View>

      <Card title={tree ? t.tree : t.allTalents} hint={t.treeHint}>
        <View style={{ marginBottom: space(4) }}>
          <Segmented accent={accent} value={group} onChange={setGroup} options={(['class', 'spec', 'hero'] as Group[]).map((g) => ({ value: g, label: g === 'hero' ? build.heroTree : t.groups[g] }))} />
        </View>
        {tree && nodes.length ? (
          <TalentTree nodes={nodes} talents={build.talents} accent={accent} />
        ) : (
          list.map((x) => <PctRow key={`${x.id}-${x.rank}`} icon={x.icon ?? ''} label={x.name + (x.rank > 1 ? ` (${x.rank})` : '')} pct={x.pct} accent={accent} strong={x.pct >= 50} />)
        )}
      </Card>

      {isPvp && md.pvpTalents?.length ? (
        <Card title={t.pvpTalents}>
          {md.pvpTalents.filter((p) => p.pct >= 3).map((p) => <PctRow key={p.name} icon={p.icon ?? ''} label={p.name} pct={p.pct} accent={accent} strong={p.pct >= 50} />)}
        </Card>
      ) : null}

      {build.flex.length ? (
        <Card title={t.flex} hint={t.flexHint}>
          {flex.map((f, i) => <PctRow key={`${f.name}-${f.rank}-${i}`} icon={f.icon ?? ''} label={f.name + (f.rank > 1 ? ` (${f.rank})` : '')} sub={t.groups[f.group as Group]} pct={f.pct} accent={accent} />)}
          {build.flex.length > 6 ? (
            <Pressable onPress={() => setAllFlex(!allFlex)} style={s.more}><Text style={[s.moreText, { color: accent }]}>{allFlex ? t.showLess : t.showAll(build.flex.length)}</Text></Pressable>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function StatsTab({ stats, accent }: { stats?: { order: string[]; avg: Record<string, number> }; accent: string }) {
  if (!stats) return null;
  const max = Math.max(...Object.values(stats.avg));
  return (
    <Card title={t.statPriority} hint={t.statHint}>
      <View style={s.statChainRow}>
        {stats.order.map((k, i) => (
          <React.Fragment key={k}>
            <View style={[s.statPill, i === 0 && { borderColor: colors.gold, backgroundColor: alpha(colors.gold, 0.12) }]}>
              <Text style={[s.statPillText, i === 0 && { color: colors.gold }]}>{t.stat[k as keyof typeof t.stat] ?? k}</Text>
            </View>
            {i < stats.order.length - 1 ? <Text style={s.gt}>›</Text> : null}
          </React.Fragment>
        ))}
      </View>
      {stats.order.map((k, i) => (
        <PctRow key={k} label={`${i + 1}. ${t.stat[k as keyof typeof t.stat] ?? k}`} valueText={`${stats.avg[k]}`} pct={(stats.avg[k] / max) * 100} accent={i === 0 ? colors.gold : accent} strong={i === 0} />
      ))}
    </Card>
  );
}

function GearTab({ md, accent }: { md: ModeData; accent: string }) {
  return (
    <>
      {slotOrder.filter((sl) => md.gear[sl]?.length).map((sl) => (
        <Card key={sl} title={slotNames[sl]}>
          {md.gear[sl].map((it, i) => (
            <PctRow key={`${it.id}-${i}`} icon={it.icon ?? ''} iconSize={36} label={it.name} labelColor={quality[it.quality || 'EPIC']} pct={it.pct} accent={accent} strong={i === 0} />
          ))}
        </Card>
      ))}
    </>
  );
}

function EnchantsTab({ md, accent }: { md: ModeData; accent: string }) {
  return (
    <>
      <Card title={t.tabs.enchants}>
        {slotOrder.filter((sl) => md.enchants[sl]?.length && md.enchants[sl][0].pct >= 10).map((sl) => (
          <View key={sl} style={{ marginBottom: space(1) }}>
            <Text style={s.slotLabel}>{slotNames[sl]}</Text>
            {md.enchants[sl].filter((e) => e.pct >= 5).map((e, i) => <PctRow key={e.name} label={e.name} labelColor={i === 0 ? quality.UNCOMMON : undefined} pct={e.pct} accent={accent} strong={i === 0} />)}
          </View>
        ))}
      </Card>
      <Card title={t.gems}>
        {md.gems.filter((g) => g.perPlayer >= 0.2).map((g) => (
          <View key={g.name} style={s.gemRow}>
            <Icon name={g.icon} size={28} fallback={g.name} />
            <Text style={s.gemName}>{g.name}</Text>
            <Text style={s.gemCount}>{g.perPlayer} {t.perPlayer}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function PlayersTab({ md }: { md: ModeData }) {
  return (
    <Card title={t.topPlayers}>
      {md.players.map((p, i) => (
        <Pressable key={`${p.realm}-${p.name}`} style={s.playerRow} onPress={() => Linking.openURL(`https://raider.io/characters/us/${p.realm}/${encodeURIComponent(p.name)}`)}>
          <Text style={[s.playerRank, i < 3 && { color: colors.gold }]}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.playerName}>{p.name}</Text>
            <Text style={s.playerRealm}>{p.realm}{p.maxKey ? ` · +${p.maxKey}` : ''}</Text>
          </View>
          <Text style={s.playerValue}>{p.value}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(3) },
  back: { color: colors.muted, fontSize: font.body, marginBottom: space(4) },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  specIconWrap: { shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, borderRadius: 12 },
  className: { fontSize: font.small, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 2, letterSpacing: -0.5 },
  sample: { marginTop: space(3) },
  sampleMain: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  sampleSub: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  body: { padding: space(4) },
  warn: { color: colors.warn, fontSize: font.small, marginBottom: space(3) },
  recCard: { borderRadius: radius.lg, borderWidth: 1, padding: space(4), marginBottom: space(3), backgroundColor: colors.surface, overflow: 'hidden' },
  recHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space(3) },
  recKicker: { color: colors.gold, fontSize: font.tiny, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  recTitle: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginTop: 1 },
  importBox: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  importText: { color: colors.muted, fontFamily: mono, fontSize: font.tiny },
  copyBtn: { marginTop: space(3), borderRadius: radius.md, paddingVertical: space(3) + 2, alignItems: 'center' },
  copyText: { color: '#14110A', fontWeight: '800', fontSize: font.body },
  note: { color: colors.muted, fontSize: font.small, marginTop: space(3) },
  more: { paddingVertical: space(2), alignItems: 'center' },
  moreText: { fontSize: font.small, fontWeight: '700' },
  statChainRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: space(4) },
  statPill: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 5, paddingHorizontal: space(3), marginVertical: 3, backgroundColor: colors.surface2 },
  statPillText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  gt: { color: colors.faint, fontSize: font.h3, marginHorizontal: 5 },
  slotLabel: { color: colors.faint, fontSize: font.tiny, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space(2), fontWeight: '700' },
  gemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  gemName: { color: colors.text, fontSize: font.body, flex: 1, marginLeft: space(3) },
  gemCount: { color: colors.muted, fontSize: font.small },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2) + 2, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  playerRank: { color: colors.faint, width: 28, fontSize: font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  playerName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  playerRealm: { color: colors.muted, fontSize: font.tiny, marginTop: 1 },
  playerValue: { color: colors.text, fontSize: font.body, fontVariant: ['tabular-nums'], fontWeight: '700' },
  attr: { color: colors.faint, fontSize: font.tiny, textAlign: 'center', marginTop: space(4) },
});
