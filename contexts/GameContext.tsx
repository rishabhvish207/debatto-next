"use client";

// contexts/GameContext.tsx
//
// Single source of truth for everything that used to be re-fetched (or
// would have needed to be re-fetched) inside Debatto.tsx directly: auth
// session, profile (coins/wins/is_admin), the debot catalog + per-user
// unlock status, and topics. Every route — Offline, Online, Store,
// History, Settings, Admin — reads this via useGame() instead of running
// its own Supabase calls, so there's exactly one auth listener and one
// fetch per domain no matter how many sections the app grows to.
//
// This is a straight port of the logic that lived at the top of
// Debatto.tsx — behavior is unchanged, just relocated so it's shared
// instead of duplicated.

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { saveGameData, loadGameData, syncLocalToDB, loadPinnedTopics, togglePinnedTopic, deleteTopic as deleteTopicRecord, loadHiddenTopics } from "@/lib/persistenceManager";
import { GAME_CONFIG, DEFAULT_STORE_ITEMS, StoreItemDef, computeItemPrice } from "@/config/Game";
import { DEFAULT_THEMES, StoreTheme } from "@/config/Themes";
import { DEFAULT_ACHIEVEMENTS, AchievementDef } from "@/config/Achievements";
import { getNewlyUnlocked, normalizeMatch } from "@/lib/achievements";
import { DEFAULT_JUDGE_SETTINGS, JudgeSettings } from "@/config/Judge";
import { DEFAULT_REWARD_PER_CORRECT } from "@/config/DailyChallenge";
import type { MatchInvite } from "@/lib/matchInvites";

const supabase = createClient();
const DEFAULT_NAME = GAME_CONFIG.defaultName;

type Profile = {
  name: string;
  coins: number;
  wins: number;
  is_admin: boolean;
  player_id?: string | null; // system-generated, fixed-length, immutable
  prestige?: number;
  bio?: string | null;
  avatar_url?: string | null;
  equipped_theme_id?: string | null; // null/absent = the default theme
  username?: string | null;          // unique handle for friend search — null until the player sets one
  show_history_public?: boolean;     // toggled in Settings; gates whether other players can see your online history
  // Cumulative totals, never decrease — `coins` itself can't be used for
  // "earn/spend this much lifetime" achievements since it's a spendable
  // balance that goes back down on every purchase. The admin debucks cheat
  // deliberately does NOT add to lifetimeDebucksEarned (see store/page.tsx).
  lifetimeDebucksEarned?: number;
  lifetimeDebucksSpent?: number;
};

type Inventory = {
  insightLens: boolean;      // gear — one-time purchase, permanently unlocks the in-match Insight lifeline
  aceCards: number;          // consumable — "Show Answer", stacks up to store.aceCard.maxStock
  confidencePills: number;   // consumable — heals HP on use, stacks up to store.confidencePill.maxStock
  revivalShots: number;      // consumable — heals to FULL HP on use, stacks up to store.revivalShot.maxStock
};

const DEFAULT_INVENTORY: Inventory = { insightLens: false, aceCards: 0, confidencePills: 0, revivalShots: 0 };

type GameContextValue = {
  user: any;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  profile: Profile;
  upProfile: (patch: Partial<Profile>) => void;
  earnCoins: (amount: number, extra?: Partial<Profile>) => void;
  spendCoins: (amount: number, extra?: Partial<Profile>) => void;
  uploadAvatar: (file: File) => Promise<{ ok: boolean; error?: string }>;
  removeAvatar: () => Promise<{ ok: boolean; error?: string }>;
  onlineUserIds: Set<string>; // live presence — profile ids currently connected app-wide
  incomingInvite: MatchInvite | null; // most recent live Friend Match invite popup — see InvitePopup
  setIncomingInvite: (invite: MatchInvite | null) => void;
  hostMatchReady: string | null; // set the instant a HOST's own sent invite gets accepted — see HostMatchRedirect
  setHostMatchReady: (matchId: string | null) => void;

  opps: any[];
  oppsLoading: boolean;
  unlockDebot: (debot: any) => Promise<void>;
  refetchDebots: () => Promise<void>;

  inventory: Inventory;
  inventoryLoading: boolean;
  aceCardPrice: (held?: number) => number;
  itemPrice: (key: string, held: number) => number;
  buyInsightLens: () => Promise<void>;
  buyAceCard: () => Promise<void>;
  buyConfidencePill: () => Promise<void>;
  buyRevivalShot: () => Promise<void>;
  useAceCard: () => Promise<boolean>;
  useConfidencePill: () => Promise<boolean>;
  useRevivalShot: () => Promise<boolean>;
  refetchInventory: () => Promise<void>;

  storeItems: StoreItemDef[];
  storeItemsLoading: boolean;
  refetchStoreItems: () => Promise<void>;

  themes: StoreTheme[];
  themesLoading: boolean;
  ownedThemeIds: string[];
  equippedTheme: StoreTheme | null;
  buyTheme: (themeId: string) => Promise<void>;
  equipTheme: (themeId: string | null) => void;
  refetchThemes: () => Promise<void>;

  achievements: AchievementDef[];
  achievementsLoading: boolean;
  unlockedAchievementIds: string[];
  refetchAchievements: () => Promise<void>;
  checkAchievements: (opts?: {
    extraMatch?: any;
    baseCoins?: number;
    inventoryOverride?: Partial<Inventory>;
    unlockedDebotIdsOverride?: string[];
    ownedThemeCountOverride?: number;
    lifetimeEarnedDelta?: number;
    lifetimeSpentDelta?: number;
    dailyChallengesCompletedOverride?: number;
  }) => Promise<AchievementDef[]>;
  pendingAchievementPopups: AchievementDef[];
  dismissAchievementPopup: () => void;

  topics: any[];
  topicsLoading: boolean;
  saveCustomTopic: (text: string, cat?: string) => Promise<boolean>;
  pinnedTopicIds: any[];
  toggleTopicPin: (topicId: any) => Promise<void>;
  deleteTopic: (topic: { id: any; is_system?: boolean }) => Promise<boolean>;

  roundOptions: number[];
  defaultRounds: number;
  settingsLoaded: boolean;
  debotVertices: number | null;
  diffBadgeStyle: "badge" | "plain";
  cheatTapEnabled: boolean;
  siteBg: { url: string | null; opacity: number; applyEverywhere: boolean };
  dailyChallengeRewardPerCorrect: number;
  refetchSettings: () => Promise<void>;
  judgeSettings: JudgeSettings;
  judgeSettingsLoading: boolean;
  refetchJudgeSettings: () => Promise<void>;
  requestNavigation: (action: () => void) => void;
  pendingNavAction: boolean;
  confirmNavigation: () => void;
  cancelNavigation: () => void;

  battleActive: boolean;
  navGuardMessage: { title: string; message: string };
  setNavGuardMessage: (m: { title: string; message: string }) => void;
  setBattleActive: (active: boolean) => void;

  apiError: string;
  setApiError: (msg: string) => void;
};

