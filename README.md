# MoaPlan · 모아플랜

단체의 활동 기획부터 일정 관리, 인스타그램 홍보까지 돕는 AI 운영 도우미.

## 실행

Node.js 22.12 이상에서 `npm ci --ignore-scripts`, `npm run dev:local`. http://localhost:5173 에서 단체와 운영자 계정을 생성합니다.

`dev:local`은 기존 `.env`를 사용하지 않고 `.local/development/`에 별도 개발 데이터와 키를 저장하며 예약 게시를 끕니다. 기존 Supabase PostgreSQL 데이터에 연결할 때만 `.env`를 사용하는 `npm run dev`를 실행하세요. 비밀 키와 `.local`은 Git에서 제외됩니다.

Node 서버의 예약 처리는 기본 비활성이며 `MOAPLAN_WORKER_ENABLED=true`를 명시해야 실행됩니다. 현재 배포 목표는 Cloudflare Pages + Supabase Edge Functions/PostgreSQL + R2이며 전환과 검증이 진행 중입니다.

`npm test`, `npm run build` 후 운영에서는 NODE_ENV=production으로 `npm start`를 실행합니다. Windows에서는 환경변수를 `.env`에 설정할 수 있습니다.

외부 연동은 단체 관리 화면에서 계정과 키를 설정한 뒤 사용합니다. 키가 없을 때 AI 또는 게시 성공을 가장하지 않습니다.

## 범위

활동 기획과 편집, 후보지, 달력/목록, AI 작성, 홍보 이미지 1~8장, R2 이미지 저장, Instagram 예약 게시, Google Calendar 버튼 등록, 단체별 설정. 회원 및 회비 납부 관리는 제외합니다.
