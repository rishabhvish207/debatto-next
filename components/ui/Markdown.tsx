"use client";

import React from "react";

// A small, dependency-free markdown renderer — this project has no network
// access to add a real markdown package mid-session, and honestly a full
// CommonMark implementation is overkill for admin-authored docs. Supports:
// # .. ###### headings, **bold**, *italic*/_italic_, `code`, [text](url),
// - / * unordered lists, 1. ordered lists, > blockquotes, ``` code fences,
// --- horizontal rules, and blank-line-separated paragraphs. Anything else
// just renders as plain text — good enough for the two admin-editable docs
// this is used for (Documentation, Game Guide).

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "hr" }
  | { type: "code"; lang: string; code: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "p"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // Code fence
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph — consume until a blank line or the start of another block type
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

let hitCounter = 0;

// Splits `text` on **bold**, *italic*/_italic_, `code`, and [text](url),
// rendering each as the matching element; plain text in between (and any
// occurrence of `query`, if given) is wrapped for search highlighting.
function renderInline(text: string, keyPrefix: string, query?: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  function pushPlain(chunk: string) {
    if (!chunk) return;
    if (!query || !query.trim()) { nodes.push(chunk); return; }
    const q = query.trim();
    const lower = chunk.toLowerCase();
    const ql = q.toLowerCase();
    let pos = 0;
    let idx = lower.indexOf(ql, pos);
    if (idx === -1) { nodes.push(chunk); return; }
    while (idx !== -1) {
      if (idx > pos) nodes.push(chunk.slice(pos, idx));
      nodes.push(
        <mark key={`${keyPrefix}-hit-${hitCounter++}`} className="md-hit" style={{ background: "var(--amber-soft)", color: "var(--amber)", borderRadius: 3, padding: "0 1px" }}>
          {chunk.slice(idx, idx + q.length)}
        </mark>
      );
      pos = idx + q.length;
      idx = lower.indexOf(ql, pos);
    }
    if (pos < chunk.length) nodes.push(chunk.slice(pos));
  }

  while ((m = re.exec(text))) {
    if (m.index > lastIndex) pushPlain(text.slice(lastIndex, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{renderInline(token.slice(2, -2), `${keyPrefix}-b${i}`, query)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${keyPrefix}-${i++}`} style={{ background: "var(--faint)", padding: "1px 5px", borderRadius: 4, fontSize: "0.92em" }}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(<a key={`${keyPrefix}-${i++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>{linkMatch[1]}</a>);
      } else {
        pushPlain(token);
      }
    } else {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{renderInline(token.slice(1, -1), `${keyPrefix}-i${i}`, query)}</em>);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) pushPlain(text.slice(lastIndex));
  return nodes;
}

const HEADING_SIZES: Record<number, number> = { 1: 24, 2: 19, 3: 16, 4: 14, 5: 13, 6: 12 };

export function Markdown({ text, query }: { text: string; query?: string }) {
  const blocks = React.useMemo(() => parseBlocks(text || ""), [text]);

  return (
    <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.75 }}>
      {blocks.map((b, idx) => {
        const key = `blk-${idx}`;
        switch (b.type) {
          case "heading":
            return (
              <div
                key={key}
                style={{
                  fontSize: HEADING_SIZES[b.level] || 13,
                  fontWeight: 700,
                  color: b.level <= 2 ? "var(--amber)" : "var(--text)",
                  marginTop: idx === 0 ? 0 : b.level <= 2 ? 26 : 18,
                  marginBottom: 8,
                  paddingBottom: b.level === 1 ? 8 : 0,
                  borderBottom: b.level === 1 ? "1px solid var(--border)" : "none",
                }}
              >
                {renderInline(b.text, key, query)}
              </div>
            );
          case "hr":
            return <hr key={key} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />;
          case "code":
            return (
              <pre key={key} className="card" style={{ padding: 12, overflowX: "auto", marginBottom: 12, background: "var(--faint)" }}>
                <code style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", whiteSpace: "pre" }}>{b.code}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={key} style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                {b.items.map((it, i2) => (
                  <li key={i2} style={{ marginBottom: 5, color: "var(--muted)" }}>{renderInline(it, `${key}-${i2}`, query)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                {b.items.map((it, i2) => (
                  <li key={i2} style={{ marginBottom: 5, color: "var(--muted)" }}>{renderInline(it, `${key}-${i2}`, query)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <div key={key} style={{ borderLeft: "3px solid var(--blue-soft)", paddingLeft: 12, marginBottom: 12, color: "var(--muted)", fontStyle: "italic" }}>
                {b.lines.map((l, i2) => <div key={i2}>{renderInline(l, `${key}-${i2}`, query)}</div>)}
              </div>
            );
          case "p":
          default:
            return (
              <p key={key} style={{ margin: "0 0 12px", color: "var(--muted)" }}>
                {renderInline(b.text, key, query)}
              </p>
            );
        }
      })}
    </div>
  );
}
