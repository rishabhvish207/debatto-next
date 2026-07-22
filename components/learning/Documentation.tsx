"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Markdown } from "@/components/ui/Markdown";
import { highlightMatches, clearHighlights, setActiveMatch } from "@/lib/textHighlight";
import { Search, X } from "lucide-react";
import { DEFAULT_DOCUMENTATION_MD } from "@/config/LearningDefaults";

const supabase = createClient();

// Height reserved in the normal document flow for the search row — the
// compact icon button when idle, or the spacer left behind while the
// expanded bar is floating (position: fixed) above the content.
const BAR_SLOT_HEIGHT = 40;

export function Documentation() {
  const [content, setContent] = useState(DEFAULT_DOCUMENTATION_MD);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Expanded/floating while there's something to search for (focused or
  // has text); collapses back to a plain icon button once both are false.
  const searchActive = focused || query.length > 0;

  // Floats just under the fixed app top bar rather than a hardcoded value,
  // so it still lines up if the top bar's height ever changes.
  const [topOffset, setTopOffset] = useState(52);
  useEffect(() => {
    const topbar = document.querySelector(".app-topbar");
    if (topbar) setTopOffset(topbar.getBoundingClientRect().height);
  }, []);

  // Autofocus the input the moment it expands (e.g. after tapping the
  // collapsed search icon), once it's actually mounted.
  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("learning_content").select("body").eq("key", "documentation").maybeSingle();
        if (data?.body) setContent(data.body);
      } catch {
        // keep the default content
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Highlighting is a DOM pass over whatever react-markdown actually
  // rendered, not part of the markdown parsing itself — see
  // lib/textHighlight.ts for why. Rebuilt from scratch and re-marked as
  // "active" in the SAME effect (rather than splitting highlight-building
  // and active-marking across two effects) so the two can never drift
  // apart — e.g. a button changing activeHit always has fresh marks to
  // point at, instead of relying on marks a previous pass left behind.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!query.trim()) {
      clearHighlights(containerRef.current);
      setHitCount(0);
      if (activeHit !== 0) setActiveHit(0);
      return;
    }
    const count = highlightMatches(containerRef.current, query);
    setHitCount(count);
    const clamped = count > 0 ? Math.min(activeHit, count - 1) : 0;
    if (clamped !== activeHit) { setActiveHit(clamped); return; } // re-run with the clamped value
    const el = setActiveMatch(containerRef.current, clamped);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [query, content, activeHit]);

  function nextHit() { if (hitCount) setActiveHit((activeHit + 1) % hitCount); }
  function prevHit() { if (hitCount) setActiveHit((activeHit - 1 + hitCount) % hitCount); }
  function clearSearch() {
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div>
      {/* This spacer always reserves the same slot in the flow — the row
          switches to position:fixed on top of it when expanded, so the
          content below never jumps when search is toggled on/off. */}
      <div style={{ height: BAR_SLOT_HEIGHT, marginBottom: 18, position: "relative" }}>
        {!searchActive ? (
          <button
            type="button"
            onClick={() => setFocused(true)}
            className="btn btn-ghost btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Search size={14} /> Search this page
          </button>
        ) : (
          <div
            style={{
              position: "fixed", top: topOffset, left: 0, right: 0, zIndex: 30,
              background: "var(--bg)", borderBottom: "1px solid var(--border)",
              boxShadow: "0 8px 16px -8px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                display: "flex", gap: 8, alignItems: "center",
                maxWidth: 720, margin: "0 auto", padding: "10px 16px",
              }}
            >
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}><Search size={14} /></span>
                <input
                  ref={inputRef}
                  className="input-field"
                  placeholder="Search this page…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextHit(); } }}
                  style={{ width: "100%", paddingLeft: 34, paddingRight: query ? 34 : 14 }}
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={clearSearch}
                    style={{
                      position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", color: "var(--muted)", cursor: "pointer",
                      display: "flex", padding: 4,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {query.trim() && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {hitCount > 0 ? `${activeHit + 1}/${hitCount}` : "0"}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={prevHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>‹</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={nextHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>›</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <div ref={containerRef} className="card" style={{ padding: 20 }}>
          <Markdown text={content} />
        </div>
      )}
    </div>
  );
}
