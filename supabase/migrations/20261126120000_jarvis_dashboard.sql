create table if not exists public.jarvis_dashboard_memberships (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  role text not null check (role in ('owner', 'admin', 'moderator', 'member')),
  created_at timestamptz not null default now(),
  primary key (auth_user_id, guild_id),
  unique (guild_id, discord_user_id)
);

create table if not exists public.jarvis_command_logs (
  trace_id text primary key check (length(trace_id) between 1 and 100),
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  command_name text not null check (length(command_name) between 1 and 64),
  status text not null check (status in ('completed', 'error')),
  duration_ms integer not null check (duration_ms >= 0),
  occurred_at timestamptz not null default now()
);

create index if not exists jarvis_command_logs_guild_time_idx
  on public.jarvis_command_logs (guild_id, occurred_at desc);

create table if not exists public.jarvis_user_levels (
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 0 check (level between 0 and 1000),
  total_xp bigint not null default 0 check (total_xp >= 0),
  last_message_ms bigint not null default 0 check (last_message_ms >= 0),
  synced_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create index if not exists jarvis_user_levels_leaderboard_idx
  on public.jarvis_user_levels (guild_id, level desc, total_xp desc);

create table if not exists public.jarvis_memories (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  scope text not null check (scope in ('user', 'guild')),
  subject_user_id text check (subject_user_id is null or subject_user_id ~ '^[0-9]{17,20}$'),
  content text not null check (length(content) between 1 and 4000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'guild' and subject_user_id is null)
    or (scope = 'user' and subject_user_id is not null)
  )
);

create index if not exists jarvis_memories_guild_scope_idx
  on public.jarvis_memories (guild_id, scope, created_at desc);

create index if not exists jarvis_memories_user_idx
  on public.jarvis_memories (guild_id, subject_user_id, created_at desc)
  where scope = 'user';

create table if not exists public.jarvis_control_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  action text not null check (action = 'set_level'),
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  target_user_id text not null check (target_user_id ~ '^[0-9]{17,20}$'),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'level'
    and case
      when (payload ->> 'level') ~ '^[0-9]{1,4}$'
        then (payload ->> 'level')::integer between 0 and 1000
      else false
    end
  ),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'rejected', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz
);

create index if not exists jarvis_control_requests_pending_idx
  on public.jarvis_control_requests (created_at)
  where status = 'pending';

create or replace function public.jarvis_has_guild_role(
  target_guild_id text,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.jarvis_dashboard_memberships membership
    where membership.auth_user_id = (select auth.uid())
      and membership.guild_id = target_guild_id
      and membership.role = any (allowed_roles)
  );
$$;

create or replace function public.jarvis_linked_discord_user(target_guild_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select membership.discord_user_id
  from public.jarvis_dashboard_memberships membership
  where membership.auth_user_id = (select auth.uid())
    and membership.guild_id = target_guild_id
  limit 1;
$$;

revoke all on function public.jarvis_has_guild_role(text, text[]) from public, anon;
revoke all on function public.jarvis_linked_discord_user(text) from public, anon;
grant execute on function public.jarvis_has_guild_role(text, text[]) to authenticated, service_role;
grant execute on function public.jarvis_linked_discord_user(text) to authenticated, service_role;

alter table public.jarvis_dashboard_memberships enable row level security;
alter table public.jarvis_command_logs enable row level security;
alter table public.jarvis_user_levels enable row level security;
alter table public.jarvis_memories enable row level security;
alter table public.jarvis_control_requests enable row level security;

create policy "dashboard users see their memberships"
  on public.jarvis_dashboard_memberships
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.jarvis_has_guild_role(guild_id, array['owner']::text[])
  );

create policy "staff read command logs"
  on public.jarvis_command_logs
  for select to authenticated
  using (
    public.jarvis_has_guild_role(guild_id, array['owner', 'admin', 'moderator']::text[])
  );

create policy "users read own level and staff read guild levels"
  on public.jarvis_user_levels
  for select to authenticated
  using (
    user_id = public.jarvis_linked_discord_user(guild_id)
    or public.jarvis_has_guild_role(guild_id, array['owner', 'admin', 'moderator']::text[])
  );

create policy "users and staff read scoped memories"
  on public.jarvis_memories
  for select to authenticated
  using (
    (
      scope = 'guild'
      and public.jarvis_has_guild_role(
        guild_id,
        array['owner', 'admin', 'moderator', 'member']::text[]
      )
    )
    or (
      scope = 'user'
      and (
        subject_user_id = public.jarvis_linked_discord_user(guild_id)
        or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
      )
    )
  );

create policy "users and admins create scoped memories"
  on public.jarvis_memories
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        scope = 'user'
        and (
          subject_user_id = public.jarvis_linked_discord_user(guild_id)
          or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
        )
      )
      or (
        scope = 'guild'
        and public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
      )
    )
  );

create policy "users and admins update scoped memories"
  on public.jarvis_memories
  for update to authenticated
  using (
    (
      scope = 'user'
      and subject_user_id = public.jarvis_linked_discord_user(guild_id)
    )
    or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
  )
  with check (
    (
      scope = 'user'
      and subject_user_id = public.jarvis_linked_discord_user(guild_id)
    )
    or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
  );

create policy "users and admins delete scoped memories"
  on public.jarvis_memories
  for delete to authenticated
  using (
    (
      scope = 'user'
      and subject_user_id = public.jarvis_linked_discord_user(guild_id)
    )
    or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
  );

create policy "users submit authorized level changes"
  on public.jarvis_control_requests
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'pending'
    and public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
    and target_user_id <> public.jarvis_linked_discord_user(guild_id)
  );

create policy "users view their requests and staff view guild requests"
  on public.jarvis_control_requests
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or public.jarvis_has_guild_role(guild_id, array['owner', 'admin']::text[])
  );

revoke all on public.jarvis_dashboard_memberships,
  public.jarvis_command_logs,
  public.jarvis_user_levels,
  public.jarvis_memories,
  public.jarvis_control_requests
from anon, authenticated;

grant select on public.jarvis_dashboard_memberships to authenticated;
grant select on public.jarvis_command_logs, public.jarvis_user_levels to authenticated;
grant select, insert, delete on public.jarvis_memories to authenticated;
grant update (scope, subject_user_id, content, updated_at)
  on public.jarvis_memories to authenticated;
grant select on public.jarvis_control_requests to authenticated;
grant insert (action, guild_id, target_user_id, payload)
  on public.jarvis_control_requests to authenticated;
grant all on public.jarvis_dashboard_memberships,
  public.jarvis_command_logs,
  public.jarvis_user_levels,
  public.jarvis_memories,
  public.jarvis_control_requests
to service_role;
