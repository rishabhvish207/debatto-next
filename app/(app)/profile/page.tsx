"use client";

import { useRef, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { DebucksIcon } from "@/components/ui/DebucksIcon";
import { displayName, tierColor } from "@/config/Achievements";

export default function ProfilePage() {
  const { user, profile, upProfile, uploadAvatar, removeAvatar, signOut, signInWithGoogle, achievements, unlockedAchievementIds } = useGame();

  // Profile only ever shows the HIGHEST unlocked tier of each achievement
  // group, not every tier stacked — e.g. clearing Clean Sweep III means the
  // I/II unlocks that came alongside it don't also show up here separately.
  const achievementGroupSummary = (() => {
    const active = achievements.filter((a) => a.active);
    const groups = new Map<string, typeof active>();
    for (const a of active) {
      const key = a.groupKey || `__solo_${a.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    let unlockedGroups = 0;
    const badges: typeof active = [];
    for (const members of groups.values()) {
      const sorted = [...members].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1));
      let highest: (typeof active)[number] | null = null;
      for (const m of sorted) {
        if (unlockedAchievementIds.includes(m.id)) highest = m;
      }
      if (highest) { unlockedGroups += 1; badges.push(highest); }
    }
    return { unlockedGroups, totalGroups: groups.size, badges: badges.slice(0, 12) };
  })();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setName(profile?.name || "");
    setBio(profile?.bio || "");
    setAvatarStatus("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    upProfile({
      name: name.trim() || "Guest",
      bio: bio.trim() || null,
    });
    setSaving(false);
    setEditing(false);
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setAvatarStatus("Uploading…");
    const res = await uploadAvatar(file);
    setAvatarStatus(res.ok ? "Profile picture updated." : res.error || "Upload failed.");
    setAvatarBusy(false);
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    setAvatarStatus("Removing…");
    const res = await removeAvatar();
    setAvatarStatus(res.ok ? "Profile picture removed." : res.error || "Remove failed.");
    setAvatarBusy(false);
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 26, marginBottom: 20 }}>Profile</h2>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              onClick={editing && !avatarBusy ? () => fileInputRef.current?.click() : undefined}
              style={{
                width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
                border: "2px solid var(--border)", background: "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: editing && !avatarBusy ? "pointer" : "default",
              }}
              title={editing ? "Change profile picture" : undefined}
            >
              {avatarBusy ? (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>…</span>
              ) : profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile picture" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 24, color: "var(--muted)" }}>{(profile?.name || "G")[0]?.toUpperCase()}</span>
              )}
            </div>

            {editing && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                  title="Change profile picture"
                  style={{
                    position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%",
                    background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, border: "2px solid var(--bg, #0b0b12)", cursor: avatarBusy ? "not-allowed" : "pointer",
                    color: "#fff", padding: 0,
                  }}
                >
                  ✎
                </button>
                {profile?.avatar_url && !avatarBusy && (
                  <button
                    type="button"
                    title="Remove profile picture"
                    onClick={handleAvatarRemove}
                    style={{
                      position: "absolute", top: -4, left: -4, width: 20, height: 20, borderRadius: "50%",
                      background: "var(--red)", color: "#fff", border: "2px solid var(--bg, #0b0b12)", cursor: "pointer",
                      fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarPick}
                />
              </>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile?.name || "Guest"}
            </div>
            {user && (
              <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                ID: {profile?.player_id || "…"}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {user ? "Signed in" : "Playing as Guest"}
              {profile?.is_admin && <span style={{ color: "var(--amber)", marginLeft: 6 }}>· Admin</span>}
            </div>
          </div>
        </div>

        {editing && avatarStatus && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>{avatarStatus}</div>}

        <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Debucks</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--amber)", display: "flex", alignItems: "center", gap: 4 }}>
              <DebucksIcon />{profile?.coins ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Wins</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.wins ?? 0}</div>
          </div>
          {typeof profile?.prestige === "number" && (
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Prestige</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.prestige}</div>
            </div>
          )}
        </div>

        {!editing && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Bio</div>
            <div style={{ fontSize: 13, color: profile?.bio ? "var(--text)" : "var(--muted)", lineHeight: 1.5 }}>
              {profile?.bio || "No bio yet."}
            </div>
          </div>
        )}
      </div>

      {!editing ? (
        <button className="btn btn-primary btn-sm" onClick={startEditing}>Edit profile</button>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Display name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />

          <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Bio</label>
          <textarea
            className="input-field"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={4}
            style={{ marginBottom: 6, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right", marginBottom: 14 }}>{bio.length}/280</div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <a href="/achievements" className="card" style={{ padding: 16, marginTop: 16, textDecoration: "none", display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🏅</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Achievements</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {achievementGroupSummary.unlockedGroups} unlocked
              {achievementGroupSummary.totalGroups ? ` / ${achievementGroupSummary.totalGroups}` : ""}
            </div>
          </div>
          <span style={{ color: "var(--muted)" }}>›</span>
        </div>
        {achievementGroupSummary.badges.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {achievementGroupSummary.badges.map((b) => (
              <div
                key={b.id}
                title={displayName(b)}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: `${tierColor(b.tier)}33`, border: `1.5px solid ${tierColor(b.tier)}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                {b.icon}
              </div>
            ))}
          </div>
        )}
      </a>

      <div style={{ marginTop: 20 }}>
        {user ? (
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Log out</button>
        ) : (
          <div>
            <button className="btn btn-primary btn-sm" onClick={signInWithGoogle}>Log in</button>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              Saves your progress across devices and gives you a permanent Player ID.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
