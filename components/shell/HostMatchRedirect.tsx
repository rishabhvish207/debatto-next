"use client";

// Renders nothing — just watches GameContext's `hostMatchReady` (set the
// instant a host's own sent Friend Match invite gets accepted, from
// wherever in the app the host happens to be) and redirects them into the
// arena the moment it's set. Mounted globally in the app shell alongside
// InvitePopup, which handles the equivalent moment from the invitee's side.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";

export function HostMatchRedirect() {
  const { hostMatchReady, setHostMatchReady } = useGame();
  const router = useRouter();

  useEffect(() => {
    if (!hostMatchReady) return;
    const matchId = hostMatchReady;
    setHostMatchReady(null);
    router.push(`/online/match/${matchId}`);
  }, [hostMatchReady]);

  return null;
}
