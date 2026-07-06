// The always-visible main menu (left rail), shared by the wish screen and the
// character detail modal so the menu is reachable from both. 'profile' opens the
// owned-character modal; the rest are wish-screen tabs.
export type MenuId = 'banners' | 'party' | 'characters' | 'profile' | 'inventory';

export const MAIN_MENU: { id: MenuId; label: string; glyph: string }[] = [
  { id: 'banners', label: 'BANERI', glyph: '✦' },
  { id: 'party', label: 'KOMANDA', glyph: '⚑' },
  { id: 'characters', label: 'VAROŅI', glyph: '❖' },
  { id: 'profile', label: 'VARONIS', glyph: '◉' },
  { id: 'inventory', label: 'IEROČI', glyph: '▦' },
];
