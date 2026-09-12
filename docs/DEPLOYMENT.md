# 실행 및 배포

## 로컬 실행

1. npm ci --ignore-scripts (Deno 등 설치 스크립트 자동 실행 방지)
2. npm run dev:local — .env를 읽지 않고 .local/development의 별도 개발 데이터를 사용
3. 기존 Supabase 데이터 연결이 필요한 경우에만 npm run dev
4. http://localhost:5173 에서 운영자 계정 생성

예약 게시 작업은 기본 비활성이다. Node 서버에서 예약 처리를 운영하려면 MOAPLAN_WORKER_ENABLED=true를 명시해야 한다. dev:local은 이 설정과 관계없이 예약 처리를 끈다. 예약 처리를 꺼도 npm run dev는 .env의 DB에 연결하고 초기화 쿼리 및 사용자 요청에 따른 쓰기를 수행하므로 읽기 전용 모드가 아니다.

기본 로컬 실행은 127.0.0.1에만 바인딩한다. 개발 데이터와 암호화 키는 .local에 보관한다. 초기 화면에 실제 이름과 비밀번호를 직접 입력한다. 자동 생성된 공용 비밀번호는 없다.

## Render

render.yaml은 유료 웹 서비스와 PostgreSQL 리소스를 선언한다. 아직 실제 배포나 결제를 실행하지 않았다. 배포 전에 요금제를 확인한다.

- APP_URL: 배포된 HTTPS 도메인, 끝 슬래시 없이 입력
- ENCRYPTION_KEY: 32바이트의 난수를 64자리 hex로 표현한 값. 별도 안전한 저장소에 백업하고 변경하지 않는다.
- SETUP_TOKEN: 단체 생성 시 입력할 초기 설정 코드. Render에서 생성된 값을 관리자가 확인한다.
- DATABASE_URL: Render 내부 PostgreSQL 연결을 사용한다. 기본 TLS 검증을 끄지 않는다.

데이터베이스 테이블은 최초 서버 시작 시 생성된다. 예약 처리는 웹 서비스 프로세스에서 주기적으로 동작하므로 항상 실행되는 인스턴스 1개를 사용한다. 서버 중단 중에는 게시가 실행되지 않는다. 재개 시 저장된 예약을 처리하며, 처리 도중 중단된 작업은 10분 후 결과 확인 필요 상태가 된다.

## R2

비공개 버킷과 해당 버킷만 접근 가능한 S3 인증 키를 만들고 관리 메뉴에 저장한다. 원본 선택은 최대 15MB이며 브라우저에서 먼저 축소한다. 서버는 JPEG 180KB 목표/300KB 상한으로 압축하고 160px WebP 썸네일을 만든다. 원본은 저장하지 않는다. 본문 이미지 접근은 로그인된 동일 단체에서만 가능하다. Meta 전달 URL은 예약 실행 시 발급해 1시간 동안 유효하다. 비밀 버킷 전체를 공개하지 않는다.

## Google

Google Cloud에서 Calendar API와 Maps Embed API를 활성화한다. 웹 OAuth 클라이언트를 만들고 APP_URL/api/google/callback을 리디렉션 URI로 등록한다. 클라이언트 ID/비밀 키 저장 후 Google 계정을 연결한다. 테스트 앱의 사용자/토큰 제한과 공개 앱 검증 여부는 Google 콘솔에서 확인한다. 지도용 키는 브라우저에 노출되므로 HTTP referrer 및 API 제한을 적용한다.

## Instagram

현재 어댑터는 Instagram Login 방식의 graph.instagram.com을 사용한다. 게시 권한이 있는 프로페셔널 계정 ID와 토큰, 앱에서 지원하는 Graph API 버전을 입력한다. Facebook Login용 토큰과 혼용하지 않는다. 연결 테스트는 계정 조회만 확인하며 실제 게시 권한의 완전한 검증은 테스트 게시로 수행해야 한다. 실제 계정이나 토큰은 저장소에 넣지 않는다.

## 백업 및 알려진 제한

PostgreSQL 백업과 ENCRYPTION_KEY를 함께 안전하게 보관한다. JSON 내보내기에는 비밀 키가 포함되지 않으며 복구용 전체 DB 백업을 대체하지 않는다. 초기 버전에는 계정 비밀번호 재설정 이메일, 운영자 초대 UI, R2 고아 파일 자동 삭제, Instagram 로그인 자동 토큰 발급 UI가 없다. 삭제된 활동의 이미지는 자동 제거하지 않으므로 실제 운영 전 보존·정리 정책을 결정한다.

## 검증

