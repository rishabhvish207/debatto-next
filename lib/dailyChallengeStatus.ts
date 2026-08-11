import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export const GUEST_COMPLETIONS_KEY = "debatto:daily_challenge_completions";
export const GUEST_TODAY_RESULT_PREFIX = "debatto:daily_challenge_result:";

/** True if this user (or guest browser) has already completed today's Daily Challenge. */
export async function hasCompletedToday(user: { id: string } | null): Promise<boolean> {
  const date = todayUTC();

  // Check the local cache first, for EVERYONE — not just guests. This used
  // to be guest-only, with logged-in users relying solely on a live
  // `daily_challenge_attempts` SELECT every single time (here, and
  // separately in DailyChallenge.tsx's own checkAlreadyDone). That select
  // depends on RLS + the browser's auth session being fully ready at the
  // moment this runs; if either hiccups even once, a logged-in user who
  // definitely completed today sees the quiz again on refresh, and the
  // header's notification dot never clears even though there's genuinely
  // nothing left to do. The local cache (written by DailyChallenge.tsx
  // right after a successful submit, for guests AND logged-in users)
  // sidesteps that entirely: no network round-trip, no RLS, just "did this
  // browser see today's submission succeed."
  //
  // This does mean a fresh browser/device that hasn't seen today's
  // completion locally still needs the DB check below to know — that's
  // intentional and correct (there's no other way to know on a new
  // device), it just isn't the ONLY path anymore.
  try {
    if (localStorage.getItem(GUEST_TODAY_RESULT_PREFIX + date)) return true;
  } catch {}

  if (user) {
    const { data, error } = await supabase
      .from("daily_challenge_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("challenge_date", date)
      .maybeSingle();
    if (error) console.error("hasCompletedToday: daily_challenge_attempts read failed:", error);
    return !!data;
  }
  return false;
}
