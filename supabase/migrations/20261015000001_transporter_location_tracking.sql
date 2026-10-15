-- ============================================================================
-- Migration: 20261015000001_transporter_location_tracking.sql
-- Description: Smallest secure transporter live location tracking infrastructure
-- with Row-Level Security and Supabase Realtime publication.
-- Restricts location updates and reads strictly to authorized participants
-- (assigned transporter, requester/customer, verified admin) during active deliveries.
-- ============================================================================

-- 1. Transporter Locations Table
create table if not exists public.transporter_locations (
  delivery_id uuid primary key references public.delivery_requests(id) on delete cascade,
  transporter_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision default null,
  speed double precision default null,
  updated_at timestamptz not null default now()
);

-- Index for lookup by transporter
create index if not exists idx_transporter_locations_transporter on public.transporter_locations (transporter_id);

-- Enable RLS
alter table public.transporter_locations enable row level security;

-- 2. Row Level Security Policies

-- Drop existing policies if re-run
drop policy if exists "Authorized delivery participants can view transporter location" on public.transporter_locations;
drop policy if exists "Transporter can upsert location for their active in_transit delivery" on public.transporter_locations;

-- SELECT policy: Assigned transporter, delivery requester, or verified admin can read coordinates,
-- only while the delivery request is active ('matched' or 'in_transit').
create policy "Authorized delivery participants can view transporter location"
  on public.transporter_locations
  for select
  to authenticated
  using (
    public.is_admin()
    or auth.uid() = transporter_id
    or exists (
      select 1 from public.delivery_requests dr
      where dr.id = transporter_locations.delivery_id
        and dr.requester_id = auth.uid()
        and dr.status in ('matched', 'in_transit')
    )
  );

-- INSERT / UPDATE / ALL policy: Only the assigned transporter can write coordinates
-- for a delivery that is currently active ('matched' or 'in_transit').
create policy "Transporter can upsert location for their active in_transit delivery"
  on public.transporter_locations
  for all
  to authenticated
  using (
    auth.uid() = transporter_id
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id = transporter_locations.delivery_id
        and dr.transporter_id = auth.uid()
        and dr.status in ('matched', 'in_transit')
    )
  )
  with check (
    auth.uid() = transporter_id
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id = transporter_locations.delivery_id
        and dr.transporter_id = auth.uid()
        and dr.status in ('matched', 'in_transit')
    )
  );

-- Revoke all permissions from anon & public
revoke all on public.transporter_locations from anon, public;
grant select, insert, update on public.transporter_locations to authenticated;

-- 3. Dedicated Atomic Location Update RPC
create or replace function public.update_transporter_location(
  p_delivery_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_heading double precision default null,
  p_speed double precision default null
)
returns jsonb as $$
declare
  v_request record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  -- Validate coordinate bounds
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates: latitude must be in [-90, 90] and longitude in [-180, 180].';
  end if;

  select * into v_request
  from public.delivery_requests
  where id = p_delivery_id;

  if not found then
    raise exception 'Delivery request not found.';
  end if;

  if v_request.transporter_id <> auth.uid() then
    raise exception 'Unauthorized: Only the assigned transporter can update location.';
  end if;

  if v_request.status not in ('matched', 'in_transit') then
    raise exception 'Cannot report location for delivery in status %.', v_request.status;
  end if;

  insert into public.transporter_locations (
    delivery_id,
    transporter_id,
    latitude,
    longitude,
    heading,
    speed,
    updated_at
  ) values (
    p_delivery_id,
    auth.uid(),
    p_latitude,
    p_longitude,
    p_heading,
    p_speed,
    now()
  )
  on conflict (delivery_id) do update
  set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    heading = excluded.heading,
    speed = excluded.speed,
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'updated_at', now()
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.update_transporter_location(uuid, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_transporter_location(uuid, double precision, double precision, double precision, double precision) to authenticated;

-- 4. Supabase Realtime Publication Setup
alter table public.transporter_locations replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Check if table is already in publication before adding
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' 
        and schemaname = 'public' 
        and tablename = 'transporter_locations'
    ) then
      alter publication supabase_realtime add table public.transporter_locations;
    end if;
  end if;
end $$;
