# 회원가입 Slack 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 OAuth로 새 계정이 생성될 때마다(`auth.users` INSERT) Slack 채널에 가입 알림을 보낸다.

**Architecture:** 기존 `handle_new_user()` 트리거 함수(`0001_init.sql`)를 새 마이그레이션에서 `create or replace`로 확장한다. `pg_net` extension으로 비동기 HTTP POST를 Slack Incoming Webhook에 보내고, Webhook URL은 Supabase Vault에 암호화 저장한다. Slack 호출 실패는 `EXCEPTION WHEN OTHERS`로 삼켜 회원가입 자체를 절대 막지 않는다.

**Tech Stack:** PostgreSQL (Supabase), `pg_net` extension, Supabase Vault. 새 TypeScript/프론트 코드는 없음 — 순수 DB 마이그레이션.

## Global Constraints

- 마이그레이션은 `supabase/migrations/`에 새 번호 파일로 추가한다 (기존 파일 수정 금지) — 다음 번호는 `0014`.
- Slack Webhook URL은 어떤 git 추적 파일에도 절대 기록하지 않는다 — Supabase Vault에만 저장.
- Slack 호출 실패가 회원가입(프로필 생성)을 실패시켜서는 안 된다.
- 이 프로젝트는 자동화된 테스트/린트가 없다(`npm run build`의 타입체크만 자동 검증 가능하며, 이 작업은 SQL만 변경하므로 그마저 해당 없음). 검증은 Supabase SQL Editor에서 수동으로 진행한다.

---

### Task 1: 마이그레이션 파일 작성

**Files:**
- Create: `supabase/migrations/0014_slack_signup_notification.sql`

**Interfaces:**
- Consumes: 기존 `public.handle_new_user()` 함수 시그니처(`0001_init.sql:14-33`, `returns trigger`, `on_auth_user_created` 트리거가 호출)를 그대로 유지하며 body만 확장
- Produces: 없음 (터미널 태스크 — 이후 Task가 이 파일의 SQL을 그대로 실행함)

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
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
```

- [ ] **Step 2: 내용 재검토**

파일을 다시 읽어 다음을 확인한다 (로컬 Postgres가 없는 프로젝트라 자동 실행 검증은 Task 2에서 실제 Supabase 인스턴스에 대해 수행):
- `insert into public.profiles (...)`의 컬럼/값이 원본 `0001_init.sql`의 `handle_new_user()`와 동일한 3개 필드(`id`, `name`, `avatar_url`)를 채우는지
- `exception when others`가 Slack 호출 블록만 감싸고 있어, profiles insert 자체의 실패는 여전히 트랜잭션을 롤백시키는지 (의도된 동작 — profiles insert 실패는 여전히 알아야 할 오류)
- 문자열 리터럴에 이스케이프되지 않은 따옴표가 없는지

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0014_slack_signup_notification.sql
git commit -m "feat(auth): 회원가입 시 Slack 알림 전송"
```

---

### Task 2: Vault 시크릿 등록 + 마이그레이션 적용 + 실동작 검증

**Files:**
- 없음 (Supabase SQL Editor에서 직접 실행하는 운영 단계 — 이 태스크에서 생성/수정하는 git 파일 없음)

**Interfaces:**
- Consumes: Task 1에서 작성한 `supabase/migrations/0014_slack_signup_notification.sql`의 전체 SQL
- Produces: 없음 (최종 검증 태스크)

- [ ] **Step 1: Supabase SQL Editor에서 마이그레이션 적용**

Supabase 대시보드 → SQL Editor에서 `supabase/migrations/0014_slack_signup_notification.sql`의 전체 내용을 그대로 실행한다. 에러 없이 완료되어야 한다 (특히 `pg_net` extension이 프로젝트에서 사용 가능한지 확인 — Supabase 호스팅 프로젝트는 기본 제공).

- [ ] **Step 2: Vault에 Slack Webhook URL 등록**

같은 SQL Editor에서 아래를 실행한다. **`<SLACK_INCOMING_WEBHOOK_URL>` 자리에는 실제 Webhook URL을 채워 넣되, 이 SQL이나 URL을 어떤 파일에도 저장하지 말고 SQL Editor에만 붙여넣어 바로 실행한다** (이 대화에서 이미 URL을 전달받았다면 그 값을 사용):

```sql
select vault.create_secret(
  '<SLACK_INCOMING_WEBHOOK_URL>',
  'slack_signup_webhook_url',
  'Slack incoming webhook for new signup notifications'
);
```

실행 후 아래로 등록 여부만 확인한다(값 자체는 노출되지 않음):

```sql
select name, description, created_at
from vault.secrets
where name = 'slack_signup_webhook_url';
```

1개 행이 조회되어야 한다.

- [ ] **Step 3: 가입 알림이 실제로 오는지 검증**

테스트 가능한 카카오 계정으로 앱에 접속해 실제로 회원가입(최초 로그인)을 수행한다. 다음을 확인한다:
- Slack 채널에 `🎉 새 회원가입: <이름> (<YYYY-MM-DD HH:MM>)` 형식의 메시지가 도착하는가
- 가입 플로우 자체(프로필 생성 → 온보딩 진입)가 정상 동작하는가 — Slack 호출이 가입을 막지 않아야 함

- [ ] **Step 4: 알림 실패가 가입을 막지 않는지 확인 (회귀 방지 검증)**

```sql
delete from vault.secrets where name = 'slack_signup_webhook_url';
```

시크릿을 삭제한 상태에서 새 테스트 계정으로 다시 가입을 시도한다 — Slack 알림 없이도 프로필 생성과 온보딩 진입이 정상적으로 완료되어야 한다. 확인 후 Step 2의 `vault.create_secret` 호출을 다시 실행해 시크릿을 복구한다.

- [ ] **Step 5: 완료 보고**

Task 1의 커밋 해시와 함께, 위 검증 결과(알림 도착 여부, 시크릿 부재 시 가입 정상 여부)를 사용자에게 요약 보고한다. 이 태스크는 git 커밋을 생성하지 않는다(운영 단계이므로).

---

## Self-Review Notes

- **Spec coverage:** 목표(가입 시 Slack 알림) — Task 1. Vault 저장 — Task 1(함수) + Task 2 Step 2. pg_net 사용 — Task 1. 에러 처리(가입 자체는 막지 않음) — Task 1(exception 블록) + Task 2 Step 4로 실동작 검증. 메시지 포맷(이름+시각, 이메일 제외) — Task 1 코드에 반영. 시크릿을 git에 커밋하지 않음 — Task 2 Step 2에 명시. 범위 밖(Edge Function 방식, 그룹 초대 알림)은 이 계획에 포함하지 않음 — 스펙과 일치.
- **Placeholder scan:** `<SLACK_INCOMING_WEBHOOK_URL>`만 유일한 placeholder이며, 이는 의도적 — 실제 값을 git에 커밋하지 않기 위한 설계이지 미완성 계획이 아니다. 그 외 모든 스텝은 완전한 코드/명령을 포함한다.
- **Type consistency:** `handle_new_user()`의 반환 타입(`trigger`)과 트리거 바인딩(`on_auth_user_created`)은 원본과 동일하게 유지되어 변경 없음. 새로 도입한 로컬 변수(`display_name`, `webhook_url`)는 Task 1 내에서만 쓰이고 다른 태스크가 참조하지 않으므로 시그니처 불일치 위험 없음.
