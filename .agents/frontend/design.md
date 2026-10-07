# 디자인 인계 · 2026-10-01

## 확정 기준

[Figma 파일](https://www.figma.com/design/5IToNjI4vrk4ZPiptrvyfF), [토큰 가이드](../../design/README.md), [CSS 토큰](../../design/tokens.css)을 기준으로 화면을 구현한다. 이전 회색조 설계는 브랜드 토큰 적용 완료 상태로 대체되었다.

| 영역 | 현재 결과 |
| --- | --- |
| 화면 | 데스크톱 로그인·대화 목록·업로드·원문·통계·모순·관점·일정 8개, 모바일 모순·일정 2개, 상태 보드 |
| 팔레트 | Realtime Colors 미리보기: 본문 #182235, 배경 #F8FAFC, Primary #3D5A99, Secondary #DCE8F2, Accent #237F86 |
| 글꼴 | Noto Sans KR. Pretendard MCP 로드 실패 후 사용자 승인한 대체 글꼴 |
| 토큰 | 변수 106개, 텍스트 스타일 8개, 효과 스타일 4개; CSS 변수 110개 |
| 레이아웃 | 데스크톱 페이지 32px, 모바일 24px, 카드 24px, 카드 radius 12px, 버튼·입력 radius 10px, 최소 터치 44px |
| 검증 | 기존 회색 변수 참조·색상 불일치·버튼 문구 초과 0, 프로토타입 연결 76개 유지, 모바일·데스크톱 렌더 확인 |
| 근거 기록 | design/figma-state.json, design/theme-application.json |

## 구현 경계

새 브랜치 codex/m2/frontend-screens는 기존 codex/m0/environment-setup 기반이다. 이 브랜치는 M2 화면과 M3 분석 화면의 시각·동작 초안을 다루며, 서비스 마일스톤 완료를 의미하지 않는다. 인증·개인 저장·서버 파싱·AI는 후속 연결 대상이다. 합성 데이터는 실제 사용자 대화와 구분한다.

공통 컴포넌트, 화면, 데이터 및 브라우저 경로 훅을 책임에 따라 분리한다. 기존 파일 이동·삭제 없이 새 소스 파일을 추가한다. 세부 구현·검증은 screens.md에 기록한다.
