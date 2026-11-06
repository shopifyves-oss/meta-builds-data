import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { iconUrl } from '../data';
import { colors } from '../theme';

// Икона от играта (render.worldofwarcraft.com). Без икона → буква в кутийка.
export default function Icon({ name, size = 28, border, round, fallback, dim }: { name?: string; size?: number; border?: string; round?: boolean; fallback?: string; dim?: number }) {
  const r = round ? size / 2 : Math.max(4, size * 0.18);
  return (
    <View style={[s.wrap, { width: size, height: size, borderRadius: r, borderColor: border ?? colors.border, opacity: dim ?? 1 }]}>
      {name ? (
        <Image source={{ uri: iconUrl(name, size > 40 ? 56 : 36) }} style={{ width: size - 2, height: size - 2, borderRadius: r - 1 }} cachePolicy="memory-disk" transition={120} />
      ) : (
        <Text style={[s.fb, { fontSize: size * 0.42 }]}>{(fallback || '?').slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { borderWidth: 1, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fb: { color: colors.muted, fontWeight: '700' },
});
