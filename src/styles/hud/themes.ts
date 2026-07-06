// HUD theme registry. Each id maps to a `[data-hud-theme="<id>"]` reskin file in
// this folder (imported by ./index.css). The attribute is set on the `.app` root
// (App.tsx); the CSS scopes every override under `.hud`, so only the gameplay HUD
// is reskinned — the gacha/character overlays keep the base tokens.
export interface HudTheme {
  id: string;
  label: string;
  blurb: string;
}

export const HUD_THEMES: HudTheme[] = [
  {
    id: 'alfa',
    label: 'Alfa · klasiskā',
    blurb: 'Sākotnējais kluso-stiklu HUD. Asas malas, tumši zaļš.',
  },
  {
    id: 'celestia',
    label: 'Celestia · Genshin',
    blurb: 'Silts krēmstikls, zelta matlīnijas, mīksti noapaļots — Teivatas stils.',
  },
  {
    id: 'abyss',
    label: 'Abyss · neona sci-fi',
    blurb: 'Tumšs kosmokuģa panelis, ciāna/fuksīna spīdums, nogriezti stūri.',
  },
  {
    id: 'verdant',
    label: 'Verdant · rokraksts',
    blurb: 'Smaragds un pergaments, organiskas līnijas, tinte un lapu zelts.',
  },
  {
    id: 'synth',
    label: 'Synthwave · arkāde',
    blurb: 'Fuksīns + ciāns neons, biezas malas, spilgti spīdumi. Skaļš.',
  },
  {
    id: 'frost',
    label: 'Frost · minimāls',
    blurb: 'Vienkrāsains sals, matlīnijas, daudz tukšuma. Rāms un tīrs.',
  },
];

export const DEFAULT_HUD_THEME = 'frost';

export function isHudTheme(id: string | null): id is string {
  return !!id && HUD_THEMES.some(t => t.id === id);
}
