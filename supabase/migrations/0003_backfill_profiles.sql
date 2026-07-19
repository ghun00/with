-- 프로필 트리거 생성 이전에 가입한 사용자의 profiles 행 백필
insert into public.profiles (id, name, avatar_url)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'nickname',
    u.raw_user_meta_data ->> 'preferred_username',
    ''
  ),
  coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
