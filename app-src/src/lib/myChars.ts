import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Запазени герои („Моите герои“) — пазят се само на телефона.
export type MyChar = {
  region: string; realm: string; name: string;
  cls: string; spec: string; className: string; specName: string;
  thumb?: string; score?: number; matchPct?: number; checkedAt: string;
  metaSig?: string; // подпис на мета билда при последната проверка → „New meta build“
};
const KEY = 'myCharacters';
export const charKey = (c: { region: string; realm: string; name: string }) => `${c.region}/${c.realm}/${c.name}`.toLowerCase();

let cache: MyChar[] | null = null;
const listeners = new Set<(l: MyChar[]) => void>();
async function read(): Promise<MyChar[]> {
  if (cache) return cache;
  try { cache = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { cache = []; }
  return cache!;
}
async function write(list: MyChar[]) {
  cache = list;
  listeners.forEach((f) => f(list));
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}
export async function saveChar(c: MyChar) {
  const list = await read();
  const i = list.findIndex((x) => charKey(x) === charKey(c));
  const next = i >= 0 ? list.map((x, j) => (j === i ? { ...x, ...c } : x)) : [c, ...list].slice(0, 12);
  await write(next);
}
export async function updateCharIfSaved(c: Partial<MyChar> & { region: string; realm: string; name: string }) {
  const list = await read();
  if (!list.some((x) => charKey(x) === charKey(c))) return;
  await write(list.map((x) => (charKey(x) === charKey(c) ? { ...x, ...c } : x)));
}
export async function removeChar(c: { region: string; realm: string; name: string }) {
  await write((await read()).filter((x) => charKey(x) !== charKey(c)));
}
export function useMyChars() {
  const [list, setList] = useState<MyChar[]>(cache ?? []);
  useEffect(() => { read().then(setList); listeners.add(setList); return () => { listeners.delete(setList); }; }, []);
  return list;
}
