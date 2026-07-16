# Debatto

An AI-powered debate game. Pick a debot (an AI opponent with its own personality, difficulty, and argument style), pick a side of a topic, and go head-to-head across a set number of rounds. Each round, an LLM judges your argument, scores it, and fires back in character — HP and points move accordingly until one side wins.

Built with Next.js 15 (App Router), TypeScript, Tailwind, and Supabase (Postgres + Auth + Storage). AI calls run through Groq (Llama 3.3 70B).

## Status

| Mode | Status |
|---|---|
| **Debots** (`/offline`) | Playable — full loop: select debot, pick topic, debate, score, unlock rewards |
| **Profile** (`/profile`) | Playable — avatar, name, bio, stats, read-only Player ID for logged-in users |
| **Admin** (`/admin`) | Playable (admin-only) — manage debots, topics, and game settings |
| **Online** (`/online`) | Not built yet |
| **Learning** (`/learning`) | Not built yet |
| **Store** (`/store`) | Not built yet — schema exists, no UI |

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS**
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
- `topics` — debate topics: `title`/`text`, `category`/`cat`, `is_system` (seeded topics vs. user-submitted), `user_id`
- `pinned_topics` — per-user topic pins: `user_id`, `topic_id`
- `hidden_topics` — per-user topic removals (used when a user "deletes" a system topic — it's hidden for them, not removed globally): `user_id`, `topic_id`
- `app_settings` — key/value config the admin panel edits at runtime: `rounds_options`, `rounds_default`, `debot_vertices`, `debucks_cheat_enabled`, `ai_model`, `ai_max_tokens`, `ai_temperature`, `landing_bg_url` (public URL of the landing page's background image, shown at low opacity behind the logo; empty/absent means no background image)

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

-- site-assets: admin uploads only (currently just the landing page background)
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
- **Settings flash prevention**: `roundOptions` starts empty (not a hardcoded fallback) and the Setup screen waits for `settingsLoaded` before rendering round-count buttons, so a stale default never flashes before the real admin-configured values arrive.

## Project structure

```
app/
  (app)/            # authenticated shell: layout.tsx has TopBar, RightDrawer, guarded-nav modal
    offline/        # the main debate game loop
    profile/        # avatar, name, bio, stats
    admin/           # debot/topic/settings management (admin-only)
    hub/ history/ settings/ store/ online/ learning/
  api/debate/        # server route that calls Groq, reading model config from app_settings
components/
  admin/             # AdminPanel.tsx — debot CRUD, topics, global settings
  arena/             # DebotStage.tsx — debot selection grid + hexagon shape rendering
  game/              # InputPanel, DialogueBox
  shell/             # TopBar, RightDrawer, ConfirmModal
  ui/                # PlayerSprite, DebotSprite, HPBar, AdvBar, DebucksIcon
config/              # Game.ts (economy/damage/scoring constants), AI.ts (Groq defaults)
contexts/            # GameContext.tsx
lib/                 # ai.ts (callAI), persistenceManager.ts (guest/local + Supabase persistence)
```

## Known limitations

- Browser back-button interception mid-match isn't reliable (see architecture notes above) — use the in-app Exit button, drawer, or header logo instead, all of which are guarded.
- Online multiplayer, Learning, and Store are stubs.
