import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { RotationCore } from '../data';
import { colors, font, space } from '../theme';
import Icon from './Icon';
import { Card, PctRow } from './ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Ротация на топ играчите (Mythic+ логове от Warcraft Logs)
export default function RotationTab({ rot, accent, hero }: { rot: RotationCore; accent: string; hero?: string }) {
  const maxCpm = Math.max(...rot.core.map((a) => a.cpm), 1);
  return (
    <>
      <Text style={s.lead}>{hero ? `${hero} · ` : ''}Based on {rot.fights} top Mythic+ logs (average +{rot.avgKey} key).</Text>

      <Card title="Opener" hint="The first casts of a run — most common ability at each step">
        <View style={s.opener}>
          {rot.opener.map((a, i) => (
            <View key={i} style={s.step}>
              <Icon name={a.icon} size={38} border={a.agree >= 60 ? accent : colors.border} fallback={a.name} dim={a.agree >= 40 ? 1 : 0.6} />
              <Text style={s.stepNum}>{i + 1}</Text>
              {i < rot.opener.length - 1 ? <Text style={s.arrow}>›</Text> : null}
            </View>
          ))}
        </View>
        <Text style={s.hint}>Bright border = most top players start the same way at that step.</Text>
      </Card>

      <Card title="Core abilities" hint="Casts per minute — median of top players">
        {rot.core.map((a, i) => (
          <PctRow key={a.id} icon={a.icon ?? ''} label={a.name} sub={a.usage < 90 ? `${a.usage}% use` : undefined} valueText={`${a.cpm}/min`} pct={(a.cpm / maxCpm) * 100} accent={accent} strong={i < 3} />
        ))}
      </Card>

      {rot.cooldowns.length ? (
        <Card title="Cooldowns" hint="How often top players use their big cooldowns">
          {rot.cooldowns.map((a) => (
            <View key={a.id} style={s.cdRow}>
              <Icon name={a.icon} size={34} border={colors.gold} fallback={a.name} />
              <View style={{ flex: 1, marginLeft: space(3) }}>
                <Text style={s.cdName}>{a.name}</Text>
                <Text style={s.cdSub}>First use at {mmss(a.firstUse)} · used by {a.usage}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.cdVal}>{a.per5min}×</Text>
                <Text style={s.cdUnit}>per 5 min</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {rot.utility?.length ? (
        <Card title="Utility & defensives" hint="Interrupts, movement and defensives top players use most">
          <View style={s.utilWrap}>
            {rot.utility.map((a) => (
              <View key={a.id} style={s.util}>
                <Icon name={a.icon} size={28} fallback={a.name} />
                <View style={{ marginLeft: space(2) }}>
                  <Text style={s.utilName} numberOfLines={1}>{a.name}</Text>
                  <Text style={s.utilSub}>{a.cpm}/min</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Pressable onPress={() => Linking.openURL('https://www.warcraftlogs.com')}>
        <Text style={s.attr}>Rotation data from Warcraft Logs</Text>
      </Pressable>
    </>
  );
}

const s = StyleSheet.create({
  lead: { color: colors.muted, fontSize: font.small, marginBottom: space(3) },
  opener: { flexDirection: 'row', flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: space(3) },
  stepNum: { position: 'absolute', left: 2, top: -6, color: colors.text, fontSize: 9, fontWeight: '800', backgroundColor: colors.bg, paddingHorizontal: 3, borderRadius: 4, overflow: 'hidden' },
  arrow: { color: colors.faint, fontSize: 18, marginHorizontal: 3 },
  hint: { color: colors.faint, fontSize: font.tiny },
  cdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  cdName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  cdSub: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  cdVal: { color: colors.gold, fontSize: font.h3, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cdUnit: { color: colors.faint, fontSize: font.tiny },
  utilWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  util: { flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: space(3), paddingRight: space(2) },
  utilName: { color: colors.text, fontSize: font.small, fontWeight: '600', maxWidth: 120 },
  utilSub: { color: colors.muted, fontSize: font.tiny },
  attr: { color: colors.faint, fontSize: font.tiny, textAlign: 'center', marginTop: space(2) },
});
