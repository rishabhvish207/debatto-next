// lib/persistenceManager.ts
//
// Single source of truth for reading/writing game data. Every scattered
// localStorage.setItem / supabase.update call in the app should route
// through here instead. The caller never branches on guest-vs-logged-in —
// this module does that once, internally.
//
// Domains supported today: profile, debots, topics, history, inventory.
// Adding a new persisted feature (themes, voice preferences, etc.) means
// adding one case to each switch below — not touching call sites elsewhere.

import { createClient } from "@/utils/supabase/client";
import { GAME_CONFIG } from "@/config/Game";

const supabase = createClient();

export type AuthUser = { id: string } | null;

type Domain = "profile" | "debots" | "topics" | "history" | "inventory";

const PINNED_TOPICS_LOCAL_KEY = "debatto:pinned_topics"; // string[] of topic ids, guest-only
const HIDDEN_TOPICS_LOCAL_KEY = "debatto:hidden_topics"; // string[] of system-topic ids this guest has personally removed

const LOCAL_KEYS: Record<Domain, string> = {
  profile: "debatto:profile",
  debots: "debatto:unlocked_debots",   // string[] of debot ids the guest owns
  topics: "debatto:custom_topics",     // array of custom topic objects
  history: "debatto:match_history",    // array of { debotId, topicText, result, playerScore, opponentScore, rounds }
  inventory: "debatto:inventory",      // { insightLens, aceCards, confidencePills } — store items owned
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

/**
 * Wipes every piece of locally-stored guest progress (profile, unlocked
 * debots, custom topics, match history, pinned/hidden topic lists). Only
 * meaningful for guests — logged-in accounts live in Supabase and aren't
 * touched by this. Callers should reload/reset in-memory state afterward.
 */
export function clearAllLocalData() {
  (Object.keys(LOCAL_KEYS) as Domain[]).forEach((d) => clearLocal(LOCAL_KEYS[d]));
  clearLocal(PINNED_TOPICS_LOCAL_KEY);
  clearLocal(HIDDEN_TOPICS_LOCAL_KEY);
}

// ---------------------------------------------------------------------------
// Result shape - every write/read returns this so callers can branch on
// failure the same way regardless of which backend served the request.
// ---------------------------------------------------------------------------

type Result<T = unknown> =
  | { ok: true; source: "local" | "db"; data?: T }
  | { ok: false; source: "local" | "db"; error: any };

type ProfileData = { coins?: number; [key: string]: any };
type InventoryData = { insightLens: boolean; aceCards: number; confidencePills: number } | null;

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
    case "inventory":
      return writeInventory(user.id, value); // value: partial { insightLens, aceCards, confidencePills }
  }
}

/**
 * Read a piece of game state, from Supabase if logged in, localStorage if not.
 */
