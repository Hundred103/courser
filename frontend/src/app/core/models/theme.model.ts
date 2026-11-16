export const ACCENT_OPTIONS = [
  { id: 'coral', label: 'Koralowy', value: '#ff6b35' },
  { id: 'blue', label: 'Niebieski', value: '#3b82f6' },
  { id: 'green', label: 'Zielony', value: '#22c55e' },
  { id: 'violet', label: 'Fioletowy', value: '#8b5cf6' },
  { id: 'turquoise', label: 'Turkusowy', value: '#14b8a6' },
  { id: 'pink', label: 'Różowy', value: '#ec4899' },
] as const;

export type AccentColor = typeof ACCENT_OPTIONS[number]['id'];
export const DEFAULT_ACCENT_COLOR: AccentColor = 'coral';

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === 'string' && ACCENT_OPTIONS.some((option) => option.id === value);
}
