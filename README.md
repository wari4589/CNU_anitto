# ANITTO

ANA 마니또 게임을 위한 Next.js 기반 웹앱입니다.

기존 정적 HTML/JS 버전을 Next.js App Router 구조로 옮기고, 관리자 인증과 보안 헤더를 서버 중심으로 정리했습니다.

이 프로젝트의 Next.js 전환, 보안 정리, README 작성에는 OpenAI Codex를 개발 보조 도구로 활용했습니다.

## 주요 기능

- 일반 사용자 로그인/회원가입
- 마니또 게임 세션 참여
- 미션 목록 확인 및 완료 처리
- 랭킹/알림 UI
- 관리자 패널
- Supabase 기반 인증/DB 연동

## 사용처 및 사용 흐름

이 앱은 소규모 커뮤니티, 동아리, 학과 행사, 사내 이벤트 등에서 마니또 게임을 운영하기 위한 웹 서비스입니다.

예상 사용 흐름:

- 참가자는 계정을 만들고 게임 세션에 참여합니다.
- 참가자는 미션을 수행하고 점수와 코인을 얻습니다.
- 랭킹과 알림으로 게임 진행 상황을 확인합니다.
- 관리자는 게임 시작/종료, 미션 관리, 참가자 현황 확인을 수행합니다.
- 행사 종료 후 엔딩 크레딧 형태로 결과를 확인할 수 있습니다.

## 기술 스택

- Framework: Next.js App Router
- Language: JavaScript / JSX
- UI: 기존 HTML/CSS 기반 UI를 Next.js에 통합
- Styling: CSS Custom Properties, 반응형 모바일 중심 레이아웃
- Backend API: Next.js Route Handlers
- Database/Auth: Supabase Auth, Supabase Postgres
- Admin Auth: Supabase 계정 기반 관리자 인증, HttpOnly cookie 세션
- Security: CSP, security headers, server-only service role key
- Package Manager: npm

## 개발 도구

- OpenAI Codex: Next.js 전환, 보안 구조 정리, README 작성 보조
- Git/GitHub: 버전 관리 및 배포 준비
- Chrome Headless/CDP: UI 동작 및 콘솔 오류 확인

## 실행 방법

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 환경변수

로컬 개발은 `.env.local`에 설정하고, 배포 시에는 Vercel 같은 호스팅 서비스의 환경변수 설정에 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SESSION_SECRET=
ADMIN_EMAILS=
ADMIN_PROFILE_ID=
```

설명:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 관리자 API용 service role key
- `ADMIN_SESSION_SECRET`: 관리자 세션 쿠키 서명용 랜덤 문자열
- `ADMIN_EMAILS`: 관리자 허용 이메일 목록, 쉼표로 구분
- `ADMIN_PROFILE_ID`: 미션 생성자 ID가 필수일 때 쓰는 관리자 profile UUID

주의:

- `.env.local`은 절대 커밋하지 마세요.
- `SUPABASE_SERVICE_ROLE_KEY`와 `ADMIN_SESSION_SECRET`은 브라우저에 노출되면 안 됩니다.
- 공개 저장소에는 실제 Supabase key를 올리지 마세요.

## 관리자 인증 방식

관리자 공용 비밀번호 방식은 제거했습니다.

현재 관리자 판정 방식:

- Supabase 계정으로 이메일/비밀번호 로그인
- 서버에서 Supabase access token 검증
- `profiles.is_admin = true`이면 관리자 허용
- 또는 `.env.local`의 `ADMIN_EMAILS`에 포함된 이메일이면 관리자 허용
- 관리자 세션은 HttpOnly cookie로 저장

예시:

```bash
ADMIN_EMAILS=admin@example.com,owner@example.com
```

## Supabase 설정

이 저장소에는 Supabase 스키마가 자동으로 생성되지 않습니다.

Supabase Dashboard의 SQL Editor 또는 Supabase CLI migration으로 필요한 테이블과 RLS 정책을 만들어야 합니다.

앱이 기대하는 주요 테이블:

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

## 스크립트

```bash
npm run dev
npm run build
npm run start
```

## 프로젝트 구조

```text
app/
  api/admin/        서버 전용 관리자 인증/API
  legacy/           기존 UI를 Next.js에서 쓰도록 옮긴 코드
  layout.jsx        Next.js root layout
  page.jsx          메인 페이지

html_legacy/        기존 정적 HTML 버전 보관본
public/             favicon, touch icon
proxy.js            CSP 및 보안 헤더
next.config.mjs     Next.js 설정
```

## 보안 정리

- 클라이언트 하드코딩 관리자 비밀번호 제거
- 관리자 DB 작업은 서버 API에서만 수행
- Supabase service role key는 서버에서만 사용
- HttpOnly cookie로 관리자 세션 유지
- CSP 적용
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` 적용
- `postcss` 취약점은 `package.json` overrides로 패치 버전 고정

## GitHub 업로드 전 확인

```bash
npm audit --audit-level=moderate
npm run build
```

업로드하면 안 되는 파일:

- `.env`
- `.env.local`
- `.next/`
- `node_modules/`

위 항목은 `.gitignore`에 포함되어 있습니다.

## Legacy 보관본

`html_legacy/`에는 기존 정적 HTML 버전이 들어 있습니다.

보관본에서는 Supabase URL/key와 관리자 비밀번호를 제거했습니다. 실제 배포는 Next.js 버전을 사용하세요.
