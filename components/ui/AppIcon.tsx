"use client";

import React from "react";
import {
  Trophy, Flame, Brain, Zap, Lightbulb, Pill, Gift, Palette, Globe, BookOpen,
  ShoppingBag, Swords, Settings, User, ScrollText, Wrench, Puzzle, CheckCircle2,
  XCircle, Medal, CalendarCheck, LayoutGrid, Sparkle, Search, Lock, Save, Pencil,
  Check, X, ArrowRight, ArrowLeft, ArrowUpRight, CornerDownLeft, AlertTriangle,
  Sparkles, Handshake, Bell, type LucideIcon,
} from "lucide-react";

// Every achievement/store-item/debot `icon` field in the database is still
// a plain string, chosen freely by an admin (Admin -> Achievements/Store ->
// Items). Rather than restricting that to a fixed dropdown (a real UX
// regression for anyone who wants to add something new), this maps the
// emoji strings already shipped in this app's default catalogs to a clean
// Lucide icon — anything typed in that ISN'T in this map just falls back to
// rendering as the raw text/emoji, so nothing ever breaks, it just won't be
// "upgraded" to a line icon until it's added here.
const EMOJI_TO_ICON: Record<string, LucideIcon> = {
  "🏆": Trophy,
  "🔥": Flame,
  "🧠": Brain,
  "⚡": Zap,
  "🂡": Lightbulb,
  "💊": Pill,
  "🎁": Gift,
  "🎨": Palette,
  "🌐": Globe,
  "📚": BookOpen,
  "🛍": ShoppingBag,
  "⚔": Swords,
  "⚙": Settings,
  "👤": User,
  "📜": ScrollText,
  "🛠": Wrench,
  "🧩": Puzzle,
  "✅": CheckCircle2,
  "❌": XCircle,
  "🎖": Medal,
  "📅": CalendarCheck,
  "🗂": LayoutGrid,
  "❋": Sparkle,
  "🔍": Search,
  "🔒": Lock,
  "💾": Save,
  "✎": Pencil,
  "✓": Check,
  "✕": X,
  "→": ArrowRight,
  "←": ArrowLeft,
  "↗": ArrowUpRight,
  "↵": CornerDownLeft,
  "⚠": AlertTriangle,
  "✨": Sparkles,
  "✦": Sparkle,
  "🏅": Medal,
  "🤝": Handshake,
  "🔔": Bell,
};

/**
 * Renders `token` as a Lucide icon if it's a mapped emoji/symbol, otherwise
 * falls back to rendering it as plain text exactly as given (so an
 * admin-typed emoji that isn't in the map yet still shows up, just not as a
 * line icon). `size` maps to both width/height and, for the text fallback,
 * an equivalent font-size.
 */
export function AppIcon({
  token,
  size = 16,
  strokeWidth = 2,
  className,
  style,
}: {
  token: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!token) return null;
  const Icon = EMOJI_TO_ICON[token.trim()];
  if (Icon) {
    return <Icon size={size} strokeWidth={strokeWidth} className={className} style={{ flexShrink: 0, ...style }} />;
  }
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1, flexShrink: 0, ...style }}>
      {token}
    </span>
  );
}
