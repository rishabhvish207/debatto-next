// lib/notificationsBadge.ts
//
// A single, cheap yes/no check for "does this person have anything new to
// look at in Notifications" — used by the header bell (components/shell/
// TopBar.tsx) to decide whether to show the little dot. Deliberately much
// lighter than app/(app)/notifications/page.tsx's own data-fetching: the
// header just needs a boolean, not the full friend-request/invite objects
// (with joined profile names etc.) the actual page needs to render.
//
// "Anything worth a dot" mirrors exactly what the Notifications page would
// show you if you opened it right now:
//   - today's Daily Challenge not yet completed (guest or logged-in — see
//     hasCompletedToday, which already handles both)
//   - an incoming friend request
//   - an incoming match invite you haven't dismissed
//   - an outgoing match invite whose status changed to something you
//     haven't seen yet (accepted/declined) — mirrors the page's "Sent
//     invites" section, which stays visible until YOU dismiss it too, not
//     just while it's pending

import { createClient } from "@/utils/supabase/client";
import { hasCompletedToday } from "@/lib/dailyChallengeStatus";
import { expireStaleInvites } from "@/lib/matchInvites";

const supabase = createClient();

export async function hasPendingNotifications(user: { id: string } | null): Promise<boolean> {
  // Cheapest check first, and the only one guests can have at all — no
  // need to touch Supabase for a signed-out/guest session beyond this.
  const dailyDone = await hasCompletedToday(user);
  if (!dailyDone) return true;
  if (!user) return false;

  await expireStaleInvites();

  const [{ count: reqCount }, { data: invites }] = await Promise.all([
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("addressee_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("match_invites")
      .select("id, host_id, invitee_id, status, invitee_dismissed, host_dismissed")
      .or(`invitee_id.eq.${user.id},host_id.eq.${user.id}`),
  ]);

  if ((reqCount || 0) > 0) return true;

  const hasInviteToShow = (invites || []).some((i: any) => {
    if (i.invitee_id === user.id) return !i.invitee_dismissed; // incoming, not yet dismissed
    if (i.host_id === user.id) return !i.host_dismissed; // outgoing, not yet dismissed
    return false;
  });

  return hasInviteToShow;
}
