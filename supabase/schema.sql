-- =====================================================================
-- Four tables.
--
--   location    where the equipment lives, and when the doors open
--   asset       the equipment itself -- the source of truth for trade
--   work_order  CURRENT STATE of one request
--   event       TRUTH. append-only. every state change, replayable.
--
-- The split between work_order and event is the whole argument for a
-- relational store over a JSON blob. When a system dispatches a
-- technician who bills for the trip, "what did we know, and when did we
-- know it" has to be answerable after the fact.
--
-- CHECK lists below mirror lib/llm/vocab.ts. vocab.ts is the source of
-- truth; these are defense in depth. Drift fails loudly at insert time,
-- which is the point of having them at all.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- location
-- ---------------------------------------------------------------------
create table if not exists location (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null,
  timezone    text not null,                 -- IANA, e.g. America/New_York
  opens_at    time not null,
  closes_at   time not null,
  created_at  timestamptz not null default now()
);

comment on column location.opens_at is
  'Authoritative for respond_by. A manager saying "we open at 11" is a hint; this column decides.';

-- ---------------------------------------------------------------------
-- asset
-- ---------------------------------------------------------------------
create table if not exists asset (
  id                   uuid primary key default gen_random_uuid(),
  location_id          uuid not null references location(id) on delete cascade,
  trade                text not null,
  type                 text not null,        -- keys the parts catalog
  label                text not null,
  aliases              text[] not null default '{}',
  make                 text,
  model                text,
  serial               text,
  installed_on         date,
  warranty_expires_on  date,
  refrigerant_type     text,
  created_at           timestamptz not null default now()
);

comment on column asset.trade is
  'Authoritative. When the model proposes a different trade, the record wins and the disagreement is logged as a trade_disagreement event.';
comment on column asset.aliases is
  'What people actually call this thing. Load-bearing: seeded scenarios work because we wrote them, real managers type "the big cooler".';
comment on column asset.refrigerant_type is
  'Why the walk-in/reach-in question has real delta: R-404A vs R-134a is a different truck load.';

create index if not exists asset_location_idx on asset (location_id);
create index if not exists asset_aliases_idx  on asset using gin (aliases);

-- ---------------------------------------------------------------------
-- work_order  -- current state
-- ---------------------------------------------------------------------
create table if not exists work_order (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references location(id),
  asset_id           uuid references asset(id),          -- null = unresolved, a designed outcome
  raw_intake_text    text not null,
  trade              text,
  urgency_tier       text check (urgency_tier in ('P1','P2','P3','P4')),
  urgency_rationale  text,                               -- code-generated template, never model prose
  respond_by         timestamptz,
  business_impact    text,                               -- model prose. nothing reads this.
  symptom_codes      text[] not null default '{}',
  suspected_causes   jsonb  not null default '[]'::jsonb, -- model prose. nothing reads this.
  recommended_parts  jsonb  not null default '[]'::jsonb,
  assumptions        jsonb  not null default '[]'::jsonb,
  status             text not null check (status in (
                       'dispatchable',
                       'dispatchable_with_assumption',
                       'needs_human',
                       'out_of_scope')),
  confidence         numeric(3,2) check (confidence between 0 and 1),
  model_version      text,
  prompt_version     text,
  created_at         timestamptz not null default now()
);

comment on column work_order.urgency_rationale is
  'Filled from the rule that fired. If a model wrote this it could contradict the tier the code computed -- and this is the line a dispatcher actually reads.';
comment on column work_order.asset_id is
  'Nullable on purpose. "No asset matched" renders as a stated assumption, not an empty field.';

create index if not exists work_order_location_idx on work_order (location_id, created_at desc);

-- ---------------------------------------------------------------------
-- event  -- truth, append-only
-- ---------------------------------------------------------------------
create table if not exists event (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references work_order(id) on delete cascade,
  type           text not null check (type in (
                   'intake_received',
                   'classified',
                   'question_asked',
                   'answer_received',
                   'reclassified',
                   'escalated',
                   'trade_disagreement')),
  actor          text not null check (actor in ('manager','system','model')),
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists event_wo_idx on event (work_order_id, created_at);

-- Append-only enforced by the database, not by convention. Application code
-- can be refactored into doing the wrong thing; a trigger cannot.
create or replace function event_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'event is append-only: % is not permitted on this table', tg_op;
end;
$$;

drop trigger if exists event_no_update on event;
create trigger event_no_update before update on event
  for each row execute function event_append_only();

drop trigger if exists event_no_delete on event;
create trigger event_no_delete before delete on event
  for each row execute function event_append_only();

-- To reset demo data, the append-only trigger has to come off first:
--   alter table event disable trigger event_no_delete;
--   delete from event; delete from work_order;
--   alter table event enable trigger event_no_delete;