const GameContext = createContext<GameContextValue | null>(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame() must be used inside <GameProvider>");
  return ctx;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile>({
    name: DEFAULT_NAME,
    coins: 0,
    wins: 0,
    is_admin: false,
  });

  const [opps, setOpps] = useState<any[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);

  const [topics, setTopics] = useState<any[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  const [roundOptions, setRoundOptions] = useState<number[]>([]); // empty until fetchGameSettings resolves — avoids flashing the hardcoded fallback
  const [defaultRounds, setDefaultRounds] = useState<number>(GAME_CONFIG.rounds.default);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pinnedTopicIds, setPinnedTopicIds] = useState<any[]>([]);
  const [hiddenTopicIds, setHiddenTopicIds] = useState<any[]>([]); // system topics this user has personally removed
  const [debotVertices, setDebotVertices] = useState<number | null>(null); // null = each debot uses its own
  const [diffBadgeStyle, setDiffBadgeStyle] = useState<"badge" | "plain">("badge");
  const [cheatTapEnabled, setCheatTapEnabled] = useState<boolean>(true);
  const [siteBg, setSiteBg] = useState<{ url: string | null; opacity: number; applyEverywhere: boolean }>({ url: null, opacity: 0.16, applyEverywhere: false });
  const [dailyChallengeRewardPerCorrect, setDailyChallengeRewardPerCorrect] = useState(DEFAULT_REWARD_PER_CORRECT);
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);

  // Any navigation that might leave an in-progress match (drawer links, the
  // header logo, the in-match Exit button, browser back) should go through
  // this instead of acting immediately — it only defers when battleActive is
  // actually true, so it's a no-op everywhere else.
  function requestNavigation(action: () => void) {
    if (battleActive) {
      setPendingNavAction(() => action);
    } else {
      action();
    }
  }
  function confirmNavigation() {
    setBattleActive(false);
    const action = pendingNavAction;
    setPendingNavAction(null);
    action?.();
  }
  function cancelNavigation() {
    setPendingNavAction(null);
  }

  const [apiError, setApiError] = useState("");
  const [battleActive, setBattleActive] = useState(false);
  // battleActive's confirmation dialog defaults to match wording — the
  // Daily Challenge (app/(app)/learning/page.tsx) overrides this while
  // it's in progress, then it's fine to leave it as whatever it last was.
  const [navGuardMessage, setNavGuardMessage] = useState({
    title: "Exit this match?",
    message: "Leaving now will end the debate and lose your progress in this round.",
  });

  const savingTopicRef = useRef(false);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) {
      // This used to be silently swallowed — a failed fetch (RLS error,
      // network blip, anything) just left `profile` sitting at whatever it
      // was a moment before (usually the pre-login guest snapshot: no name,
      // no admin flag, no player ID), with nothing in the console and
      // nothing telling the person their real account never actually
      // loaded. Surfacing it doesn't fix the underlying cause, but it turns
      // "my account randomly disappears" into a visible, debuggable error.
      console.error("fetchProfile failed:", error);
      setApiError("Couldn't load your profile — check the 'profiles' table's SELECT policy for logged-in users.");
      return;
    }
    if (data) {
      setProfile({
        name: data.name,
        coins: data.coins,
        wins: data.wins,
        is_admin: data.is_admin,
        player_id: data.player_id != null ? String(data.player_id) : null,
        prestige: data.prestige,
        bio: data.bio ?? null,
        avatar_url: data.avatar_url ?? null,
        equipped_theme_id: data.equipped_theme_id ?? null,
        username: data.username ?? null,
        show_history_public: data.show_history_public ?? true,
        lifetimeDebucksEarned: data.lifetime_debucks_earned ?? 0,
        lifetimeDebucksSpent: data.lifetime_debucks_spent ?? 0,
      });
    }
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const upProfile = (patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    saveGameData("profile", patch, user).then((res) => {
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to save profile changes.");
      }
    });
  };

  // Every genuine "you earned/spent debucks" path should go through these
  // two instead of patching `coins` directly — they keep the lifetime
  // totals (used by the tiered "Debucks Earned"/"Big Spender" achievements)
  // in sync automatically. The admin debucks cheat (store/page.tsx)
  // deliberately calls upProfile directly instead, so cheat-granted coins
  // never count toward those achievements.
  function earnCoins(amount: number, extra: Partial<Profile> = {}) {
    if (amount <= 0) { if (Object.keys(extra).length) upProfile(extra); return; }
    upProfile({ ...extra, coins: profile.coins + amount, lifetimeDebucksEarned: (profile.lifetimeDebucksEarned || 0) + amount });
  }
  function spendCoins(amount: number, extra: Partial<Profile> = {}) {
    if (amount <= 0) { if (Object.keys(extra).length) upProfile(extra); return; }
    upProfile({ ...extra, coins: profile.coins - amount, lifetimeDebucksSpent: (profile.lifetimeDebucksSpent || 0) + amount });
  }

  // Guests can't write to Supabase Storage, so their avatar is just a base64
  // data URL kept in localStorage via the normal profile patch path. Logged-in
  // users get a real upload to the "avatars" bucket at a stable per-user path
  // (upsert: true), so re-uploading just replaces the file instead of piling
  // up orphans.
  const uploadAvatar = async (file: File): Promise<{ ok: boolean; error?: string }> => {
    if (!file) return { ok: false, error: "No file provided." };
    if (file.size > 1_500_000) return { ok: false, error: "Image is too large — please use something under 1.5MB." };

    if (!user) {
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsDataURL(file);
        });
        upProfile({ avatar_url: dataUrl });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message || "Failed to read image." };
      }
    }

    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`; // cache-bust — the path is stable across re-uploads

      const { data: dbData, error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id).select();
      if (dbErr) throw dbErr;
      if (!dbData || dbData.length === 0) {
        throw new Error("Update didn't apply — check the 'profiles' table UPDATE policy allows this account.");
      }
      setProfile((p) => ({ ...p, avatar_url: url }));
      return { ok: true };
    } catch (err: any) {
      console.error(err);
      return { ok: false, error: err.message || "Upload failed." };
    }
  };

  const removeAvatar = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!user) {
      upProfile({ avatar_url: null });
      return { ok: true };
    }

    try {
      const { data: dbData, error: dbErr } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id).select();
      if (dbErr) throw dbErr;
      if (!dbData || dbData.length === 0) {
        throw new Error("Update didn't apply — check the 'profiles' table UPDATE policy allows this account.");
      }
      setProfile((p) => ({ ...p, avatar_url: null }));
      // Best-effort storage cleanup — the DB clearing is what actually matters for display.
      supabase.storage.from("avatars").list(user.id).then(({ data: files }: { data: any }) => {
        if (files?.length) {
          supabase.storage.from("avatars").remove(files.map((f: any) => `${user.id}/${f.name}`));
        }
      }).catch(() => {});
      return { ok: true };
    } catch (err: any) {
      console.error(err);
      return { ok: false, error: err.message || "Remove failed." };
    }
  };

  // ── AUTH BOOTSTRAP + GUEST->LOGIN SYNC ──
  //
  // This used to also call supabase.auth.getSession() directly in its own
  // effect, in addition to this listener — but onAuthStateChange already
  // fires once on subscribe with whatever session currently exists (that's
  // documented Supabase behavior), so the two were doing the same job
  // concurrently and racing: both called setUser()/fetchProfile() close
  // together, and there was no ordering guarantee about which one's result
  // "won." Relying on just this listener removes that race entirely.
  //
  // Separately: syncLocalToDB was only guarded by `event === "SIGNED_IN"`,
  // but Supabase can (and does, in some client versions/situations) fire
  // SIGNED_IN not just on a fresh sign-in but also when an *existing*
  // session is simply restored on page load or tab focus — so that guard
  // alone let guest-progress migration re-run on every reload of an
  // already-logged-in tab, repeatedly re-merging (or re-clobbering) profile
  // data. The marker below makes it run at most once per user id per
  // browser tab, regardless of how many times the event fires.
  useEffect(() => {
    const syncedThisTab = new Set<string>();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      setUser(session?.user || null);

      if (session?.user) {
        const uid = session.user.id;
        const marker = `debatto:synced:${uid}`;
        const alreadySynced = syncedThisTab.has(uid) || sessionStorage.getItem(marker) === "1";

        if (event === "SIGNED_IN" && !alreadySynced) {
          syncedThisTab.add(uid);
          sessionStorage.setItem(marker, "1");
          syncLocalToDB({ id: uid }).then((sync) => {
            if (!sync.ok) {
              console.error(sync.errors);
              setApiError("Some guest progress failed to sync. Please check your data.");
              // Don't leave a marker behind for a sync that didn't actually
              // finish — let it retry on the next sign-in in this tab.
              syncedThisTab.delete(uid);
              sessionStorage.removeItem(marker);
            }
          });
        }
        fetchProfile(uid);
      } else {
        // No session — either nothing's ever been signed in on this tab, or
        // this is a real sign-out. Either way, show whatever's cached
        // locally for this guest browser (not just hardcoded starting
        // values), same as a signed-out account should always see its own
        // local progress rather than a reset-looking blank slate.
        const local = await loadGameData("profile", null);
        const localData: any = (local.ok && local.data) ? local.data : null;
        if (localData) {
          if ("player_id" in localData) delete localData.player_id;
          setProfile((p) => ({ ...p, ...localData }));
        } else {
          const seeded = { coins: GAME_CONFIG.economy.startingCoins };
          setProfile((p) => ({ ...p, ...seeded }));
          saveGameData("profile", seeded, null);
        }
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── PRESENCE: who's currently online, app-wide ──
  //
  // One shared Realtime Presence channel joined for the lifetime of a
  // logged-in session — not something each page (Friends list, Friend
  // Match setup) opens for itself, so "online" doesn't flicker as someone
  // navigates between those screens. Guests never join (no stable user id
  // to track, and they can't be friended anyway).
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id) { setOnlineUserIds(new Set()); return; }

    const channel = supabase.channel("presence:online", { config: { presence: { key: user.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
      });

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── FRIEND MATCH INVITE POPUP ──
  //
  // Two ways an invite surfaces here, both folding into the same
  // `incomingInvite` state so InvitePopup only has one thing to render:
  //   1. Already pending when this tab connects (e.g. invited while
  //      offline, then opened the app) — one-time fetch on login.
  //   2. Arrives live while connected — Realtime INSERT subscription.
  // The Notifications page is the durable list; this is just the toast.
  const [incomingInvite, setIncomingInvite] = useState<MatchInvite | null>(null);
  useEffect(() => {
    if (!user?.id) { setIncomingInvite(null); return; }

    (async () => {
      const { data } = await supabase
        .from("match_invites")
        .select("*")
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setIncomingInvite(data as MatchInvite);
    })();

    const channel = supabase
      .channel(`invite-listen:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_invites", filter: `invitee_id=eq.${user.id}` },
        (payload: any) => setIncomingInvite(payload.new as MatchInvite)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── FRIEND MATCH: host gets pulled in the instant their invite is accepted ──
  //
  // The invitee's client is the one that creates the online_matches row
  // (via the finalize_invite_into_match RPC — see lib/matchInvites.ts), so
  // without this the host would just have to notice on their own and go
  // find the match. Watching for match_invites transitioning from
  // "no match_id yet" to "match_id set" on the HOST's own sent invites
  // means they get pulled in automatically too, from wherever they are in
  // the app — HostMatchRedirect (mounted in the app shell) is what actually
  // does the navigation once this fires.
  const [hostMatchReady, setHostMatchReady] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) { setHostMatchReady(null); return; }

    const channel = supabase
      .channel(`host-invite-listen:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_invites", filter: `host_id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new?.match_id && !payload.old?.match_id) setHostMatchReady(payload.new.match_id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── DEBOTS: catalog (public) + per-user unlock status ──
  const fetchDebots = async () => {
    setOppsLoading(true);
    const { data, error } = await supabase.from("debots").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true });

    if (error) {
      console.error(error);
      setApiError("Failed to load debots. Please refresh and try again.");
      setOppsLoading(false);
      return;
    }

    const unlockedRes = await loadGameData("debots", user);
    const unlockedIds: any[] = unlockedRes.ok && Array.isArray(unlockedRes.data) ? unlockedRes.data : [];

    const mapped = (data || []).map((d: any) => ({
      ...d,
      id: d.id,
      name: d.name || "Unknown Debot",
      maxHP: d.max_hp ?? 100,
      cost: d.cost ?? 0,
      color: d.color || "var(--blue)",
      personality: d.personality || "Neutral, composed.",
      depth: d.depth || "Moderate",
      story: d.story || "No story written yet.",
      vertices: d.vertices ?? 0,
      argSentences: d.arg_sentences ?? 3,
      sprite: d.sprite_url || null,
      spriteEmotions: d.sprite_emotions || {},
      // Leave unset (not defaulted here) when a debot has no custom
      // multiplier of its own — offline/page.tsx falls back to
      // judgeSettings.opponentDamageMultiplier (Admin -> AI -> Judge &
      // Scoring) in that case. This used to default to the *player's*
      // multiplier instead, which meant every debot without an explicit
      // override was silently using the wrong damage multiplier and the
      // admin-configured opponent default could never actually apply.
      multiplier: d.multiplier ?? undefined,
      reward: d.reward ?? 5,
      unlocked: (d.cost ?? 0) <= 0 || unlockedIds.includes(d.id),
    }));
    setOpps(mapped);
    setOppsLoading(false);
  };

  useEffect(() => {
    fetchDebots();
  }, [user]);

  async function unlockDebot(debot: any) {
    if (profile.coins < debot.cost) {
      setApiError("Not enough coins to unlock this debot.");
      return;
    }
    try {
      const res = await saveGameData("debots", { debotId: debot.id }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to unlock debot. Please try again.");
        return;
      }
      const nextUnlockedIds = [...opps.filter((x) => x.unlocked).map((x) => x.id), debot.id];
      setOpps((prev) => prev.map((x) => (x.id === debot.id ? { ...x, unlocked: true } : x)));
      spendCoins(debot.cost);
      checkAchievements({ baseCoins: profile.coins - debot.cost, unlockedDebotIdsOverride: nextUnlockedIds, lifetimeSpentDelta: debot.cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to unlock debot. Please try again.");
    }
  }

  // ── INVENTORY: store items (gear + consumables) ──
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  const fetchInventory = async () => {
    setInventoryLoading(true);
    const res = await loadGameData("inventory", user);
    const data: any = res.ok ? res.data : null;
    setInventory(data ? { ...DEFAULT_INVENTORY, ...data } : DEFAULT_INVENTORY);
    setInventoryLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, [user]);

  // Price of the *next* unit of any consumable, using whichever pricing
  // formula an admin has set for it (Admin -> Store -> Items: flat,
  // scaling/exponential, linear, or additive — see computeItemPrice).
  // Reads from the admin-editable storeItems catalog so a change there
  // takes effect immediately; falls back to a flat DB-catalog default (or
  // GAME_CONFIG for ace_card specifically) if the item's missing.
  function itemPrice(key: string, held: number): number {
    const item = storeItems.find((i) => i.key === key);
    if (!item) {
      // ace_card is the only one with a non-trivial hardcoded fallback;
      // everything else defaults to flat-priced-at-0 if the catalog is
      // somehow completely unavailable.
      if (key === "ace_card") return Math.round(GAME_CONFIG.store.aceCard.baseCost * Math.pow(2, held));
      return 0;
    }
    return computeItemPrice(item, held);
  }

  // Kept as its own name for backward compatibility — Ace Card's price was
  // shown in the Store before other items had scaling prices too.
  function aceCardPrice(held: number = inventory.aceCards): number {
    return itemPrice("ace_card", held);
  }

  async function buyInsightLens() {
    if (inventory.insightLens) return; // permanent — nothing to rebuy
    const item = storeItems.find((i) => i.key === "insight_lens");
    const cost = item?.baseCost ?? GAME_CONFIG.store.insightLens.cost;
    if (profile.coins < cost) {
      setApiError("Not enough coins to buy the Insight Lens.");
      return;
    }
    try {
      const res = await saveGameData("inventory", { insightLens: true }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to purchase Insight Lens. Please try again.");
        return;
      }
      setInventory((inv) => ({ ...inv, insightLens: true }));
      spendCoins(cost);
      checkAchievements({ baseCoins: profile.coins - cost, inventoryOverride: { insightLens: true }, lifetimeSpentDelta: cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Insight Lens. Please try again.");
    }
  }

  async function buyAceCard() {
    const item = storeItems.find((i) => i.key === "ace_card");
    const maxStock = item?.maxStock ?? GAME_CONFIG.store.aceCard.maxStock;
    if (inventory.aceCards >= maxStock) {
      setApiError("Ace Cards are already at max stock.");
      return;
    }
    const cost = itemPrice("ace_card", inventory.aceCards);
    if (profile.coins < cost) {
      setApiError("Not enough coins to buy an Ace Card.");
      return;
    }
    const nextCards = inventory.aceCards + 1;
    try {
      const res = await saveGameData("inventory", { aceCards: nextCards }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to purchase Ace Card. Please try again.");
        return;
      }
      setInventory((inv) => ({ ...inv, aceCards: nextCards }));
      spendCoins(cost);
      checkAchievements({ baseCoins: profile.coins - cost, inventoryOverride: { aceCards: nextCards }, lifetimeSpentDelta: cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Ace Card. Please try again.");
    }
  }

  async function buyConfidencePill() {
    const item = storeItems.find((i) => i.key === "confidence_pill");
    const maxStock = item?.maxStock ?? GAME_CONFIG.store.confidencePill.maxStock;
    if (inventory.confidencePills >= maxStock) {
      setApiError("Confidence Pills are already at max stock.");
      return;
    }
    const cost = itemPrice("confidence_pill", inventory.confidencePills);
    if (profile.coins < cost) {
      setApiError("Not enough coins to buy a Confidence Pill.");
      return;
    }
    const nextPills = inventory.confidencePills + 1;
    try {
      const res = await saveGameData("inventory", { confidencePills: nextPills }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to purchase Confidence Pill. Please try again.");
        return;
      }
      setInventory((inv) => ({ ...inv, confidencePills: nextPills }));
      spendCoins(cost);
      checkAchievements({ baseCoins: profile.coins - cost, inventoryOverride: { confidencePills: nextPills }, lifetimeSpentDelta: cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Confidence Pill. Please try again.");
    }
  }

  async function buyRevivalShot() {
    const item = storeItems.find((i) => i.key === "revival_shot");
    const maxStock = item?.maxStock ?? GAME_CONFIG.store.revivalShot.maxStock;
    if (inventory.revivalShots >= maxStock) {
      setApiError("Revival Shots are already at max stock.");
      return;
    }
    const cost = itemPrice("revival_shot", inventory.revivalShots);
    if (profile.coins < cost) {
      setApiError("Not enough coins to buy a Revival Shot.");
      return;
    }
    const nextShots = inventory.revivalShots + 1;
    try {
      const res = await saveGameData("inventory", { revivalShots: nextShots }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to purchase Revival Shot. Please try again.");
        return;
      }
      setInventory((inv) => ({ ...inv, revivalShots: nextShots }));
      spendCoins(cost);
      checkAchievements({ baseCoins: profile.coins - cost, inventoryOverride: { revivalShots: nextShots }, lifetimeSpentDelta: cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Revival Shot. Please try again.");
    }
  }

  // Spends one from inventory (mid-match, no coin cost — already paid for
  // at purchase time). Resolves false without changing anything if none
  // are held, so callers can just `if (!(await useX())) return;`.
  async function useAceCard(): Promise<boolean> {
    if (inventory.aceCards <= 0) return false;
    const next = inventory.aceCards - 1;
    setInventory((inv) => ({ ...inv, aceCards: next }));
    const res = await saveGameData("inventory", { aceCards: next }, user);
    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to sync item use.");
    }
    return true;
  }

  async function useConfidencePill(): Promise<boolean> {
    if (inventory.confidencePills <= 0) return false;
    const next = inventory.confidencePills - 1;
    setInventory((inv) => ({ ...inv, confidencePills: next }));
    const res = await saveGameData("inventory", { confidencePills: next }, user);
    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to sync item use.");
    }
    return true;
  }

  async function useRevivalShot(): Promise<boolean> {
    if (inventory.revivalShots <= 0) return false;
    const next = inventory.revivalShots - 1;
    setInventory((inv) => ({ ...inv, revivalShots: next }));
    const res = await saveGameData("inventory", { revivalShots: next }, user);
    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to sync item use.");
    }
    return true;
  }

  // ── STORE ITEMS: admin-editable catalog (public read, falls back to the
  // hardcoded config if the store_items table isn't migrated yet) ──
  const [storeItems, setStoreItems] = useState<StoreItemDef[]>(DEFAULT_STORE_ITEMS);
  const [storeItemsLoading, setStoreItemsLoading] = useState(true);

  const fetchStoreItems = async () => {
    setStoreItemsLoading(true);
    const { data, error } = await supabase
      .from("store_items")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error || !data || data.length === 0) {
      setStoreItems(DEFAULT_STORE_ITEMS);
      setStoreItemsLoading(false);
      return;
    }

    setStoreItems(
      data.map((row: any) => ({
        key: row.key,
        category: row.category,
        name: row.name,
        icon: row.icon || "🎁",
        description: row.description || "",
        pricingType: row.pricing_type,
        baseCost: row.base_cost,
        priceMultiplier: row.price_multiplier ?? 1,
        maxStock: row.max_stock ?? null,
        healAmount: row.heal_amount ?? 0,
        healFull: row.heal_full === true,
        active: row.active !== false,
        sortOrder: row.sort_order ?? 0,
      }))
    );
    setStoreItemsLoading(false);
  };

  useEffect(() => {
    fetchStoreItems();
  }, []);

  // ── THEMES: admin-editable catalog + per-user ownership + equipped theme.
  // The catalog itself (colors, fonts, price) is public and doesn't depend
  // on the signed-in user; ownership does. ──
  const [themes, setThemes] = useState<StoreTheme[]>(DEFAULT_THEMES);
  const [themesLoading, setThemesLoading] = useState(true);
  const [ownedThemeIds, setOwnedThemeIds] = useState<string[]>([]);

  const fetchThemes = async () => {
    setThemesLoading(true);
    const { data, error } = await supabase
      .from("store_themes")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error || !data || data.length === 0) {
      setThemes(DEFAULT_THEMES);
      setThemesLoading(false);
      return;
    }

    setThemes(
      data.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || "",
        cost: row.cost ?? 0,
        isDefault: !!row.is_default,
        active: row.active !== false,
        colors: row.colors,
        fontHeading: row.font_heading || "'Playfair Display', serif",
        fontBody: row.font_body || "'DM Sans', sans-serif",
        googleFontUrl: row.google_font_url ?? null,
        backgroundImageUrl: row.background_image_url ?? null,
        backgroundOpacity: typeof row.background_opacity === "number" ? row.background_opacity : 0.16,
      }))
    );
    setThemesLoading(false);
  };

  useEffect(() => {
    fetchThemes();
  }, []);

  useEffect(() => {
    const fetchOwned = async () => {
      const res = await loadGameData("themes", user);
      setOwnedThemeIds(res.ok && Array.isArray(res.data) ? res.data : []);
    };
    fetchOwned();
  }, [user]);

  // A theme with cost 0 (typically the default/starter look) is owned by
  // everyone automatically, same as a free debot — no purchase needed.
  const allOwnedThemeIds = [
    ...themes.filter((t) => t.cost <= 0).map((t) => t.id),
    ...ownedThemeIds,
  ];
  const equippedTheme =
    themes.find((t) => t.id === profile.equipped_theme_id && t.active) ||
    themes.find((t) => t.isDefault) ||
    null;

  async function buyTheme(themeId: string) {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    if (allOwnedThemeIds.includes(themeId)) return; // already owned — nothing to buy
    if (profile.coins < theme.cost) {
      setApiError("Not enough coins to buy this theme.");
      return;
    }
    try {
      const res = await saveGameData("themes", { themeId }, user);
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to purchase theme. Please try again.");
        return;
      }
      setOwnedThemeIds((prev) => (prev.includes(themeId) ? prev : [...prev, themeId]));
      spendCoins(theme.cost);
      checkAchievements({ baseCoins: profile.coins - theme.cost, ownedThemeCountOverride: ownedThemeIds.length + 1, lifetimeSpentDelta: theme.cost }).catch(() => {});
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase theme. Please try again.");
    }
  }

  // Equipping just flips profile.equipped_theme_id — upProfile already
  // handles guest-local vs. Supabase persistence generically. Passing null
  // resets to the catalog's default theme.
  function equipTheme(themeId: string | null) {
    if (themeId && !allOwnedThemeIds.includes(themeId)) {
      setApiError("You don't own this theme yet.");
      return;
    }
    upProfile({ equipped_theme_id: themeId });
  }

  // ── ACHIEVEMENTS: admin-editable catalog + per-user unlocks. Catalog is
  // public and independent of the signed-in user; unlocks aren't. ──
  const [achievements, setAchievements] = useState<AchievementDef[]>(DEFAULT_ACHIEVEMENTS);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<string[]>([]);
  // A global popup queue, not tied to any one page — checkAchievements can
  // be triggered from a match (offline/page.tsx) or a store purchase
  // (store/page.tsx via GameContext itself), and either way the person
  // should see the popup wherever they currently are. Rendered once, at
  // the bottom of this provider, so it's available app-wide for free.
  const [pendingAchievementPopups, setPendingAchievementPopups] = useState<AchievementDef[]>([]);
  const dismissAchievementPopup = () => setPendingAchievementPopups((q) => q.slice(1));

  const fetchAchievements = async () => {
    setAchievementsLoading(true);
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error || !data || data.length === 0) {
      setAchievements(DEFAULT_ACHIEVEMENTS);
      setAchievementsLoading(false);
      return;
    }

    setAchievements(
      data.map((row: any) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description || "",
        icon: row.icon || "🏅",
        conditionType: row.condition_type,
        conditionConfig: row.condition_config || {},
        rewardDebucks: row.reward_debucks ?? 0,
        rewardThemeId: row.reward_theme_id ?? null,
        active: row.active !== false,
        sortOrder: row.sort_order ?? 0,
        groupKey: row.group_key ?? null,
        tier: row.tier ?? null,
      }))
    );
    setAchievementsLoading(false);
  };

  useEffect(() => {
    fetchAchievements();
  }, []);

  useEffect(() => {
    const fetchUnlocked = async () => {
      const res = await loadGameData("achievements", user);
      setUnlockedAchievementIds(res.ok && Array.isArray(res.data) ? res.data : []);
    };
    fetchUnlocked();
  }, [user]);

  // Evaluates every active, not-yet-unlocked achievement against the user's
  // current match history + inventory, persists + rewards any that newly
  // qualify, and returns them so the caller can show a toast/notification.
  //
  // `extraMatch` lets a caller (the offline battle screen, right after a
  // match) pass the just-finished match record in directly rather than
  // trusting that its own save landed before this read runs — it's merged
  // into the fetched history (deduped by id) instead of raced against it.
  // `baseCoins` lets a caller supply the coin total it already knows is
  // about to be true (e.g. mid-reward-payout) instead of reading the
  // possibly-stale `profile.coins` closure — `lifetimeEarnedDelta`/
  // `lifetimeSpentDelta` do the same for the two lifetime counters, and
  // `unlockedDebotIdsOverride`/`ownedThemeCountOverride` do it for a debot
  // unlock / theme purchase that also hasn't landed in `opps`/
  // `ownedThemeIds` state yet at the moment this runs.
  async function checkAchievements(opts: {
    extraMatch?: any;
    baseCoins?: number;
    inventoryOverride?: Partial<Inventory>;
    unlockedDebotIdsOverride?: string[];
    ownedThemeCountOverride?: number;
    lifetimeEarnedDelta?: number;
    lifetimeSpentDelta?: number;
    dailyChallengesCompletedOverride?: number;
  } = {}): Promise<AchievementDef[]> {
    const historyRes = await loadGameData("history", user);
    let rawHistory: any[] = historyRes.ok && Array.isArray(historyRes.data) ? historyRes.data : [];
    if (opts.extraMatch && !rawHistory.some((m: any) => m.id && m.id === opts.extraMatch.id)) {
      rawHistory = [...rawHistory, opts.extraMatch];
    }
    const matchHistory = rawHistory.map(normalizeMatch).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const debotDifficultyById: Record<string, string> = {};
    for (const o of opps) debotDifficultyById[String(o.id)] = o.diff;

    const newly = getNewlyUnlocked(achievements, unlockedAchievementIds, {
      matchHistory,
      inventory: opts.inventoryOverride ? { ...inventory, ...opts.inventoryOverride } : inventory,
      storeItems,
      debotDifficultyById,
      lifetimeDebucksEarned: (profile.lifetimeDebucksEarned || 0) + (opts.lifetimeEarnedDelta || 0),
      lifetimeDebucksSpent: (profile.lifetimeDebucksSpent || 0) + (opts.lifetimeSpentDelta || 0),
      unlockedDebotIds: opts.unlockedDebotIdsOverride ?? opps.filter((o) => o.unlocked).map((o) => o.id),
      totalActiveDebotCount: opps.length,
      // Deliberately ownedThemeIds, NOT allOwnedThemeIds — the latter also
      // includes every free/default theme, which everyone "owns" from the
      // moment they open the app. Using it here meant "buy your first
      // theme" was satisfied for every player on their very first
      // achievement check of any kind (buying an item, winning a match —
      // anything), without ever actually buying a theme.
      ownedThemeCount: opts.ownedThemeCountOverride ?? ownedThemeIds.length,
      dailyChallengesCompleted: opts.dailyChallengesCompletedOverride ?? 0,
    });
    if (newly.length === 0) return [];

    for (const a of newly) {
      const res = await saveGameData("achievements", { achievementId: a.id }, user);
      if (!res.ok) console.error(res.error);
      if (a.rewardThemeId) {
        const themeRes = await saveGameData("themes", { themeId: a.rewardThemeId }, user);
        if (themeRes.ok) setOwnedThemeIds((prev) => (prev.includes(a.rewardThemeId!) ? prev : [...prev, a.rewardThemeId!]));
      }
    }

    setUnlockedAchievementIds((prev) => [...prev, ...newly.map((a) => a.id)]);
    setPendingAchievementPopups((q) => [...q, ...newly]);

    const totalDebucks = newly.reduce((sum, a) => sum + (a.rewardDebucks || 0), 0);
    if (totalDebucks > 0) {
      const base = typeof opts.baseCoins === "number" ? opts.baseCoins : profile.coins;
      upProfile({ coins: base + totalDebucks, lifetimeDebucksEarned: (profile.lifetimeDebucksEarned || 0) + totalDebucks });
    }

    return newly;
  }

  // ── PINNED TOPICS ──
  useEffect(() => {
    const fetchPinned = async () => {
      const res = await loadPinnedTopics(user);
      setPinnedTopicIds(res.ok && Array.isArray(res.data) ? res.data : []);
    };
    fetchPinned();
  }, [user]);

  async function toggleTopicPin(topicId: any) {
    const isPinned = pinnedTopicIds.includes(topicId);
    // Optimistic update — flip immediately, revert if the write fails.
    setPinnedTopicIds((prev) => (isPinned ? prev.filter((id) => id !== topicId) : [...prev, topicId]));
    const res = await togglePinnedTopic(topicId, !isPinned, user);
    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to update pinned topic.");
      setPinnedTopicIds((prev) => (isPinned ? [...prev, topicId] : prev.filter((id) => id !== topicId)));
    }
  }

  // System topics can't be removed for everyone, so "delete" on one of those
  // just hides it for this user (persisted per-user); a user's own custom
  // topic gets actually deleted. Either way it disappears from their list.
  async function deleteTopic(topic: { id: any; is_system?: boolean }): Promise<boolean> {
    const res = await deleteTopicRecord(topic, user);
    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to remove topic. Please try again.");
      return false;
    }
    setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    if (topic.is_system) {
      setHiddenTopicIds((prev) => (prev.includes(topic.id) ? prev : [...prev, topic.id]));
    }
    if (pinnedTopicIds.includes(topic.id)) {
      setPinnedTopicIds((prev) => prev.filter((id) => id !== topic.id));
      togglePinnedTopic(topic.id, false, user).catch(() => {});
    }
    return true;
  }

  // ── GAME SETTINGS: admin-configurable round options, global debot shape,
  // and the debucks tap-cheat toggle. Pulled together since they're all one
  // row-per-key table; exposed as refetchSettings so AdminPanel can force a
  // refresh right after writing a change instead of waiting for a reload.
  const fetchGameSettings = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["rounds_options", "rounds_default", "debot_vertices", "debot_diff_badge_style", "debucks_cheat_enabled", "landing_bg_url", "landing_bg_opacity", "bg_apply_everywhere", "daily_challenge_reward_per_correct"]);

    if (error || !data) {
      // DB fetch failed — fall back to config so the UI has *something*
      // correct to show, rather than sitting on the empty initial state.
      setRoundOptions(GAME_CONFIG.rounds.options);
      setSettingsLoaded(true);
      return;
    }

    const map: Record<string, any> = {};
    for (const row of data) map[row.key] = row.value;

    setRoundOptions(Array.isArray(map.rounds_options) && map.rounds_options.length ? map.rounds_options : GAME_CONFIG.rounds.options);
    setDefaultRounds(typeof map.rounds_default === "number" ? map.rounds_default : GAME_CONFIG.rounds.default);
    setDebotVertices(typeof map.debot_vertices === "number" ? map.debot_vertices : null);
    setDiffBadgeStyle(map.debot_diff_badge_style === "plain" ? "plain" : "badge");
    // Defaults to enabled (true) if the key was never set, so existing guests
    // keep the behavior they always had until an admin explicitly turns it off.
    setCheatTapEnabled(map.debucks_cheat_enabled !== false);
    setSiteBg({
      url: typeof map.landing_bg_url === "string" && map.landing_bg_url ? map.landing_bg_url : null,
      opacity: typeof map.landing_bg_opacity === "number" ? map.landing_bg_opacity : 0.16,
      applyEverywhere: map.bg_apply_everywhere === true,
    });
    setDailyChallengeRewardPerCorrect(typeof map.daily_challenge_reward_per_correct === "number" ? map.daily_challenge_reward_per_correct : DEFAULT_REWARD_PER_CORRECT);
    setSettingsLoaded(true);
  };

  useEffect(() => {
    fetchGameSettings();
  }, []);

  // ── JUDGE & SCORING: the prompt sent to the judge model, the caps applied
  // to what it returns, HP-damage conversion, impact-label thresholds, and
  // win bonuses — all admin-editable (Admin -> AI -> Judge & Scoring),
  // separate from fetchGameSettings above since it's edited on its own tab
  // and offline/page.tsx wants a single object to read from mid-match. ──
  const [judgeSettings, setJudgeSettings] = useState<JudgeSettings>(DEFAULT_JUDGE_SETTINGS);
  const [judgeSettingsLoading, setJudgeSettingsLoading] = useState(true);

  const fetchJudgeSettings = async () => {
    setJudgeSettingsLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "judge_system_prompt", "judge_max_gain", "judge_max_penalty", "judge_max_opp_gain", "judge_max_opp_penalty",
        "judge_player_dmg_multiplier", "judge_opp_dmg_multiplier",
        "judge_impact_devastating", "judge_impact_strong", "judge_impact_solid", "judge_impact_weak",
        "judge_no_penalty_bonus", "judge_domination_bonus", "judge_domination_margin",
        "judge_low_effort_backstop_enabled",
      ]);

    if (error || !data || data.length === 0) {
      setJudgeSettings(DEFAULT_JUDGE_SETTINGS);
      setJudgeSettingsLoading(false);
      return;
    }

    const map: Record<string, any> = {};
    for (const row of data) map[row.key] = row.value;
    const d = DEFAULT_JUDGE_SETTINGS;
    setJudgeSettings({
      systemPromptTemplate: typeof map.judge_system_prompt === "string" && map.judge_system_prompt.trim() ? map.judge_system_prompt : d.systemPromptTemplate,
      maxGain: typeof map.judge_max_gain === "number" ? map.judge_max_gain : d.maxGain,
      maxPenalty: typeof map.judge_max_penalty === "number" ? map.judge_max_penalty : d.maxPenalty,
      maxOppGain: typeof map.judge_max_opp_gain === "number" ? map.judge_max_opp_gain : d.maxOppGain,
      maxOppPenalty: typeof map.judge_max_opp_penalty === "number" ? map.judge_max_opp_penalty : d.maxOppPenalty,
      playerDamageMultiplier: typeof map.judge_player_dmg_multiplier === "number" ? map.judge_player_dmg_multiplier : d.playerDamageMultiplier,
      opponentDamageMultiplier: typeof map.judge_opp_dmg_multiplier === "number" ? map.judge_opp_dmg_multiplier : d.opponentDamageMultiplier,
      impactDevastating: typeof map.judge_impact_devastating === "number" ? map.judge_impact_devastating : d.impactDevastating,
      impactStrong: typeof map.judge_impact_strong === "number" ? map.judge_impact_strong : d.impactStrong,
      impactSolid: typeof map.judge_impact_solid === "number" ? map.judge_impact_solid : d.impactSolid,
      impactWeak: typeof map.judge_impact_weak === "number" ? map.judge_impact_weak : d.impactWeak,
      noPenaltyBonus: typeof map.judge_no_penalty_bonus === "number" ? map.judge_no_penalty_bonus : d.noPenaltyBonus,
      dominationBonus: typeof map.judge_domination_bonus === "number" ? map.judge_domination_bonus : d.dominationBonus,
      dominationMargin: typeof map.judge_domination_margin === "number" ? map.judge_domination_margin : d.dominationMargin,
      lowEffortBackstopEnabled: map.judge_low_effort_backstop_enabled !== false,
    });
    setJudgeSettingsLoading(false);
  };

  useEffect(() => {
    fetchJudgeSettings();
  }, []);

  // ── TOPICS: system (public) + per-user/guest custom ──
  useEffect(() => {
    const fetchTopics = async () => {
      setTopicsLoading(true);
      let query = supabase.from("topics").select("*").order("sort_order", { ascending: true, nullsFirst: false });
      query = user
        ? query.or(`is_system.eq.true,user_id.eq.${user.id}`)
        : query.eq("is_system", true);

      const { data, error } = await query;

      if (error) {
        console.error(error);
        setApiError("Failed to load topics. Please refresh and try again.");
        setTopicsLoading(false);
        return;
      }

      const hiddenRes = await loadHiddenTopics(user);
      const hiddenIds = hiddenRes.ok && Array.isArray(hiddenRes.data) ? hiddenRes.data : [];
      setHiddenTopicIds(hiddenIds);

      const mapped = (data || [])
        .filter((t: any) => !hiddenIds.includes(t.id))
        .map((t: any) => ({
          ...t,
          text: t.title || t.text || "Untitled topic",
          cat: t.category || t.cat || "General",
        }));

      if (!user) {
        const local = await loadGameData("topics", null);
        const localTopics = local.ok && Array.isArray(local.data) ? local.data : [];
        setTopics([...mapped, ...localTopics]);
      } else {
        setTopics(mapped);
      }
      setTopicsLoading(false);
    };
    fetchTopics();
  }, [user]);

  async function saveCustomTopic(text: string, cat: string = "Custom"): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || savingTopicRef.current) return false;
    savingTopicRef.current = true;

    const newTopic = {
      id: user ? undefined : `local-${Date.now()}`,
      text: trimmed,
      cat,
      is_system: false,
    };

    const res = await saveGameData("topics", newTopic, user);
    savingTopicRef.current = false;

    if (!res.ok) {
      console.error(res.error);
      setApiError("Failed to save topic. Please try again.");
      return false;
    }

    if (user) {
      const { data } = await supabase
        .from("topics")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_system", false)
        .order("id", { ascending: false })
        .limit(1);
      const row = data?.[0];
      if (row) {
        setTopics((prev) => [...prev, { ...row, text: row.title || trimmed, cat: row.category || cat }]);
      }
    } else {
      setTopics((prev) => [...prev, newTopic]);
    }

    return true;
  }

  return (
    <GameContext.Provider
      value={{
        user,
        signInWithGoogle,
        signOut,
        profile,
        upProfile,
        earnCoins,
        spendCoins,
        uploadAvatar,
        removeAvatar,
        onlineUserIds,
        incomingInvite,
        setIncomingInvite,
        hostMatchReady,
        setHostMatchReady,
        opps,
        oppsLoading,
        unlockDebot,
        refetchDebots: fetchDebots,
        inventory,
        inventoryLoading,
        aceCardPrice,
        itemPrice,
        buyInsightLens,
        buyAceCard,
        buyConfidencePill,
        buyRevivalShot,
        useAceCard,
        useConfidencePill,
        useRevivalShot,
        refetchInventory: fetchInventory,
        storeItems,
        storeItemsLoading,
        refetchStoreItems: fetchStoreItems,
        themes,
        themesLoading,
        ownedThemeIds: allOwnedThemeIds,
        equippedTheme,
        buyTheme,
        equipTheme,
        refetchThemes: fetchThemes,
        achievements,
        achievementsLoading,
        unlockedAchievementIds,
        refetchAchievements: fetchAchievements,
        checkAchievements,
        pendingAchievementPopups,
        dismissAchievementPopup,
        topics,
        topicsLoading,
        saveCustomTopic,
        pinnedTopicIds,
        toggleTopicPin,
        deleteTopic,
        roundOptions,
        defaultRounds,
        settingsLoaded,
        debotVertices,
        diffBadgeStyle,
        cheatTapEnabled,
        siteBg,
        dailyChallengeRewardPerCorrect,
        refetchSettings: fetchGameSettings,
        judgeSettings,
        judgeSettingsLoading,
        refetchJudgeSettings: fetchJudgeSettings,
        requestNavigation,
        pendingNavAction: !!pendingNavAction,
        confirmNavigation,
        cancelNavigation,
        battleActive,
        navGuardMessage,
        setNavGuardMessage,
        setBattleActive,
        apiError,
        setApiError,
      }}
    >
      {children}
      <AchievementPopupHost popup={pendingAchievementPopups[0]} onDismiss={dismissAchievementPopup} />
    </GameContext.Provider>
  );
}

// Rendered once, app-wide, from inside GameProvider so it fires no matter
// which page triggered the unlock (a match result, a store purchase,
// anything else that calls checkAchievements in the future). Shows one
// achievement at a time — a second unlock in the same beat just waits its
// turn in the queue rather than stacking modals.
function AchievementPopupHost({ popup, onDismiss }: { popup: AchievementDef | undefined; onDismiss: () => void }) {
  if (!popup) return null;
  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-pop"
        style={{
          background: "var(--surface)", border: "1px solid var(--amber)", borderRadius: "var(--r)",
          padding: 28, maxWidth: 340, width: "100%", textAlign: "center",
          boxShadow: "0 0 40px rgba(245,166,35,0.25)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
          Achievement Unlocked
        </div>
        <div
          style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 14px",
            background: "var(--amber-soft)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36,
          }}
        >
          {popup.icon}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{popup.name}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>{popup.description}</div>
        {popup.rewardDebucks > 0 && (
          <div style={{ fontSize: 14, color: "var(--amber)", fontWeight: 700, marginBottom: 18 }}>+{popup.rewardDebucks} debucks</div>
        )}
        <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={onDismiss}>Nice</button>
      </div>
    </div>
  );
}