export async function loadGameData(domain: Domain, user: AuthUser): Promise<Result> {
  if (!user) {
    const fallback = domain === "profile" || domain === "inventory" ? null : [];
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
    case "inventory":
      return readInventory(user.id);
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
  const cachedInventory = readLocal<any>(LOCAL_KEYS.inventory, null);

  const migrated = { profile: false, debots: 0, topics: 0, matches: 0, inventory: false };
  const errors: any[] = [];

  // Guest progress is additive on top of whatever the account already has —
  // never a blind overwrite. The instant the app loads in a browser with no
  // session, it seeds a fresh guest profile (coins = starting default) and
  // caches it locally, *before* the person ever clicks "Sign in". If that
  // local seed were written straight onto an existing account, logging into
  // a new device would reset a real coin balance back down to the starting
  // amount — which is exactly what was happening.
  if (cachedProfile && typeof cachedProfile.coins === "number") {
    const existing = await readProfile(user.id);
    const existingCoins = (existing.ok && typeof existing.data?.coins === "number")
      ? existing.data.coins
      : GAME_CONFIG.economy.startingCoins;
    // Only the portion of the guest's local balance that's *above* the
    // starting default represents something they actually earned in that
    // browser as a guest — that's the only part that should move over.
    const guestEarned = Math.max(0, cachedProfile.coins - GAME_CONFIG.economy.startingCoins);
    if (guestEarned > 0) {
      const res = await writeProfile(user.id, { coins: existingCoins + guestEarned });
      if (res.ok) migrated.profile = true;
      else errors.push(res.error);
    }
  }

  if (cachedInventory) {
    // Same reasoning as coins: a fresh browser's guest inventory is all
    // zeros/false, and must never stomp a real account's purchases —
    // insightLens in particular is supposed to be permanent, so overwriting
    // it with `false` on a new-device login would silently take it away.
    const existingInv = await readInventory(user.id);
    const base = (existingInv.ok && existingInv.data) ? existingInv.data : { insightLens: false, aceCards: 0, confidencePills: 0 };
    const patch: Record<string, any> = {};
    if (typeof cachedInventory.insightLens === "boolean") patch.insightLens = base.insightLens || cachedInventory.insightLens;
    if (typeof cachedInventory.aceCards === "number") patch.aceCards = base.aceCards + cachedInventory.aceCards;
    if (typeof cachedInventory.confidencePills === "number") patch.confidencePills = base.confidencePills + cachedInventory.confidencePills;
    if (Object.keys(patch).length) {
      const res = await writeInventory(user.id, patch);
      if (res.ok) migrated.inventory = true;
      else errors.push(res.error);
    }
  }

  const debotResults = await Promise.all(
    cachedDebotIds.map((debotId) => writeDebotUnlock(user.id, { debotId }))
  );
  for (const res of debotResults) {
    if (res.ok) migrated.debots += 1;
    else errors.push(res.error);
  }

  const topicResults = await Promise.all(
    cachedTopics.map((topic) => writeTopic(user.id, topic))
  );
  for (const res of topicResults) {
    if (res.ok) migrated.topics += 1;
    else errors.push(res.error);
  }

  const matchResults = await Promise.all(
    cachedHistory.map((match) => writeMatch(user.id, match))
  );
  for (const res of matchResults) {
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

  if (domain === "inventory") {
    // Same partial-patch merge as profile — a single row of counters, not
    // an accumulating list.
    const existing = readLocal<any>(LOCAL_KEYS.inventory, {});
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

// Store items live in a dedicated `user_inventory` table — one row per
// user, upserted on every purchase/use, mirroring the single-row shape of
// `profiles` rather than the join-table shape of `user_debots` (items here
// are stackable counters, not a set of unlocked ids).
// Expected columns: user_id (pk/unique), insight_lens (bool),
// ace_cards (int), confidence_pills (int).
async function writeInventory(userId: string, patch: Record<string, any>): Promise<Result> {
  const row: Record<string, any> = { user_id: userId };
  if ("insightLens" in patch) row.insight_lens = patch.insightLens;
  if ("aceCards" in patch) row.ace_cards = patch.aceCards;
  if ("confidencePills" in patch) row.confidence_pills = patch.confidencePills;

  const { error } = await supabase.from("user_inventory").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

async function readInventory(userId: string): Promise<Result<InventoryData>> {
  const { data, error } = await supabase
    .from("user_inventory")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, source: "db", error };
  if (!data) return { ok: true, source: "db", data: null }; // no row yet — brand new account, defaults apply
  return {
    ok: true,
    source: "db",
    data: {
      insightLens: !!data.insight_lens,
      aceCards: data.ace_cards ?? 0,
      confidencePills: data.confidence_pills ?? 0,
    },
  };
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

async function readProfile(userId: string): Promise<Result<ProfileData>> {
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
    .select("*, match_rounds(*), debots(name, color)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data };
}

// ---------------------------------------------------------------------------
// Topic pinning — a per-user preference layered on top of any topic (system
// or their own custom one). Kept as dedicated functions rather than forced
// into the generic saveGameData/loadGameData domain switch above, since
// toggle-on/toggle-off doesn't fit that "write this value" shape cleanly.
// ---------------------------------------------------------------------------

export async function loadPinnedTopics(user: AuthUser): Promise<Result> {
  if (!user) {
    return { ok: true, source: "local", data: readLocal<string[]>(PINNED_TOPICS_LOCAL_KEY, []) };
  }
  const { data, error } = await supabase.from("pinned_topics").select("topic_id").eq("user_id", user.id);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data: (data || []).map((r: any) => r.topic_id) };
}

export async function loadHiddenTopics(user: AuthUser): Promise<Result> {
  if (!user) {
    return { ok: true, source: "local", data: readLocal<string[]>(HIDDEN_TOPICS_LOCAL_KEY, []) };
  }
  const { data, error } = await supabase.from("hidden_topics").select("topic_id").eq("user_id", user.id);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db", data: (data || []).map((r: any) => r.topic_id) };
}

async function hideSystemTopicForUser(topicId: any, user: AuthUser): Promise<Result> {
  if (!user) {
    const existing = readLocal<string[]>(HIDDEN_TOPICS_LOCAL_KEY, []);
    writeLocal(HIDDEN_TOPICS_LOCAL_KEY, existing.includes(topicId) ? existing : [...existing, topicId]);
    return { ok: true, source: "local" };
  }
  const { error } = await supabase.from("hidden_topics").upsert(
    { user_id: user.id, topic_id: topicId },
    { onConflict: "user_id,topic_id" }
  );
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

/**
 * "Delete" on a system topic can't remove it for everyone, so it's really a
 * per-user hide (a row in hidden_topics / a local id list). A user's own
 * custom topic (is_system === false) gets a real delete instead.
 */
export async function deleteTopic(topic: { id: any; is_system?: boolean }, user: AuthUser): Promise<Result> {
  const topicId = topic.id;

  if (topic.is_system) {
    return hideSystemTopicForUser(topicId, user);
  }

  if (!user) {
    const existing = readLocal<any[]>(LOCAL_KEYS.topics, []);
    writeLocal(LOCAL_KEYS.topics, existing.filter((t: any) => t.id !== topicId));
    const pinned = readLocal<string[]>(PINNED_TOPICS_LOCAL_KEY, []);
    writeLocal(PINNED_TOPICS_LOCAL_KEY, pinned.filter((id) => id !== topicId));
    return { ok: true, source: "local" };
  }

  const { error } = await supabase
    .from("topics")
    .delete()
    .eq("id", topicId)
    .eq("user_id", user.id)
    .eq("is_system", false);
  if (error) return { ok: false, source: "db", error };
  return { ok: true, source: "db" };
}

export async function togglePinnedTopic(topicId: any, shouldBePinned: boolean, user: AuthUser): Promise<Result> {
  if (!user) {
    const existing = readLocal<string[]>(PINNED_TOPICS_LOCAL_KEY, []);
    const next = shouldBePinned
      ? (existing.includes(topicId) ? existing : [...existing, topicId])
      : existing.filter((id) => id !== topicId);
    writeLocal(PINNED_TOPICS_LOCAL_KEY, next);
    return { ok: true, source: "local" };
  }

  if (shouldBePinned) {
    const { error } = await supabase.from("pinned_topics").upsert(
      { user_id: user.id, topic_id: topicId },
      { onConflict: "user_id,topic_id" }
    );
    if (error) return { ok: false, source: "db", error };
  } else {
    const { error } = await supabase.from("pinned_topics").delete().eq("user_id", user.id).eq("topic_id", topicId);
    if (error) return { ok: false, source: "db", error };
  }
  return { ok: true, source: "db" };
}
