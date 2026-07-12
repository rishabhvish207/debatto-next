// Random online matchmaking. Schema already exists (matchmaking_queue,
// online_matches, online_match_rounds, try_match_player() RPC) — this page
// still needs the actual queue-join UI, Realtime subscription to the
// player's own queue row, and the live two-human battle screen.
export default function OnlineRandomPage() {
  return (
    <div style={{ padding: 24, color: "var(--muted)" }}>
      Random online matchmaking — coming soon.
    </div>
  );
}
