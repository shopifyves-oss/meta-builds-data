import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Consumable, ModeData } from '../data';
import { colors, font, space } from '../theme';
import Icon from './Icon';
import { Card } from './ui';

// Консумативи на топ играчите: отвари, healthstone (Warcraft Logs) и масло за оръжие (Blizzard)
export default function Consumables({ md }: { md: ModeData }) {
  const c = md.rotation?.consumables;
  const oils = (md.weaponBuffs || []).filter((w) => w.pct >= 5);
  if (!c && !oils.length) return null;
  return (
    <Card title="Consumables" hint="What top players use in their keys">
      {c?.combatPotions.length ? <Section title="Combat potion" items={c.combatPotions} /> : null}
      {c?.healing.length ? <Section title="Healing" items={c.healing} /> : null}
      {c && (c.potionsPerRun != null || c.healthstonesPerRun != null) ? (
        <Text style={s.note}>On average per key: {c.potionsPerRun ?? '—'} potions · {c.healthstonesPerRun ?? '—'} healthstones</Text>
      ) : null}
      {oils.length ? (
        <View style={{ marginTop: space(3) }}>
          <Text style={s.title}>Weapon buff</Text>
          {oils.map((w) => (
            <View key={w.name} style={s.row}>
              <Text style={s.name}>{w.name}</Text>
              <Text style={s.val}>{Math.round(w.pct)}% seen</Text>
            </View>
          ))}
          <Text style={s.note}>Seen on the weapon when the player was checked — real usage is higher.</Text>
        </View>
      ) : null}
    </Card>
  );
}

function Section({ title, items }: { title: string; items: Consumable[] }) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Text style={s.title}>{title}</Text>
      {items.map((x) => (
        <View key={x.name} style={s.row}>
          <Icon name={x.icon} size={28} fallback={x.name} />
          <Text style={[s.name, { marginLeft: space(3) }]} numberOfLines={1}>{x.name}</Text>
          <Text style={s.val}>{x.usage}% · {x.perRun}×/key</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  title: { color: colors.faint, fontSize: font.tiny, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  name: { color: colors.text, fontSize: font.body, flex: 1 },
  val: { color: colors.muted, fontSize: font.small, fontVariant: ['tabular-nums'] },
  note: { color: colors.faint, fontSize: font.tiny, marginTop: space(1) },
});
