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
import { GAME_CONFIG, DEFAULT_STORE_ITEMS, StoreItemDef } from "@/config/Game"; // now also provides GAME_CONFIG.store (insight lens / ace card / confidence pill pricing)
import { DEFAULT_THEMES, StoreTheme } from "@/config/Themes";

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
};

type Inventory = {
  insightLens: boolean;      // gear — one-time purchase, permanently unlocks the in-match Insight lifeline
  aceCards: number;          // consumable — "Show Answer", stacks up to store.aceCard.maxStock
  confidencePills: number;   // consumable — heals HP on use, stacks up to store.confidencePill.maxStock
};

const DEFAULT_INVENTORY: Inventory = { insightLens: false, aceCards: 0, confidencePills: 0 };

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

  inventory: Inventory;
  inventoryLoading: boolean;
  aceCardPrice: (held?: number) => number;
  buyInsightLens: () => Promise<void>;
  buyAceCard: () => Promise<void>;
  buyConfidencePill: () => Promise<void>;
  useAceCard: () => Promise<boolean>;
  useConfidencePill: () => Promise<boolean>;
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
  siteBg: { url: string | null; opacity: number; applyEverywhere: boolean };
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
  const [siteBg, setSiteBg] = useState<{ url: string | null; opacity: number; applyEverywhere: boolean }>({ url: null, opacity: 0.16, applyEverywhere: false });
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
        equipped_theme_id: data.equipped_theme_id ?? null,
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
          syncLocalToDB({ id: session.user.id }).then((sync) => {
            if (!sync.ok) {
              console.error(sync.errors);
              setApiError("Some guest progress failed to sync. Please check your data.");
            }
          });
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

  // Price of the *next* Ace Card purchase: baseCost * multiplier^held.
  // Reads from the admin-editable storeItems catalog (Admin → Store →
  // Items) so a price change there takes effect immediately; falls back to
  // the hardcoded config if the item isn't in the catalog for some reason.
  // Tied to how many you currently hold, not how many you've ever bought —
  // spend them all down to 0 and the price is right back to base.
  function aceCardPrice(held: number = inventory.aceCards): number {
    const item = storeItems.find((i) => i.key === "ace_card");
    const base = item?.baseCost ?? GAME_CONFIG.store.aceCard.baseCost;
    const mult = item?.priceMultiplier ?? 2;
    return Math.round(base * Math.pow(mult, held));
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
      upProfile({ coins: profile.coins - cost });
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
    const cost = aceCardPrice(inventory.aceCards);
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
      upProfile({ coins: profile.coins - cost });
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Ace Card. Please try again.");
    }
  }

  async function buyConfidencePill() {
    const item = storeItems.find((i) => i.key === "confidence_pill");
    const cost = item?.baseCost ?? GAME_CONFIG.store.confidencePill.cost;
    const maxStock = item?.maxStock ?? GAME_CONFIG.store.confidencePill.maxStock;
    if (inventory.confidencePills >= maxStock) {
      setApiError("Confidence Pills are already at max stock.");
      return;
    }
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
      upProfile({ coins: profile.coins - cost });
    } catch (err) {
      console.error(err);
      setApiError("Failed to purchase Confidence Pill. Please try again.");
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
      upProfile({ coins: profile.coins - theme.cost });
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
      .in("key", ["rounds_options", "rounds_default", "debot_vertices", "debucks_cheat_enabled", "landing_bg_url", "landing_bg_opacity", "bg_apply_everywhere"]);

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
    setSiteBg({
      url: typeof map.landing_bg_url === "string" && map.landing_bg_url ? map.landing_bg_url : null,
      opacity: typeof map.landing_bg_opacity === "number" ? map.landing_bg_opacity : 0.16,
      applyEverywhere: map.bg_apply_everywhere === true,
    });
    setSettingsLoaded(true);
  };

  useEffect(() => {
    fetchGameSettings();
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
        uploadAvatar,
        removeAvatar,
        opps,
        oppsLoading,
        unlockDebot,
        refetchDebots: fetchDebots,
        inventory,
        inventoryLoading,
        aceCardPrice,
        buyInsightLens,
        buyAceCard,
        buyConfidencePill,
        useAceCard,
        useConfidencePill,
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
        siteBg,
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
