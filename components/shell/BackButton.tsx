"use client";

import { useRouter } from "next/navigation";

// Universal back button — lives in the (app) group layout, directly under
// TopBar, so it's in the same place on every in-app page instead of each
// page needing its own ad hoc "back" affordance. Uses browser history so
// it naturally respects wherever the user actually came from.
export function BackButton() {
  const router = useRouter();
  return (
    <div style={{ padding: "10px 16px 0" }}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>← Back</button>
    </div>
  );
}
