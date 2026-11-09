import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DungeonDiff, Rotation } from '../data';
import { colors, font, space } from '../theme';
import Icon from './Icon';
import { Card, Chip } from './ui';

// Таланти по подземие: какво топ играчите сменят спрямо обичайния си билд
export default function DungeonTalents({ dungeons, accent }: { dungeons: NonNullable<Rotation['dungeons']>; accent: string }) {
  const [i, setI] = useState(0);
  const d = dungeons[Math.min(i, dungeons.length - 1)];
  if (!d) return null;
  return (
    <Card title="By dungeon" hint="Talents top players swap in for a specific dungeon">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space(3) }}>
        {dungeons.map((x, j) => <Chip key={x.dungeon} label={x.dungeon} on={j === i} accent={accent} onPress={() => setI(j)} />)}
      </ScrollView>
      {!d.more.length && !d.less.length ? <Text style={s.same}>Top players use their usual build here.</Text> : null}
      <List title="Taken more here" items={d.more} color={colors.good} />
      <List title="Taken less here" items={d.less} color={colors.warn} />
      <Text style={s.note}>Based on {d.logs} top logs in {d.dungeon}.</Text>
    </Card>
  );
}

function List({ title, items, color }: { title: string; items: DungeonDiff[]; color: string }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: space(3) }}>
      <Text style={[s.title, { color }]}>{title}</Text>
      {items.map((x) => (
        <View key={x.nodeId} style={s.row}>
          <Icon name={x.icon} size={28} border={color} fallback={x.name} />
          <Text style={s.name} numberOfLines={1}>{x.name}</Text>
          <Text style={s.val}><Text style={{ color, fontWeight: '800' }}>{x.here}%</Text><Text style={s.vs}>  vs {x.overall}%</Text></Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: font.tiny, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  name: { color: colors.text, fontSize: font.body, flex: 1, marginLeft: space(3) },
  val: { fontSize: font.small, fontVariant: ['tabular-nums'] },
  vs: { color: colors.faint, fontSize: font.tiny },
  same: { color: colors.muted, fontSize: font.small, marginBottom: space(3) },
  note: { color: colors.faint, fontSize: font.tiny },
});