npm test: 로그인/세션, 단체 간 격리, 출처 검증, 동시 저장, 암호화, 입력 검증, 이미지 최적화.
npm run build: 운영용 프런트엔드 생성.
외부 서비스 실호출 및 실제 PostgreSQL 접속 검증은 계정/서버 설정 이후 수행한다.

## Supabase PostgreSQL

Use the Session pooler URI for the local IPv4 backend. Set DATABASE_URL and DATABASE_SSL_CA_FILE to the downloaded Supabase CA certificate path. Keep ENCRYPTION_KEY identical to the original local key when migrating encrypted settings. Never commit these values.

The server stores its initial JSONB state in moaplan_private.moaplan_state, with RLS enabled and access revoked from PUBLIC, anon and authenticated. This is a server-only store, not a browser Data API. Existing public.moaplan_state installations must be explicitly migrated before upgrading; the server does not automatically move old tables.

For local-file migration, stop the server, back up state.json and encryption.key, refuse to overwrite a populated destination, copy the entire state in a transaction, compare the result, and only then switch DATABASE_URL. Local backups under .local must be protected alongside the encryption key. Supabase provides the database; the Node web server still needs hosting for public deployment.


## 첫 Pages + Edge 배포

현재 Edge 이미지 처리는 npm 패키지 내부 WASM 읽기로 동작하며 배포 환경 압축 검증을 통과했다. 예약 작업 엔드포인트는 구현되어 있으나 실행 플래그는 비활성이고 Cron DB 설치는 별도 승인 대기다.

1. 프로젝트에서 `npx supabase login`, `npx wrangler login`으로 계정 인증한다. 토큰을 문서나 대화에 기록하지 않는다.
2. 기존 Supabase 프로젝트를 확인하고 Pages 프로젝트와 고정 HTTPS 주소를 결정한다.
3. Edge에 기존 DATABASE_URL, ENCRYPTION_KEY, 인증서 원문의 DATABASE_SSL_CA, 고정 Pages 주소의 APP_URL, SETUP_TOKEN, MOAPLAN_PROXY_SECRET을 비밀 설정으로 등록한다. 로컬 인증서 파일 경로를 원격에 전달하지 않는다. DATABASE_POOL_SIZE는 초기에는 1로 제한한다.
4. Pages에는 MOAPLAN_API_URL과 동일한 MOAPLAN_PROXY_SECRET만 등록한다. DB 비밀번호와 ENCRYPTION_KEY는 Pages나 프런트엔드에 넣지 않는다.
5. `npx supabase functions deploy moaplan-api --use-api --project-ref <확인한 프로젝트>`로 서버 측 번들을 사용한다. 로컬 Deno 검사와 Docker 시작은 필요하지 않다. 배포 시 다른 함수를 제거하는 prune 옵션을 사용하지 않는다.
6. `npm run build` 후 `npx wrangler pages deploy dist --project-name <확인한 프로젝트>`로 화면과 프록시를 올린다.
7. 프록시 비밀값 없는 Edge 직접 접근 거부, Pages health/session 응답, 로그인 쿠키, 기존 데이터 조회를 확인한다. 계정 생성이나 게시 등 운영 데이터 변경을 배포 점검에 섞지 않는다.

WASM 파일은 패키지 내부에서 읽으므로 별도 공개 다운로드 없이 --use-api 배포를 사용한다. Google OAuth는 최종 APP_URL에 맞춘 리디렉션 URI 등록 이후 확인한다.


## 예약 실행 및 검증 범위

`node --env-file=.env scripts/install-scheduler.mjs`는 사전 승인 후에만 실행한다. pg_cron/pg_net 확장과 Vault 비밀 설정, 비공개 실행 함수, 10초 간격 Cron을 만들고 같은 트랜잭션에서 Cron을 비활성화한다. 실제 활성화는 Instagram 계정 연결과 사용자 승인 후 Edge의 MOAPLAN_WORKER_ENABLED 및 Cron active를 함께 변경해야 한다.

예약 실행은 한 번의 호출에서 원격 요청 한 단계를 처리한다. 작업별 DB 임대는 90초, Instagram 요청 제한은 20초다. 게시 직전 상태를 먼저 기록하며, 게시 결과가 불명확하면 운영자 확인 전까지 재시도하지 않는다. 20분 넘게 완료되지 않은 준비 작업은 실패로 처리한다.

읽기 전용 배포 진단은 프록시 비밀값으로 보호된 `/internal/connections`와 `/internal/image-check`를 사용한다. 외부 서비스 실제 생성/쓰기/게시 테스트는 수행하지 않았다. Google 재연결용 리디렉션 URI는 `https://moaplan.pages.dev/api/google/callback`이다.
