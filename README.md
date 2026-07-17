# Debatto

An AI-powered debate game. Pick a debot (an AI opponent with its own personality, difficulty, and argument style), pick a side of a topic, and go head-to-head across a set number of rounds. Each round, an LLM judges your argument, scores it, and fires back in character — HP and points move accordingly until one side wins.

**Live demo:** [debatto-git-main-2-rishabhvish207s-projects.vercel.app](https://debatto-git-main-2-rishabhvish207s-projects.vercel.app/)

Built with Next.js (App Router), TypeScript, Tailwind, and Supabase (Postgres + Auth + Storage). AI calls run through Groq (Llama 3.3 70B).

## Status

| Mode | Status |
|---|---|
| **Debots** (`/offline`) | Playable — full loop: select debot, pick topic, debate, score, unlock rewards |
| **Store** (`/store`) | Playable — Insight Lens (permanent lifeline unlock), Ace Cards, Confidence Pills, and Themes, all bought with debucks. Both the item and theme catalogs are fully admin-editable (Admin → Store) |
| **Hub** (`/hub`) | Playable — post-landing mode-select screen |
| **History** (`/history`) | Playable — past match log with per-round breakdowns |
| **Settings** (`/settings`) | Playable — account (sign in/out), guest data reset |
| **Profile** (`/profile`) | Playable — avatar, name, bio, stats, read-only Player ID for logged-in users |
| **Admin** (`/admin`) | Playable (admin-only) — manage debots, topics, store items, themes, and game settings |
| **Online → Random** (`/online/random`) | Not built yet — schema ready (`matchmaking_queue`, `online_matches`, `online_match_rounds`, `try_match_player()` RPC) |
| **Online → Friends** (`/online/friends`) | Not built yet — schema ready (`friendships` table) |
| **Learning** (`/learning`) | Not built yet |

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Supabase** — Postgres (with Row Level Security), Auth (Google OAuth), Storage
- **Groq API** (`llama-3.3-70b-versatile`) for argument generation and judging

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GROQ_API_KEY=your-groq-key
```

`GROQ_API_KEY` is server-only (used in `app/api/debate/route.ts`) — never expose it with a `NEXT_PUBLIC_` prefix.

## Database setup

The app expects specific tables, columns, and **Row Level Security policies** in Supabase. Missing RLS policies are the single biggest source of "it looks like it saved but didn't" bugs in this project — Postgres/PostgREST silently returns success on an UPDATE that matches zero rows if RLS blocks it, with no error. Every write path in the admin panel guards against this by checking the returned row count, but the underlying policy still needs to exist for the write to actually work.

### Core tables

- `profiles` — one row per user: `name`, `coins`, `wins`, `is_admin`, `bio`, `avatar_url`, `player_id` (see below), `prestige`
- `debots` — the AI opponent catalog: `name`, `sub`, `personality`, `depth`, `story`, `arg_sentences`, `sprite_url`, `sprite_emotions` (jsonb), `multiplier` (its own attack-damage multiplier against the player), `cost`, `max_hp`, `color`, `diff` (difficulty label — read by the AI to scale how hard/easy it argues and how strictly it grades you), `dc`, `reward`, `vertices` (per-debot shape fallback; overridden globally if `app_settings.debot_vertices` is set)
- `user_debots` — join table for per-user unlocks: `user_id`, `debot_id`, `unlocked_at`. Unlocks live here rather than as a column on `debots` itself, since a debot getting unlocked for one user must not unlock it globally for everyone.
- `user_inventory` — one row per user for Store items: `user_id` (unique), `insight_lens` (bool, permanent), `ace_cards` (int, stackable), `confidence_pills` (int, stackable). Upserted on every purchase/use.
- `store_items` — the admin-editable item catalog (Admin → Store → Items): `key` (see note below), `category` (`gear`/`consumable`), `name`, `icon`, `description`, `pricing_type` (`flat`/`scaling`), `base_cost`, `price_multiplier`, `max_stock`, `heal_amount` (HP restored on use — only meaningful for `confidence_pill`), `active`, `sort_order`. Falls back to a hardcoded catalog in `config/Game.ts` if this table is empty/missing, so the Store always has something to show.
- `store_themes` — the admin-editable theme catalog (Admin → Store → Themes): `name`, `description`, `cost`, `is_default`, `active`, `colors` (jsonb — all 18 CSS custom properties from `Debatto.css`), `font_heading`, `font_body`, `google_font_url`, `background_image_url`, `background_opacity`, `sort_order`. Falls back to `config/Themes.ts` if empty/missing.
- `user_themes` — join table for per-user theme ownership: `user_id`, `theme_id`, `unlocked_at`. Same reasoning as `user_debots` — a theme bought by one user shouldn't unlock it for everyone.
- `profiles.equipped_theme_id` — nullable, references `store_themes.id`; `null` means "use whichever theme has `is_default = true`".
- `topics` — debate topics: `title`/`text`, `category`/`cat`, `is_system` (seeded topics vs. user-submitted), `user_id`
- `pinned_topics` — per-user topic pins: `user_id`, `topic_id`
- `hidden_topics` — per-user topic removals (used when a user "deletes" a system topic — it's hidden for them, not removed globally): `user_id`, `topic_id`
- `app_settings` — key/value config the admin panel edits at runtime: `rounds_options`, `rounds_default`, `debot_vertices` (0–20 sides, blank = per-debot), `debot_shape_rotation` (0/90/180/270, rotates every debot's frame), `debot_diff_badge_style` (`badge`/`plain` — whether the difficulty label in the selection grid gets a background pill or plain text), `debucks_cheat_enabled`, `ai_model`, `ai_max_tokens`, `ai_temperature`, `ai_fallback_model`, `ai_fallback_enabled` (see "AI rate-limit fallback" below), `landing_bg_url` (public URL of the landing page's background image, shown at low opacity behind the logo; empty/absent means no background image)

### Required RLS policies

```sql
-- debots: public read, admin-only write
create policy "Allow public select" on public.debots for select using (true);

create policy "Admins can insert debots" on public.debots for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "Admins can update debots" on public.debots for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "Admins can delete debots" on public.debots for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- app_settings: public read, admin-only write
create policy "app_settings_select_all" on public.app_settings for select using (true);

create policy "app_settings_write_admin_only" on public.app_settings for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- profiles: users can update their own row
create policy "Users can update own profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- hidden_topics: users manage their own hidden list
alter table public.hidden_topics enable row level security;
create policy "Users manage their own hidden topics" on public.hidden_topics for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- store_items: public read, admin-only write
create policy "store_items_select_all" on public.store_items for select using (true);
create policy "store_items_write_admin_only" on public.store_items for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- store_themes: public read, admin-only write
create policy "store_themes_select_all" on public.store_themes for select using (true);
create policy "store_themes_write_admin_only" on public.store_themes for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- user_themes: users manage their own ownership rows only
alter table public.user_themes enable row level security;
create policy "Users manage their own theme unlocks" on public.user_themes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Store & Themes migration

Run once to create the three new tables, extend `profiles`, and seed the three starter items + three starter themes (matching what's in `config/Game.ts` / `config/Themes.ts` exactly — this is also the reference to restore any of them by hand if deleted):

```sql
alter table public.profiles add column if not exists equipped_theme_id uuid;

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null check (category in ('gear', 'consumable')),
  name text not null,
  icon text,
  description text,
  pricing_type text not null default 'flat' check (pricing_type in ('flat', 'scaling')),
  base_cost numeric not null default 0,
  price_multiplier numeric not null default 1,
  max_stock int,
  heal_amount numeric not null default 0,
  active boolean not null default true,
  sort_order int default 0
);
alter table public.store_items enable row level security;

create table if not exists public.store_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cost numeric not null default 0,
  is_default boolean not null default false,
  active boolean not null default true,
  colors jsonb not null,
  font_heading text not null default '''Playfair Display'', serif',
  font_body text not null default '''DM Sans'', sans-serif',
  google_font_url text,
  background_image_url text,
  background_opacity numeric not null default 0.16,
  sort_order int default 0
);
alter table public.store_themes enable row level security;
alter table public.profiles add constraint fk_equipped_theme
  foreign key (equipped_theme_id) references public.store_themes(id) on delete set null;

create table if not exists public.user_themes (
  user_id uuid references auth.users(id) on delete cascade,
  theme_id uuid references public.store_themes(id) on delete cascade,
  unlocked_at timestamptz default now(),
  primary key (user_id, theme_id)
);

-- If you already ran this migration before heal_amount existed, this
-- brings an existing store_items table up to date without re-running
-- the create table above.
alter table public.store_items add column if not exists heal_amount numeric not null default 0;

insert into public.store_items (key, category, name, icon, description, pricing_type, base_cost, price_multiplier, max_stock, heal_amount, sort_order)
values
  ('insight_lens', 'gear', 'Insight Lens', '🔍', 'Permanently unlocks the Insight lifeline in every match — see the opponent''s weak points and fallacies as you debate, as many times as you want. Buy it once; it''s yours for good.', 'flat', 50, 1, null, 0, 0),
  ('ace_card', 'consumable', 'Ace Card', '🂡', 'Reveals 3 AI-suggested responses to the opponent''s argument — pick one and use it as-is, or as a starting point. Consumed on use.', 'scaling', 2, 2, 10, 0, 1),
  ('confidence_pill', 'consumable', 'Confidence Pill', '💊', 'Restores +10 HP the moment you take it. Consumed on use.', 'flat', 5, 1, 5, 10, 2)
on conflict (key) do nothing;

insert into public.store_themes (name, description, cost, is_default, colors, font_heading, font_body, google_font_url, sort_order)
values
  ('Midnight Blue', 'The original Debatto look — free for everyone.', 0, true,
   '{"bg":"#13141a","surface":"#1c1d26","surface2":"#22232f","border":"#2e2f3e","border2":"#3a3b50","text":"#d4d4e0","muted":"#6b6b84","faint":"#2a2b38","blue":"#6b9fff","blueSoft":"rgba(107,159,255,0.12)","red":"#ff7070","redSoft":"rgba(255,112,112,0.12)","amber":"#f5a623","amberSoft":"rgba(245,166,35,0.12)","green":"#5dbb8a","greenSoft":"rgba(93,187,138,0.12)","purple":"#a78bfa","teal":"#2dd4bf"}',
   '''Playfair Display'', serif', '''DM Sans'', sans-serif', null, 0),
  ('Crimson Ember', 'Dark, high-contrast, and a little dramatic.', 300, false,
   '{"bg":"#160b0d","surface":"#221115","surface2":"#2b1418","border":"#3d1a1f","border2":"#4d2027","text":"#f2dede","muted":"#8a6b6f","faint":"#2b1418","blue":"#ff5d6c","blueSoft":"rgba(255,93,108,0.14)","red":"#ff7070","redSoft":"rgba(255,112,112,0.14)","amber":"#f5a623","amberSoft":"rgba(245,166,35,0.14)","green":"#5dbb8a","greenSoft":"rgba(93,187,138,0.14)","purple":"#c084fc","teal":"#f472b6"}',
   '''Cinzel'', serif', '''DM Sans'', sans-serif', 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap', 1),
  ('Paper Light', 'Warm parchment tones for daytime reading.', 400, false,
   '{"bg":"#f4ecd8","surface":"#fffaf0","surface2":"#f0e6cc","border":"#dcccaa","border2":"#c9b98e","text":"#2b2418","muted":"#8a7d5e","faint":"#ece1c4","blue":"#6b4f9e","blueSoft":"rgba(107,79,158,0.12)","red":"#c0392b","redSoft":"rgba(192,57,43,0.12)","amber":"#b8860b","amberSoft":"rgba(184,134,11,0.12)","green":"#3f7d54","greenSoft":"rgba(63,125,84,0.12)","purple":"#6b4f9e","teal":"#2f7a6b"}',
   '''Merriweather'', serif', '''Inter'', sans-serif', 'https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Inter:wght@400;500;600&display=swap', 2);
```

### Storage buckets

Two public buckets, each with admin/user-scoped write access:

```sql
-- debot-sprites: admin uploads only
insert into storage.buckets (id, name, public) values ('debot-sprites', 'debot-sprites', true)
  on conflict (id) do nothing;
-- (write policy should check profiles.is_admin, same pattern as above)

-- avatars: each user can only write to their own folder (avatars/{user_id}/...)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "Users can upload their own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');

-- site-assets: admin uploads only (landing page background + theme background images)
insert into storage.buckets (id, name, public) values ('site-assets', 'site-assets', true)
  on conflict (id) do nothing;

create policy "Anyone can view site assets" on storage.objects for select using (bucket_id = 'site-assets');
create policy "Admins can upload site assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admins can update site assets" on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));
```

### Player ID

`profiles.player_id` is a random, unique, immutable 9-digit identifier — **only ever assigned to logged-in accounts**, never to guests. It's generated server-side by a trigger, not the client:

```sql
alter table public.profiles add column if not exists player_id bigint;

create or replace function public.generate_player_id() returns bigint as $$
declare
  new_id bigint;
  taken boolean;
begin
  loop
    new_id := floor(random() * 900000000 + 100000000); -- always 9 digits
    select exists(select 1 from public.profiles where player_id = new_id) into taken;
    exit when not taken;
  end loop;
  return new_id;
end;
$$ language plpgsql;

create or replace function public.set_player_id() returns trigger as $$
begin
  if new.player_id is null then
    new.player_id := public.generate_player_id();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_player_id before insert on public.profiles
  for each row execute function public.set_player_id();

update public.profiles set player_id = public.generate_player_id() where player_id is null;
alter table public.profiles alter column player_id set not null;
create unique index if not exists profiles_player_id_key on public.profiles (player_id);
```

## Architecture notes

- **`contexts/GameContext.tsx`** is the single source of truth for profile, debots, topics, and admin-configurable game settings. It also owns the guest/logged-in duality: guests get local persistence (`localStorage`, via `lib/persistenceManager.ts`); logged-in users get the equivalent Supabase-backed calls. Most read paths merge both.
- **Guarded navigation**: `GameContext` exposes `requestNavigation()`, which defers any navigation action behind a confirm modal (rendered in `app/(app)/layout.tsx`) whenever `battleActive` is true. The header logo, drawer links, and the in-match Exit button all route through it. Note: the actual browser back button (hardware/gesture) **cannot** be reliably intercepted this way in a Next.js SPA — a `popstate` fires only after the URL has already changed, and any dummy-history-entry workaround fights with Next's own router. Tab close/refresh is instead covered by a native `beforeunload` prompt.
- **Debot difficulty (`diff`)** isn't just a label — `getDifficultyGuidance()` in `app/(app)/offline/page.tsx` turns it into concrete instructions injected into both the opening-argument and per-round judge prompts, so a "Beginner" debot genuinely argues weaker and gets graded more generously against, while "Expert" is the reverse.
- **Damage multiplier (`debots.multiplier`)** scales *that debot's* attack against the player. The player's damage to the opponent uses a flat, game-wide constant (`GAME_CONFIG.damage.playerMultiplier`) instead, since that shouldn't vary per-debot.
- **Judge scoring** has a client-side backstop (`isLowEffortInput()`) independent of the AI's own judgment — low-effort/gibberish input gets zero gain and max penalty locally regardless of what the model returns, since LLMs tend to grade generously by default.
- **Match reward** scales with rounds played: `opp.reward` is calibrated for `app_settings.rounds_default`, and the actual payout is `reward × (rounds played / default rounds)`.
- **Store items** are bought with debucks in `/store` and consumed/used from `contexts/GameContext.tsx`, persisted through the `user_inventory` table (or `localStorage` for guests) — same dual-mode pattern as everything else. Insight Lens is a one-time permanent unlock (the in-match "Insight" lifeline becomes unlimited-use once owned); Ace Cards and Confidence Pills are stackable consumables capped at `maxStock`. Ace Card price follows `baseCost × 2^(cards currently held)`, so it's tied to what's in inventory right now, not a running lifetime purchase count — spending them back down to 0 resets the price to base. The item catalog — including name, icon, description, price, category, stock cap, active/inactive, and Confidence Pill's heal amount — is fully admin-editable (Admin → Store → Items); only three `key`s (`insight_lens`, `ace_card`, `confidence_pill`) have actual in-match effects wired up — any other key an admin adds shows up in the Store as "Coming soon" until a developer hooks up what it does. Ace Card specifically is only debited from inventory *after* its AI call succeeds — if Groq errors or rate-limits, the player keeps their card and can just try again.
- **AI rate-limit fallback**: Groq's free tier caps tokens-per-day per model, not per account — `llama-3.3-70b-versatile` in particular has a much smaller daily budget than lighter models, so it's the one most likely to get rate-limited (HTTP 429) under real usage. `app/api/debate/route.ts` catches a 429 specifically and retries once against `ai_fallback_model` (default `llama-3.1-8b-instant`, editable in Admin → AI) before giving up — other error types (bad request, auth, etc.) aren't retried, since they'd fail identically on the fallback model too. Toggle off with `ai_fallback_enabled` if you'd rather it just fail loudly.
- **Themes** change the whole app's look — colors, fonts, and (if set) a background image — the moment they're equipped, including the pre-login landing page (since `GameProvider` wraps the whole app from the root layout down, and the local/guest theme choice persists the same way as everything else). `config/Themes.ts` defines the CSS custom properties a theme can override (all 18 vars from `Debatto.css`, plus `--font-heading`/`--font-body`) and ships 3 starter themes as a fallback if `store_themes` is empty. Buying/equipping goes through `GameContext`'s `buyTheme`/`equipTheme`, same ownership pattern as debots (`user_themes` join table, or local storage for guests). Colors and fonts are applied globally by `components/shell/ThemeApplier.tsx`, mounted once in the root layout. Background image priority is handled per-surface: `app/(app)/layout.tsx` for the app shell, `components/shell/LandingThemeBg.tsx` for the landing page — if the equipped theme has its own background image, it overrides the site-wide background configured in Admin → Settings; if not, the site-wide background (if enabled) still shows through. The theme catalog is fully admin-editable (Admin → Store → Themes), including a live preview while editing.
- **Settings flash prevention**: `roundOptions` starts empty (not a hardcoded fallback) and the Setup screen waits for `settingsLoaded` before rendering round-count buttons, so a stale default never flashes before the real admin-configured values arrive.

## Project structure

```
app/
  (app)/            # authenticated shell: layout.tsx has TopBar, RightDrawer, guarded-nav modal
    hub/            # post-landing mode-select screen
    offline/        # the main debate game loop
    store/          # Insight Lens / Ace Cards / Confidence Pills, bought with debucks
    history/        # past match log, per-round breakdown
    settings/       # account (sign in/out), guest data reset
    profile/        # avatar, name, bio, stats
    admin/          # debot/topic/settings management (admin-only)
    online/random/  # stub — random matchmaking, schema ready
    online/friends/ # stub — friends/challenge flow, schema ready
    learning/       # stub — fallacy/technique docs, not started
  api/debate/        # server route that calls Groq, reading model config from app_settings
components/
  admin/             # AdminPanel.tsx — debot CRUD, topics, global settings
  arena/             # DebotStage.tsx — debot selection grid + hexagon shape rendering
  game/              # InputPanel, DialogueBox
  shell/             # TopBar, RightDrawer, ConfirmModal
  ui/                # PlayerSprite, DebotSprite, HPBar, AdvBar, DebucksIcon
config/              # Game.ts (economy/damage/scoring/store constants), AI.ts (Groq defaults), Themes.ts (starter themes + font presets)
contexts/            # GameContext.tsx
lib/                 # ai.ts (callAI), persistenceManager.ts (guest/local + Supabase persistence)
```

### Fixing the debots.id default

Unlike `store_items`/`store_themes`, the `debots` table's `id` column is a plain not-null integer with no auto-generating default — that's why creating a debot from the admin panel used to fail with `null value in column "id" violates not-null constraint`. The app now works around this by computing "one past the current highest id" client-side before inserting (see `withNextDebotId` in `AdminPanel.tsx`), so debot creation works without touching the database. If you'd rather fix it properly at the DB level instead:

```sql
alter table public.debots alter column id add generated by default as identity;
-- Existing debots weren't inserted through that sequence, so bump it past
-- the current max id or the next insert (from either path above) collides:
select setval(pg_get_serial_sequence('public.debots', 'id'), (select max(id) from public.debots));
```

## Known limitations

- Browser back-button interception mid-match isn't reliable (see architecture notes above) — use the in-app Exit button, drawer, or header logo instead, all of which are guarded.
- Online multiplayer (both random matchmaking and challenging friends) and Learning are stubs — the underlying database schema is already in place for online, but there's no queue/matchmaking UI, Realtime subscription, or live two-human battle screen yet.
- Admin can add store items with any `key`, but only `insight_lens`, `ace_card`, and `confidence_pill` do anything in a match — a new key needs actual game-logic hooked up by a developer before it's more than cosmetic.
