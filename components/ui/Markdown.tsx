"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// A real CommonMark + GitHub-Flavored-Markdown renderer (tables, task
// lists, strikethrough, images, footnotes, autolinks — everything a tool
// like Obsidian's preview supports) via react-markdown + remark-gfm,
// themed to match the app instead of react-markdown's unstyled defaults.
// Search-term highlighting is handled separately, as a DOM pass after
// render (see lib/textHighlight.ts) — that's independent of whichever
// markdown engine is underneath, so switching engines never breaks it.

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body" style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.75 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--amber)", marginTop: 0, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
              {children}
            </div>
          ),
          h2: ({ children }) => (
            <div style={{ fontSize: 19, fontWeight: 700, color: "var(--amber)", marginTop: 26, marginBottom: 10 }}>
              {children}
            </div>
          ),
          h3: ({ children }) => (
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginTop: 18, marginBottom: 8 }}>
              {children}
            </div>
          ),
          h4: ({ children }) => <div style={{ fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6 }}>{children}</div>,
          h5: ({ children }) => <div style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 6 }}>{children}</div>,
          h6: ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 6, color: "var(--muted)" }}>{children}</div>,
          p: ({ children }) => <p style={{ margin: "0 0 12px", color: "var(--muted)" }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: "var(--text)", fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => <del style={{ opacity: 0.65 }}>{children}</del>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>{children}</a>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />,
          ul: ({ children }) => <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 5, color: "var(--muted)" }}>{children}</li>,
          blockquote: ({ children }) => (
            <div style={{ borderLeft: "3px solid var(--blue-soft)", paddingLeft: 12, marginBottom: 12, color: "var(--muted)", fontStyle: "italic" }}>
              {children}
            </div>
          ),
          code: ({ className, children, ...props }: any) => {
            const codeText = String(children).replace(/\n$/, "");
            // react-markdown v9 no longer passes an `inline` flag — a
            // className only shows up when the fence has a language tag
            // (```js), so a language-less multi-line block needs the
            // newline check too, or it'd wrongly get pill-style inline
            // code styling instead of pre-wrap block styling.
            const isBlock = className?.includes("language-") || codeText.includes("\n");
            if (isBlock) {
              return <code className={className} style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", whiteSpace: "pre" }} {...props}>{children}</code>;
            }
            return (
              <code style={{ background: "var(--faint)", padding: "1px 5px", borderRadius: 4, fontSize: "0.92em" }} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="card" style={{ padding: 12, overflowX: "auto", marginBottom: 12, background: "var(--faint)" }}>
              {children}
            </pre>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt || ""} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)", margin: "8px 0" }} />
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: "var(--faint)" }}>{children}</thead>,
          th: ({ children }) => (
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--border)", color: "var(--text)", fontWeight: 700 }}>{children}</th>
          ),
          td: ({ children }) => <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{children}</td>,
          input: ({ checked, ...props }: any) => (
            <input type="checkbox" checked={!!checked} disabled style={{ marginRight: 6, accentColor: "var(--blue)" }} {...props} />
          ),
        }}
      >
        {text || ""}
      </ReactMarkdown>
    </div>
  );
}
