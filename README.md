# MoaPlan · 모아플랜

단체의 활동 기획부터 일정 관리, 인스타그램 홍보까지 돕는 AI 운영 도우미.

## 실행

Node.js 22.12 이상에서 `npm install`, `npm run dev`. http://localhost:5173 에서 단체와 운영자 계정을 생성합니다.

개발 시 DATABASE_URL이 없으면 `.local/`에 데이터를 저장합니다. 실제 운영은 Render PostgreSQL을 사용해야 합니다. `.env.example`을 `.env`로 복사해 설정하세요. 비밀 키와 `.local`은 Git에서 제외됩니다.

`npm test`, `npm run build` 후 운영에서는 NODE_ENV=production으로 `npm start`를 실행합니다. Windows에서는 환경변수를 `.env`에 설정할 수 있습니다.

외부 연동은 단체 관리 화면에서 계정과 키를 설정한 뒤 사용합니다. 키가 없을 때 AI 또는 게시 성공을 가장하지 않습니다.

## 범위

활동 기획과 편집, 후보지, 달력/목록, AI 작성, 홍보 이미지 1~8장, R2 이미지 저장, Instagram 예약 게시, Google Calendar 버튼 등록, 단체별 설정. 회원 및 회비 납부 관리는 제외합니다.
