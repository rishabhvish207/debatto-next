"use client";

// Store — items are bought here with debucks (schema: shop is client-side
// config for now, purchases persist through GameContext's `inventory` /
// the `user_inventory` table, mirroring the debots/user_debots pattern).
//
// Two top-level sections: Themes and Items. Themes has no content yet —
// it's deliberately kept as an empty, ready-to-fill tab (see THEMES below)
// so adding real theme items later doesn't require touching the section
// scaffolding, just populating the array.
//
// Items are split into two categories — Consumable and Gear. The category
// *labels* are pulled from one constant (ITEM_CATEGORIES) specifically so
// renaming "Gears" later is a one-line change.
//
// Two levels of tabs on one screen (Themes/Items, then Consumable/Gear)
// read as one confusing row unless they're visually unequal — the section
// switch is styled as a real top-level tab strip (underline, bigger type),
// the category switch as a small subordinate pill group nested under it.

import { useState, useRef, ReactNode } from "react";
import { useGame } from "@/contexts/GameContext";
import { DebucksIcon } from "@/components/ui/DebucksIcon";
import { GAME_CONFIG } from "@/config/Game";

type CategoryKey = "consumable" | "gear";

const ITEM_CATEGORIES: Record<CategoryKey, { key: CategoryKey; label: string }> = {
  consumable: { key: "consumable", label: "Consumables" },
  gear: { key: "gear", label: "Gears" },
};

// Future themes go here — empty on purpose for now. Each entry will need at
// least { id, name, cost, preview } once themes actually exist.
const THEMES: any[] = [];

type Section = "themes" | "items";

