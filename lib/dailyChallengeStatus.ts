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
  if (user) {
    const { data } = await supabase
      .from("daily_challenge_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("challenge_date", date)
      .maybeSingle();
    return !!data;
  }
  try {
    return !!localStorage.getItem(GUEST_TODAY_RESULT_PREFIX + date);
  } catch {
    return false;
  }
}
