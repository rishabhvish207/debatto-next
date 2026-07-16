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

export async function getLandingBgUrl(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${supabaseUrl()}/rest/v1/app_settings?key=eq.landing_bg_url&select=value`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 60 }, // admin changes show up within a minute, not instantly, without hitting the DB on every request
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const value = rows?.[0]?.value;
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}
