"use client";

// Store — two top-level sections: Items and Themes. Both catalogs are fully
// admin-editable (Admin → Store) and come from GameContext (which itself
// falls back to config/Game.ts + config/Themes.ts if the store_items /
// store_themes tables haven't been migrated yet).
//
// Items purchase/use logic (coins, stock caps, per-item pricing formulas)
// still lives in GameContext's inventory functions, keyed by each item's
// `key` — only the four keys the in-match code actually checks
// (insight_lens, ace_card, confidence_pill, revival_shot) do anything when
// bought. The item catalog itself is fixed to these four (Admin → Store →
// Items only tweaks their numbers now, no add/delete) so that's the whole set.
//
// Themes change the app's whole look — colors, fonts, and (if set) a
// background image — the moment they're equipped. See GameContext's
// buyTheme/equipTheme and the CSS-variable injection in (app)/layout.tsx.

import { useState, useRef, ReactNode } from "react";
import { useGame } from "@/contexts/GameContext";
import { DebucksIcon } from "@/components/ui/DebucksIcon";
import type { StoreItemDef } from "@/config/Game";
import type { StoreTheme } from "@/config/Themes";

type CategoryKey = "consumable" | "gear";

const ITEM_CATEGORIES: Record<CategoryKey, { key: CategoryKey; label: string }> = {
  consumable: { key: "consumable", label: "Consumables" },
  gear: { key: "gear", label: "Gears" },
};

type Section = "items" | "themes";

export default function StorePage() {
  const {
    profile, upProfile, inventory, inventoryLoading,
    aceCardPrice, itemPrice, buyInsightLens, buyAceCard, buyConfidencePill, buyRevivalShot,
    cheatTapEnabled,
    storeItems, storeItemsLoading,
    themes, themesLoading, ownedThemeIds, equippedTheme, buyTheme, equipTheme,
  } = useGame();

  const [section, setSection] = useState<Section>("items");
  const [category, setCategory] = useState<CategoryKey>("consumable");

  const activeItems = storeItems.filter((i) => i.active);
  const gearItems = activeItems.filter((i) => i.category === "gear");
  const consumableItems = activeItems.filter((i) => i.category === "consumable");
  const activeThemes = themes.filter((t) => t.active);

  // ── EASTER EGG: 5 consecutive taps on the Debucks counter -> 10,000 ──
  const coinTapCountRef = useRef(0);
  const coinTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleCoinTap() {
    if (!cheatTapEnabled) return;
    coinTapCountRef.current += 1;
    if (coinTapTimerRef.current) clearTimeout(coinTapTimerRef.current);
    coinTapTimerRef.current = setTimeout(() => { coinTapCountRef.current = 0; }, 800);
    if (coinTapCountRef.current >= 5) {
      coinTapCountRef.current = 0;
      // Deliberately plain upProfile, not earnCoins — a cheat shouldn't
      // count toward the "Debucks Earned" achievement tiers.
      upProfile({ coins: 10000 });
    }
  }

  function renderItem(item: StoreItemDef) {
    if (item.key === "insight_lens") {
      return (
        <ItemCard key={item.key} icon={item.icon} name={item.name} categoryLabel={ITEM_CATEGORIES.gear.label} description={item.description}
          footer={inventory.insightLens ? <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>✓ Owned — permanent</span> : undefined}
        >
          {!inventory.insightLens && (
            <BuyButton cost={item.baseCost} coins={profile.coins} onBuy={buyInsightLens}
              label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{item.baseCost}</>} />
          )}
        </ItemCard>
      );
    }
    if (item.key === "ace_card") {
      const nextPrice = itemPrice("ace_card", inventory.aceCards);
      const atMax = item.maxStock != null && inventory.aceCards >= item.maxStock;
      return (
        <div key={item.key}>
          <ItemCard icon={item.icon} name={item.name} categoryLabel={ITEM_CATEGORIES.consumable.label} description={item.description}
            footer={<span style={{ fontSize: 12, color: "var(--muted)" }}>Held: <b style={{ color: "var(--text)" }}>{inventory.aceCards}</b>{item.maxStock != null ? ` / ${item.maxStock}` : ""}</span>}
          >
            <BuyButton cost={nextPrice} coins={profile.coins} disabled={atMax} disabledLabel={atMax ? "Stock full" : undefined}
              onBuy={buyAceCard} label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{nextPrice}</>} />
          </ItemCard>
          {item.pricingType !== "flat" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, paddingLeft: 2 }}>
              Price depends on how many you're holding right now — using cards brings it back down, buying pushes it up.
            </div>
          )}
        </div>
      );
    }
    if (item.key === "confidence_pill") {
      const nextPrice = itemPrice("confidence_pill", inventory.confidencePills);
      const atMax = item.maxStock != null && inventory.confidencePills >= item.maxStock;
      return (
        <div key={item.key}>
          <ItemCard icon={item.icon} name={item.name} categoryLabel={ITEM_CATEGORIES.consumable.label} description={item.description}
            footer={<span style={{ fontSize: 12, color: "var(--muted)" }}>Held: <b style={{ color: "var(--text)" }}>{inventory.confidencePills}</b>{item.maxStock != null ? ` / ${item.maxStock}` : ""}</span>}
          >
            <BuyButton cost={nextPrice} coins={profile.coins} disabled={atMax} disabledLabel={atMax ? "Stock full" : undefined}
              onBuy={buyConfidencePill} label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{nextPrice}</>} />
          </ItemCard>
          {item.pricingType !== "flat" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, paddingLeft: 2 }}>
              Price depends on how many you're holding right now.
            </div>
          )}
        </div>
      );
    }
    if (item.key === "revival_shot") {
      const nextPrice = itemPrice("revival_shot", inventory.revivalShots);
      const atMax = item.maxStock != null && inventory.revivalShots >= item.maxStock;
      return (
        <div key={item.key}>
          <ItemCard icon={item.icon} name={item.name} categoryLabel={ITEM_CATEGORIES.consumable.label} description={item.description}
            footer={<span style={{ fontSize: 12, color: "var(--muted)" }}>Held: <b style={{ color: "var(--text)" }}>{inventory.revivalShots}</b>{item.maxStock != null ? ` / ${item.maxStock}` : ""}</span>}
          >
            <BuyButton cost={nextPrice} coins={profile.coins} disabled={atMax} disabledLabel={atMax ? "Stock full" : undefined}
              onBuy={buyRevivalShot} label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{nextPrice}</>} />
          </ItemCard>
          {item.pricingType !== "flat" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, paddingLeft: 2 }}>
              Price depends on how many you're holding right now.
            </div>
          )}
        </div>
      );
    }
    // Any other admin-added key: shown, but there's no in-match effect wired
    // up for it yet, so it's presentation-only until a developer adds one.
    return (
      <ItemCard key={item.key} icon={item.icon} name={item.name} categoryLabel={ITEM_CATEGORIES[item.category].label} description={item.description}
        footer={<span style={{ fontSize: 11, color: "var(--muted)" }}>Coming soon</span>}
      >
        <button className="btn btn-sm" disabled style={{ opacity: 0.5 }}>
          Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{item.baseCost}
        </button>
      </ItemCard>
    );
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <h2 className="heading" style={{ fontSize: 26 }}>Store</h2>
        <span className="badge" onClick={handleCoinTap} style={{ background: "var(--amber-soft)", color: "var(--amber)", cursor: "default" }}>
          <DebucksIcon style={{ marginRight: 4 }} />{profile.coins}
        </span>
      </div>

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
        themesLoading ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading themes…</p>
        ) : activeThemes.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎨</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No themes available</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                owned={ownedThemeIds.includes(theme.id)}
                equipped={equippedTheme?.id === theme.id}
                coins={profile.coins}
                onBuy={() => buyTheme(theme.id)}
                onEquip={() => equipTheme(theme.id)}
              />
            ))}
          </div>
        )
      )}

      {section === "items" && (
        <>
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

          {inventoryLoading || storeItemsLoading ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading store…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(category === "gear" ? gearItems : consumableItems).length === 0 ? (
                <div className="card" style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
                  Nothing here right now.
                </div>
              ) : (
                (category === "gear" ? gearItems : consumableItems).map(renderItem)
              )}
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
      {cantAfford && !disabled ? <>Need · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{cost}</> : disabled && disabledLabel ? disabledLabel : label}
    </button>
  );
}

