// config/Themes.ts
//
// Fallback theme catalog. GameContext reads themes from the `store_themes`
// table first — this only kicks in if that table hasn't been migrated yet
// (or the fetch fails), so the Store page and theming always have *some*
// options rather than an empty screen. It's also the reference an admin can
// use to recreate the starter themes by hand if they're ever deleted.
//
// Every color is a plain hex/rgba string mapped straight onto the CSS custom
// properties defined in components/Debatto.css (see applyTheme in
// app/(app)/layout.tsx). "blue" is the app's one accent color used
// throughout — it doesn't have to be blue-hued, the variable name just
// stuck from the original palette.

export type ThemeColors = {
  bg: string; surface: string; surface2: string;
  border: string; border2: string;
  text: string; muted: string; faint: string;
  blue: string; blueSoft: string;
  red: string; redSoft: string;
  amber: string; amberSoft: string;
  green: string; greenSoft: string;
  purple: string; teal: string;
};

export type StoreTheme = {
  id: string;
  name: string;
  description: string;
  cost: number;
  isDefault: boolean;
  active: boolean;
  colors: ThemeColors;
  fontHeading: string;
  fontBody: string;
  googleFontUrl: string | null;
  backgroundImageUrl: string | null;
  backgroundOpacity: number;
};

export const DEFAULT_THEMES: StoreTheme[] = [
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    description: "The original Debatto look — free for everyone.",
    cost: 0,
    isDefault: true,
    active: true,
    colors: {
      bg: "#13141a", surface: "#1c1d26", surface2: "#22232f",
      border: "#2e2f3e", border2: "#3a3b50",
      text: "#d4d4e0", muted: "#6b6b84", faint: "#2a2b38",
      blue: "#6b9fff", blueSoft: "rgba(107,159,255,0.12)",
      red: "#ff7070", redSoft: "rgba(255,112,112,0.12)",
      amber: "#f5a623", amberSoft: "rgba(245,166,35,0.12)",
      green: "#5dbb8a", greenSoft: "rgba(93,187,138,0.12)",
      purple: "#a78bfa", teal: "#2dd4bf",
    },
    fontHeading: "'Playfair Display', serif",
    fontBody: "'DM Sans', sans-serif",
    googleFontUrl: null, // already imported globally in Debatto.css
    backgroundImageUrl: null,
    backgroundOpacity: 0.16,
  },
  {
    id: "crimson-ember",
    name: "Crimson Ember",
    description: "Dark, high-contrast, and a little dramatic.",
    cost: 300,
    isDefault: false,
    active: true,
    colors: {
      bg: "#160b0d", surface: "#221115", surface2: "#2b1418",
      border: "#3d1a1f", border2: "#4d2027",
      text: "#f2dede", muted: "#8a6b6f", faint: "#2b1418",
      blue: "#ff5d6c", blueSoft: "rgba(255,93,108,0.14)",
      red: "#ff7070", redSoft: "rgba(255,112,112,0.14)",
      amber: "#f5a623", amberSoft: "rgba(245,166,35,0.14)",
      green: "#5dbb8a", greenSoft: "rgba(93,187,138,0.14)",
      purple: "#c084fc", teal: "#f472b6",
    },
    fontHeading: "'Cinzel', serif",
    fontBody: "'DM Sans', sans-serif",
    googleFontUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap",
    backgroundImageUrl: null,
    backgroundOpacity: 0.16,
  },
  {
    id: "paper-light",
    name: "Paper Light",
    description: "Warm parchment tones for daytime reading.",
    cost: 400,
    isDefault: false,
    active: true,
    colors: {
      bg: "#f4ecd8", surface: "#fffaf0", surface2: "#f0e6cc",
      border: "#dcccaa", border2: "#c9b98e",
      text: "#2b2418", muted: "#8a7d5e", faint: "#ece1c4",
      blue: "#6b4f9e", blueSoft: "rgba(107,79,158,0.12)",
      red: "#c0392b", redSoft: "rgba(192,57,43,0.12)",
      amber: "#b8860b", amberSoft: "rgba(184,134,11,0.12)",
      green: "#3f7d54", greenSoft: "rgba(63,125,84,0.12)",
      purple: "#6b4f9e", teal: "#2f7a6b",
    },
    fontHeading: "'Merriweather', serif",
    fontBody: "'Inter', sans-serif",
    googleFontUrl: "https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Inter:wght@400;500;600&display=swap",
    backgroundImageUrl: null,
    backgroundOpacity: 0.16,
  },
];

// A curated list offered in the admin theme editor's font pickers — not
// exhaustive, just common Google Fonts pairings that read well as a heading
// or body face. Admins can still type a custom font-family/URL by hand.
export const FONT_PRESETS = {
  heading: [
    { label: "Playfair Display (serif)", family: "'Playfair Display', serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap" },
    { label: "Cinzel (serif, dramatic)", family: "'Cinzel', serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap" },
    { label: "Merriweather (serif, warm)", family: "'Merriweather', serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&display=swap" },
    { label: "Poppins (geometric)", family: "'Poppins', sans-serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap" },
    { label: "Space Mono (monospace)", family: "'Space Mono', monospace", googleFontUrl: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap" },
  ],
  body: [
    { label: "DM Sans", family: "'DM Sans', sans-serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" },
    { label: "Inter", family: "'Inter', sans-serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
    { label: "Source Sans 3", family: "'Source Sans 3', sans-serif", googleFontUrl: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&display=swap" },
    { label: "DM Mono", family: "'DM Mono', monospace", googleFontUrl: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" },
  ],
};
