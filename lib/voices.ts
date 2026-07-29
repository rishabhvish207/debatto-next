"use client";

// lib/voices.ts
//
// Reads the admin-curated enabled-voice list (Admin -> Voices) directly
// from app_settings — consumers (DebotsAdmin's voice picker, the player's
// own voice picker on Profile) never hit the live Edge TTS catalog
// themselves; VoicesAdmin already resolved ids to labels when it saved.

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export type EnabledVoice = { id: string; label: string };

// Debots and players are curated as two SEPARATE admin-controlled lists
// (Admin -> Voices), not one shared pool — a debot's assigned voice and
// what a player can pick for themselves are deliberately independent.
export function useEnabledVoices(scope: "debots" | "players") {
  const [voices, setVoices] = useState<EnabledVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const key = scope === "debots" ? "enabled_voices_debots" : "enabled_voices_players";

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", key).maybeSingle().then(({ data, error }) => {
      if (error) console.error(error);
      setVoices(data?.value?.voices || []);
      setLoading(false);
    });
  }, [key]);

  return { voices, loading };
}
