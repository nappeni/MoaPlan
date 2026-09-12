# 추가 개발 및 검증 — 2026-09-12

- Pages: https://moaplan.pages.dev, 기존 계정의 로그인 세션 및 관리 화면 확인.
- SVG 파비콘 추가. 브라우저 업로드 전 1080x1350 이내 축소, 서버 JPEG 180KB 목표/300KB 상한, WebP 썸네일 160px. 원본은 저장하지 않음. 작은 이미지는 확대하지 않으며 투명 배경은 흰색 처리.
- Edge 이미지 처리 복구 완료: npm 패키지 내부 WASM을 직접 읽음. 별도 공개 WASM 다운로드/리소스는 불필요하여 제거. 합성 이미지의 실제 Edge 압축 성공 확인.
- 로그인 요청 제한을 DB 트랜잭션 기반 공유 카운터로 교체.
- 예약 작업을 단계별 실행, DB 임대 잠금, 컨테이너 진행 상태 저장 구조로 변경. 게시 요청 후 응답 유실/중단 시 attention 처리하고 자동 재게시하지 않음.
- 예약 실행은 여전히 비활성. 활성화 전에는 게시 요청을 503으로 명확히 거절.
- scripts/install-scheduler.mjs는 설치 준비만 완료. 운영 DB 확장/Vault/함수/Cron 변경은 자동 승인 검토에 차단되어 아직 실행하지 않음. 명시 승인 후 실행해도 Cron은 중지 상태로 생성됨.
- 실제 Edge에서 기존 DB 비밀 복호화 및 R2/Google/OpenAI 읽기 연결 성공. Instagram 계정 정보 미등록.
- 사용자는 외부 서비스 검증을 조회/연결까지만 허용. AI 실제 생성, R2 쓰기, Google 일정 등록, Instagram 실제 게시 테스트는 실행하지 않음.
- Google 기존 refresh token 연결은 정상. 새 배포 주소의 OAuth 재동의 및 redirect URI 설정 검증은 별도 필요.
- 테스트 22개 통과. 이미지 용량/투명도/소형 이미지, 공유 제한, 동시 예약 처리, 다중 이미지, 중단 복구, 응답 유실 후 중복 방지 검증. 브라우저 새로고침 후 로그인 세션 유지 확인.

---

# 노트북 배포 진행 — 2026-09-12

- 최초 테스트 배포 완료: https://moaplan.pages.dev
- Supabase MoaPlan 프로젝트의 moaplan-api Edge Function을 --use-api 방식으로 배포. 로컬 Deno 검사와 Docker는 실행하지 않음.
- 기존 DB URL, CA, 암호화 키는 사용자 명시 승인 후 Supabase 비밀 설정에 등록. Pages에는 API URL 및 프록시 비밀값만 등록.
- Edge의 Buffer 전역 미정의 오류를 node:buffer 명시 import로 수정.
- 배포 검증: 화면 200, Pages API health 200, session에서 원격 DB 및 기존 계정 존재 확인, 미로그인 data 401, 다른 출처 POST 403, 프록시 비밀값 없는 Edge 직접 접근 403.
- 테스트 13개 통과, Vite 및 Pages 함수 빌드 성공. 실제 계정 로그인 및 로그인 이후 외부 연동은 아직 미검증.
- 예약 자동 실행은 비활성. Node는 MOAPLAN_WORKER_ENABLED=true일 때만 실행. Edge에는 예약 트리거 없음.
- 첫 Edge 배포의 이미지 업로드는 503 안내 오류로 제한. 로컬 Node 이미지 처리는 유지. WASM 배포 전략/리소스 검증 필요.
- 기존 로그인 제한은 인스턴스별 메모리에 있으므로 공유 제한 처리가 남음. Google OAuth 리디렉션 주소 설정 및 실연동 검증도 남음.
- npm run dev:local은 .local/development의 격리 데이터 사용. npm run dev는 복원한 .env의 실제 Supabase 데이터 사용.
- 배포 설정 등록 스크립트: scripts/configure-deployment.mjs. 생성된 설정 비밀값은 Git 제외 .local/deploy에 소유자 전용 권한으로 보관. 기존 .env 및 암호화 키는 변경하지 않음.
- 현재 배포는 로컬 변경 사항을 직접 업로드한 상태. Git 커밋/푸시는 아직 하지 않음.

---

# 작업 인계 — 2026-09-11

## 현재 상태
- Supabase PostgreSQL 연결 및 기존 로컬 데이터 이전 완료. 저장 위치는 moaplan_private.moaplan_state.
- 설정 저장 시 메타데이터로 요청이 거부되던 문제 수정.
- R2 업로드/서명 URL 다운로드 검증 완료, 테스트 파일 삭제 완료.
- OpenAI 인증 및 모델 목록 조회 확인. 실제 생성은 미검증.
- Google OAuth 연결 및 캘린더 목록 조회 확인. 일정 등록은 미검증.
- Instagram 연결 및 실제 게시 미완료.

## 서버 전환 진행 중 (배포 완료 아님)
- server/app.js: Express API를 로컬 실행 진입점에서 분리.
- server/images-node.js / images-wasm.js: 이미지 처리 분리 및 WASM JPEG/WebP 기본 출력 확인.
- functions/api/[[path]].js: Cloudflare Pages API 프록시 초안.
- supabase/functions/moaplan-api/index.ts 및 설정 파일: Edge Functions 진입점 초안.
- Node 테스트 7개는 앱/이미지 분리 후 통과. 마지막 Edge 진입점 변경 이후 전체 검증 미완료.
- 예약 게시를 짧고 재개 가능한 작업으로 변경하는 작업, WASM 배포 번들/리소스 제한 확인, 서버리스 로그인 요청 제한, 프록시/쿠키/OAuth 통합 검증이 남음.
- 배포 도구(Supabase CLI, Wrangler)는 로그인하지 않은 상태였음.
- Render 설정은 이전 구성이다. 현재 목표는 Cloudflare Pages + Supabase Edge Functions/PostgreSQL + R2.

## PC 중단 현상
Deno 호환성 검사 시도 도중 사용자가 블루스크린과 PC 멈춤을 보고했다. 원인은 확인되지 않았다. 동일 PC에서 Deno 검사를 재시도하지 않는다. 이번 커밋/푸시에서는 빌드나 런타임 검사를 실행하지 않았다.

## 노트북에서 이어갈 때
1. 저장소를 복제하고 이 문서부터 확인한다.
2. .env, .local/encryption.key 및 인증서 등은 Git에 없다. 기존 PC에서 안전하게 별도 전달한다.
3. ENCRYPTION_KEY는 기존 값 그대로 사용한다. 새 키로 바꾸면 DB의 기존 암호화 설정을 복호화할 수 없다.
4. .env의 DATABASE_SSL_CA_FILE 경로가 새 PC에서 유효한지 확인한다.
5. 실제 데이터는 Supabase에 있다. 오래된 .local/state.json을 다시 업로드해 덮어쓰지 않는다.
6. 문제 원인이 확인되기 전에는 중단된 Deno 명령을 자동 재실행하지 않는다.

비밀번호/API 토큰/환경 변수 원문은 문서·커밋·로그에 포함하지 않는다. docs/MoaPlan_env.txt는 로컬 비밀 정보 참고 파일로 Git 제외 대상이다.
