import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Build, TreeData, useCdn } from '../data';
import { ClassInfo, decodeLoadout, detectHero } from '../lib/talentString';
import { colors, font, mono, radius, space } from '../theme';
import CompareResult from './CompareResult';
import { Card } from './ui';

// „Сравни моя билд“: поставяш import string от играта → разлики спрямо топ играчите
export default function CompareBuild({ classId, specId, builds, tree, accent }: { classId: number; specId: number; builds: Build[]; tree?: TreeData; accent: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ talents: Map<number, number>; hero?: string } | null>(null);
  const info = useCdn<ClassInfo>(open ? `classes/${classId}.json` : null);

  const run = (str: string) => {
    setError(null); setResult(null);
    if (!info.data) { setError('Still loading talent data — try again in a second.'); return; }
    try {
      const d = decodeLoadout(str, info.data);
      if (d.specId !== specId) { setError('This build is for a different spec. Open that spec and compare there.'); return; }
      setResult({ talents: d.talents, hero: tree ? detectHero(d, info.data, tree.hero) : undefined });
    } catch (e: any) { setError(e?.message ?? 'Could not read this import string.'); }
  };
  const paste = async () => { const s = (await Clipboard.getStringAsync()).trim(); setText(s); if (s) run(s); };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [s.cta, { borderColor: accent, opacity: pressed ? 0.8 : 1 }]}>
        <Text style={[s.ctaTitle, { color: accent }]}>Compare my build</Text>
        <Text style={s.ctaSub}>Paste your import string from the game and see what differs from top players</Text>
      </Pressable>
    );
  }
  return (
    <>
      <Card title="Compare my build" hint="In game: Talents → Share → Copy to clipboard">
        <TextInput value={text} onChangeText={setText} placeholder="Paste your talent import string…" placeholderTextColor={colors.faint}
          style={s.input} autoCapitalize="none" autoCorrect={false} multiline onSubmitEditing={() => run(text)} />
        <View style={{ flexDirection: 'row', marginTop: space(3) }}>
          <Pressable onPress={paste} style={[s.btn, { backgroundColor: accent, flex: 1, marginRight: space(2) }]}><Text style={s.btnTextDark}>Paste & compare</Text></Pressable>
          <Pressable onPress={() => run(text)} style={[s.btn, { borderWidth: 1, borderColor: colors.border, flex: 1 }]}><Text style={s.btnText}>Compare</Text></Pressable>
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </Card>
      {result ? <CompareResult talents={result.talents} builds={builds} detectedHero={result.hero} tree={tree} ignore={info.data?.specs[String(specId)]?.notInString ?? []} accent={accent} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  cta: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space(4), marginBottom: space(3), backgroundColor: colors.surface },
  ctaTitle: { fontSize: font.h3, fontWeight: '800' },
  ctaSub: { color: colors.muted, fontSize: font.small, marginTop: 3 },
  input: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: space(3), color: colors.text, fontFamily: mono, fontSize: font.tiny, minHeight: 64 },
  btn: { borderRadius: radius.md, paddingVertical: space(3), alignItems: 'center' },
  btnText: { color: colors.text, fontWeight: '700' },
  btnTextDark: { color: '#0B0D12', fontWeight: '800' },
  error: { color: colors.bad, fontSize: font.small, marginTop: space(3) },
});
