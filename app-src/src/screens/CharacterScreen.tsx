import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { classBySlug } from '../classes';
import CompareResult from '../components/CompareResult';
import Icon from '../components/Icon';
import { Card, Segmented, fmtPct } from '../components/ui';
import { SpecData, TreeData, useCdn } from '../data';
import { checkGear, rioQuality, RioItem } from '../lib/compare';
import { ClassInfo, decodeLoadout, detectHero } from '../lib/talentString';
import { slotNames, slotOrder, t } from '../strings';
import { alpha, colors, font, quality, radius, space } from '../theme';

type Region = 'us' | 'eu';
type Profile = {
  name: string; realm: string; region: string; class: string; active_spec_name: string; thumbnail_url?: string; profile_url?: string;
  gear?: { item_level_equipped: number; items: Record<string, RioItem> };
  talentLoadout?: { loadout_text?: string };
  mythic_plus_scores_by_season?: { scores: { all: number } }[];
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const LAST = 'lastCharacter';

export default function CharacterScreen({ onBack, onOpenSpec }: { onBack: () => void; onOpenSpec: (cls: string, spec: string) => void }) {
  const [region, setRegion] = useState<Region>('us');
  const [realm, setRealm] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => { AsyncStorage.getItem(LAST).then((s) => { if (s) { const v = JSON.parse(s); setRegion(v.region); setRealm(v.realm); setName(v.name); } }).catch(() => {}); }, []);

  const search = async () => {
    if (!name.trim() || !realm.trim()) { setError('Enter your character name and realm.'); return; }
    setLoading(true); setError(null); setProfile(null);
    try {
      const url = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${encodeURIComponent(realm.trim())}&name=${encodeURIComponent(name.trim())}&fields=gear,talents,mythic_plus_scores_by_season:current`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status === 400 || res.status === 404 ? 'Character not found on Raider.IO. Check the name and realm (the character needs a Mythic+ key this season).' : `Raider.IO error ${res.status}`);
      const p = (await res.json()) as Profile;
      setProfile(p);
      AsyncStorage.setItem(LAST, JSON.stringify({ region, realm: realm.trim(), name: name.trim() })).catch(() => {});
    } catch (e: any) { setError(e?.message ?? 'Something went wrong'); }
    setLoading(false);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
      <LinearGradient colors={['#1A2236', colors.bg]} style={s.hero}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={s.back}>‹ {t.back}</Text></Pressable>
        <Text style={s.kicker}>Check my character</Text>
        <Text style={s.title}>How close are you to the meta?</Text>
        <View style={{ marginTop: space(4) }}>
          <Segmented accent={colors.gold} value={region} onChange={setRegion} options={[{ value: 'us', label: 'US' }, { value: 'eu', label: 'EU' }]} />
        </View>
        <TextInput value={name} onChangeText={setName} placeholder="Character name" placeholderTextColor={colors.faint} style={s.input} autoCapitalize="words" autoCorrect={false} returnKeyType="next" />
        <TextInput value={realm} onChangeText={setRealm} placeholder="Realm (e.g. Area 52)" placeholderTextColor={colors.faint} style={s.input} autoCorrect={false} returnKeyType="search" onSubmitEditing={search} />
        <Pressable onPress={search} style={({ pressed }) => [s.searchBtn, { opacity: pressed || loading ? 0.8 : 1 }]}>
          {loading ? <ActivityIndicator color="#14110A" /> : <Text style={s.searchText}>Check character</Text>}
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </LinearGradient>
      {profile ? <Report profile={profile} onOpenSpec={onOpenSpec} /> : null}
    </ScrollView>
  );
}

function Report({ profile: p, onOpenSpec }: { profile: Profile; onOpenSpec: (cls: string, spec: string) => void }) {
  const cls = slug(p.class), spec = slug(p.active_spec_name);
  const c = classBySlug(cls);
  const accent = c?.color ?? colors.gold;
  const sd = useCdn<SpecData>(`specs/${cls}-${spec}.json`);
  const tree = useCdn<TreeData>(sd.data?.hasTree ? `trees/${sd.data.specId}.json` : null);
  const info = useCdn<ClassInfo>(sd.data ? `classes/${sd.data.classId}.json` : null);
  const md = sd.data?.modes.mplus;
  const score = Math.round(p.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0);

  let decoded: { talents: Map<number, number>; hero?: string } | null = null, talentError: string | null = null;
  if (p.talentLoadout?.loadout_text && info.data && sd.data) {
    try {
      const d = decodeLoadout(p.talentLoadout.loadout_text, info.data);
      decoded = { talents: d.talents, hero: tree.data ? detectHero(d, info.data, tree.data.hero) : undefined };
    } catch (e: any) { talentError = e?.message; }
  }
  const gear = md && p.gear ? checkGear(p.gear.items, md) : [];
  gear.sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));
  const missingEnchants = gear.filter((g) => g.enchantStatus === 'missing').length;

  return (
    <View style={{ padding: space(4) }}>
      <View style={[s.charCard, { borderColor: alpha(accent, 0.4) }]}>
        {p.thumbnail_url ? <Image source={{ uri: p.thumbnail_url }} style={s.avatar} /> : <View style={[s.avatar, { backgroundColor: colors.surface2 }]} />}
        <View style={{ flex: 1, marginLeft: space(3) }}>
          <Text style={s.charName}>{p.name}</Text>
          <Text style={[s.charSpec, { color: accent }]}>{p.active_spec_name} {p.class}</Text>
          <Text style={s.charRealm}>{p.realm} · {p.region.toUpperCase()}{p.gear ? ` · ilvl ${p.gear.item_level_equipped}` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.scoreBig}>{score}</Text>
          <Text style={s.scoreLabel}>M+ score</Text>
        </View>
      </View>

      {md?.meta.cutoffScore ? (
        <View style={[s.banner, { borderColor: score >= md.meta.cutoffScore ? colors.good : colors.border }]}>
          <Text style={s.bannerText}>
            {score >= md.meta.cutoffScore
              ? `🏆 You're in the top 5% of ${p.active_spec_name} ${p.class}s (cutoff ${md.meta.cutoffScore}).`
              : `Top 5% of ${p.active_spec_name} ${p.class}s starts at ${md.meta.cutoffScore} — you're ${md.meta.cutoffScore - score} points away.`}
          </Text>
        </View>
      ) : null}

      {sd.loading ? <ActivityIndicator color={colors.muted} style={{ marginTop: space(6) }} /> : null}
      {sd.error ? <Text style={s.error}>No meta data for {p.active_spec_name} {p.class} yet.</Text> : null}

      {md && decoded ? (
        <CompareResult talents={decoded.talents} builds={md.builds} detectedHero={decoded.hero} tree={tree.data} ignore={info.data?.specs[String(sd.data!.specId)]?.notInString ?? []} accent={accent} />
      ) : talentError ? <Text style={s.error}>Couldn't read talents: {talentError}</Text> : null}

      {gear.length ? (
        <Card title="Gear check" hint={missingEnchants ? `${missingEnchants} slot${missingEnchants > 1 ? 's' : ''} missing an enchant most top players use` : 'Enchants look good'}>
          {gear.map((g) => (
            <View key={g.slot} style={s.gearRow}>
              <Icon name={g.item.icon} size={36} border={quality[rioQuality(g.item.item_quality) || 'EPIC']} fallback={g.item.name} />
              <View style={{ flex: 1, marginLeft: space(3) }}>
                <Text style={s.slot}>{slotNames[g.slot] ?? g.slot} · {g.item.item_level}</Text>
                <Text style={[s.itemName, { color: quality[rioQuality(g.item.item_quality) || 'EPIC'] }]} numberOfLines={1}>{g.item.name}</Text>
                <Text style={s.itemNote} numberOfLines={2}>
                  {g.popularity != null ? `Used by ${fmtPct(g.popularity)} of top players` : g.topItem ? `Top players mostly use ${g.topItem.name} (${fmtPct(g.topItem.pct)})` : ''}
                </Text>
                {g.enchantStatus === 'missing' ? <Text style={[s.ench, { color: colors.bad }]}>✗ No enchant — {fmtPct(g.topEnchant!.pct)} use {g.topEnchant!.name}</Text> : null}
                {g.enchantStatus === 'different' ? <Text style={[s.ench, { color: colors.warn }]}>⚠ Different enchant — most use {g.topEnchant!.name}</Text> : null}
                {g.enchantStatus === 'ok' ? <Text style={[s.ench, { color: colors.good }]}>✓ Enchanted</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {c && sd.data ? (
        <Pressable onPress={() => onOpenSpec(cls, spec)} style={[s.openBtn, { borderColor: accent }]}>
          <Text style={[s.openText, { color: accent }]}>Open {p.active_spec_name} {p.class} meta ›</Text>
        </Pressable>
      ) : null}
      {p.profile_url ? <Pressable onPress={() => Linking.openURL(p.profile_url!)}><Text style={s.attr}>Character data from Raider.IO · view profile</Text></Pressable> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(5) },
  back: { color: colors.muted, fontSize: font.body, marginBottom: space(4) },
  kicker: { color: colors.gold, fontSize: font.tiny, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '800' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: space(1), letterSpacing: -0.3 },
  input: { marginTop: space(3), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3), color: colors.text, fontSize: font.body },
  searchBtn: { marginTop: space(4), backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: space(3) + 2, alignItems: 'center' },
  searchText: { color: '#14110A', fontWeight: '800', fontSize: font.body },
  error: { color: colors.bad, fontSize: font.small, marginTop: space(3) },
  charCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: space(3), marginBottom: space(3) },
  avatar: { width: 56, height: 56, borderRadius: 10 },
  charName: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  charSpec: { fontSize: font.small, fontWeight: '700', marginTop: 1 },
  charRealm: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  scoreBig: { color: colors.gold, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  scoreLabel: { color: colors.faint, fontSize: font.tiny },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space(3), marginBottom: space(3), backgroundColor: colors.surface },
  bannerText: { color: colors.text, fontSize: font.small, lineHeight: 18 },
  gearRow: { flexDirection: 'row', paddingVertical: space(2) + 2, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  slot: { color: colors.faint, fontSize: font.tiny, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  itemName: { fontSize: font.body, fontWeight: '600', marginTop: 1 },
  itemNote: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  ench: { fontSize: font.tiny, fontWeight: '700', marginTop: 3 },
  openBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: space(3), alignItems: 'center', marginTop: space(2) },
  openText: { fontWeight: '800', fontSize: font.body },
  attr: { color: colors.faint, fontSize: font.tiny, textAlign: 'center', marginTop: space(4) },
});
