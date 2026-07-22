// lib/textHighlight.ts
//
// Works on whatever's actually in the DOM after a markdown render, rather
// than being wired into the markdown parser itself — so swapping markdown
// engines (as happened once already) never breaks search highlighting.
// Call `clearHighlights` before re-highlighting (or when the query changes
// to empty) to undo a previous pass cleanly.

export function clearHighlights(container: HTMLElement) {
  container.querySelectorAll("mark.md-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });
}

/** Wraps every case-insensitive occurrence of `query` in a rendered container with <mark class="md-hit">. Returns the number of matches found. */
export function highlightMatches(container: HTMLElement, query: string): number {
  clearHighlights(container);
  const q = query.trim();
  if (!q) return 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);

  const ql = q.toLowerCase();
  let count = 0;

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const lower = text.toLowerCase();
    if (!lower.includes(ql)) continue;

    const frag = document.createDocumentFragment();
    let pos = 0;
    let idx = lower.indexOf(ql, pos);
    while (idx !== -1) {
      if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
      const mark = document.createElement("mark");
      mark.className = "md-hit";
      mark.style.background = "var(--amber-soft)";
      mark.style.color = "var(--amber)";
      mark.style.borderRadius = "3px";
      mark.style.padding = "0 1px";
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      count++;
      pos = idx + q.length;
      idx = lower.indexOf(ql, pos);
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return count;
}

/**
 * Marks the `index`-th <mark class="md-hit"> as the "current" match (brighter,
 * inverted colors) and resets the rest to the plain highlight style. Returns
 * the active element so callers can scrollIntoView it.
 */
export function setActiveMatch(container: HTMLElement, index: number): HTMLElement | undefined {
  const marks = container.querySelectorAll<HTMLElement>("mark.md-hit");
  let active: HTMLElement | undefined;
  marks.forEach((mark, i) => {
    if (i === index) {
      mark.style.background = "var(--amber)";
      mark.style.color = "var(--bg)";
      active = mark;
    } else {
      mark.style.background = "var(--amber-soft)";
      mark.style.color = "var(--amber)";
    }
  });
  return active;
}
