// components/modals/ProfileModal.tsx
import React, { useState } from "react";

interface ProfileModalProps {
  profile: { name: string };
  onSave: (name: string) => void;
  onClose: () => void;
}

const DEFAULT_NAME = "Guest"; // Import from GAME_CONFIG if needed

export default function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [name, setName] = useState(profile.name);
  
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16,
    }} onClick={onClose}>
      <div className="card" style={{ padding: 24, maxWidth: 360, width: "100%" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Edit Profile</div>
        <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>Display name</label>
        <input className="input-field" value={name} onChange={e => setName(e.target.value)}
          placeholder={DEFAULT_NAME}
          onKeyDown={e => { if (e.key === "Enter") onSave(name.trim() || DEFAULT_NAME); }}
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(name.trim() || DEFAULT_NAME)}>Save</button>
        </div>
      </div>
    </div>
  );
}