export default function StorePage() {
  const {
    profile, upProfile, inventory, inventoryLoading,
    aceCardPrice, buyInsightLens, buyAceCard, buyConfidencePill,
    cheatTapEnabled,
  } = useGame();

  const [section, setSection] = useState<Section>("items");
  const [category, setCategory] = useState<CategoryKey>("consumable");

  const { insightLens: insightLensCfg, aceCard: aceCardCfg, confidencePill: pillCfg } = GAME_CONFIG.store;

  const nextAcePrice = aceCardPrice(inventory.aceCards);
  const aceAtMax = inventory.aceCards >= aceCardCfg.maxStock;
  const pillAtMax = inventory.confidencePills >= pillCfg.maxStock;

  // ── EASTER EGG: 5 consecutive taps on the Debucks counter -> 10,000 ──
  // Moved here from the battle screen — this is now the only place it works.
  const coinTapCountRef = useRef(0);
  const coinTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleCoinTap() {
    if (!cheatTapEnabled) return;
    coinTapCountRef.current += 1;
    if (coinTapTimerRef.current) clearTimeout(coinTapTimerRef.current);
    coinTapTimerRef.current = setTimeout(() => { coinTapCountRef.current = 0; }, 800);
    if (coinTapCountRef.current >= 5) {
      coinTapCountRef.current = 0;
      upProfile({ coins: 10000 });
    }
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <h2 className="heading" style={{ fontSize: 26 }}>Store</h2>
        <span className="badge" onClick={handleCoinTap} style={{ background: "var(--amber-soft)", color: "var(--amber)", cursor: "default" }}>
          <DebucksIcon style={{ marginRight: 4 }} />{profile.coins}
        </span>
      </div>

      {/* Section tabs — Themes / Items. Top-level nav: underline indicator,
          bigger uppercase type, full-bleed border — reads as "this is the
          primary switch on this screen". */}
      <div style={{ display: "flex", gap: 24, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {(["items", "themes"] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0 2px 12px", fontSize: 15, fontWeight: 700,
              letterSpacing: "0.03em", textTransform: "uppercase",
              color: section === s ? "var(--text)" : "var(--muted)",
              borderBottom: section === s ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {section === "themes" && (
        THEMES.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎨</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No themes yet</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              Theme & customization items are coming soon — check back later.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {THEMES.map((t: any) => (
              <div key={t.id} className="card" style={{ padding: 16 }}>{t.name}</div>
            ))}
          </div>
        )
      )}

      {section === "items" && (
        <>
          {/* Category tabs — Consumable / Gear. Deliberately a small,
              subordinate pill group (not full-width buttons like the
              section tabs above) so it visibly nests under "Items" rather
              than competing with it for attention. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Category
            </span>
            <div style={{ display: "inline-flex", gap: 4, background: "var(--faint)", borderRadius: 999, padding: 3 }}>
              {Object.values(ITEM_CATEGORIES).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 999,
                    padding: "5px 12px", fontSize: 12, fontWeight: 600,
                    background: category === c.key ? "var(--surface2)" : "transparent",
                    color: category === c.key ? "var(--text)" : "var(--muted)",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {inventoryLoading ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading store…</p>
          ) : category === "gear" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ItemCard
                icon="🔍"
                name="Insight Lens"
                categoryLabel={ITEM_CATEGORIES.gear.label}
                description="Permanently unlocks the Insight lifeline in every match — see the opponent's weak points and fallacies as you debate, as many times as you want. Buy it once; it's yours for good."
                footer={
                  inventory.insightLens
                    ? <span style={{ fontSize: 12, color: "var(--green, #5dbb8a)", fontWeight: 600 }}>✓ Owned — permanent</span>
                    : undefined
                }
              >
                {!inventory.insightLens && (
                  <BuyButton
                    cost={insightLensCfg.cost}
                    coins={profile.coins}
                    onBuy={buyInsightLens}
                    label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{insightLensCfg.cost}</>}
                  />
                )}
              </ItemCard>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ItemCard
                icon="🂡"
                name="Ace Card"
                categoryLabel={ITEM_CATEGORIES.consumable.label}
                description="Reveals 3 AI-suggested responses to the opponent's argument — pick one and use it as-is, or as a starting point. Consumed on use."
                footer={
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Held: <b style={{ color: "var(--text)" }}>{inventory.aceCards}</b> / {aceCardCfg.maxStock}
                  </span>
                }
              >
                <BuyButton
                  cost={nextAcePrice}
                  coins={profile.coins}
                  disabled={aceAtMax}
                  disabledLabel={aceAtMax ? "Stock full" : undefined}
                  onBuy={buyAceCard}
                  label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{nextAcePrice}</>}
                />
              </ItemCard>

              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -6, marginBottom: -2, paddingLeft: 2 }}>
                Price depends on how many you're holding right now (next after this: <DebucksIcon style={{ marginLeft: 1, marginRight: 1 }} />{aceCardPrice(Math.min(inventory.aceCards + 1, aceCardCfg.maxStock))}) — using cards brings it back down, buying pushes it up.
              </div>

              <ItemCard
                icon="💊"
                name="Confidence Pill"
                categoryLabel={ITEM_CATEGORIES.consumable.label}
                description="Restores +10 HP the moment you take it. Consumed on use."
                footer={
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Held: <b style={{ color: "var(--text)" }}>{inventory.confidencePills}</b> / {pillCfg.maxStock}
                  </span>
                }
              >
                <BuyButton
                  cost={pillCfg.cost}
                  coins={profile.coins}
                  disabled={pillAtMax}
                  disabledLabel={pillAtMax ? "Stock full" : undefined}
                  onBuy={buyConfidencePill}
                  label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{pillCfg.cost}</>}
                />
              </ItemCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemCard({
  icon, name, categoryLabel, description, footer, children,
}: {
  icon: string;
  name: string;
  categoryLabel: string;
  description: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{name}</span>
            <span className="badge" style={{ fontSize: 9, background: "var(--surface2)", color: "var(--muted)" }}>{categoryLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 10 }}>{description}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            {footer || <span />}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuyButton({
  cost, coins, onBuy, label, disabled, disabledLabel,
}: {
  cost: number;
  coins: number;
  onBuy: () => void;
  label: ReactNode;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const cantAfford = coins < cost;
  const isDisabled = disabled || cantAfford;
  return (
    <button
      className="btn btn-primary btn-sm"
      disabled={isDisabled}
      style={cantAfford && !disabled ? { background: "transparent", border: "1px solid var(--red)", color: "var(--red)" } : undefined}
      onClick={onBuy}
    >
      {disabled && disabledLabel ? disabledLabel : cantAfford ? "Not enough" : label}
    </button>
  );
}
