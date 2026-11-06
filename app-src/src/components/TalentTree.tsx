import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Talent, TreeNode } from '../data';
import { alpha, colors, font, radius, space } from '../theme';
import Icon from './Icon';
import { fmtPct } from './ui';

// Позиции: решетката от играта (display row/col), иначе raw x/y.
function layout(nodes: TreeNode[]) {
  const xs = nodes.map((n) => n.col ?? n.x ?? 0), ys = nodes.map((n) => n.row ?? n.y ?? 0);
  const step = (vals: number[]) => {
    const u = [...new Set(vals)].sort((a, b) => a - b);
    let m = Infinity; for (let i = 1; i < u.length; i++) m = Math.min(m, u[i] - u[i - 1]);
    return Number.isFinite(m) && m > 0 ? m : 1;
  };
  const sx = step(xs), sy = step(ys), minX = Math.min(...xs), minY = Math.min(...ys);
  const gx = nodes.map((_, i) => (xs[i] - minX) / sx), gy = nodes.map((_, i) => (ys[i] - minY) / sy);
  return { gx, gy, cols: Math.max(...gx) + 1, rows: Math.max(...gy) + 1 };
}

export default function TalentTree({ nodes, talents, accent }: { nodes: TreeNode[]; talents: Talent[]; accent: string }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const pctById = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of talents) m.set(t.id, (m.get(t.id) || 0) + t.pct);
    return m;
  }, [talents]);
  const L = useMemo(() => (nodes.length ? layout(nodes) : null), [nodes]);
  if (!nodes.length || !L) return null;

  const cell = w ? Math.min(52, w / L.cols) : 0;
  const size = Math.min(40, cell * 0.8);
  const rowH = Math.max(cell, size + 18); // място за % под иконата
  const H = L.rows * rowH;
  const offX = (w - L.cols * cell) / 2;
  const pos = (i: number) => ({ cx: offX + L.gx[i] * cell + cell / 2, cy: L.gy[i] * rowH + size / 2 + 4 });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  // Връзки: от locked_by и unlocks (без повторения)
  const edgeSet = new Set<string>(); const edges: [number, number][] = [];
  const addEdge = (p: number, c: number) => { const k = `${p}-${c}`; if (idx.has(p) && idx.has(c) && !edgeSet.has(k)) { edgeSet.add(k); edges.push([p, c]); } };
  for (const n of nodes) { (n.lockedBy || []).forEach((p) => addEdge(p, n.id)); (n.unlocks || []).forEach((c) => addEdge(n.id, c)); }
  const nodePct = (n: TreeNode) => Math.min(100, n.entries.reduce((s, e) => s + (pctById.get(e.id) || 0), 0));
  const selNode = sel != null ? nodes.find((n) => n.id === sel) : undefined;

  return (
    <View>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: w ? H : 200 }}>
        {w ? (
          <>
            <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
              {edges.map(([p, c]) => {
                const a = pos(idx.get(p)!), b = pos(idx.get(c)!);
                const on = nodePct(nodes[idx.get(c)!]) >= 50 && nodePct(nodes[idx.get(p)!]) >= 50;
                return <Line key={`${p}-${c}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={on ? colors.gold : colors.border} strokeWidth={on ? 2 : 1.5} strokeOpacity={on ? 0.85 : 1} />;
              })}
            </Svg>
            {nodes.map((n, i) => {
              const p = nodePct(n), { cx, cy } = pos(i);
              const top = [...n.entries].sort((a, b) => (pctById.get(b.id) || 0) - (pctById.get(a.id) || 0))[0];
              const tier = p >= 50 ? 'core' : p >= 15 ? 'flex' : 'off';
              const border = tier === 'core' ? colors.gold : tier === 'flex' ? accent : colors.border;
              return (
                <Pressable key={n.id} onPress={() => setSel(sel === n.id ? null : n.id)} hitSlop={4}
                  style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, alignItems: 'center' }}>
                  <View style={[tier === 'core' && { shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }, sel === n.id && s.selRing]}>
                    <Icon name={top?.icon} size={size} border={border} round={false} fallback={top?.name} dim={tier === 'off' ? 0.28 : tier === 'flex' ? 0.85 : 1} />
                    {n.choice ? <View style={[s.choice, { borderColor: border }]} /> : null}
                  </View>
                  {p >= 5 && p < 95 ? <Text style={[s.pct, { color: tier === 'core' ? colors.gold : colors.muted }]}>{Math.round(p)}%</Text> : null}
                </Pressable>
              );
            })}
          </>
        ) : null}
      </View>

      <View style={s.legend}>
        <View style={[s.dot, { backgroundColor: colors.gold }]} /><Text style={s.legendText}>≥50% of top players</Text>
        <View style={[s.dot, { backgroundColor: accent, marginLeft: space(3) }]} /><Text style={s.legendText}>15–50%</Text>
      </View>

      {selNode ? (
        <View style={s.info}>
          {selNode.entries.map((e) => (
            <View key={e.id} style={s.infoRow}>
              <Icon name={e.icon} size={30} fallback={e.name} border={colors.border} />
              <Text style={s.infoName}>{e.name}</Text>
              <Text style={s.infoPct}>{fmtPct(pctById.get(e.id) || 0)}</Text>
            </View>
          ))}
          {selNode.maxRank > 1 ? <Text style={s.infoHint}>Max rank {selNode.maxRank}</Text> : null}
          {selNode.choice ? <Text style={s.infoHint}>Choice node — top players pick one</Text> : null}
        </View>
      ) : (
        <Text style={s.tapHint}>Tap a talent to see how often top players take it</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pct: { fontSize: 9, marginTop: 2, fontWeight: '700', fontVariant: ['tabular-nums'] },
  choice: { position: 'absolute', right: -3, top: -3, width: 9, height: 9, borderRadius: 2, borderWidth: 1.5, backgroundColor: colors.bg, transform: [{ rotate: '45deg' }] },
  selRing: { borderRadius: 8, borderWidth: 2, borderColor: colors.text, margin: -2 },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: space(3) },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { color: colors.muted, fontSize: font.tiny },
  info: { marginTop: space(3), backgroundColor: alpha(colors.bg, 0.6), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space(2) },
  infoName: { color: colors.text, fontSize: font.body, fontWeight: '600', flex: 1, marginLeft: space(3) },
  infoPct: { color: colors.gold, fontSize: font.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  infoHint: { color: colors.faint, fontSize: font.tiny },
  tapHint: { color: colors.faint, fontSize: font.tiny, marginTop: space(2) },
});
