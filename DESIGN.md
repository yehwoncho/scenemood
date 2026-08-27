# BLINK — DESIGN.md

> 인터랙션 · 비주얼 구현 명세
> PRD v1.0 기준 / 작성일 2026-08-26

---

## 0. 레퍼런스 인벤토리

| 출처 | 핵심 기법 | BLINK 적용처 | 티어 |
|---|---|---|---|
| [cipher.tv](https://cipher.tv) | 흩어진 이미지 클러스터 + 마우스 패럴랙스, 그레이스케일 대비, % 프리로더 | 랜딩 히어로 | **T1** |
| [Ibaliqbal/grid-layout-transition](https://github.com/Ibaliqbal/grid-layout-transition) *(원형: Codrops GridLayoutTransitions, GSAP Flip)* | 그리드 → 확대 뷰 레이아웃 전환 | 클러스터 → 결과 3장 수렴 | **T1** |
| `matdn/helmet` *(미확인 — 3D 스크롤 인터랙션으로 가정)* | 3D 오브젝트 스크롤 연동 | 랜딩 배경 앰비언트 | T3 |
| [cullenwebber/three-html-to-canvas](https://github.com/cullenwebber/three-html-to-canvas) | HTML → SVG ForeignObject → Canvas → Three.js 셰이더 | 스텝 전환 시 화면 왜곡 | T3 |

### 티어 정의
- **T1 (필수)** — 이틀 안에 반드시 완성. 없으면 컨셉이 성립하지 않음
- **T2 (권장)** — 목요일 저녁까지 여유가 있으면 착수
- **T3 (보류)** — Phase 2. PRD에 "확장 계획"으로 명시하되 이번엔 손대지 않음

> **T3 분리 근거**
> `three-html-to-canvas`는 ForeignObject 파이프라인 특성상 **크로스 오리진 이미지를 렌더링할 수 없다.**
> TMDB 포스터는 전량 외부 도메인이므로 base64 인라인 변환이 선행되어야 하며,
> 폰트 임베딩 · Safari 렌더링 편차까지 감안하면 단독으로 1~2일 규모의 작업이다.
> 2일 · 1인 조건에서 착수 시 T1이 미완성으로 남을 위험이 크다.

---

## 1. 디자인 토큰

```css
:root {
  /* Color */
  --bg:            #0A0A0A;
  --surface:       #141414;
  --surface-hi:    #1E1E1E;
  --text:          #FFFFFF;
  --text-dim:      #8A8A8A;
  --text-mute:     #4A4A4A;
  --accent:        #C6FF00;
  --line:          rgba(255,255,255,0.08);

  /* Motion */
  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);   /* power3.out 근사 */
  --ease-inout:    cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast:      0.4s;
  --dur-base:      0.8s;
  --dur-slow:      1.2s;

  /* Layout */
  --max-w:         1440px;
  --gutter:        24px;
  --radius:        4px;   /* 시네마틱 무드 — 라운드 최소화 */

  /* Depth (클러스터 레이어) */
  --z-back:        0.3;   /* 패럴랙스 계수 */
  --z-mid:         0.6;
  --z-front:       1.0;
}
```

### 타이포 스케일

| 토큰 | 크기 | 용도 |
|---|---|---|
| `display` | `clamp(48px, 8vw, 120px)` | 히어로 타이틀 |
| `h1` | `clamp(32px, 4vw, 56px)` | 스텝 질문 |
| `h2` | `24px` | 카드 제목 |
| `body` | `16px` | 본문 |
| `caption` | `13px` | 태그 칩, 메타 |

- 영문 헤드라인: Inter / Neue Haas 계열, `letter-spacing: -0.02em`, weight 600~700
- 한글 본문: Pretendard, weight 400~500
- **세리프 미사용** — 매거진 인상으로 기울어짐

---

## 2. T1 효과 명세

### 2.1 프리로더 (% 카운터)

**출처** — cipher.tv

**동작**
```
1. 화면 중앙 하단에 000 → 100 카운트업
2. 실제 에셋 로드 진행률과 동기화 (이미지 preload Promise.all)
3. 100 도달 시 숫자 마스크 아웃 (y: -100%)
4. 배경 마스크가 위아래로 열리며 히어로 노출
```

**구현 노트**
- 진행률은 로드 완료 개수 / 전체 개수. 단, **최소 표시 시간 1.2초 보장** (캐시 시 순간 종료 방지)
- 숫자는 `font-variant-numeric: tabular-nums` — 자릿수 흔들림 방지
- GSAP: `gsap.to(counter, { value: 100, snap: { value: 1 }, ease: "none" })`

**예상 소요** — 1시간

---

### 2.2 히어로 포스터 클러스터 + 마우스 패럴랙스

**출처** — cipher.tv

**구조**
```
.cluster
 ├── .layer[data-depth="0.3"]  ← 뒤, 작고 어둡게, 5장
 ├── .layer[data-depth="0.6"]  ← 중간, 6장
 └── .layer[data-depth="1.0"]  ← 앞, 크게, 5장
```

**동작**
- 마우스 위치 정규화 `(-1 ~ 1)` → 레이어별 `depth * 40px` 만큼 역방향 이동
- 개별 포스터는 로드 시 랜덤 위치·회전(`-4deg ~ 4deg`)으로 배치
- 기본 `filter: grayscale(1) brightness(0.7)`
- 호버 시 → `grayscale(0) brightness(1)`, `scale(1.04)`, `z-index` 상승

**구현 노트**
```js
// 반드시 quickTo 사용 — gsap.to를 매 mousemove마다 호출하면 프레임 붕괴
const xTo = gsap.quickTo(layer, "x", { duration: 0.6, ease: "power3" });
const yTo = gsap.quickTo(layer, "y", { duration: 0.6, ease: "power3" });
```
- 포스터 **최대 16장**. 초과 시 모바일에서 프레임 드랍
- `will-change: transform`, `transform: translateZ(0)`
- 이미지는 TMDB `w342` 사이즈 사용 (`original` 금지 — 용량 폭증)

**터치 기기 폴백**
- `matchMedia("(hover: none)")` 감지 → 마우스 추적 비활성
- 대신 각 레이어에 무한 부유 모션 적용
  ```js
  gsap.to(layer, { y: "+=20", duration: 4, yoyo: true, repeat: -1, ease: "sine.inOut" });
  ```

**예상 소요** — 3시간

---

### 2.3 그레이스케일 → 컬러 (컨셉 연결)

**출처** — cipher.tv (스크린샷상 흑백 다수 + 컬러 1장의 대비)

**BLINK 고유 해석**
> 모든 포스터는 흑백. **마우스가 닿은 것만 색을 되찾는다.**
> → "고르는 순간 살아난다"는 서비스 컨셉의 시각적 번역

**적용 범위**
| 화면 | 상태 |
|---|---|
| 히어로 클러스터 | 전부 흑백 → 호버 시 컬러 |
| 상황/기분 카드 | 미선택 흑백 → 선택 시 컬러 + accent 테두리 |
| 결과 3장 | **전부 컬러** (여기가 종착점) |

**구현 노트**
- `filter` 트랜지션은 GPU 부담이 있음 → `transition: filter var(--dur-fast)` 정도로 짧게
- 대안: 컬러 이미지 위에 `mix-blend-mode: saturation` 레이어를 얹고 opacity 조절 (더 부드러움)

**예상 소요** — 1시간

---

### 2.4 그리드 레이아웃 전환 (클러스터 → 3장 수렴) ★ 핵심

**출처** — Ibaliqbal/grid-layout-transition (GSAP Flip)

**이 프로젝트에서 가장 중요한 인터랙션.** 랜딩부터 결과까지를 하나의 서사로 잇는 장치이며, 레퍼런스에는 없는 BLINK 고유 요소다.

**동작**
```
[로딩 화면]
1. 흩어진 포스터 16장이 빠르게 스쳐 지나감 (0 ~ 0.8초)
2. 점차 감속하며 화면 중앙으로 수렴 (0.8 ~ 1.3초)
3. 3장만 남고 나머지는 페이드아웃 + scale down (1.3 ~ 1.5초)
4. 남은 3장이 결과 그리드 위치로 Flip 전환
```

**구현 노트**
```js
import { Flip } from "gsap/Flip";

const state = Flip.getState(".poster");   // 흩어진 상태 캡처
// DOM 클래스 교체 → 3-column 그리드 레이아웃으로
container.classList.add("is-result");
Flip.from(state, {
  duration: 1.2,
  ease: "power3.inOut",
  stagger: 0.06,
  absolute: true,
  onEnter:  el => gsap.fromTo(el, { opacity: 0 }, { opacity: 1 }),
  onLeave:  el => gsap.to(el, { opacity: 0, scale: 0.8 }),
});
```
- **GSAP Flip은 현재 무료** (전 플러그인 무료화). 별도 라이선스 불필요
- `absolute: true` 필수 — 그리드 재배치 중 레이아웃 흔들림 방지
- 로딩은 **의도적으로 1.5초 유지**. API는 0.5초면 응답하지만, 이 연출이 "고민해서 골랐다"는 인상을 만듦

**예상 소요** — 4시간 (가장 큰 덩어리)

---

### 2.5 스텝 전환 (scatter out / gather in)

**동작 원칙**
| 방향 | 모션 |
|---|---|
| 나가는 요소 | 흩어지며 사라짐 — 랜덤 `x/y ±60px`, `opacity 0`, `stagger 0.03` |
| 들어오는 요소 | 중앙에서 모임 — `scale 0.9 → 1`, `opacity 0 → 1`, `stagger 0.05` |

**구현 노트**
- 단일 페이지 3-STEP이므로 라우팅이 아닌 **GSAP 타임라인 교체**로 처리
- `?step=` 쿼리 동기화 → 뒤로가기 대응 (`useRoute` watch)
- 전환 중 클릭 잠금 (`pointer-events: none`) — 중복 트리거 방지

**예상 소요** — 2시간

---

### 2.6 텍스트 마스크 리빌

**동작** — 줄 단위 `overflow: hidden` 래퍼 + 내부 `y: 100% → 0`

```js
gsap.from(".line-inner", {
  yPercent: 100,
  duration: 1,
  ease: "power3.out",
  stagger: 0.08,
});
```

**구현 노트**
- SplitText 대신 **직접 줄 단위 span 래핑** (한글은 SplitText 문자 분할 시 조합 깨짐 위험)
- 헤드라인에만 적용. 본문까지 걸면 산만해짐

**예상 소요** — 40분

---

### 2.7 커스텀 커서

**동작**
- 기본: 8px 원, `--text` 색상, `mix-blend-mode: difference`
- 포스터 위: 64px로 확대 + `VIEW` 라벨
- 버튼 위: `--accent` 색상으로 전환

**구현 노트**
- `quickTo`로 보간, duration 0.3
- **터치 기기에서는 완전 비활성** (`hover: none` 감지)
- `mix-blend-mode: difference`가 흑백 화면에서 가장 잘 작동

**예상 소요** — 1시간

---

### 2.8 스무스 스크롤 (Lenis)

```js
const lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - 2**(-10*t)) });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

- 랜딩에만 적용. 결과·모달 화면은 네이티브 스크롤 유지
- `prefers-reduced-motion` 시 비활성

**예상 소요** — 30분

---

## 2.9 카드 타이포 시스템 (A24 레퍼런스)

**출처** — [a24films.com](https://a24films.com)

히어로(Cipher 무드)와 실제 선택 화면(상황·기분·결과 카드)의 톤을 분리한다.
히어로는 감각적 압도, 그 이후는 **명료한 타이포 위계**로 전환해 사용자가
헤매지 않게 한다.

### 카드 구조 (상황 · 기분 · 결과 공통)

```
┌─────────────────────────┐
│  SITUATION 01            │  ← eyebrow: 12px, letter-spacing 0.1em,
│                           │             uppercase, --text-dim
│  혼밥                     │  ← title: 32~40px, bold, --text
│                           │
│  20~40분, 가볍게 보기 좋은 │  ← description: 14px, --text-dim
│                           │
└─────────────────────────┘
```

- eyebrow 라벨은 카드 종류에 따라 텍스트만 교체: `SITUATION 01` / `MOOD 03` / `MATCH 92%`
- 카드 자체는 테두리 최소화 (`1px solid var(--line)`), 배경은 `--surface`
- 호버 시 border color → `--accent`, `translateY(-4px)` — 무게감 있게, 바운스 없이

### STEP 진행 인디케이터

A24 히어로 캐러셀의 `1 6` 페이지네이션 방식을 차용.

```
좌하단 고정 배치:  01 — 03
                   ^^  ^^ --text-dim
                   현재  전체
```

- 스텝 전환 시 현재 숫자만 `--accent`로 강조, 크로스페이드
- 진행 바(progress bar)보다 숫자 표기가 이 프로젝트 톤에 더 절제되어 보임

### 결과 카드 차별점

결과 화면은 유일하게 **이미지가 이미 컬러인 상태**로 등장한다 (흑백 → 컬러 전환의 종착점).
A24 카드 문법 위에 포스터 이미지를 크게 얹고, `MATCH 92%` eyebrow로
6.4 추천 이유 태그 칩을 보완한다.

```
┌───────────────────────────┐
│ [포스터 이미지, 컬러]        │
│                             │
│ MATCH 92%                  │  ← eyebrow
│ 영화 제목                    │  ← title
│ #잔잔하게 #90분이하           │  ← 태그 칩 (기존 6.4 사양)
└───────────────────────────┘
```

**예상 소요** — 2시간 (카드 컴포넌트 1개를 상황/기분/결과 3곳에 재사용)

---

## 3. T2 효과 (여유 시)

| 효과 | 설명 | 소요 |
|---|---|---|
| 포스터 호버 시 예고편 재생 | 스틸 위에 muted 비디오 오버레이, TMDB `/videos` 활용 | 2h |
| 마그네틱 버튼 | CTA가 커서를 향해 미세 이동 | 40m |
| 결과 카드 3D 틸트 | 마우스 위치 기반 `rotateX/Y` ±6deg | 1h |
| 노이즈 그레인 오버레이 | 전체에 필름 그레인 텍스처, `opacity 0.03` | 30m |

> 노이즈 그레인은 **가성비가 가장 높다.** 30분 투자로 시네마틱 인상이 확연히 올라간다.
> 시간이 애매하게 남으면 이것부터.

---

## 4. T3 효과 (Phase 2)

### 4.1 HTML → Canvas → Three.js 왜곡 전환
**출처** — cullenwebber/three-html-to-canvas

**의도한 적용** — 스텝 전환 시 현재 화면을 텍스처로 구워 셰이더 왜곡(웨이브/글리치) 후 다음 스텝 노출

**보류 사유**
1. **크로스 오리진 차단** — ForeignObject는 외부 도메인 이미지를 렌더링하지 못함. TMDB 포스터 전량을 base64 인라인해야 함
2. **폰트 임베딩** — 웹폰트도 base64로 인라인 필요. 미처리 시 시스템 폰트로 렌더링됨
3. **브라우저 편차** — Safari에서 ForeignObject 렌더링 결과가 Chrome과 다름
4. **디버깅 난이도** — 텍스처가 안 나올 때 원인 추적이 오래 걸림

**Phase 2 착수 시 선행 작업**
- Nuxt server route에서 포스터를 프록시하며 base64로 변환하는 엔드포인트 구축
- 폰트 subset + base64 임베딩

### 4.2 3D 오브젝트 스크롤 연동
**출처** — matdn/helmet *(내용 미확인 — 확인 후 재작성 필요)*

**가정한 적용** — 랜딩 배경에 앰비언트 3D 오브젝트, 스크롤에 따라 회전

**보류 사유** — GLTF 로딩 + 조명 세팅 + 성능 튜닝으로 최소 반나절. T1 완성이 우선

---

## 5. 성능 예산

| 항목 | 기준 |
|---|---|
| 동시 렌더 포스터 | 최대 16장 |
| 이미지 사이즈 | TMDB `w342` (히어로), `w500` (결과 카드) |
| 목표 프레임 | 60fps (마우스 이동 중 55fps 이상) |
| LCP | 2.5초 이내 |
| 애니메이션 속성 | `transform` · `opacity`만 사용. `top/left/width` 금지 |

### 필수 방어 코드
```js
// 1) 접근성
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.globalTimeline.timeScale(999);  // 사실상 즉시 완료
}

// 2) 정리 — Nuxt 페이지 전환 시 누수 방지
onUnmounted(() => {
  ScrollTrigger.getAll().forEach(t => t.kill());
  gsap.killTweensOf("*");
});
```

---

## 6. Tailwind와 GSAP의 역할 분리

**원칙 — GSAP이 제어할 속성은 Tailwind 클래스로 잡지 않는다.**

| 담당 | 범위 |
|---|---|
| Tailwind | 레이아웃, 색상, 타이포, 간격, 반응형 |
| GSAP | `transform`(x/y/scale/rotate), `opacity`, `clip-path` |
| CSS 변수 | 양쪽이 공유하는 값 (색상 토큰, 이징) |

위반 시 클래스와 인라인 스타일이 같은 속성을 두고 경합하여 디버깅이 극도로 어려워진다.

---

## 7. 차별화 체크리스트

레퍼런스를 그대로 재현하면 "클론"으로 읽힌다. 아래 항목 중 **최소 2개는 반드시 BLINK 고유로 유지**할 것.

- [x] **클러스터 → 3장 수렴** — 랜딩부터 결과까지 하나의 서사. 레퍼런스에 없음
- [x] **그레이스케일을 기능으로 연결** — "고르는 순간 색이 돌아온다"
- [x] **네온 라임 액센트** — 영화 사이트의 붉은 계열 클리셰 회피
- [ ] 로딩 시간의 의도적 유지 — 기술이 아닌 **UX 판단**으로서 문서화

---

## 8. 구현 순서 (DESIGN 관점)

| 순서 | 작업 | 티어 | 누적 |
|---|---|---|---|
| 1 | 디자인 토큰 + Tailwind config | — | 0.5h |
| 2 | 히어로 클러스터 + 패럴랙스 | T1 | 3.5h |
| 3 | 그레이스케일 인터랙션 | T1 | 4.5h |
| 4 | 스텝 전환 (scatter/gather) | T1 | 6.5h |
| 5 | **Flip 수렴 전환** | T1 | 10.5h |
| 6 | 프리로더 | T1 | 11.5h |
| 7 | 텍스트 리빌 + 커스텀 커서 | T1 | 13h |
| 8 | Lenis + 성능 방어 | T1 | 14h |
| 9 | 노이즈 그레인 | T2 | 14.5h |

> **5번(Flip 수렴)이 병목이다.** 여기서 막히면 6~8번을 잘라내고 5번을 완성하는 쪽이 옳다.
> 프리로더와 커스텀 커서는 없어도 사이트가 성립하지만, 수렴 전환이 없으면 컨셉 자체가 사라진다.
