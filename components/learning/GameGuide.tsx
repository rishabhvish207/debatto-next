"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Markdown } from "@/components/ui/Markdown";
import { highlightMatches, clearHighlights, setActiveMatch } from "@/lib/textHighlight";
import { Search, X } from "lucide-react";
import { DEFAULT_GAME_GUIDE_MD } from "@/config/LearningDefaults";

const supabase = createClient();

// Height reserved in the normal document flow for the search bar row.
// Kept constant whether the bar is floating or not, so switching between
// the two never shifts the content below it.
const BAR_SLOT_HEIGHT = 56;

export function GameGuide() {
  const [content, setContent] = useState(DEFAULT_GAME_GUIDE_MD);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Floating while there's something to search for (focused or has text),
  // back to its normal spot in the layout the moment both are false.
  const searchActive = focused || query.length > 0;

  // Floats just under the fixed app top bar rather than a hardcoded value,
  // so it still lines up if the top bar's height ever changes.
  const [topOffset, setTopOffset] = useState(52);
  useEffect(() => {
    const topbar = document.querySelector(".app-topbar");
    if (topbar) setTopOffset(topbar.getBoundingClientRect().height);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("learning_content").select("body").eq("key", "game_guide").maybeSingle();
        if (data?.body) setContent(data.body);
      } catch {
        // keep the default content
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!containerRef.current) { return; }
    if (!query.trim()) { clearHighlights(containerRef.current); setHitCount(0); setActiveHit(0); return; }
    const count = highlightMatches(containerRef.current, query);
    setHitCount(count);
    setActiveHit(0);
  }, [query, content]);

  useEffect(() => {
    if (!hitCount || !containerRef.current) return;
    const el = setActiveMatch(containerRef.current, activeHit);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeHit, hitCount]);

  function nextHit() { if (hitCount) setActiveHit((activeHit + 1) % hitCount); }
  function prevHit() { if (hitCount) setActiveHit((activeHit - 1 + hitCount) % hitCount); }
  function clearSearch() {
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div>
      {/* This spacer always reserves the same slot in the flow — the bar
          itself switches to position:fixed on top of it when active, so
          the content below never jumps when search is toggled on/off. */}
      <div style={{ height: BAR_SLOT_HEIGHT, position: "relative" }}>
        <div
          style={{
            ...(searchActive
              ? {
                  position: "fixed", top: topOffset, left: 0, right: 0, zIndex: 30,
                  background: "var(--bg)", borderBottom: "1px solid var(--border)",
                  boxShadow: "0 8px 16px -8px rgba(0,0,0,0.4)",
                }
              : {}),
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
                onKeyDown={(e) => { if (e.key === "Enter") nextHit(); }}
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
                <button className="btn btn-ghost btn-sm" onClick={prevHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>‹</button>
                <button className="btn btn-ghost btn-sm" onClick={nextHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>›</button>
              </div>
            )}
          </div>
        </div>
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
