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
