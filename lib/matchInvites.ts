// lib/matchInvites.ts
//
// Shared logic for accepting/declining a Friend Match invite, and for
// finalizing one into an actual online_matches row. Pulled out of the
// Notifications page so the same "waiting for host" resume logic can also
// run from a presence-change effect (host comes back online later) without
// duplicating the match-creation code.
//
// finalizeInviteIntoMatch calls a server-side RPC rather than inserting
// from the client — see finalize_invite_into_match in the SQL migrations
// for why: more than one client-side trigger could reach this for the same
// invite (the popup, the Notifications page, its auto-resume effect), and
// nothing serialized them against each other, so it was possible to create
// two different matches for one invite. The RPC row-locks the invite and
// makes that impossible.

import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export type MatchInvite = {
  id: string;
  host_id: string;
  invitee_id: string;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  rounds_total: number;
  allowed_items: Record<string, number>;
  topic_text: string;
  first_arguer_is_host: boolean;
  host_side: "FOR" | "AGAINST";
  match_id: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  invitee_dismissed: boolean;
  host_dismissed: boolean;
};

// Best-effort — flips any invite past its expires_at to 'expired' before we
// read/act on the table, so nobody accepts something that's actually stale.
export async function expireStaleInvites() {
  const { error } = await supabase.rpc("expire_stale_invites");
  if (error) console.error("expire_stale_invites failed:", error);
}

// Called once the invitee has accepted AND the host is confirmed online
// (checked by the caller against GameContext's onlineUserIds — this
// function doesn't know about presence itself). Idempotent AND
// concurrency-safe: the RPC row-locks the invite, so no matter how many
// times or from how many places this gets called for the same invite, only
// one online_matches row is ever created.
export async function finalizeInviteIntoMatch(invite: MatchInvite): Promise<{ ok: boolean; matchId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("finalize_invite_into_match", { p_invite_id: invite.id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, matchId: data as string };
}

export async function respondToInvite(invite: MatchInvite, accept: boolean, onlineUserIds: Set<string>): Promise<{ ok: boolean; matchId?: string; waitingForHost?: boolean; error?: string }> {
  if (!accept) {
    const { error } = await supabase.from("match_invites").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", invite.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error: acceptErr } = await supabase
    .from("match_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (acceptErr) return { ok: false, error: acceptErr.message };

  if (!onlineUserIds.has(invite.host_id)) {
    // Host has gone offline since sending the invite — leave match_id null.
    // Whoever's watching this invite (Notifications page, a presence
    // effect) calls finalizeInviteIntoMatch once the host reappears.
    return { ok: true, waitingForHost: true };
  }

  const result = await finalizeInviteIntoMatch(invite);
  return result.ok ? { ok: true, matchId: result.matchId } : { ok: false, error: result.error };
}
