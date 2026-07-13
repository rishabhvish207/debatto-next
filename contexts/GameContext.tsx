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
import { saveGameData, loadGameData, syncLocalToDB } from "@/lib/persistenceManager";
import { GAME_CONFIG } from "@/config/Game";

const supabase = createClient();
const DEFAULT_NAME = GAME_CONFIG.defaultName;

type Profile = {
  name: string;
  coins: number;
  wins: number;
  is_admin: boolean;
  username?: string | null;
  prestige?: number;
};

type GameContextValue = {
  user: any;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  profile: Profile;
  upProfile: (patch: Partial<Profile>) => void;

  opps: any[];
  oppsLoading: boolean;
  unlockDebot: (debot: any) => Promise<void>;

  topics: any[];
  topicsLoading: boolean;
  saveCustomTopic: (text: string, cat?: string) => Promise<boolean>;

  roundOptions: number[];
  defaultRounds: number;

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
    coins: GAME_CONFIG.economy.startingCoins,
    wins: 0,
    is_admin: false,
  });

  const [opps, setOpps] = useState<any[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);

  const [topics, setTopics] = useState<any[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  const [roundOptions, setRoundOptions] = useState<number[]>(GAME_CONFIG.rounds.options);
  const [defaultRounds, setDefaultRounds] = useState<number>(GAME_CONFIG.rounds.default);

  const [apiError, setApiError] = useState("");

  const savingTopicRef = useRef(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) {
      setProfile({
        name: data.name,
        coins: data.coins,
        wins: data.wins,
        is_admin: data.is_admin,
        username: data.username,
        prestige: data.prestige,
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

  // ── AUTH BOOTSTRAP + GUEST->LOGIN SYNC ──
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        const local = await loadGameData("profile", null);
        if (local.ok && local.data) {
          setProfile((p) => ({ ...p, ...local.data }));
        }
      }
    };
    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
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
        setProfile({ name: "Guest", coins: 20, wins: 0, is_admin: false });
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── DEBOTS: catalog (public) + per-user unlock status ──
  useEffect(() => {
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
        vertices: d.vertices ?? 6,
        sprite: d.sprite_url || null,
        spriteEmotions: d.sprite_emotions || {},
        multiplier: d.multiplier ?? GAME_CONFIG.damage.playerMultiplier,
        reward: d.reward ?? 5,
        unlocked: (d.cost ?? 0) <= 0 || unlockedIds.includes(d.id),
      }));
      setOpps(mapped);
      setOppsLoading(false);
    };
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

  // ── GAME SETTINGS: admin-configurable round options ──
  useEffect(() => {
    const fetchRoundSettings = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["rounds_options", "rounds_default"]);

      if (error || !data) return; // keep the GAME_CONFIG fallback silently

      const map: Record<string, any> = {};
      for (const row of data) map[row.key] = row.value;

      if (Array.isArray(map.rounds_options) && map.rounds_options.length) {
        setRoundOptions(map.rounds_options);
      }
      if (typeof map.rounds_default === "number") {
        setDefaultRounds(map.rounds_default);
      }
    };
    fetchRoundSettings();
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

      const mapped = (data || []).map((t: any) => ({
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
        opps,
        oppsLoading,
        unlockDebot,
        topics,
        topicsLoading,
        saveCustomTopic,
        roundOptions,
        defaultRounds,
        apiError,
        setApiError,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
