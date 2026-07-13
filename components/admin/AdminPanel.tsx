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

const supabase = createClient();

type AdminPanelProps = {
  profile: { is_admin?: boolean } | null;
};

const EMOTIONS = ["confident", "angry", "shocked", "neutral", "defeated"];

export function AdminPanel({ profile }: AdminPanelProps) {
  const [tab, setTab] = useState<"debots" | "topics" | "settings">("debots");

  // Fail closed: no profile, or not an admin -> render nothing at all.
  if (!profile?.is_admin) return null;

  return (
    <div className="card" style={{ padding: 16, marginTop: 24, borderColor: "var(--amber)" }}>
      <div style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        ⚙ Admin
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["debots", "topics", "settings"] as const).map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "debots" && <DebotsAdmin />}
      {tab === "topics" && <TopicsAdmin />}
      {tab === "settings" && <SettingsAdmin />}
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
  vertices: 6,
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
  const [debots, setDebots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // null = not editing, object = form data
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState<string | null>(null); // which slot is mid-upload

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
    setEditing({ ...d, sprite_emotions: d.sprite_emotions || {} });
  }

  function startNew() {
    setConfirmingDeleteId(null);
    setEditing({ ...BLANK_DEBOT });
  }

  function cancelEdit() {
    setEditing(null);
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
      vertices: Math.max(0, Math.min(10, Number(editing.vertices) || 0)),
      multiplier: Number(editing.multiplier) || 1,
      cost: Number(editing.cost) || 0,
      max_hp: Number(editing.max_hp) || 100,
      color: editing.color,
      diff: editing.diff,
      dc: editing.dc,
      reward: Number(editing.reward) || 0,
    };

    const res = editing.id
      ? await supabase.from("debots").update(payload).eq("id", editing.id)
      : await supabase.from("debots").insert(payload).select().single();

    if (res.error) {
      setStatus(`Failed: ${res.error.message}`);
      return;
    }

    setStatus(editing.id ? "Debot updated." : "Debot created — you can now upload sprites for it.");
    // If we just created a new debot, stay in the edit form (now with a real
    // id) instead of bouncing back to the list, so sprite upload is usable
    // immediately without having to re-open the edit screen.
    if (!editing.id && res.data) {
      setEditing({ ...res.data, sprite_emotions: res.data.sprite_emotions || {} });
    } else {
      setEditing(null);
    }
    load();
  }

  async function confirmDelete(id: any) {
    setStatus("Deleting…");
    const { error } = await supabase.from("debots").delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (error) setStatus(`Failed to delete: ${error.message}`);
    else {
      setStatus("Debot deleted.");
      load();
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
        const { error: dbErr } = await supabase.from("debots").update({ sprite_url: url }).eq("id", editing.id);
        if (dbErr) throw dbErr;
        setEditing((prev: any) => ({ ...prev, sprite_url: url }));
      } else {
        const nextEmotions = { ...(editing.sprite_emotions || {}), [slot]: url };
        const { error: dbErr } = await supabase.from("debots").update({ sprite_emotions: nextEmotions }).eq("id", editing.id);
        if (dbErr) throw dbErr;
        setEditing((prev: any) => ({ ...prev, sprite_emotions: nextEmotions }));
      }

      setStatus("Sprite uploaded.");
      load();
    } catch (err: any) {
      console.error(err);
      setStatus(`Upload failed: ${err.message || err}`);
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
          <LabeledInput label="Vertices (0=circle, up to 10)" value={editing.vertices} onChange={(v) => updateField("vertices", v)} type="number" />
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
            />
            {EMOTIONS.map((em) => (
              <SpriteSlot
                key={em}
                label={em}
                url={editing.sprite_emotions?.[em]}
                disabled={!editing.id}
                uploading={uploading === em}
                onFile={(f) => uploadSprite(f, em)}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
            Any emotion without its own sprite falls back to the base sprite, and falls back to a plain colored placeholder if no sprite exists at all.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Done</button>
        </div>
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
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.diff} · ❋{d.cost} · ×{d.multiplier} · {d.vertices ?? 6}v</div>
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
  label, url, disabled, uploading, onFile,
}: {
  label: string; url?: string | null; disabled?: boolean; uploading?: boolean; onFile: (f: File) => void;
}) {
  return (
    <label style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      width: 64, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>
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
      <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "capitalize", textAlign: "center" }}>{label}</span>
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
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState<number | "">("");
  const [temperature, setTemperature] = useState<number | "">("");
  const [roundsOptionsText, setRoundsOptionsText] = useState("");
  const [roundsDefault, setRoundsDefault] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["ai_model", "ai_max_tokens", "ai_temperature", "rounds_options", "rounds_default"]);

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
    setRoundsOptionsText(Array.isArray(map.rounds_options) ? map.rounds_options.join(", ") : "");
    setRoundsDefault(typeof map.rounds_default === "number" ? map.rounds_default : "");
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

    const rows = [
      { key: "ai_model", value: model },
      { key: "ai_max_tokens", value: Number(maxTokens) || 1000 },
      { key: "ai_temperature", value: Number(temperature) },
      { key: "rounds_options", value: parsedOptions },
      { key: "rounds_default", value: Number(roundsDefault) || parsedOptions[0] },
    ];
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setStatus(error ? `Failed: ${error.message}` : "Settings saved.");
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Number of Rounds
      </div>
      <LabeledInput label="Round options (comma-separated)" value={roundsOptionsText} onChange={setRoundsOptionsText} />
      <div style={{ marginTop: 8 }}>
        <LabeledInput label="Default rounds" value={roundsDefault} onChange={(v) => setRoundsDefault(v === "" ? "" : Number(v))} type="number" />
      </div>

      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 18, marginBottom: 8 }}>
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
