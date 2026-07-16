"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { ConfirmModal } from "@/components/shell/ConfirmModal";
import { clearAllLocalData } from "@/lib/persistenceManager";

export default function SettingsPage() {
  const { user, profile, signInWithGoogle, signOut } = useGame();
  const [confirmingReset, setConfirmingReset] = useState(false);

  function resetGuestProgress() {
    clearAllLocalData();
    // Simplest reliable way to get every piece of in-memory state (profile,
    // unlocked debots, custom topics, pins) back in sync with the now-empty
    // localStorage, without duplicating GameContext's whole bootstrap logic.
    window.location.reload();
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 26, marginBottom: 20 }}>Settings</h2>

      {/* Account */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Account
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{profile?.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
          {user ? "Signed in with Google — your progress is saved to your account." : "Playing as Guest — your progress is only stored on this device."}
        </div>
        {user ? (
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Log out</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={signInWithGoogle}>Log in with Google</button>
        )}
      </div>

      {/* Data */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Data
        </div>
        {user ? (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            Your debots, topics, and match history are tied to your account and sync automatically. To change your
            display name, bio, or profile picture, head to the Profile tab.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
              Everything — coins, unlocked debots, saved topics, match history — lives in this browser only. Clearing
              your browser data (or switching devices) loses it for good unless you log in first, which copies it
              over to a real account automatically.
            </div>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => setConfirmingReset(true)}>
              Reset guest progress
            </button>
          </>
        )}
      </div>

      {/* About */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          About
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Debatto</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          An AI-powered debate arena — pick a debot, pick a side, and argue it out. Built with Next.js, Supabase, and Groq.
        </div>
      </div>

      {confirmingReset && (
        <ConfirmModal
          title="Reset guest progress?"
          message="This permanently deletes your coins, unlocked debots, saved topics, and match history from this browser. This can't be undone."
          confirmLabel="Reset everything"
          cancelLabel="Cancel"
          onConfirm={resetGuestProgress}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
    </div>
  );
}
