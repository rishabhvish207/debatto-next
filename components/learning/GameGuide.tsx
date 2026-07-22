"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Markdown } from "@/components/ui/Markdown";
import { highlightMatches, clearHighlights } from "@/lib/textHighlight";
import { Search } from "lucide-react";
import { DEFAULT_GAME_GUIDE_MD } from "@/config/LearningDefaults";

const supabase = createClient();

export function GameGuide() {
  const [content, setContent] = useState(DEFAULT_GAME_GUIDE_MD);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    if (!hitCount) return;
    const el = containerRef.current?.querySelectorAll(".md-hit")[activeHit] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeHit, hitCount]);

  function nextHit() { if (hitCount) setActiveHit((activeHit + 1) % hitCount); }
  function prevHit() { if (hitCount) setActiveHit((activeHit - 1 + hitCount) % hitCount); }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}><Search size={14} /></span>
          <input
            className="input-field"
            placeholder="Search this page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") nextHit(); }}
            style={{ width: "100%", paddingLeft: 34 }}
          />
        </div>
        {query.trim() && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {hitCount > 0 ? `${activeHit + 1}/${hitCount}` : "0"}
            <button className="btn btn-ghost btn-sm" onClick={prevHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>‹</button>
            <button className="btn btn-ghost btn-sm" onClick={nextHit} disabled={!hitCount} style={{ padding: "4px 8px" }}>›</button>
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
