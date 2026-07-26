"use client";

// Random online matchmaking. Schema/RPC already exist (matchmaking_queue,
// online_matches, try_match_player()) — this is the actual queue-join UI:
// join the queue, watch your own row for a match_id via Realtime, and
// land in the same arena Friend Match uses (mode-agnostic there already).

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export default function OnlineRandomPage() {
  const { user, profile } = useGame();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, []);

  async function findMatch() {
    if (!user) return;
    setError("");
    setSearching(true);
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const { data: matchId, error: rpcError } = await supabase.rpc("try_match_player", { p_user_id: user.id });
    if (rpcError) {
      console.error(rpcError);
      setError("Failed to join matchmaking. Please try again.");
      setSearching(false);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      return;
    }
    if (matchId) {
      router.push(`/online/match/${matchId}`);
      return;
    }
    // No opponent was waiting — we're queued. Watch our own row for
    // whoever matches with us next to set match_id.
  }

  useEffect(() => {
    if (!searching || !user) return;
    const channel = supabase
      .channel(`queue:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matchmaking_queue", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new?.match_id) router.push(`/online/match/${payload.new.match_id}`);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [searching, user]);

  // Rematch (from the prematch screen) redirects here with ?auto=1 to
  // requeue immediately instead of making the player press Find Match
  // again — only fires once per page load, and only once profile/username
  // are actually ready to search with.
  useEffect(() => {
    if (autoStarted.current) return;
    if (searchParams.get("auto") !== "1") return;
    if (!user || !profile?.username) return;
    autoStarted.current = true;
    findMatch();
  }, [user, profile?.username, searchParams]);

  async function cancelSearch() {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    setSearching(false);
    if (user) await supabase.from("matchmaking_queue").update({ status: "cancelled" }).eq("user_id", user.id);
  }

  if (!user) {
    return <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>Log in to play random online matches.</div>;
  }
  if (!profile?.username) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ color: "var(--muted)", marginBottom: 12, fontSize: 13 }}>You need a username before you can play online.</div>
        <a href="/profile" className="btn btn-primary btn-sm">Set a username</a>
      </div>
    );
  }

  return (
    <div className="root" style={{ padding: "40px 16px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <h1 className="heading" style={{ fontSize: 24, marginBottom: 8 }}>Random Match</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 28 }}>
        Matched by prestige, random topic, random side, random start.
      </p>

      {searching ? (
        <div>
          <div className="anim-pulse" style={{ fontSize: 15, marginBottom: 6 }}>Searching for an opponent…</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>{elapsed}s</div>
          <button className="btn btn-ghost btn-sm" onClick={cancelSearch}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={findMatch} style={{ padding: "12px 32px" }}>Find Match</button>
      )}

      {error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 16 }}>{error}</div>}
    </div>
  );
}