function ThemeCard({
  theme, owned, equipped, coins, onBuy, onEquip,
}: {
  theme: StoreTheme;
  owned: boolean;
  equipped: boolean;
  coins: number;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const c = theme.colors;
  return (
    <div className="card" style={{ padding: 16, border: equipped ? "1px solid var(--blue)" : undefined }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Swatch preview: a little mock card rendered in the theme's own
            colors/fonts so you can see it before buying/equipping. */}
        <div style={{
          width: 64, height: 64, borderRadius: 10, flexShrink: 0, overflow: "hidden",
          background: c.bg, border: `1px solid ${c.border}`,
          ...(theme.backgroundImageUrl ? { backgroundImage: `url(${theme.backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
        }}>
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ fontFamily: theme.fontHeading, color: c.blue, fontSize: 18, fontWeight: 700 }}>D</div>
            <div style={{ width: 30, height: 4, borderRadius: 2, background: c.blue }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{theme.name}</span>
            {theme.isDefault && <span className="badge" style={{ fontSize: 9, background: "var(--surface2)", color: "var(--muted)" }}>Default</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 10 }}>{theme.description}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span />
            {equipped ? (
              <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>✓ Equipped</span>
            ) : owned ? (
              <button className="btn btn-primary btn-sm" onClick={onEquip}>Equip</button>
            ) : (
              <BuyButton cost={theme.cost} coins={coins} onBuy={onBuy}
                label={<>Buy · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{theme.cost}</>} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
