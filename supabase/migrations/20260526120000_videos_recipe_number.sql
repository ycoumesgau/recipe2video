alter table public.videos
  add column recipe_number integer;

comment on column public.videos.recipe_number is
  'Stable incremental recipe index shown in the dashboard, overview, and breadcrumbs.';

with numbered as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as num
  from public.videos
)
update public.videos v
set recipe_number = numbered.num
from numbered
where v.id = numbered.id;

alter table public.videos
  alter column recipe_number set not null;

create unique index videos_recipe_number_key on public.videos (recipe_number);
