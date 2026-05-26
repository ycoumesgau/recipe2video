-- Recipe numbers are optional; uniqueness applies only among active rows that have one.
drop index if exists public.videos_recipe_number_active_key;

alter table public.videos
  alter column recipe_number drop not null;

create unique index videos_recipe_number_active_key
  on public.videos (recipe_number)
  where archived_at is null and recipe_number is not null;

update public.videos
set recipe_number = null;

update public.videos
set recipe_number = 2
where id = '4c1053b6-ecfd-4af3-89f2-f866aa2a295b';

update public.videos
set recipe_number = 3
where id = 'f4d7b0c1-f107-4596-8a53-880386af5c18';

update public.videos
set recipe_number = 4
where id = '3dd86fd1-8ddf-442a-b123-635b5eee5037';

update public.videos
set recipe_number = 5
where id = '677addd8-9597-46f7-906b-79d4817f9e83';

update public.videos
set recipe_number = 6
where id = 'f3e5a9b8-dbc2-4131-9946-9292b128b6f4';

update public.videos
set recipe_number = 7
where id = 'abf433ea-5abb-4586-b0f5-0d8e6020cfee';

update public.videos
set recipe_number = 8
where id = '05ea0559-21c9-487c-9bf7-415090f9a5a4';

update public.videos
set recipe_number = 9
where id = 'ef42a802-3cbc-489d-96ad-c9631ed08c78';

update public.videos
set recipe_number = 10
where id = 'ffd1df51-dbd1-4599-b492-fbeb4558e782';

update public.videos
set recipe_number = 11
where id = '5e846a3d-92ea-4607-8bfc-91f26b88291e';
