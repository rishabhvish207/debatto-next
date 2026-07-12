// Next.js shows this automatically during navigation to any route inside
// the (app) group (hub, offline, online, learning, store, history,
// settings, admin) — no manual "isLoading" state or event listeners
// needed, it's the framework's own transition boundary.
export default function Loading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="spinner" />
    </div>
  );
}
