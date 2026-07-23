// lib/matchInvites.ts
//
// Shared logic for accepting/declining a Friend Match invite, and for
// finalizing one into an actual online_matches row. Pulled out of the
// Notifications page so the same "waiting for host" resume logic can also
// run from a presence-change effect (host comes back online later) without
// duplicating the match-creation code.

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
// function doesn't know about presence itself). Idempotent: if match_id is
// already set, does nothing and just returns it, so it's safe to call this
// again from a "host came back online" effect without double-creating.
export async function finalizeInviteIntoMatch(invite: MatchInvite): Promise<{ ok: boolean; matchId?: string; error?: string }> {
  if (invite.match_id) return { ok: true, matchId: invite.match_id };

  const { data: match, error: matchErr } = await supabase
    .from("online_matches")
    .insert({
      mode: "friend",
      status: "active",
      host_id: invite.host_id,
      player_a: invite.host_id,
      player_b: invite.invitee_id,
      topic_text: invite.topic_text,
      rounds_total: invite.rounds_total,
      first_arguer: invite.host_id, // host always starts a friend match
      allowed_items: invite.allowed_items,
    })
    .select("id")
    .single();
  if (matchErr || !match) return { ok: false, error: matchErr?.message || "Failed to create match." };

  const { error: updateErr } = await supabase
    .from("match_invites")
    .update({ match_id: match.id })
    .eq("id", invite.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, matchId: match.id };
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
