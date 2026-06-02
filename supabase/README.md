# Supabase Schema

`migrations/001_init.sql`을 Supabase Dashboard의 SQL Editor에서 실행하세요.

생성 항목:

- `profiles`
- `seasons`
- `game_sessions`
- `participants`
- `missions`
- `mission_completions`
- `score_log`
- `coin_log`
- `notifications`
- `manittos`
- 기본 index
- 최소 RLS policy
- `add_coins_and_pending_score` RPC

관리자 계정 설정:

1. 앱에서 회원가입합니다.
2. Supabase SQL Editor에서 해당 계정의 `profiles.is_admin`을 `true`로 바꿉니다.

```sql
update public.profiles
set is_admin = true
where id = '사용자 UUID';
```

또는 `.env.local`의 `ADMIN_EMAILS`에 관리자 이메일을 추가합니다.
