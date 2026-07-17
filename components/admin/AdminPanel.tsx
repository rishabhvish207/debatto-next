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

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useGame } from "@/contexts/GameContext";
import { callAI } from "@/lib/ai";
import { DEFAULT_THEMES, FONT_PRESETS } from "@/config/Themes";

const supabase = createClient();

type AdminPanelProps = {
  profile: { is_admin?: boolean } | null;
};

const EMOTIONS = ["confident", "angry", "shocked", "neutral", "defeated"];

function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

// Persists the new order as consecutive sort_order values (0, 1, 2, ...)
// matching each row's index in the reordered array.
async function persistSortOrder(table: "debots" | "topics" | "store_items" | "store_themes", orderedIds: any[]) {
  await Promise.all(
    orderedIds.map((id, idx) => supabase.from(table).update({ sort_order: idx }).eq("id", id))
  );
}

// The `debots` table's `id` column (unlike store_items/store_themes) has no
// auto-generating default in the DB — it's a plain not-null integer column,
// so every insert has to supply one itself or Postgres rejects it. This
// computes "one past the current highest id" client-side so creating a
// debot from the admin panel works without a schema migration. If you'd
// rather fix this at the DB level instead, see the README's "Fixing the
// debots.id default" note for the SQL to add a proper identity default.
async function withNextDebotId(payload: Record<string, any>) {
  const { data } = await supabase.from("debots").select("id").order("id", { ascending: false }).limit(1);
  const nextId = (data && data[0]?.id ? Number(data[0].id) : 0) + 1;
  return { ...payload, id: nextId };
}

// Hold-and-drag reordering via Pointer Events rather than native HTML5
// drag-and-drop — native DnD doesn't fire reliably from touch/hold gestures
// on phones, and this admin panel is used from mobile as much as desktop.
// The dragged row floats and follows the finger/cursor (via transform, so no
// layout reflow happens mid-drag); the actual array reorder is computed and
// committed once, on release, against the other rows' static positions.
function useDragReorder(onCommit: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const startY = useRef(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  function setRowRef(i: number) {
    return (el: HTMLDivElement | null) => { rowRefs.current[i] = el; };
  }

  function onPointerDown(i: number, e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragIndex(i);
    setHoverIndex(i);
    startY.current = e.clientY;
    setDragDy(0);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return;
    setDragDy(e.clientY - startY.current);
    let best = dragIndex, bestDist = Infinity;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(e.clientY - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setHoverIndex(best);
  }

  function onPointerUp() {
    if (dragIndex !== null && hoverIndex !== null && hoverIndex !== dragIndex) {
      onCommit(dragIndex, hoverIndex);
    }
    setDragIndex(null);
    setHoverIndex(null);
    setDragDy(0);
  }

  function rowStyle(i: number): React.CSSProperties {
    if (dragIndex === i) {
      return { position: "relative", zIndex: 5, transform: `translateY(${dragDy}px)`, boxShadow: "0 6px 18px rgba(0,0,0,.45)", cursor: "grabbing" };
    }
    if (hoverIndex === i && dragIndex !== null) {
      return { borderTop: "2px solid var(--blue)" };
    }
    return {};
  }

  const handleProps = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => onPointerDown(i, e),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: { cursor: "grab", touchAction: "none", padding: "2px 6px", color: "var(--muted)", fontSize: 16, lineHeight: 1, userSelect: "none" as const },
  });

  return { setRowRef, rowStyle, handleProps, dragging: dragIndex !== null };
}

