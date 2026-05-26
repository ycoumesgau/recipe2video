-- Recipe numbers are unique and meaningful only among active (non-archived) projects.
drop index if exists public.videos_recipe_number_key;

create unique index videos_recipe_number_active_key
  on public.videos (recipe_number)
  where archived_at is null;

with numbered as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as num
  from public.videos
  where archived_at is null
)
update public.videos v
set recipe_number = numbered.num
from numbered
where v.id = numbered.id;
