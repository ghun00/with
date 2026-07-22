# 회원가입 Slack 알림 설계안

## 목표

새 회원이 가입(카카오 OAuth 최초 로그인 → `auth.users` 행 생성)할 때마다 지정된 Slack 채널로 알림을 보낸다.

## 배경

가입 시 자동 프로필 생성은 이미 `0001_init.sql`의 `handle_new_user()` 트리거 함수가 담당한다 — `auth.users`에 INSERT가 일어날 때마다 실행되어 `public.profiles`에 행을 만든다(카카오 메타데이터에서 이름/아바타를 뽑아옴). 이 트리거가 "회원가입" 이벤트의 유일하고 확실한 지점이므로, 여기에 Slack 알림 호출을 추가한다.

그룹 초대 수락(기존 회원이 새 그룹에 합류)은 `auth.users` INSERT를 일으키지 않으므로 알림 대상이 아니다 — 이 트리거는 순수하게 "신규 계정 생성"에만 반응한다.

## 아키텍처

**기존 `handle_new_user()` 함수를 확장**한다. 새 Edge Function이나 Database Webhook은 만들지 않는다.

1. **`pg_net` extension** 활성화 — Supabase Postgres에서 비동기 HTTP 요청을 보내는 표준 확장. DB 트랜잭션을 막지 않고 큐에 넣고 바로 반환한다.
2. **Slack Webhook URL은 Supabase Vault에 암호화 저장**한다(`vault.create_secret`) — 마이그레이션 파일(git에 커밋됨)에는 URL을 절대 넣지 않는다. 트리거 함수는 `vault.decrypted_secrets` 뷰에서 이름으로 조회해 사용한다.
3. 프로필 insert 이후, Vault에서 조회한 URL로 `net.http_post()`를 호출해 Slack에 메시지를 보낸다.
4. **Slack 호출은 `BEGIN ... EXCEPTION WHEN OTHERS`로 감싸 실패를 삼킨다** — Vault 시크릿이 아직 등록되지 않았거나 Slack이 일시적으로 응답하지 않아도 회원가입(프로필 생성) 자체는 절대 실패하지 않아야 한다. 이 프로젝트의 `logActivity()` fire-and-forget 패턴(활동 로그 실패가 본 작업을 막지 않음)과 동일한 원칙이다.

## 메시지 내용

- 이름: `profiles.name`과 동일한 소스(`raw_user_meta_data`의 `name`/`full_name`/`preferred_username`)에서 추출, 없으면 "(이름 없음)"
- 가입 시각: `now()` (한국 시간 표기, `YYYY-MM-DD HH24:MI` 포맷)
- 이메일은 포함하지 않음 — 카카오 OAuth는 이메일 scope를 항상 제공하지 않아 신뢰할 수 없는 필드이므로 제외

예시: `🎉 새 회원가입: 홍길동 (2026-07-23 14:32)`

## 구현 스케치

새 마이그레이션 `0014_slack_signup_notification.sql`:

```sql
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
```

## 시크릿 등록 (마이그레이션과 별개, 1회성 수동 단계)

Webhook URL은 마이그레이션 파일에 넣지 않으므로, Supabase SQL Editor에서 아래를 **1회** 직접 실행해 Vault에 등록한다(이 SQL 자체도 git에 커밋하지 않는다):

```sql
select vault.create_secret(
  '<SLACK_INCOMING_WEBHOOK_URL>',
  'slack_signup_webhook_url',
  'Slack incoming webhook for new signup notifications'
);
```

사용자가 이미 실제 Webhook URL을 대화 중 제공했으므로, 구현 단계에서 Supabase 접근 권한이 있다면 이 등록을 대신 실행하는 것을 제안하고, 없다면 사용자가 직접 SQL Editor에서 실행하도록 안내한다.

## 에러 처리

- Vault에 시크릿이 없는 상태(등록 전) → `webhook_url`이 null → 호출 자체를 건너뜀, 경고 없음, 가입은 정상 진행
- `pg_net` extension 미설치, Slack 응답 오류, 네트워크 실패 등 → `EXCEPTION WHEN OTHERS`로 삼켜지고 `RAISE WARNING`으로 Postgres 로그에만 남음, 가입 트랜잭션은 커밋됨

## 테스트 방법

자동화 테스트 스크립트가 없는 프로젝트이므로(빌드의 타입체크만 자동 검증), 수동 검증한다:
1. 마이그레이션 적용 + Vault 시크릿 등록
2. 새 카카오 계정(또는 테스트 가능한 계정)으로 실제 로그인해 회원가입 플로우 실행
3. Slack 채널에 알림이 도착하는지 확인
4. (선택) Vault 시크릿 등록 전 상태에서도 가입 자체가 정상 완료되는지 확인 — 알림 실패가 가입을 막지 않음을 검증

## 범위 밖

- Edge Function 기반 방식(더 복잡한 로직/템플릿이 필요해지면 고려)
- 이메일 포함 (신뢰 불가능한 필드)
- 그룹 초대 수락, 재로그인 등 "가입" 이외 이벤트에 대한 알림