export function AdminPanel({ profile }: AdminPanelProps) {
  const [tab, setTab] = useState<"debots" | "topics" | "store" | "settings" | "ai">("debots");

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
          ["store", "Store"],
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
      {tab === "store" && <StoreAdmin />}
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
    const { data, error } = await supabase.from("debots").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setDebots(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function commitReorder(from: number, to: number) {
    const newList = reorderArray(debots, from, to);
    setDebots(newList);
    await persistSortOrder("debots", newList.map((d) => d.id));
  }
  const reorder = useDragReorder(commitReorder);

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
      : await supabase.from("debots").insert(await withNextDebotId(payload)).select().single();

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
          {debots.map((d, i) => (
            <div key={d.id} ref={reorder.setRowRef(i)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "var(--faint)", ...reorder.rowStyle(i) }}>
              <span {...reorder.handleProps(i)}>⠿</span>
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
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: false });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setTopics(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function commitReorder(from: number, to: number) {
    const newList = reorderArray(topics, from, to);
    setTopics(newList);
    await persistSortOrder("topics", newList.map((t) => t.id));
  }
  const reorder = useDragReorder(commitReorder);

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
          {topics.map((t, i) => (
            <div key={t.id} ref={reorder.setRowRef(i)} style={{ padding: "8px 10px", borderRadius: 6, background: "var(--faint)", ...reorder.rowStyle(i) }}>
              {editingId === t.id ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="input-field" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ flex: "1 1 200px" }} />
                  <input className="input-field" value={editCat} onChange={(e) => setEditCat(e.target.value)} style={{ flex: "0 1 140px" }} />
                  <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span {...reorder.handleProps(i)}>⠿</span>
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
// STORE — two subtabs: Items (the consumable/gear catalog bought with
// debucks) and Themes (whole-app color/font/background looks). Both are
// full CRUD, live in their own tables (store_items, store_themes), and both
// call refetchStoreItems()/refetchThemes() after any write so the live
// Store page and the equipped theme update immediately without a reload.
// ===========================================================================

function StoreAdmin() {
  const [sub, setSub] = useState<"items" | "themes">("items");
  return (
    <div>
      <div style={{ display: "inline-flex", gap: 4, background: "var(--faint)", borderRadius: 999, padding: 3, marginBottom: 14 }}>
        {(["items", "themes"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            style={{
              border: "none", cursor: "pointer", borderRadius: 999,
              padding: "5px 14px", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
              background: sub === s ? "var(--surface2)" : "transparent",
              color: sub === s ? "var(--text)" : "var(--muted)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {sub === "items" ? <ItemsAdmin /> : <ThemesAdmin />}
    </div>
  );
}

const BLANK_ITEM = {
  id: null as any,
  key: "",
  category: "consumable" as "consumable" | "gear",
  name: "",
  icon: "🎁",
  description: "",
  pricing_type: "flat" as "flat" | "scaling",
  base_cost: 0,
  price_multiplier: 2,
  max_stock: 5 as number | null,
  heal_amount: 0,
  active: true,
};

function ItemsAdmin() {
  const { refetchStoreItems } = useGame();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("store_items").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setItems(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function commitReorder(from: number, to: number) {
    const newList = reorderArray(items, from, to);
    setItems(newList);
    await persistSortOrder("store_items", newList.map((i) => i.id));
    refetchStoreItems();
  }
  const reorder = useDragReorder(commitReorder);

  function startEdit(i: any) { setConfirmingDeleteId(null); setEditing({ ...i }); }
  function startNew() { setConfirmingDeleteId(null); setEditing({ ...BLANK_ITEM }); }
  function cancelEdit() { setEditing(null); }
  function updateField(key: string, value: any) { setEditing((prev: any) => ({ ...prev, [key]: value })); }

  async function save() {
    if (!editing?.key?.trim() || !editing?.name?.trim()) {
      setStatus("Key and name are both required.");
      return;
    }
    setStatus("Saving…");
    const payload = {
      key: editing.key.trim(),
      category: editing.category,
      name: editing.name.trim(),
      icon: editing.icon?.trim() || "🎁",
      description: editing.description || "",
      pricing_type: editing.pricing_type,
      base_cost: Number(editing.base_cost) || 0,
      price_multiplier: editing.pricing_type === "scaling" ? (Number(editing.price_multiplier) || 2) : 1,
      max_stock: editing.category === "consumable"
        ? (editing.max_stock === "" || editing.max_stock == null ? null : Number(editing.max_stock))
        : null,
      heal_amount: Number(editing.heal_amount) || 0,
      active: !!editing.active,
    };
    const res = editing.id
      ? await supabase.from("store_items").update(payload).eq("id", editing.id).select()
      : await supabase.from("store_items").insert({ ...payload, sort_order: items.length }).select().single();

    if (res.error) { setStatus(`Failed: ${res.error.message}`); return; }
    setStatus(editing.id ? "Item updated." : "Item created.");
    setEditing(null);
    load();
    refetchStoreItems();
  }

  async function confirmDelete(id: any) {
    setStatus("Deleting…");
    const { error } = await supabase.from("store_items").delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (error) setStatus(`Failed to delete: ${error.message}`);
    else { setStatus("Item deleted."); load(); refetchStoreItems(); }
  }

  if (editing) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {editing.id ? `Edit: ${editing.name || "Item"}` : "New Item"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
          <LabeledInput
            label="Key" value={editing.key} onChange={(v) => updateField("key", v)}
            disabled={!!editing.id}
          />
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>Category</label>
            <select className="input-field" value={editing.category} onChange={(e) => updateField("category", e.target.value)} style={{ width: "100%" }}>
              <option value="consumable">Consumable</option>
              <option value="gear">Gear</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
          <code>insight_lens</code>, <code>ace_card</code>, and <code>confidence_pill</code> are the three keys the in-match code actually
          checks — use one of these exactly to restore that item's original behavior, or delete/edit its name, icon, description, and
          price freely without breaking anything. Any other key is shown in the Store but has no effect in a match until a developer
          wires it up.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <LabeledInput label="Name" value={editing.name} onChange={(v) => updateField("name", v)} />
          <LabeledInput label="Icon (emoji)" value={editing.icon} onChange={(v) => updateField("icon", v)} />
        </div>
        <LabeledTextarea label="Description" value={editing.description} onChange={(v) => updateField("description", v)} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>Pricing</label>
            <select className="input-field" value={editing.pricing_type} onChange={(e) => updateField("pricing_type", e.target.value)} style={{ width: "100%" }}>
              <option value="flat">Flat — same price every time</option>
              <option value="scaling">Scaling — price grows with stock held</option>
            </select>
          </div>
          <LabeledInput label="Base cost (❋)" value={editing.base_cost} onChange={(v) => updateField("base_cost", v)} type="number" />
          {editing.pricing_type === "scaling" && (
            <LabeledInput
              label="Price multiplier (× per held)" value={editing.price_multiplier}
              onChange={(v) => updateField("price_multiplier", v)} type="number" step="0.1"
            />
          )}
          {editing.category === "consumable" && (
            <LabeledInput
              label="Max stock (blank = unlimited)" value={editing.max_stock ?? ""}
              onChange={(v) => updateField("max_stock", v)} type="number"
            />
          )}
          {editing.category === "consumable" && (
            <LabeledInput
              label="Heal amount (HP, 0 = no heal effect)" value={editing.heal_amount ?? 0}
              onChange={(v) => updateField("heal_amount", v)} type="number"
            />
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: "var(--text)" }}>
          <input type="checkbox" checked={!!editing.active} onChange={(e) => updateField("active", e.target.checked)} />
          Active — visible in the Store
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{items.length} items</span>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ New Item</button>
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
          {items.map((it, i) => (
            <div key={it.id} ref={reorder.setRowRef(i)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "var(--faint)", opacity: it.active === false ? 0.5 : 1, ...reorder.rowStyle(i) }}>
              <span {...reorder.handleProps(i)}>⠿</span>
              <span style={{ fontSize: 18 }}>{it.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  <code>{it.key}</code> · {it.category} · ❋{it.base_cost}{it.pricing_type === "scaling" ? ` ×${it.price_multiplier}^held` : ""}
                  {it.heal_amount ? ` · heals +${it.heal_amount} HP` : ""}
                  {it.active === false && " · inactive"}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(it)}>Edit</button>
              {confirmingDeleteId === it.id ? (
                <>
                  <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(it.id)}>Confirm</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDeleteId(it.id)}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
      {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
    </div>
  );
}

const THEME_COLOR_FIELDS: { key: keyof import("@/config/Themes").ThemeColors; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "surface2", label: "Surface 2" },
  { key: "border", label: "Border" },
  { key: "border2", label: "Border 2" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "faint", label: "Faint fill" },
  { key: "blue", label: "Accent (blue)" },
  { key: "blueSoft", label: "Accent soft" },
  { key: "red", label: "Red" },
  { key: "redSoft", label: "Red soft" },
  { key: "amber", label: "Amber" },
  { key: "amberSoft", label: "Amber soft" },
  { key: "green", label: "Green" },
  { key: "greenSoft", label: "Green soft" },
  { key: "purple", label: "Purple" },
  { key: "teal", label: "Teal" },
];

function blankTheme() {
  return {
    id: null as any,
    name: "",
    description: "",
    cost: 0,
    is_default: false,
    active: true,
    colors: { ...DEFAULT_THEMES[0].colors },
    font_heading: FONT_PRESETS.heading[0].family,
    font_body: FONT_PRESETS.body[0].family,
    google_font_url: FONT_PRESETS.heading[0].googleFontUrl as string | null,
    background_image_url: null as string | null,
    background_opacity: 0.16,
  };
}

function ThemesAdmin() {
  const { refetchThemes } = useGame();
  const [themeRows, setThemeRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("store_themes").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    if (error) setStatus(`Failed to load: ${error.message}`);
    else setThemeRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function commitReorder(from: number, to: number) {
    const newList = reorderArray(themeRows, from, to);
    setThemeRows(newList);
    await persistSortOrder("store_themes", newList.map((t) => t.id));
    refetchThemes();
  }
  const reorder = useDragReorder(commitReorder);

  function startEdit(t: any) { setConfirmingDeleteId(null); setEditing({ ...t, colors: { ...t.colors } }); }
  function startNew() { setConfirmingDeleteId(null); setEditing(blankTheme()); }
  function cancelEdit() { setEditing(null); }
  function updateField(key: string, value: any) { setEditing((prev: any) => ({ ...prev, [key]: value })); }
  function updateColor(key: string, value: string) { setEditing((prev: any) => ({ ...prev, colors: { ...prev.colors, [key]: value } })); }

  async function save() {
    if (!editing?.name?.trim()) { setStatus("Name is required."); return; }
    setStatus("Saving…");
    const payload = {
      name: editing.name.trim(),
      description: editing.description || "",
      cost: Number(editing.cost) || 0,
      is_default: !!editing.is_default,
      active: !!editing.active,
      colors: editing.colors,
      font_heading: editing.font_heading,
      font_body: editing.font_body,
      google_font_url: editing.google_font_url || null,
      background_image_url: editing.background_image_url || null,
      background_opacity: Math.max(0, Math.min(1, Number(editing.background_opacity))) || 0,
    };

    // Only one theme can be the default look everyone starts with.
    if (payload.is_default) {
      await supabase.from("store_themes").update({ is_default: false }).neq("id", editing.id ?? -1);
    }

    const res = editing.id
      ? await supabase.from("store_themes").update(payload).eq("id", editing.id).select()
      : await supabase.from("store_themes").insert({ ...payload, sort_order: themeRows.length }).select().single();

    if (res.error) { setStatus(`Failed: ${res.error.message}`); return; }
    setStatus(editing.id ? "Theme updated." : "Theme created — you can now upload a background image for it.");
    if (!editing.id && res.data) {
      setEditing({ ...res.data, colors: { ...res.data.colors } });
    } else {
      setEditing(null);
    }
    load();
    refetchThemes();
  }

  async function confirmDelete(id: any) {
    setStatus("Deleting…");
    const { error } = await supabase.from("store_themes").delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (error) setStatus(`Failed to delete: ${error.message}`);
    else { setStatus("Theme deleted."); load(); refetchThemes(); }
  }

  async function uploadBg(file: File) {
    if (!editing?.id) return;
    setUploading(true);
    setStatus("Uploading…");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `theme-bg-${editing.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("site-assets").getPublicUrl(path);
      const url = pub.publicUrl;
      const { data: dbData, error: dbErr } = await supabase.from("store_themes").update({ background_image_url: url }).eq("id", editing.id).select();
      if (dbErr) throw dbErr;
      if (!dbData || dbData.length === 0) throw new Error("Update didn't apply — check the 'store_themes' table UPDATE policy allows this admin account.");
      setEditing((prev: any) => ({ ...prev, background_image_url: url }));
      setStatus("Background image updated.");
      load();
      refetchThemes();
    } catch (err: any) {
      setStatus(`Upload failed: ${err.message || err}`);
    }
    setUploading(false);
  }

  async function removeBg() {
    if (!editing?.id) return;
    setUploading(true);
    const { error } = await supabase.from("store_themes").update({ background_image_url: null }).eq("id", editing.id);
    if (error) setStatus(`Remove failed: ${error.message}`);
    else {
      setEditing((prev: any) => ({ ...prev, background_image_url: null }));
      setStatus("Background image removed.");
      load();
      refetchThemes();
    }
    setUploading(false);
  }

  if (editing) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {editing.id ? `Edit: ${editing.name || "Theme"}` : "New Theme"}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <LabeledInput label="Name" value={editing.name} onChange={(v) => updateField("name", v)} />
          <LabeledInput label="Cost (❋, 0 = free)" value={editing.cost} onChange={(v) => updateField("cost", v)} type="number" />
        </div>
        <LabeledTextarea label="Description" value={editing.description} onChange={(v) => updateField("description", v)} />

        <div style={{ display: "flex", gap: 16, margin: "10px 0 14px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={!!editing.active} onChange={(e) => updateField("active", e.target.checked)} />
            Active — visible in the Store
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={!!editing.is_default} onChange={(e) => updateField("is_default", e.target.checked)} />
            Default look (free, applied when nothing's equipped)
          </label>
        </div>

        {/* Live preview — a tiny mock screen rendered in this theme's own
            colors/fonts, updates as fields change. */}
        <div style={{
          padding: 16, borderRadius: 10, marginBottom: 14,
          background: editing.colors.bg, border: `1px solid ${editing.colors.border}`,
          ...(editing.background_image_url ? { backgroundImage: `url(${editing.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
        }}>
          <div style={{ fontFamily: editing.font_heading, color: editing.colors.text, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Debatto</div>
          <div style={{ fontFamily: editing.font_body, color: editing.colors.muted, fontSize: 12, marginBottom: 10 }}>Preview of this theme's look.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: editing.colors.blueSoft, color: editing.colors.blue }}>Accent badge</span>
            <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: editing.colors.surface2, color: editing.colors.text, border: `1px solid ${editing.colors.border2}` }}>Surface</span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Colors</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {THEME_COLOR_FIELDS.map((f) => (
            <LabeledInput key={f.key} label={f.label} value={editing.colors[f.key]} onChange={(v) => updateColor(f.key, v)} />
          ))}
        </div>

        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Fonts</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>Heading font preset</label>
            <select
              className="input-field" style={{ width: "100%" }}
              value={FONT_PRESETS.heading.find((p) => p.family === editing.font_heading)?.family || ""}
              onChange={(e) => {
                const preset = FONT_PRESETS.heading.find((p) => p.family === e.target.value);
                if (preset) { updateField("font_heading", preset.family); updateField("google_font_url", preset.googleFontUrl); }
              }}
            >
              <option value="" disabled>Custom (edit below)</option>
              {FONT_PRESETS.heading.map((p) => <option key={p.family} value={p.family}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>Body font preset</label>
            <select
              className="input-field" style={{ width: "100%" }}
              value={FONT_PRESETS.body.find((p) => p.family === editing.font_body)?.family || ""}
              onChange={(e) => {
                const preset = FONT_PRESETS.body.find((p) => p.family === e.target.value);
                if (preset) updateField("font_body", preset.family);
              }}
            >
              <option value="" disabled>Custom (edit below)</option>
              {FONT_PRESETS.body.map((p) => <option key={p.family} value={p.family}>{p.label}</option>)}
            </select>
          </div>
          <LabeledInput label="Heading font-family (CSS)" value={editing.font_heading} onChange={(v) => updateField("font_heading", v)} />
          <LabeledInput label="Body font-family (CSS)" value={editing.font_body} onChange={(v) => updateField("font_body", v)} />
        </div>
        <LabeledInput label="Google Font URL (optional — leave blank for system fonts)" value={editing.google_font_url || ""} onChange={(v) => updateField("google_font_url", v)} />

        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "14px 0 8px" }}>Background</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
          If a theme has a background image, it takes priority over the site-wide background set in Admin → Settings for anyone with this theme equipped.
        </div>
        <SpriteSlot
          label="Background" url={editing.background_image_url} disabled={!editing.id} uploading={uploading}
          onFile={uploadBg} onRemove={editing.background_image_url ? removeBg : undefined}
        />
        {!editing.id && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>Save this theme first, then upload a background image.</div>}

        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
            Background opacity ({Math.round(editing.background_opacity * 100)}%)
            <input
              type="range" min={0} max={1} step={0.01} value={editing.background_opacity}
              onChange={(e) => updateField("background_opacity", Number(e.target.value))}
              style={{ display: "block", width: "100%", marginTop: 6, accentColor: "var(--blue)" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Exit</button>
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{status}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{themeRows.length} themes</span>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ New Theme</button>
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
          {themeRows.map((t, i) => (
            <div key={t.id} ref={reorder.setRowRef(i)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "var(--faint)", opacity: t.active === false ? 0.5 : 1, ...reorder.rowStyle(i) }}>
              <span {...reorder.handleProps(i)}>⠿</span>
              <span style={{ width: 20, height: 20, borderRadius: 5, background: t.colors?.bg, border: `1px solid ${t.colors?.border}`, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name} {t.is_default && <span style={{ fontWeight: 400, color: "var(--muted)" }}>· default</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>❋{t.cost}{t.active === false && " · inactive"}</div>
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
  const [landingBgUrl, setLandingBgUrl] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.16);
  const [bgApplyEverywhere, setBgApplyEverywhere] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const DEFAULT_SUBTEXT = "It's not about being right.\nIt's about being logical.";
  const [landingSubtext, setLandingSubtext] = useState(DEFAULT_SUBTEXT);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["rounds_options", "rounds_default", "debot_vertices", "debucks_cheat_enabled", "landing_bg_url", "landing_bg_opacity", "bg_apply_everywhere", "landing_subtext"]);

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
    setLandingBgUrl(typeof map.landing_bg_url === "string" ? map.landing_bg_url : null);
    setBgOpacity(typeof map.landing_bg_opacity === "number" ? map.landing_bg_opacity : 0.16);
    setBgApplyEverywhere(map.bg_apply_everywhere === true);
    setLandingSubtext(typeof map.landing_subtext === "string" && map.landing_subtext.trim() ? map.landing_subtext : DEFAULT_SUBTEXT);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function uploadLandingBg(file: File) {
    setBgUploading(true);
    setStatus("Uploading…");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `landing-bg-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("site-assets").getPublicUrl(path);
      const url = pub.publicUrl;

      const { data: upsertData, error: dbErr } = await supabase
        .from("app_settings")
        .upsert([{ key: "landing_bg_url", value: url }], { onConflict: "key" })
        .select();
      if (dbErr) throw dbErr;
      if (!upsertData || upsertData.length === 0) {
        throw new Error("Update didn't apply — check the 'app_settings' table's write policy allows this admin account.");
      }
      setLandingBgUrl(url);
      setStatus("Background image updated.");
    } catch (err: any) {
      setStatus(`Upload failed: ${err.message || err}`);
    } finally {
      setBgUploading(false);
    }
  }

  async function saveBgOpacity(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    try {
      const { error: dbErr } = await supabase
        .from("app_settings")
        .upsert([{ key: "landing_bg_opacity", value: clamped }], { onConflict: "key" })
        .select();
      if (dbErr) throw dbErr;
      setStatus("Background opacity updated.");
    } catch (err: any) {
      setStatus(`Opacity save failed: ${err.message || err}`);
    }
  }

  async function removeLandingBg() {
    setBgUploading(true);
    setStatus("Removing…");
    try {
      const { data: upsertData, error: dbErr } = await supabase
        .from("app_settings")
        .upsert([{ key: "landing_bg_url", value: null }], { onConflict: "key" })
        .select();
      if (dbErr) throw dbErr;
      if (!upsertData || upsertData.length === 0) {
        throw new Error("Update didn't apply — check the 'app_settings' table's write policy allows this admin account.");
      }
      setLandingBgUrl(null);
      setStatus("Background image removed.");
    } catch (err: any) {
      setStatus(`Remove failed: ${err.message || err}`);
    } finally {
      setBgUploading(false);
    }
  }

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
      { key: "bg_apply_everywhere", value: bgApplyEverywhere },
      { key: "landing_subtext", value: landingSubtext.trim() ? landingSubtext : DEFAULT_SUBTEXT },
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

      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 24, marginBottom: 8 }}>
        Landing Page Background
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Shown faintly behind the logo on the very first screen, before Enter. Uploads and applies immediately — no need to hit Save settings. Leave empty for a plain background.
      </div>
      <SpriteSlot
        label="Background"
        url={landingBgUrl}
        disabled={false}
        uploading={bgUploading}
        onFile={(f) => uploadLandingBg(f)}
        onRemove={landingBgUrl ? () => removeLandingBg() : undefined}
      />
      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
          Background opacity ({Math.round(bgOpacity * 100)}%)
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={bgOpacity}
            onChange={(e) => setBgOpacity(Number(e.target.value))}
            onMouseUp={(e) => saveBgOpacity(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => saveBgOpacity(Number((e.target as HTMLInputElement).value))}
            style={{ display: "block", width: "100%", marginTop: 6, accentColor: "var(--blue)" }}
          />
        </label>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Applies immediately when you release the slider — no need to hit Save settings.
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={bgApplyEverywhere} onChange={(e) => setBgApplyEverywhere(e.target.checked)} style={{ accentColor: "var(--blue)" }} />
          Also use this background on every other page, not just landing
        </label>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          Uses the same image and opacity set above. This one's saved together with the rest of this form via "Save settings" below.
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 24, marginBottom: 8 }}>
        Landing Page Subtext
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
        The line under the Debatto logo. Use a line break for a second line — the last word of the last line is bolded automatically, same as the original.
      </div>
      <textarea
        className="textarea"
        rows={2}
        value={landingSubtext}
        onChange={(e) => setLandingSubtext(e.target.value)}
        placeholder={DEFAULT_SUBTEXT}
        style={{ width: "100%" }}
      />
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        Saved together with the rest of this form via "Save settings" below.
      </div>

      <button className="btn btn-primary btn-sm" style={{ marginTop: 20 }} onClick={save}>Save settings</button>
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
  label, value, onChange, type = "text", step, disabled,
}: {
  label: string; value: any; onChange: (v: any) => void; type?: string; step?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
      {label}
      <input
        className="input-field"
        type={type}
        step={step}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? e.target.value : e.target.value)}
        style={{ display: "block", width: "100%", marginTop: 3, opacity: disabled ? 0.5 : 1 }}
      />
    </label>
  );
}

function LabeledTextarea({
  label, value, onChange,
}: {
  label: string; value: any; onChange: (v: string) => void;
}) {
  const [cleaning, setCleaning] = useState(false);
  const [err, setErr] = useState("");

  async function handleCleanup() {
    const text = (value ?? "").trim();
    if (!text || cleaning) return;
    setCleaning(true);
    setErr("");
    try {
      const sys = `You fix grammar, spelling, and sentence structure in short character-description text for a debate game's admin panel. Rules:
- Preserve the original meaning, tone, facts, and voice exactly — this describes a specific debot character.
- Only fix grammar, spelling, punctuation, and awkward/broken sentence structure.
- Do not add new facts, embellish, change the personality being described, or make it longer than necessary.
- Do not wrap the output in quotes or markdown. Return ONLY the corrected text, nothing else — no preamble, no explanation.`;
      const result = await callAI(sys, text);
      const cleaned = result.trim().replace(/^["']|["']$/g, "");
      if (cleaned) onChange(cleaned);
    } catch (e: any) {
      setErr(e?.message || "Cleanup failed");
    }
    setCleaning(false);
  }

  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <button
          type="button"
          onClick={handleCleanup}
          disabled={cleaning || !(value ?? "").trim()}
          style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 5,
            border: "1px solid var(--border)", background: "var(--surface2)",
            color: cleaning ? "var(--muted)" : "var(--blue)",
            cursor: cleaning ? "default" : "pointer", opacity: !(value ?? "").trim() ? 0.5 : 1,
          }}
        >
          {cleaning ? "Cleaning…" : "✨ Clean up"}
        </button>
      </div>
      <textarea
        className="input-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        style={{ display: "block", width: "100%", marginTop: 3, resize: "vertical", fontFamily: "inherit" }}
      />
      {err && <div style={{ color: "var(--red)", fontSize: 10, marginTop: 2 }}>{err}</div>}
    </label>
  );
}
