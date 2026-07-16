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
import { GAME_CONFIG } from "@/config/Game";

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
};

type GameContextValue = {
  user: any;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  profile: Profile;
  upProfile: (patch: Partial<Profile>) => void;
  uploadAvatar: (file: File) => Promise<{ ok: boolean; error?: string }>;
  removeAvatar: () => Promise<{ ok: boolean; error?: string }>;

  opps: any[];
  oppsLoading: boolean;
  unlockDebot: (debot: any) => Promise<void>;
  refetchDebots: () => Promise<void>;

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
  cheatTapEnabled: boolean;
  refetchSettings: () => Promise<void>;
  requestNavigation: (action: () => void) => void;
  pendingNavAction: boolean;
  confirmNavigation: () => void;
  cancelNavigation: () => void;

  battleActive: boolean;
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
  const [cheatTapEnabled, setCheatTapEnabled] = useState<boolean>(true);
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

  const savingTopicRef = useRef(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
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
      });
    }
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
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
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        const local = await loadGameData("profile", null);
        const localData: any = (local.ok && local.data) ? local.data : null;
        if (localData) {
          // Guests never get a player_id — that's reserved for logged-in
          // accounts (see fetchProfile). Strip it out in case an older
          // build of this app ever wrote one locally.
          if ("player_id" in localData) delete localData.player_id;
          setProfile((p) => ({ ...p, ...localData }));
        } else {
          // First time we're seeing this guest at all — seed the real
          // starting balance once and persist it, rather than leaving the
          // brief pre-fetch placeholder state to flash a number that isn't
          // actually theirs yet.
          const seeded = { coins: GAME_CONFIG.economy.startingCoins };
          setProfile((p) => ({ ...p, ...seeded }));
          saveGameData("profile", seeded, null);
        }
      }
    };
    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      setUser(session?.user || null);
      if (session?.user) {
        if (event === "SIGNED_IN") {
          const sync = await syncLocalToDB({ id: session.user.id });
          if (!sync.ok) {
            console.error(sync.errors);
            setApiError("Some guest progress failed to sync. Please check your data.");
          }
        }
        fetchProfile(session.user.id);
      } else {
        setProfile({ name: DEFAULT_NAME, coins: GAME_CONFIG.economy.startingCoins, wins: 0, is_admin: false });
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── DEBOTS: catalog (public) + per-user unlock status ──
  const fetchDebots = async () => {
    setOppsLoading(true);
    const { data, error } = await supabase.from("debots").select("*").order("id", { ascending: true });

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
      multiplier: d.multiplier ?? GAME_CONFIG.damage.playerMultiplier,
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
      setOpps((prev) => prev.map((x) => (x.id === debot.id ? { ...x, unlocked: true } : x)));
      upProfile({ coins: profile.coins - debot.cost });
    } catch (err) {
      console.error(err);
      setApiError("Failed to unlock debot. Please try again.");
    }
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
      .in("key", ["rounds_options", "rounds_default", "debot_vertices", "debucks_cheat_enabled"]);

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
    // Defaults to enabled (true) if the key was never set, so existing guests
    // keep the behavior they always had until an admin explicitly turns it off.
    setCheatTapEnabled(map.debucks_cheat_enabled !== false);
    setSettingsLoaded(true);
  };

  useEffect(() => {
    fetchGameSettings();
  }, []);

  // ── TOPICS: system (public) + per-user/guest custom ──
  useEffect(() => {
    const fetchTopics = async () => {
      setTopicsLoading(true);
      let query = supabase.from("topics").select("*");
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
        uploadAvatar,
        removeAvatar,
        opps,
        oppsLoading,
        unlockDebot,
        refetchDebots: fetchDebots,
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
        cheatTapEnabled,
        refetchSettings: fetchGameSettings,
        requestNavigation,
        pendingNavAction: !!pendingNavAction,
        confirmNavigation,
        cancelNavigation,
        battleActive,
        setBattleActive,
        apiError,
        setApiError,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
