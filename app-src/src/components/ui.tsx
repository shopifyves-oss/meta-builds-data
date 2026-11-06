import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, font, radius, space } from '../theme';
import Icon from './Icon';

export function Card({ title, hint, children, style, right }: { title?: string; hint?: string; children: React.ReactNode; style?: ViewStyle; right?: React.ReactNode }) {
  return (
    <View style={[s.card, style]}>
      {title ? (
        <View style={s.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{title}</Text>
            {hint ? <Text style={s.cardHint}>{hint}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// Ред с име, % и тънка лента
export function PctRow({ label, pct, accent, sub, strong, valueText, icon, iconFallback, labelColor, iconSize = 32 }: {
  label: string; pct: number; accent: string; sub?: string; strong?: boolean; valueText?: string;
  icon?: string; iconFallback?: boolean; labelColor?: string; iconSize?: number;
}) {
  const withIcon = icon !== undefined || iconFallback;
  return (
    <View style={[s.row, withIcon && { flexDirection: 'row', alignItems: 'center' }]}>
      {withIcon ? <View style={{ marginRight: space(3) }}><Icon name={icon} size={iconSize} fallback={label} border={labelColor ?? (strong ? accent : colors.border)} /></View> : null}
      <View style={{ flex: 1 }}>
        <View style={s.rowTop}>
          <Text style={[s.rowLabel, strong && { fontWeight: '600' }, labelColor ? { color: labelColor } : null]} numberOfLines={1}>{label}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
          <Text style={[s.rowPct, strong && { color: colors.text }]}>{valueText ?? fmtPct(pct)}</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.max(2, Math.min(100, pct))}%` as `${number}%`, backgroundColor: accent, opacity: strong ? 1 : 0.55 }]} />
        </View>
      </View>
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return <View style={{ padding: space(10), alignItems: 'center' }}><Text style={{ color: colors.muted }}>{text ?? 'Loading…'}</Text></View>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: space(8), alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.h3 }}>Can't load data</Text>
      <Text style={{ color: colors.muted, fontSize: font.small, marginTop: space(2), textAlign: 'center' }}>Check your internet connection. ({message})</Text>
      <Pressable onPress={onRetry} style={{ marginTop: space(4), paddingVertical: space(2), paddingHorizontal: space(5), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, accent }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accent: string }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && { backgroundColor: colors.surface2, borderColor: accent }]}>
            <Text style={[s.segText, on && { color: colors.text, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Tabs<T extends string>({ options, value, onChange, accent }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accent: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: colors.bg }} contentContainerStyle={s.tabs}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.tab, on && { borderBottomColor: accent }]}>
            <Text style={[s.tabText, on && { color: colors.text, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Chip({ label, sub, on, accent, onPress, warn, icon }: { label: string; sub?: string; on?: boolean; accent: string; onPress?: () => void; warn?: boolean; icon?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && { borderColor: accent, backgroundColor: colors.surface2 }]}>
      {icon !== undefined ? <View style={{ marginRight: space(2), alignSelf: 'center' }}><Icon name={icon} size={20} round fallback={label} border={on ? accent : colors.border} /></View> : null}
      <Text style={[s.chipText, on && { color: colors.text }]}>{label}</Text>
      {sub ? <Text style={[s.chipSub, on && { color: accent }, warn && { color: colors.warn }]}>{sub}</Text> : null}
    </Pressable>
  );
}

export const fmtPct = (p: number) => `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), marginBottom: space(3) },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space(3) },
  cardTitle: { color: colors.text, fontSize: font.h3, fontWeight: '700' },
  cardHint: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  row: { marginBottom: space(3) },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 },
  rowLabel: { color: colors.text, fontSize: font.body, flex: 1 },
  rowSub: { color: colors.faint, fontSize: font.tiny, marginRight: space(2) },
  rowPct: { color: colors.muted, fontSize: font.small, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: space(2), borderRadius: radius.sm, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  segText: { color: colors.muted, fontSize: font.body },
  tabs: { paddingHorizontal: space(4), borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg, flexGrow: 1 },
  tab: { paddingVertical: space(3), marginRight: space(5), borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { color: colors.muted, fontSize: font.body },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: space(2), paddingHorizontal: space(3), marginRight: space(2), flexDirection: 'row', alignItems: 'center' },
  chipText: { color: colors.muted, fontSize: font.body, fontWeight: '600' },
  chipSub: { color: colors.faint, fontSize: font.small, marginLeft: space(2), fontVariant: ['tabular-nums'] },
});
