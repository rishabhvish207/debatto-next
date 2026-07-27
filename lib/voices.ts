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

export function useEnabledVoices() {
  const [voices, setVoices] = useState<EnabledVoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "enabled_voices").maybeSingle().then(({ data, error }) => {
      if (error) console.error(error);
      setVoices(data?.value?.voices || []);
      setLoading(false);
    });
  }, []);

  return { voices, loading };
}
