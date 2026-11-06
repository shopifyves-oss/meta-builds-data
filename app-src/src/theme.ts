export const colors = {
  bg: '#090B10',
  bg2: '#0E1219',
  surface: '#131823',
  surface2: '#1A2130',
  border: '#252D3E',
  borderSoft: '#1D2433',
  text: '#ECEFF6',
  muted: '#8E97AA',
  faint: '#5A6377',
  gold: '#E9C46A',
  goldDim: '#9C8241',
  good: '#4CC38A',
  warn: '#E8B04A',
};
export const quality: Record<string, string> = {
  POOR: '#9D9D9D', COMMON: '#FFFFFF', UNCOMMON: '#1EFF00', RARE: '#0070DD',
  EPIC: '#A335EE', LEGENDARY: '#FF8000', ARTIFACT: '#E6CC80', HEIRLOOM: '#00CCFF',
};
export const radius = { sm: 8, md: 12, lg: 16, xl: 20 };
export const space = (n: number) => n * 4;
export const font = { title: 28, h2: 18, h3: 15, body: 14, small: 12, tiny: 11 };
export const mono = 'Menlo';
// Полупрозрачен вариант на цвят (#RRGGBB → #RRGGBBAA)
export const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
