# 그랬잖아 디자인 토큰

2026-10-01 기준 라이트 테마 설계다. Figma에서 편집 가능한 변수·텍스트 스타일·효과 스타일과 가이드 보드를 생성했다.

- [Figma 디자인 토큰](https://www.figma.com/design/5IToNjI4vrk4ZPiptrvyfF?node-id=17-249)
- [Realtime Colors 팔레트](https://www.realtimecolors.com/?colors=182235-f8fafc-3d5a99-dce8f2-237f86&fonts=Noto%20Sans%20KR-Noto%20Sans%20KR)
- [서비스 와이어프레임](https://www.figma.com/design/5IToNjI4vrk4ZPiptrvyfF?node-id=7-2)

| 파일 | 역할 |
| --- | --- |
| tokens.json | 색상·타이포그래피·간격·모서리·그림자의 기준 값 |
| tokens.css | 같은 값을 CSS custom properties로 제공 |
| figma-state.json | Figma 노드·변수·스타일 ID와 검증 기록 |

| 영역 | 구성 |
| --- | --- |
| Color | 원시 색상 19개, 의미별 별칭 27개; 주요/보조/강조·상태·입력·포커스 |
| Typography | Noto Sans KR; 12/14/16/20/24/32/40px, 본문·라벨·제목 8개 스타일 |
| Spacing | 0–96px, 4px 단위; 최소 터치 영역 44px; 용도별 별칭 8개 |
| Radius | 0/4/6/10/12/16/24/9999px; 버튼·입력 10, 카드 12, 대화상자 16 |
| Shadow | none / sm / md / lg 효과 스타일 |

## 팔레트와 사용 규칙

| 용도 | 색상 | 적용 |
| --- | --- | --- |
| 본문 | #182235 | 대화·근거·제목 |
| 배경 | #F8FAFC | 페이지 바탕 |
| Primary | #3D5A99 | 분석 요청·확인·저장 |
| Secondary | #DCE8F2 | 보조 영역·선택 강조 |
| Accent | #237F86 | 링크·근거 강조·정보 |

성공·확인 필요·오류는 각각 상태 문구와 색상을 함께 표시한다. AI가 탐지한 모순 후보에 오류 색을 적용해 잘못이나 책임을 단정하지 않는다. 기본 카드에는 그림자를 사용하지 않고, 떠 있는 카드와 팝오버에만 md/lg를 사용한다.

대비 계산: 본문/배경 15.22:1, 흰색/Primary 6.73:1, 본문/Secondary 12.79:1, 흰색/Accent 4.72:1, 보조 본문/배경 6.08:1. 지정한 조합의 계산값이며 모든 UI 상태의 접근성을 일괄 보증하는 결과는 아니다.

## 개발 연결

색상 원시 값 → 의미별 별칭 → 요소 적용 순서로 사용한다. `tokens.css`는 CSS 변수만 정의하며 앱에 자동으로 가져오지 않는다. 예를 들어 버튼은 `background: var(--primary)`, `color: var(--primary-foreground)`, `border-radius: var(--radius-button)`로 연결한다.

Typography는 `--font-family`, `--font-body-size`, `--font-body-line-height`, `--font-body-weight` 등으로 적용한다. 폰트 파일이나 외부 로딩 설정은 이 파일에 포함하지 않는다. Figma 텍스트에는 Noto Sans KR을 적용했다.

Figma의 데스크톱 8개·모바일 2개·상태 화면과 공통 컴포넌트에 브랜드 토큰을 적용했다. 실제 앱 스타일에는 아직 연결하지 않았다. `design/`은 Figma와 개발 코드가 공유할 디자인 기준 파일을 모아 소스 앱과 구분하기 위해 추가했다. 기존 파일 이동·삭제나 라이브러리 설치는 하지 않았다.

화면 적용 후 기존 회색 토큰 참조·색상 렌더링 불일치·버튼 문구 영역 초과가 없음을 확인했고, 기존 프로토타입 연결 76개를 유지했다. 적용 기록과 최신 화면 크기는 `theme-application.json`에 보관한다.

## 검증

Figma 변수 106개, 의미별 별칭 40개, 텍스트 스타일 8개, 효과 스타일 4개를 확인했다. 모든 변수에 CSS code syntax와 명시적 범위를 설정했고 ALL_SCOPES는 없다. 가이드 보드를 렌더링해 글꼴·팔레트·간격·모서리·그림자를 시각 확인했다. JSON 참조와 CSS 변수 중복도 확인했다. 서비스 구현 마일스톤은 M1 완료 상태를 유지한다.
