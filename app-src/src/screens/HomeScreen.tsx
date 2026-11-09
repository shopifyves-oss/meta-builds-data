import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CLASSES } from '../classes';
import Icon from '../components/Icon';
import { ErrorBox, Loading } from '../components/ui';
import { IndexData, useCdn } from '../data';
import { charKey, MyChar, useMyChars } from '../lib/myChars';
import { Image } from 'expo-image';
import { classBySlug } from '../classes';
import { t } from '../strings';
import { alpha, colors, font, radius, space } from '../theme';

type Role = 'all' | 'tank' | 'healer' | 'dps';
const hoursSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);

export default function HomeScreen({ onOpen, onCharacter }: { onOpen: (cls: string, spec: string) => void; onCharacter: (who?: MyChar) => void }) {
  const { data, error, loading, reload } = useCdn<IndexData>('index.json');
  const [role, setRole] = useState<Role>('all');
  const byId = useMemo(() => new Map((data?.specs || []).map((s) => [s.id, s])), [data]);
  const mine = useMyChars();

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: space(12) }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.muted} />}>
      <LinearGradient colors={['#1A2236', colors.bg]} style={s.hero}>
        <Text style={s.season}>{t.season}</Text>
        <Text style={s.title}>{t.appName}</Text>
        <Text style={s.tagline}>{t.appTagline}</Text>
        {data ? <Text style={s.updated}>● {t.updated} {t.ago(hoursSince(data.generatedAt))} · {data.region.toUpperCase()}</Text> : null}
        <Pressable onPress={() => onCharacter()} style={({ pressed }) => [s.charCta, pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={[alpha(colors.gold, 0.22), alpha(colors.gold, 0.06)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.charCtaInner}>
            <Text style={s.charCtaIcon}>⚔</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.charCtaTitle}>Check my character</Text>
              <Text style={s.charCtaSub}>Compare your talents & gear with the top players</Text>
            </View>
            <Text style={s.charCtaArrow}>›</Text>
          </LinearGradient>
        </Pressable>
        <View style={s.roles}>
          {(['all', 'tank', 'healer', 'dps'] as Role[]).map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} style={[s.role, role === r && s.roleOn]}>
              <Text style={[s.roleText, role === r && { color: colors.bg }]}>{t.roles[r]}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {mine.length ? (
        <View style={{ marginBottom: space(4) }}>
          <Text style={s.sectionTitle}>My characters</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space(4) }}>
            {mine.map((c) => {
              const col = classBySlug(c.cls)?.color ?? colors.gold;
              const sig = byId.get(`${c.cls}-${c.spec}`)?.modes.mplus?.sig;
              const changed = !!(sig && c.metaSig && sig !== c.metaSig);
              return (
                <Pressable key={charKey(c)} onPress={() => onCharacter(c)} style={({ pressed }) => [s.myCard, { borderColor: alpha(col, 0.45) }, pressed && { opacity: 0.85 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {c.thumb ? <Image source={{ uri: c.thumb }} style={s.myThumb} /> : <View style={[s.myThumb, { backgroundColor: colors.surface2 }]} />}
                    <View style={{ marginLeft: space(2), flex: 1 }}>
                      <Text style={s.myName} numberOfLines={1}>{c.name}</Text>
                      <Text style={[s.mySpec, { color: col }]} numberOfLines={1}>{c.specName}</Text>
                    </View>
                  </View>
                  <View style={s.myStats}>
                    <View><Text style={s.myVal}>{c.score ?? '—'}</Text><Text style={s.myLbl}>score</Text></View>
                    <View><Text style={[s.myVal, { color: (c.matchPct ?? 0) >= 90 ? colors.good : (c.matchPct ?? 0) >= 75 ? colors.warn : colors.text }]}>{c.matchPct != null ? `${c.matchPct}%` : '—'}</Text><Text style={s.myLbl}>talents</Text></View>
                  </View>
                  {changed ? <Text style={s.myBadge}>● New meta build</Text> : <Text style={s.myRealm} numberOfLines={1}>{c.realm} · {c.region.toUpperCase()}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!data && loading ? <Loading /> : null}
      {!data && error ? <ErrorBox message={error} onRetry={reload} /> : null}

      {data ? (
        <View style={{ paddingHorizontal: space(4) }}>
          {CLASSES.map((c) => {
            const specs = c.specs.filter((sp) => role === 'all' || sp.role === role);
            if (!specs.length) return null;
            const any = byId.get(`${c.slug}-${c.specs[0].slug}`) || c.specs.map((sp) => byId.get(`${c.slug}-${sp.slug}`)).find(Boolean);
            return (
              <View key={c.slug} style={[s.classCard, { borderColor: alpha(c.color, 0.25) }]}>
                <LinearGradient colors={[alpha(c.color, 0.16), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.classHead}>
                  <Icon name={any?.classIcon} size={30} round border={c.color} fallback={c.name} />
                  <Text style={[s.className, { color: c.color }]}>{c.name}</Text>
                </LinearGradient>
                <View style={s.specGrid}>
                  {specs.map((sp) => {
                    const d = byId.get(`${c.slug}-${sp.slug}`);
                    const top = d?.modes.mplus?.heroTrees[0] ?? Object.values(d?.modes || {})[0]?.heroTrees[0];
                    return (
                      <Pressable key={sp.slug} disabled={!d} onPress={() => onOpen(c.slug, sp.slug)} style={({ pressed }) => [s.spec, pressed && { backgroundColor: colors.surface2 }, !d && { opacity: 0.4 }]}>
                        <Icon name={d?.icon} size={40} border={alpha(c.color, 0.7)} fallback={sp.name} />
                        <View style={{ flex: 1, marginLeft: space(3) }}>
                          <Text style={s.specName} numberOfLines={1}>{sp.name}</Text>
                          <Text style={s.specSub} numberOfLines={1}>{top ? `${top.name} · ${Math.round(top.pct)}%` : t.soon}</Text>
                        </View>
                        <Text style={s.roleTag}>{t.roleShort[sp.role]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={s.attr}>{t.attribution}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(5) },
  season: { color: colors.gold, fontSize: font.tiny, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: space(1), letterSpacing: -0.5 },
  tagline: { color: colors.muted, fontSize: font.body, marginTop: space(1) },
  updated: { color: colors.good, fontSize: font.tiny, marginTop: space(3) },
  roles: { flexDirection: 'row', marginTop: space(5) },
  charCta: { marginTop: space(5), borderRadius: radius.lg, borderWidth: 1, borderColor: alpha(colors.gold, 0.45), overflow: 'hidden' },
  charCtaInner: { flexDirection: 'row', alignItems: 'center', padding: space(4) },
  charCtaIcon: { color: colors.gold, fontSize: 24, marginRight: space(3) },
  charCtaTitle: { color: colors.text, fontSize: font.h3, fontWeight: '800' },
  charCtaSub: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  charCtaArrow: { color: colors.gold, fontSize: 28, fontWeight: '300' },
  role: { paddingVertical: space(2), paddingHorizontal: space(4), borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: space(2), backgroundColor: colors.surface },
  roleOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  roleText: { color: colors.muted, fontSize: font.small, fontWeight: '700' },
  classCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, marginBottom: space(3), overflow: 'hidden' },
  classHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(3), paddingVertical: space(3) },
  className: { fontSize: font.h3, fontWeight: '800', marginLeft: space(3), letterSpacing: 0.3 },
  specGrid: { paddingHorizontal: space(2), paddingBottom: space(2) },
  spec: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2), paddingHorizontal: space(2), borderRadius: radius.md },
  specName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  specSub: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  roleTag: { color: colors.faint, fontSize: font.tiny, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { color: colors.text, fontSize: font.h3, fontWeight: '800', paddingHorizontal: space(4), marginBottom: space(3) },
  myCard: { width: 176, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: space(3), marginRight: space(3) },
  myThumb: { width: 36, height: 36, borderRadius: 8 },
  myName: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  mySpec: { fontSize: font.tiny, fontWeight: '700', marginTop: 1 },
  myStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space(3) },
  myVal: { color: colors.text, fontSize: font.h3, fontWeight: '800', fontVariant: ['tabular-nums'] },
  myLbl: { color: colors.faint, fontSize: font.tiny },
  myBadge: { color: colors.gold, fontSize: font.tiny, fontWeight: '800', marginTop: space(2) },
  myRealm: { color: colors.faint, fontSize: font.tiny, marginTop: space(2) },
  attr: { color: colors.faint, fontSize: font.tiny, textAlign: 'center', marginTop: space(6) },
});
