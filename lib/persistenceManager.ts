// lib/persistenceManager.ts
//
// Single source of truth for reading/writing game data. Every scattered
// localStorage.setItem / supabase.update call in the app should route
// through here instead. The caller never branches on guest-vs-logged-in —
// this module does that once, internally.
//
// Domains supported today: profile, debots, topics, history.
// Adding a new persisted feature (themes, voice preferences, etc.) means
// adding one case to each switch below — not touching call sites elsewhere.

import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export type AuthUser = { id: string } | null;

type Domain = "profile" | "debots" | "topics" | "history";

const LOCAL_KEYS: Record<Domain, string> = {
  profile: "debatto:profile",
  debots: "debatto:unlocked_debots",   // string[] of debot ids the guest owns
  topics: "debatto:custom_topics",     // array of custom topic objects
  history: "debatto:match_history",    // array of { debotId, topicText, result, playerScore, opponentScore, rounds }
};

// ---------------------------------------------------------------------------
// Low-level localStorage helpers (guest path)
// ---------------------------------------------------------------------------

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearLocal(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

// ---------------------------------------------------------------------------
// Result shape - every write/read returns this so callers can branch on
// failure the same way regardless of which backend served the request.
// ---------------------------------------------------------------------------

type Result<T = unknown> =
  | { ok: true; source: "local" | "db"; data?: T }
  | { ok: false; source: "local" | "db"; error: any };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a piece of game state. Logged-in users write straight to Supabase;
 * guests write to localStorage. Callers never need to know which.
 */
export async function saveGameData(
  domain: Domain,
  value: any,
  user: AuthUser
): Promise<Result> {
  if (!user) {
    writeLocal(LOCAL_KEYS[domain], mergeLocal(domain, value));
    return { ok: true, source: "local" };
  }

  switch (domain) {
    case "profile":
      return writeProfile(user.id, value);
    case "debots":
      return writeDebotUnlock(user.id, value); // value: { debotId: string | number }
    case "topics":
      return writeTopic(user.id, value); // value: { text, cat, ... }
    case "history":
      return writeMatch(user.id, value); // value: match record, see writeMatch()
  }
}

/**
 * Read a piece of game state, from Supabase if logged in, localStorage if not.
 */
export async function loadGameData(domain: Domain, user: AuthUser): Promise<Result> {
  if (!user) {
    const fallback = domain === "profile" ? null : [];
    return { ok: true, source: "local", data: readLocal(LOCAL_KEYS[domain], fallback) };
  }

  switch (domain) {
    case "profile":
      return readProfile(user.id);
    case "debots":
      return readUnlockedDebots(user.id);
    case "topics":
      return readTopics(user.id);
    case "history":
      return readHistory(user.id);
  }
}

/**
 * Call once, immediately after a guest signs in (e.g. inside the
 * onAuthStateChange SIGNED_IN branch). Pushes every cached guest value up
 * to Supabase, then clears the local cache so guest/user state can never
 * silently diverge again.
 */
export async function syncLocalToDB(user: { id: string }) {
  const cachedProfile = readLocal<any>(LOCAL_KEYS.profile, null);
  const cachedDebotIds = readLocal<string[]>(LOCAL_KEYS.debots, []);
  const cachedTopics = readLocal<any[]>(LOCAL_KEYS.topics, []);
  const cachedHistory = readLocal<any[]>(LOCAL_KEYS.history, []);

  const migrated = { profile: false, debots: 0, topics: 0, matches: 0 };
  const errors: any[] = [];

  if (cachedProfile) {
    // Only sync the parts of a guest profile that represent real progress.
    // Never let a guest's placeholder name overwrite a real account name.
    const patch: Record<string, any> = {};
    if (typeof cachedProfile.coins === "number") patch.coins = cachedProfile.coins;
    if (Object.keys(patch).length) {
      const res = await writeProfile(user.id, patch);
      if (res.ok) migrated.profile = true;
      else errors.push(res.error);
    }
  }

  for (const debotId of cachedDebotIds) {
    const res = await writeDebotUnlock(user.id, { debotId });
    if (res.ok) migrated.debots += 1;
    else errors.push(res.error);
  }

  for (const topic of cachedTopics) {
    const res = await writeTopic(user.id, topic);
    if (res.ok) migrated.topics += 1;
    else errors.push(res.error);
  }

  for (const match of cachedHistory) {
    const res = await writeMatch(user.id, match);
    if (res.ok) migrated.matches += 1;
    else errors.push(res.error);
  }

  // Only clear the cache once every item has been attempted. Any single
  // domain failing is logged but doesn't block the others from migrating.
  (Object.keys(LOCAL_KEYS) as Domain[]).forEach((d) => clearLocal(LOCAL_KEYS[d]));

  return { ok: errors.length === 0, migrated, errors };
}

// ---------------------------------------------------------------------------
// Guest-mode merge helper — some domains accumulate (debots, topics, history)
// rather than being overwritten wholesale.
// ---------------------------------------------------------------------------

function mergeLocal(domain: Domain, value: any) {
  if (domain === "profile") {
    // Callers pass partial patches (e.g. just { coins } or just { name }),
    // same as a Supabase .update() would. A guest's cache needs to merge
    // those in, not overwrite the whole cached profile with a fragment.
    const existing = readLocal<any>(LOCAL_KEYS.profile, {});
    return { ...existing, ...value };
  }

  const existing = readLocal<any[]>(LOCAL_KEYS[domain], []);

  if (domain === "debots") {
    // value: { debotId }
    const id = value?.debotId;
    return existing.includes(id) ? existing : [...existing, id];
  }

  if (domain === "topics") {
    // value: a topic object with a client-generated id
    return [...existing.filter((t: any) => t.id !== value.id), value];
  }

  if (domain === "history") {
    // value: one completed match record
    return [...existing, value];
  }

  return value;
}

// ---------------------------------------------------------------------------
// Supabase-backed writers (logged-in path)
// ---------------------------------------------------------------------------

async function writeProfile(userId: string, patch: Record<string, any>): Promise<Result> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

async function writeDebotUnlock(userId: string, value: { debotId: any }): Promise<Result> {
  // Unlocks live in a join table, NOT as a column on the shared `debots`
  // catalog — otherwise one user unlocking a debot would unlock it globally.
  const { error } = await supabase
    .from("user_debots")
    .upsert(
      { user_id: userId, debot_id: value.debotId, unlocked_at: new Date().toISOString() },
      { onConflict: "user_id,debot_id" }
    );
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

async function writeTopic(userId: string, topic: any): Promise<Result> {
  // The topics table's real columns are `title`/`category`; the app works
  // with `text`/`cat` internally (see the read-side mapping in Debatto.tsx's
  // fetchTopics). Translate here so a save doesn't write to nonexistent
  // columns or silently drop the topic's own text.
  const { id, text, cat, ...rest } = topic;
  const { error } = await supabase.from("topics").upsert({
    ...rest,
    title: text ?? topic.title,
    category: cat ?? topic.category,
    user_id: userId,
    is_system: false,
  });
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

async function writeMatch(userId: string, match: any): Promise<Result> {
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({
      user_id: userId,
      debot_id: match.debotId,
      topic_text: match.topicText,
      result: match.result, // 'win' | 'loss' | 'draw'
      player_score: match.playerScore,
      opponent_score: match.opponentScore,
      rounds_played: match.rounds?.length ?? 0,
    })
    .select()
    .single();

  if (matchErr) return { ok: false, source: "db", error: matchErr };

  const rounds = (match.rounds || []).map((r: any, i: number) => ({
    match_id: matchRow.id,
    round_number: i + 1,
    player_argument: r.pArg,
    opponent_argument: r.oppArg,
    gain: r.eval?.gain ?? null,
    penalty: r.eval?.penalty ?? null,
    net: r.net ?? null,
    opponent_net: r.oNet ?? null,
    impact: r.eval?.impact ?? null,
    fallacies: r.eval?.fallacies ?? null,
  }));

  if (rounds.length) {
    const { error: roundsErr } = await supabase.from("match_rounds").insert(rounds);
    if (roundsErr) return { ok: false, source: "db", error: roundsErr };
  }

  return { ok: true, source: "db", data: matchRow };
}

// ---------------------------------------------------------------------------
// Supabase-backed readers (logged-in path)
// ---------------------------------------------------------------------------

async function readProfile(userId: string): Promise<Result> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data };
}

async function readUnlockedDebots(userId: string): Promise<Result> {
  const { data, error } = await supabase
    .from("user_debots")
    .select("debot_id")
    .eq("user_id", userId);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data: (data || []).map((r: any) => r.debot_id) };
}

async function readTopics(userId: string): Promise<Result> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .or(`is_system.eq.true,user_id.eq.${userId}`);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data };
}

async function readHistory(userId: string): Promise<Result> {
  const { data, error } = await supabase
    .from("matches")
    .select("*, match_rounds(*), debots(name, color, sym)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data };
}
