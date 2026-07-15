"use client";

// components/admin/AdminPanel.tsx
//
// Renders nothing unless the current profile has is_admin = true. The flag
// itself can only be flipped server-side (SQL editor / service-role script /
// a dedicated RPC) — see schema_migration.sql. This component just checks
// the value it's handed; it doesn't and shouldn't try to set it.
//
// Real security boundary is Supabase Row Level Security on every table this
// panel writes to (debots, topics, app_settings) and Storage RLS on the
// debot-sprites bucket — a client-side check can be bypassed by anyone
// calling the API directly, RLS cannot.

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useGame } from "@/contexts/GameContext";

const supabase = createClient();

type AdminPanelProps = {
  profile: { is_admin?: boolean } | null;
};

const EMOTIONS = ["confident", "angry", "shocked", "neutral", "defeated"];

export function AdminPanel({ profile }: AdminPanelProps) {
  const [tab, setTab] = useState<"debots" | "topics" | "settings" | "ai">("debots");

  // Fail closed: no profile, or not an admin -> render nothing at all.
  if (!profile?.is_admin) return null;

  return (
    <div className="card" style={{ padding: 16, marginTop: 24, borderColor: "var(--amber)" }}>
      <div style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        ⚙ Admin
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {([
          ["debots", "Debots"],
          ["topics", "Topics"],
          ["settings", "Settings"],
          ["ai", "AI"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "debots" && <DebotsAdmin />}
      {tab === "topics" && <TopicsAdmin />}
      {tab === "settings" && <SettingsAdmin />}
      {tab === "ai" && <AiSettingsAdmin />}
    </div>
  );
}

// ===========================================================================
// DEBOTS — full CRUD, including shape (vertices) and sprite uploads
// ===========================================================================

const BLANK_DEBOT = {
  id: null as any,
  name: "",
  sub: "",
  personality: "",
  depth: "",
  story: "",
  arg_sentences: 3,
  sprite_url: null as string | null,
  sprite_emotions: {} as Record<string, string>,
  multiplier: 1,
  cost: 0,
  max_hp: 100,
  color: "var(--blue)",
  diff: "Beginner",
  dc: "var(--green)",
  reward: 5,
};

function DebotsAdmin() {
  const { refetchDebots } = useGame();
  const [debots, setDebots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // null = not editing, object = form data
  const [editSnapshot, setEditSnapshot] = useState<any>(null); // last-saved field values, to detect unsaved changes on Exit
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState<string | null>(null); // which slot is mid-upload

  // Only the fields Save actually persists — sprite fields are excluded since
  // those already save immediately on upload, not batched into this diff.
  function fieldSnapshot(e: any) {
    return {
      name: e.name, sub: e.sub, personality: e.personality, depth: e.depth, story: e.story,
      arg_sentences: e.arg_sentences, multiplier: e.multiplier, cost: e.cost, max_hp: e.max_hp,
      color: e.color, diff: e.diff, dc: e.dc, reward: e.reward,
    };
  }

  function hasUnsavedChanges() {
    if (!editSnapshot || !editing) return false;
    return JSON.stringify(fieldSnapshot(editing)) !== JSON.stringify(editSnapshot);
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("debots").select("*").order("id", { ascending: true });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setDebots(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startEdit(d: any) {
    setConfirmingDeleteId(null);
    const next = { ...d, sprite_emotions: d.sprite_emotions || {} };
    setEditing(next);
    setEditSnapshot(fieldSnapshot(next));
    setConfirmExit(false);
  }

  function startNew() {
    setConfirmingDeleteId(null);
    setEditing({ ...BLANK_DEBOT });
    setEditSnapshot(fieldSnapshot(BLANK_DEBOT));
    setConfirmExit(false);
  }

  function cancelEdit() {
    setEditing(null);
    setEditSnapshot(null);
    setConfirmExit(false);
  }

  // Exit button: only warns if the batched fields (name, cost, personality,
  // etc.) differ from what's actually saved. Sprite uploads are already
  // persisted the moment they succeed, so they never trigger this.
  function attemptExit() {
    if (hasUnsavedChanges()) {
      setConfirmExit(true);
    } else {
      cancelEdit();
    }
  }

  async function saveAndExit() {
    await save();
    cancelEdit();
  }

  function updateField(key: string, value: any) {
    setEditing((prev: any) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!editing?.name?.trim()) {
      setStatus("Name is required.");
      return;
    }
    setStatus("Saving…");

    const payload = {
      name: editing.name,
      sub: editing.sub,
      personality: editing.personality,
      depth: editing.depth,
      story: editing.story,
      arg_sentences: Math.max(1, Math.min(8, Number(editing.arg_sentences) || 3)),
      multiplier: Number(editing.multiplier) || 1,
      cost: Number(editing.cost) || 0,
      max_hp: Number(editing.max_hp) || 100,
      color: editing.color,
      diff: editing.diff,
      dc: editing.dc,
      reward: Number(editing.reward) || 0,
    };

    const res = editing.id
      ? await supabase.from("debots").update(payload).eq("id", editing.id).select()
      : await supabase.from("debots").insert(payload).select().single();

    if (res.error) {
      setStatus(`Failed: ${res.error.message}`);
      return;
    }
    if (editing.id && (!res.data || (Array.isArray(res.data) && res.data.length === 0))) {
      setStatus("Update didn't apply — the 'debots' table UPDATE policy may be blocking this admin account.");
      return;
    }

    setStatus(editing.id ? "Debot updated." : "Debot created — you can now upload sprites for it.");
    // If we just created a new debot, stay in the edit form (now with a real
    // id) instead of bouncing back to the list, so sprite upload is usable
    // immediately without having to re-open the edit screen.
    if (!editing.id && res.data) {
      const next = { ...res.data, sprite_emotions: res.data.sprite_emotions || {} };
      setEditing(next);
      setEditSnapshot(fieldSnapshot(next));
    } else {
      setEditing(null);
      setEditSnapshot(null);
    }
    setConfirmExit(false);
    load();
    refetchDebots();
  }

  async function confirmDelete(id: any) {
    setStatus("Deleting…");
    const { error } = await supabase.from("debots").delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (error) setStatus(`Failed to delete: ${error.message}`);
    else {
      setStatus("Debot deleted.");
      load();
      refetchDebots();
    }
  }

  // Sprite uploads persist immediately (not batched into the main Save
  // button) so a successful upload is never lost if the admin navigates
  // away without hitting Save. slot is "base" or one of EMOTIONS.
  async function uploadSprite(file: File, slot: string) {
    if (!editing?.id) {
      setStatus("Save the debot first — sprites need a real debot id.");
      return;
    }
    setUploading(slot);
    setStatus("Uploading…");

    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `debot-${editing.id}/${slot}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("debot-sprites").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("debot-sprites").getPublicUrl(path);
      const url = pub.publicUrl;

      if (slot === "base") {
        const { data: dbData, error: dbErr } = await supabase.from("debots").update({ sprite_url: url }).eq("id", editing.id).select();
        if (dbErr) throw dbErr;
        // A successful call with zero rows returned means RLS silently blocked
        // the write (Postgres/PostgREST don't error on that) — the file is in
        // storage but the debot row never got the URL, so it'll look "gone"
        // the moment this component re-reads from the DB.
        if (!dbData || dbData.length === 0) {
          throw new Error("Update didn't apply — check the 'debots' table UPDATE policy allows this admin account (RLS may be silently blocking it).");
        }
        setEditing((prev: any) => ({ ...prev, sprite_url: url }));
      } else {
        const nextEmotions = { ...(editing.sprite_emotions || {}), [slot]: url };
        const { data: dbData, error: dbErr } = await supabase.from("debots").update({ sprite_emotions: nextEmotions }).eq("id", editing.id).select();
        if (dbErr) throw dbErr;
        if (!dbData || dbData.length === 0) {
          throw new Error("Update didn't apply — check the 'debots' table UPDATE policy allows this admin account (RLS may be silently blocking it).");
        }
        setEditing((prev: any) => ({ ...prev, sprite_emotions: nextEmotions }));
      }

      setStatus("Sprite uploaded.");
      load();
      refetchDebots();
    } catch (err: any) {
      console.error(err);
      setStatus(`Upload failed: ${err.message || err}`);
    }
    setUploading(null);
  }

  // Clears a slot back to "no sprite" — both the DB reference and, best
  // effort, the underlying storage file. The DB write is what actually
  // matters for display; storage cleanup just avoids orphaned files.
  async function removeSprite(slot: string) {
    if (!editing?.id) return;
    setUploading(slot);
    setStatus("Removing…");

    try {
      if (slot === "base") {
        const { data: dbData, error: dbErr } = await supabase.from("debots").update({ sprite_url: null }).eq("id", editing.id).select();
        if (dbErr) throw dbErr;
        if (!dbData || dbData.length === 0) {
          throw new Error("Removal didn't apply — check the 'debots' table UPDATE policy allows this admin account.");
        }
        setEditing((prev: any) => ({ ...prev, sprite_url: null }));
      } else {
        const nextEmotions = { ...(editing.sprite_emotions || {}) };
        delete nextEmotions[slot];
        const { data: dbData, error: dbErr } = await supabase.from("debots").update({ sprite_emotions: nextEmotions }).eq("id", editing.id).select();
        if (dbErr) throw dbErr;
        if (!dbData || dbData.length === 0) {
          throw new Error("Removal didn't apply — check the 'debots' table UPDATE policy allows this admin account.");
        }
        setEditing((prev: any) => ({ ...prev, sprite_emotions: nextEmotions }));
      }

      setStatus("Sprite removed.");
      load();
      refetchDebots();
    } catch (err: any) {
      console.error(err);
      setStatus(`Remove failed: ${err.message || err}`);
    }
    setUploading(null);
  }

  if (editing) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {editing.id ? `Edit: ${editing.name || "Debot"}` : "New Debot"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <LabeledInput label="Name" value={editing.name} onChange={(v) => updateField("name", v)} />
          <LabeledInput label="Subtitle" value={editing.sub} onChange={(v) => updateField("sub", v)} />
          <LabeledInput label="Difficulty label" value={editing.diff} onChange={(v) => updateField("diff", v)} />
          <LabeledInput label="Difficulty color (dc)" value={editing.dc} onChange={(v) => updateField("dc", v)} />
          <LabeledInput label="Color" value={editing.color} onChange={(v) => updateField("color", v)} />
          <LabeledInput label="Argument length (sentences)" value={editing.arg_sentences ?? 3} onChange={(v) => updateField("arg_sentences", v)} type="number" />
          <LabeledInput label="Cost (❋)" value={editing.cost} onChange={(v) => updateField("cost", v)} type="number" />
          <LabeledInput label="Reward (❋)" value={editing.reward} onChange={(v) => updateField("reward", v)} type="number" />
          <LabeledInput label="Max HP" value={editing.max_hp} onChange={(v) => updateField("max_hp", v)} type="number" />
          <LabeledInput label="Damage multiplier" value={editing.multiplier} onChange={(v) => updateField("multiplier", v)} type="number" step="0.1" />
        </div>
        <LabeledTextarea label="Personality" value={editing.personality} onChange={(v) => updateField("personality", v)} />
        <LabeledTextarea label="Argument depth" value={editing.depth} onChange={(v) => updateField("depth", v)} />
        <LabeledTextarea label="Background story" value={editing.story} onChange={(v) => updateField("story", v)} />

        {/* Sprites */}
        <div style={{ marginTop: 14, marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Sprites {!editing.id && "(save the debot first)"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <SpriteSlot
              label="Base / default"
              url={editing.sprite_url}
              disabled={!editing.id}
              uploading={uploading === "base"}
              onFile={(f) => uploadSprite(f, "base")}
              onRemove={() => removeSprite("base")}
            />
            {EMOTIONS.map((em) => (
              <SpriteSlot
                key={em}
                label={em}
                url={editing.sprite_emotions?.[em]}
                disabled={!editing.id}
                uploading={uploading === em}
                onFile={(f) => uploadSprite(f, em)}
                onRemove={() => removeSprite(em)}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
            Any emotion without its own sprite falls back to the base sprite, and falls back to a plain colored placeholder if no sprite exists at all.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={attemptExit}>Exit</button>
        </div>

        {confirmExit && (
          <div className="card" style={{ marginTop: 10, padding: 12, borderColor: "var(--amber)" }}>
            <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 10 }}>
              You have unsaved changes. Save before exiting?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={saveAndExit}>Save &amp; Exit</button>
              <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={cancelEdit}>Discard</button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setConfirmExit(false)}>Cancel</button>
            </div>
          </div>
        )}

        {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{debots.length} debots</span>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ New Debot</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
          {debots.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "var(--faint)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.diff} · ❋{d.cost} · ×{d.multiplier} · {d.arg_sentences ?? 3} sent.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>Edit</button>
              {confirmingDeleteId === d.id ? (
                <>
                  <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(d.id)}>Confirm</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(d.id)}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
      {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
    </div>
  );
}

function SpriteSlot({
  label, url, disabled, uploading, onFile, onRemove,
}: {
  label: string; url?: string | null; disabled?: boolean; uploading?: boolean; onFile: (f: File) => void; onRemove?: () => void;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      width: 64, opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ position: "relative", width: 48, height: 48 }}>
        <label style={{ cursor: disabled ? "not-allowed" : "pointer", display: "block" }}>
          <div style={{
            width: 48, height: 48, borderRadius: 8, overflow: "hidden",
            border: "1px solid var(--border)", background: "var(--surface2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {uploading ? (
              <span style={{ fontSize: 9, color: "var(--muted)" }}>…</span>
            ) : url ? (
              <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 16, color: "var(--muted)" }}>+</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            disabled={disabled || uploading}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {url && !uploading && onRemove && (
          <button
            type="button"
            title={`Remove ${label} sprite`}
            onClick={onRemove}
            style={{
              position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
              background: "var(--red)", color: "#fff", border: "none", cursor: "pointer",
              fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "capitalize", textAlign: "center" }}>{label}</span>
    </div>
  );
}

// ===========================================================================
// TOPICS — system topics only (private per-user custom topics are out of
// admin scope by design; RLS already restricts admin writes to is_system=true)
// ===========================================================================

function TopicsAdmin() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [editCat, setEditCat] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("is_system", true)
      .order("id", { ascending: false });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setTopics(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addTopic() {
    if (!newText.trim() || !newCat.trim()) return;
    setStatus("Saving…");
    const { error } = await supabase
      .from("topics")
      .insert({ title: newText.trim(), category: newCat.trim(), is_system: true, user_id: null });
    setStatus(error ? `Failed: ${error.message}` : "Topic added.");
    if (!error) {
      setNewText("");
      setNewCat("");
      load();
    }
  }

  function startEdit(t: any) {
    setConfirmingDeleteId(null);
    setEditingId(t.id);
    setEditText(t.title || "");
    setEditCat(t.category || "");
  }

  async function saveEdit() {
    setStatus("Saving…");
    const { error } = await supabase
      .from("topics")
      .update({ title: editText.trim(), category: editCat.trim() })
      .eq("id", editingId);
    setStatus(error ? `Failed: ${error.message}` : "Topic updated.");
    if (!error) {
      setEditingId(null);
      load();
    }
  }

  async function confirmDelete(id: any) {
    setStatus("Deleting…");
    const { error } = await supabase.from("topics").delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (error) setStatus(`Failed to delete: ${error.message}`);
    else {
      setStatus("Topic deleted.");
      load();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input className="input-field" placeholder="Topic text" value={newText} onChange={(e) => setNewText(e.target.value)} style={{ flex: "1 1 200px" }} />
        <input className="input-field" placeholder="Category" value={newCat} onChange={(e) => setNewCat(e.target.value)} style={{ flex: "0 1 140px" }} />
        <button className="btn btn-primary btn-sm" onClick={addTopic}>Add</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {topics.map((t) => (
            <div key={t.id} style={{ padding: "8px 10px", borderRadius: 6, background: "var(--faint)" }}>
              {editingId === t.id ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="input-field" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ flex: "1 1 200px" }} />
                  <input className="input-field" value={editCat} onChange={(e) => setEditCat(e.target.value)} style={{ flex: "0 1 140px" }} />
                  <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.category}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>Edit</button>
                  {confirmingDeleteId === t.id ? (
                    <>
                      <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(t.id)}>Confirm</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(t.id)}>Delete</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
    </div>
  );
}

// ===========================================================================
// SETTINGS — AI knobs + number-of-rounds options, stored in app_settings.
// AI knobs are resolved server-side by app/api/debate/route.ts; rounds are
// read client-side by GameContext. Neither is ever trusted from the browser
// for the AI case — for rounds it's just player-facing UI config, so a
// client read is fine.
// ===========================================================================

function SettingsAdmin() {
  const { refetchSettings } = useGame();
  const [roundsOptionsText, setRoundsOptionsText] = useState("");
  const [roundsDefault, setRoundsDefault] = useState<number | "">("");
  const [vertices, setVertices] = useState<number | "">("");
  const [cheatEnabled, setCheatEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["rounds_options", "rounds_default", "debot_vertices", "debucks_cheat_enabled"]);

    if (error) {
      setStatus(`Failed to load: ${error.message}. Have you run app_settings.sql / debots_redesign.sql yet?`);
      setLoading(false);
      return;
    }

    const map: Record<string, any> = {};
    for (const row of data || []) map[row.key] = row.value;
    setRoundsOptionsText(Array.isArray(map.rounds_options) ? map.rounds_options.join(", ") : "");
    setRoundsDefault(typeof map.rounds_default === "number" ? map.rounds_default : "");
    setVertices(typeof map.debot_vertices === "number" ? map.debot_vertices : "");
    setCheatEnabled(map.debucks_cheat_enabled !== false);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setStatus("Saving…");

    const parsedOptions = roundsOptionsText
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (!parsedOptions.length) {
      setStatus("Round options must be a comma-separated list of numbers (e.g. 2, 10, 20, 30).");
      return;
    }

    const rows: { key: string; value: any }[] = [
      { key: "rounds_options", value: parsedOptions },
      { key: "rounds_default", value: Number(roundsDefault) || parsedOptions[0] },
      { key: "debucks_cheat_enabled", value: cheatEnabled },
    ];
    // Vertices is optional — leaving it blank means "let each debot keep its
    // own shape" rather than forcing one on the whole catalog.
    if (vertices !== "") {
      rows.push({ key: "debot_vertices", value: Math.max(0, Math.min(10, Number(vertices))) });
    }

    const { data: upsertData, error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" }).select();
    if (error) {
      setStatus(`Failed: ${error.message}`);
      return;
    }
    if (!upsertData || upsertData.length < rows.length) {
      setStatus("Some settings didn't save — check the 'app_settings' table's INSERT/UPDATE policies allow this admin account (RLS may be silently blocking part of the write).");
      return;
    }
    setStatus("Settings saved.");
    refetchSettings();
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Number of Rounds
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Controls the round-count choices players see on the Setup screen, and which one is pre-selected.
      </div>
      <LabeledInput label="Round options (comma-separated)" value={roundsOptionsText} onChange={setRoundsOptionsText} />
      <div style={{ marginTop: 8 }}>
        <LabeledInput label="Default rounds" value={roundsDefault} onChange={(v) => setRoundsDefault(v === "" ? "" : Number(v))} type="number" />
      </div>

      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 8 }}>
        Debot Shape
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Applies one vertex count to every debot at once, overriding each debot's individual shape. Leave blank to let each debot keep its own shape.
      </div>
      <LabeledInput label="Vertices for all debots (0 = circle, blank = per-debot)" value={vertices} onChange={(v) => setVertices(v === "" ? "" : Number(v))} type="number" />

      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 8 }}>
        Debucks Tap Cheat
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
        Tapping the coin badge 5 times quickly sets a player's coins to 10,000. Turn this off to disable it for everyone.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={cheatEnabled} onChange={(e) => setCheatEnabled(e.target.checked)} style={{ accentColor: "var(--blue)" }} />
        Enable the 5-tap debucks cheat
      </label>

      <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={save}>Save settings</button>
      {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
    </div>
  );
}

function AiSettingsAdmin() {
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState<number | "">("");
  const [temperature, setTemperature] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["ai_model", "ai_max_tokens", "ai_temperature"]);

    if (error) {
      setStatus(`Failed to load: ${error.message}. Have you run app_settings.sql yet?`);
      setLoading(false);
      return;
    }

    const map: Record<string, any> = {};
    for (const row of data || []) map[row.key] = row.value;
    setModel(map.ai_model ?? "");
    setMaxTokens(map.ai_max_tokens ?? "");
    setTemperature(map.ai_temperature ?? "");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setStatus("Saving…");
    const rows = [
      { key: "ai_model", value: model },
      { key: "ai_max_tokens", value: Number(maxTokens) || 1000 },
      { key: "ai_temperature", value: Number(temperature) },
    ];
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setStatus(error ? `Failed: ${error.message}` : "Settings saved — takes effect on the next AI call.");
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        AI Settings
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Controls the AI model used for every debate, judged evaluation, hint, and answer suggestion.
        Resolved server-side — the browser never sends or overrides these.
      </div>
      <LabeledInput label="Model" value={model} onChange={setModel} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <LabeledInput label="Max tokens" value={maxTokens} onChange={(v) => setMaxTokens(v === "" ? "" : Number(v))} type="number" />
        <LabeledInput label="Temperature" value={temperature} onChange={(v) => setTemperature(v === "" ? "" : Number(v))} type="number" step="0.1" />
      </div>

      <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={save}>Save settings</button>
      {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
    </div>
  );
}

// ===========================================================================
// Small shared form controls
// ===========================================================================

function LabeledInput({
  label, value, onChange, type = "text", step,
}: {
  label: string; value: any; onChange: (v: any) => void; type?: string; step?: string;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
      {label}
      <input
        className="input-field"
        type={type}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? e.target.value : e.target.value)}
        style={{ display: "block", width: "100%", marginTop: 3 }}
      />
    </label>
  );
}

function LabeledTextarea({
  label, value, onChange,
}: {
  label: string; value: any; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
      {label}
      <textarea
        className="input-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        style={{ display: "block", width: "100%", marginTop: 3, resize: "vertical", fontFamily: "inherit" }}
      />
    </label>
  );
}
