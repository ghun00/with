-- 0014_slack_signup_notification.sql
-- 회원가입(auth.users INSERT) 시 Slack으로 알림 전송

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  display_name text;
  webhook_url text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'preferred_username',
    ''
  );

  insert into public.profiles (id, name, avatar_url)
  values (new.id, display_name, new.raw_user_meta_data ->> 'avatar_url');

  begin
    select decrypted_secret into webhook_url
    from vault.decrypted_secrets
    where name = 'slack_signup_webhook_url';

    if webhook_url is not null then
      perform net.http_post(
        url := webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'text', format(
            '🎉 새 회원가입: %s (%s)',
            nullif(display_name, ''),
            to_char(now(), 'YYYY-MM-DD HH24:MI')
          )
        )
      );
    end if;
  exception when others then
    raise warning 'Slack signup notification failed: %', sqlerrm;
  end;

  return new;
end;
$$;
