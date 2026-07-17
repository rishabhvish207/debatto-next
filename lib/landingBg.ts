// lib/landingBg.ts
//
// Server-only fetch for the landing page's background image. Deliberately a
// plain REST call instead of the Supabase JS client — app/page.tsx is a
// Server Component and we want it to stay that way (zero client JS for the
// very first thing anyone loads), so this avoids pulling any client-side
// Supabase machinery into that route. The value is public (app_settings has
// a public-read RLS policy), so no auth/session handling is needed here.

function supabaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export async function getLandingBg(): Promise<{ url: string | null; opacity: number; subtext: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const DEFAULT_OPACITY = 0.16;
  const DEFAULT_SUBTEXT = "It's not about being right.\nIt's about being logical.";
  if (!url || !key) return { url: null, opacity: DEFAULT_OPACITY, subtext: DEFAULT_SUBTEXT };

  try {
    const res = await fetch(
      `${supabaseUrl()}/rest/v1/app_settings?key=in.(landing_bg_url,landing_bg_opacity,landing_subtext)&select=key,value`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 60 }, // admin changes show up within a minute, not instantly, without hitting the DB on every request
      }
    );
    if (!res.ok) return { url: null, opacity: DEFAULT_OPACITY, subtext: DEFAULT_SUBTEXT };
    const rows = await res.json();
    const map: Record<string, any> = {};
    for (const row of rows || []) map[row.key] = row.value;
    const bgUrl = typeof map.landing_bg_url === "string" && map.landing_bg_url ? map.landing_bg_url : null;
    const opacity = typeof map.landing_bg_opacity === "number" ? map.landing_bg_opacity : DEFAULT_OPACITY;
    const subtext = typeof map.landing_subtext === "string" && map.landing_subtext.trim() ? map.landing_subtext : DEFAULT_SUBTEXT;
    return { url: bgUrl, opacity, subtext };
  } catch {
    return { url: null, opacity: DEFAULT_OPACITY, subtext: DEFAULT_SUBTEXT };
  }
}
