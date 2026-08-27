<script setup lang="ts">
/**
 * 랜딩 히어로 — 포스터 클러스터 + 마우스 패럴랙스 (DESIGN.md §2.2)
 *
 * 역할 분리 (DESIGN.md §6):
 * - CSS 전담: 색상. 포스터 기본값은 항상 컬러(filter: none). 호버 격리는
 *   순수 :hover 선택자만 사용 — JS 상태/이벤트 핸들러 없음:
 *     .cluster:hover .poster        → 전부 흑백
 *     .cluster .poster:hover        → 그 중 호버 포스터만 컬러
 *   호버 시 확대(scale)·z-index 승격도 CSS :hover.
 * - GSAP: transform 만 담당하되 엘리먼트별로 한 가지 축만 —
 *   .layer = x/y(패럴랙스, quickTo), .orbit = --wrapper-rot(궤도 회전).
 *   quickTo로 매 mousemove마다 gsap.to()를 새로 만들지 않는다 (프레임 붕괴 방지).
 *   .cluster 호버 중에는 회전을 pause — 정지 커서 밑에서 회전하는 엘리먼트의
 *   :hover 를 브라우저가 갱신하지 않아 색이 박제되는 문제를 막는다.
 * - 랜덤 위치/회전은 마운트 시 1회만 정하는 "정적 배치"이므로 top/left/rotate를
 *   인라인 스타일로 한 번만 찍는다 (계속 애니메이션하는 속성이 아니라 §5의
 *   "top/left 금지" 규칙과 충돌하지 않음).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'

type LayerName = 'back' | 'mid' | 'front'

interface PosterItem {
  uid: string // `${mediaType}-${id}` — movie/tv 간 id 충돌 방지용 v-for key
  title: string
  posterUrl: string
  layer: LayerName
  top: number // %
  left: number // %
  rotation: number // deg
  scale: number // depth 별 미세 크기차 (0.85~1.0)
  blur: number // px, depth 별 흐림
  brightness: number // depth 별 밝기
  zIndex: number
}

// DESIGN.md §1 --z-back/--z-mid/--z-front 와 동일한 값. 패럴랙스 이동량 계수로 사용.
const DEPTH: Record<LayerName, number> = { back: 0.3, mid: 0.6, front: 1.0 }
const LAYER_ORDER: LayerName[] = ['back', 'mid', 'front']

// 모든 포스터 공통 너비(px). TMDB w342 의 2:3 비율은 <img> h-auto 로 유지된다.
const BASE_WIDTH = 140

// 원근감은 "극단적 크기차" 대신 미세 scale + blur + brightness 로만 표현한다.
// (크기차 15% 이내 — depth 0.3 → 0.85, depth 1.0 → 1.0)
const LAYER_STYLE: Record<LayerName, { scale: number, blur: number, brightness: number }> = {
  back: { scale: 0.85, blur: 1.5, brightness: 0.6 },
  mid: { scale: 0.92, blur: 0.6, brightness: 0.78 },
  front: { scale: 1.0, blur: 0, brightness: 1.0 },
}
const BASE_Z: Record<LayerName, number> = { back: 10, mid: 20, front: 30 }

// 타원 궤도 배치 — 뒷레이어일수록 반경을 살짝 키워 원근감을 준다
const LAYER_RADIUS_MUL: Record<LayerName, number> = { back: 1.14, mid: 1.0, front: 0.88 }

// 포아송 디스크 근사 — 배치 시 뭉침/공백 완화.
// MIN_DIST 8%로는 포스터 폭(~10%)에 못 미쳐 시각적으로 붙어 보였다 → 15%로 상향.
const MIN_DIST = 15 // 뷰포트 % — 이미 배치된 포스터 중심과 최소 이만큼 떨어뜨린다
const MAX_PLACE_TRIES = 20

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function layerOf(index: number): LayerName {
  return index < 5 ? 'back' : index < 11 ? 'mid' : 'front'
}

// 타원 궤도 위의 후보 좌표 1개.
// 기존 로직 그대로: 인덱스 기반 기준 각도 + 지터(±0.15rad) + 랜덤 반경(ringFactor 0.72~1.0).
function candidatePosition(index: number, total: number, layer: LayerName) {
  const angle = (index / total) * Math.PI * 2 + rand(-0.15, 0.15)
  // 가로(42~48%) / 세로(32~38%) 타원 — 가로가 더 넓은 납작한 형태.
  // 세로 반경은 중앙 카피(BLINK + 태그라인 + START CTA)를 피하도록 넉넉히.
  const ringFactor = rand(0.72, 1.0)
  const radiusMul = LAYER_RADIUS_MUL[layer] * ringFactor
  return {
    left: 50 + Math.cos(angle) * rand(42, 48) * radiusMul,
    top: 50 + Math.sin(angle) * rand(32, 38) * radiusMul,
  }
}

type Point = { top: number, left: number }

function minGap(cand: Point, placed: Point[]) {
  let m = Infinity
  for (const p of placed) {
    const d = Math.hypot(p.left - cand.left, p.top - cand.top)
    if (d < m) m = d
  }
  return m
}

// 각 포스터마다 후보를 최대 20회 뽑아, MIN_DIST 를 만족하는 첫 후보를 채택한다.
// 20회 내내 실패하면 그중 "가장 멀리 떨어진" 후보로 타협 (완벽하진 않아도 뭉침 완화).
function placePositions(count: number): Point[] {
  const placed: Point[] = []
  for (let i = 0; i < count; i++) {
    const layer = layerOf(i)
    let best = candidatePosition(i, count, layer)
    let bestGap = placed.length ? minGap(best, placed) : Infinity
    for (let t = 1; t < MAX_PLACE_TRIES && bestGap < MIN_DIST; t++) {
      const cand = candidatePosition(i, count, layer)
      const gap = minGap(cand, placed)
      if (gap > bestGap) {
        best = cand
        bestGap = gap
      }
    }
    placed.push(best)
  }
  return placed
}

const posters = ref<PosterItem[]>([])
const isLoading = ref(true)
const loadFailed = ref(false)

const router = useRouter()
const isLeaving = ref(false) // /pick 이동 전환 중 — 중복 클릭 잠금

const backPosters = computed(() => posters.value.filter((p) => p.layer === 'back'))
const midPosters = computed(() => posters.value.filter((p) => p.layer === 'mid'))
const frontPosters = computed(() => posters.value.filter((p) => p.layer === 'front'))
function postersOf(layer: LayerName) {
  return layer === 'back' ? backPosters.value : layer === 'mid' ? midPosters.value : frontPosters.value
}

async function loadPosters() {
  try {
    // 고정 큐레이션 목록(data/heroPosters.ts)의 poster_path 만 서버에서 조회.
    // 랜덤 discover 호출 없음 — 목록이 곧 화면이다.
    const res = await $fetch<Array<{ id: number, mediaType: string, title: string, poster_path: string }>>(
      '/api/hero-posters',
    )
    const candidates = res.slice(0, 16)
    const total = candidates.length
    const positions = placePositions(total) // 포아송 디스크 근사로 겹침/공백 완화

    // 현재 화면에 뜬 고정 목록 확인용 (개발 모드 전용)
    if (import.meta.dev) {
      console.table(candidates.map((m) => ({ id: m.id, media_type: m.mediaType, title: m.title })))
    }

    posters.value = candidates.map((m, i) => {
      const layer = layerOf(i)
      const s = LAYER_STYLE[layer]
      return {
        uid: `${m.mediaType}-${m.id}`,
        title: m.title,
        posterUrl: `https://image.tmdb.org/t/p/w342${m.poster_path}`,
        layer,
        top: positions[i].top,
        left: positions[i].left,
        rotation: rand(-4, 4),
        scale: s.scale,
        blur: s.blur,
        brightness: s.brightness,
        zIndex: BASE_Z[layer],
      }
    })
  }
  catch {
    loadFailed.value = true
  }
  finally {
    isLoading.value = false
  }
}

function posterStyle(p: PosterItem) {
  return {
    top: `${p.top}%`,
    left: `${p.left}%`,
    width: `${BASE_WIDTH}px`, // 전 포스터 공통. depth 차이는 아래 scale 로만.
    // top/left는 타원 궤도 위의 "중심점"이므로 -50%/-50%로 앵커를 중앙에 맞춘다.
    // rotate(calc(var(--wrapper-rot) * -1deg)) — 부모 .orbit 의 회전(--wrapper-rot,
    // GSAP이 유일하게 애니메이트하는 값)을 그대로 상쇄해 포스터를 항상 똑바로 세운다.
    // 그 뒤 개별 기울기(p.rotation) + depth scale 을 얹는다. (개별 GSAP 회전 트윈 없음)
    transform: `translate(-50%, -50%) rotate(calc(var(--wrapper-rot, 0) * -1deg)) rotate(${p.rotation}deg) scale(${p.scale})`,
    // z-index 는 CSS 변수로 넘긴다 → .poster:hover 에서 순수 CSS 로 승격 가능
    // (인라인 z-index 였다면 스타일시트의 :hover 규칙이 덮어쓰지 못함).
    '--z': p.zIndex,
    '--depth-blur': `${p.blur}px`, // .poster-card 가 참조 (depth 흐림)
    '--depth-brightness': p.brightness, // .poster-card 가 참조 (depth 밝기)
  }
}

// 호버 색상·확대·z-index 는 전부 순수 CSS(:hover)로 처리한다. JS 상태/이벤트 핸들러 없음
// — 회전 중 mouseleave 유실로 상태가 박제되던 버그 제거.

// --- 마우스 패럴랙스 (레이어 단위 quickTo) ---
const clusterEl = ref<HTMLElement | null>(null)
const layerEls: Record<LayerName, HTMLElement | null> = { back: null, mid: null, front: null }
function setLayerRef(name: LayerName, el: Element | null) {
  layerEls[name] = (el as HTMLElement) ?? null
}

// --- 타원 궤도 자동 회전 (.orbit 래퍼) ---
// transform 충돌 방지를 위해 레이어를 분리한다:
//   .layer      → GSAP quickTo x/y (패럴랙스)
//   .orbit      → GSAP이 --wrapper-rot 하나만 애니메이트, CSS가 rotate()로 변환
//   .poster     → CSS 로 부모 회전 상쇄 + 개별 기울기 + depth scale (인라인)
//   .poster-card→ CSS :hover scale (호버 확대)
const orbitEls: Record<LayerName, HTMLElement | null> = { back: null, mid: null, front: null }
function setOrbitRef(name: LayerName, el: Element | null) {
  orbitEls[name] = (el as HTMLElement) ?? null
}
const orbitTweens: gsap.core.Tween[] = []
let onClusterEnter: (() => void) | null = null
let onClusterLeave: (() => void) | null = null

function setupOrbit() {
  // 접근성: 모션 축소 설정이면 회전을 걸지 않는다
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const name of LAYER_ORDER) {
    const el = orbitEls[name]
    if (!el) continue
    gsap.set(el, { '--wrapper-rot': 0 })
    // 부모 하나만 애니메이션 — 90초에 한 바퀴, 등속(ease none), 무한 반복.
    // 자식 포스터는 개별 트윈 없이 CSS calc(-1 * var(--wrapper-rot)) 로 상쇄된다.
    orbitTweens.push(
      gsap.to(el, { '--wrapper-rot': 360, duration: 90, repeat: -1, ease: 'none' }),
    )
  }

  // 회전 중에는 브라우저가 "정지한 커서 밑에서 움직이는 엘리먼트"의 :hover 를
  // 갱신하지 않아, 커서를 안 움직이면 방금 지나간 포스터가 컬러로 박제된다.
  // → 클러스터에 커서가 들어오면 회전을 멈춘다(정적 상태에서 :hover 정확).
  //   벗어나면 재개. 리스너는 전체 화면을 덮는 .cluster 에 1쌍만 — 회전하지
  //   않는 엘리먼트라 mouseleave 유실 위험이 없다. JS 상태 변수는 두지 않고
  //   트윈 자체의 play/pause 만 토글한다.
  const cluster = clusterEl.value
  if (!cluster) return
  onClusterEnter = () => orbitTweens.forEach((t) => t.pause())
  onClusterLeave = () => orbitTweens.forEach((t) => t.resume())
  cluster.addEventListener('mouseenter', onClusterEnter)
  cluster.addEventListener('mouseleave', onClusterLeave)
}

const quickSetters: Partial<Record<LayerName, { x: (v: number) => void, y: (v: number) => void }>> = {}
let onMouseMove: ((e: MouseEvent) => void) | null = null
const floatTweens: gsap.core.Tween[] = []

function setupParallax() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isTouch = window.matchMedia('(hover: none)').matches

  for (const name of LAYER_ORDER) {
    const el = layerEls[name]
    if (!el) continue
    // 반드시 quickTo 사용 — mousemove마다 gsap.to()를 새로 만들면 프레임이 붕괴된다.
    quickSetters[name] = {
      x: gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' }),
      y: gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' }),
    }
  }

  if (reduceMotion) return // 접근성: 모션 자체를 걸지 않는다

  if (isTouch) {
    // 터치 기기 폴백 — 마우스 추적 대신 레이어별 무한 부유 모션
    for (const name of LAYER_ORDER) {
      const el = layerEls[name]
      if (!el) continue
      floatTweens.push(
        gsap.to(el, { y: '+=20', duration: 4, yoyo: true, repeat: -1, ease: 'sine.inOut' }),
      )
    }
    return
  }

  onMouseMove = (e: MouseEvent) => {
    const rect = clusterEl.value?.getBoundingClientRect()
    if (!rect) return
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1 // -1 ~ 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    for (const name of LAYER_ORDER) {
      const depth = DEPTH[name]
      quickSetters[name]?.x(-nx * depth * 40)
      quickSetters[name]?.y(-ny * depth * 40)
    }
  }
  window.addEventListener('mousemove', onMouseMove)
}

// CTA → /pick. 이동 전에 DESIGN §2.5 scatter out 을 짧게 태운다:
// 클러스터 포스터가 흩어지며 페이드아웃(0.45s) 후 라우팅. 모션 축소 / 포스터
// 미로드 시엔 즉시 이동. transform 상쇄 계산이 걸린 .poster 대신 자식
// .poster-card 를 애니메이트해 회전 상쇄 로직과 충돌하지 않게 한다.
function goToPick() {
  if (isLeaving.value) return
  isLeaving.value = true

  const cards = gsap.utils.toArray<HTMLElement>('.poster-card')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || cards.length === 0) {
    router.push('/pick')
    return
  }

  orbitTweens.forEach((t) => t.pause()) // 흩어지는 동안 궤도 회전 정지
  gsap.to('.hero-copy', { opacity: 0, duration: 0.3, ease: 'power2.in' })
  gsap.to(cards, {
    opacity: 0,
    scale: 0.8,
    x: () => gsap.utils.random(-80, 80),
    y: () => gsap.utils.random(-80, 80),
    duration: 0.45,
    ease: 'power2.in',
    stagger: 0.02,
    onComplete: () => router.push('/pick'),
  })
}

onMounted(() => {
  setupParallax() // 레이어 DOM은 항상 렌더되므로 포스터 로드를 기다릴 필요 없음
  setupOrbit()
  loadPosters()
})

onUnmounted(() => {
  if (onMouseMove) window.removeEventListener('mousemove', onMouseMove)
  if (onClusterEnter) clusterEl.value?.removeEventListener('mouseenter', onClusterEnter)
  if (onClusterLeave) clusterEl.value?.removeEventListener('mouseleave', onClusterLeave)
  floatTweens.forEach((t) => t.kill())
  orbitTweens.forEach((t) => t.kill())
  gsap.killTweensOf(['.poster-card', '.hero-copy']) // CTA scatter-out 전환 정리
  for (const name of LAYER_ORDER) {
    if (layerEls[name]) gsap.killTweensOf(layerEls[name] as HTMLElement)
    if (orbitEls[name]) gsap.killTweensOf(orbitEls[name] as HTMLElement)
  }
})
</script>

<template>
  <section class="relative h-screen w-full overflow-hidden bg-bg">
    <!-- 헤드라인 -->
    <div
      class="hero-copy pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center px-gutter text-center"
    >
      <h1 class="text-display text-text">BLINK</h1>
      <p class="mt-4 max-w-site text-body text-text-dim">
        "뭐 보지?"를 30초 만에 끝내는 무드 기반 콘텐츠 큐레이터
      </p>

      <!-- CTA — 배경 없이 테두리만. 호버 시 border·텍스트만 --accent 로 (무드 유지) -->
      <button
        type="button"
        class="pointer-events-auto mt-6 inline-flex items-center border border-line px-10 py-4 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent disabled:opacity-40"
        :disabled="isLeaving"
        @click="goToPick"
      >
        Start
      </button>

      <p v-if="isLoading" class="mt-8 text-caption text-text-mute">포스터를 불러오는 중…</p>
      <p v-else-if="loadFailed" class="mt-8 text-caption text-text-mute">
        포스터를 불러오지 못했습니다. .env의 TMDB_API_KEY를 확인해주세요.
      </p>
    </div>

    <!-- 포스터 클러스터 -->
    <div ref="clusterEl" class="cluster absolute inset-0">
      <div
        v-for="name in LAYER_ORDER"
        :key="name"
        :ref="(el) => setLayerRef(name, el as Element | null)"
        class="layer absolute inset-0 will-change-transform"
      >
        <!-- .orbit: GSAP이 --wrapper-rot 만 애니메이트, 회전 변환은 CSS(<style>)가 담당 -->
        <div
          :ref="(el) => setOrbitRef(name, el as Element | null)"
          class="orbit absolute inset-0 will-change-transform"
        >
          <div
            v-for="poster in postersOf(name)"
            :key="poster.uid"
            class="poster absolute"
            :style="posterStyle(poster)"
          >
            <div class="poster-card overflow-hidden rounded-base border border-line will-change-transform">
              <img
                :src="poster.posterUrl"
                :alt="poster.title"
                class="block h-auto w-full select-none pointer-events-none"
                loading="lazy"
                draggable="false"
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style>
/**
 * 히어로 클러스터 — 색상·회전 (순수 CSS 파트)
 * GSAP은 .orbit 의 --wrapper-rot(0→360) 만 건드리고, 실제 회전 변환과
 * 호버 격리는 전부 여기서 처리한다.
 */

/* GSAP이 setProperty 로 써 넣는 숫자값. 등록해두면 보간이 안정적이고,
   미설정(모션 축소 등) 시 initial-value 0 으로 안전하게 폴백된다. */
@property --wrapper-rot {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

/* 타원 궤도: 부모 하나만 회전 → 자식 포스터 위치가 통째로 돈다 */
.orbit {
  transform: rotate(calc(var(--wrapper-rot, 0) * 1deg));
}

/* ── 마우스 이벤트: 레이어 wrapper 는 투과, 포스터만 수신 ──────────────
   .layer / .orbit 는 화면 전체(inset-0)를 덮는 투명 wrapper. 기본 상태면
   맨 앞 레이어가 뒤 레이어 포스터의 호버를 전부 가로챈다. wrapper 를
   pointer-events:none 으로 뚫고, 실제 포스터에서만 다시 auto 로 켠다.
   (.cluster 는 auto 유지 — :hover 판정과 회전 pause 리스너가 여기 붙는다) */
.layer,
.orbit {
  pointer-events: none;
}
.poster {
  pointer-events: auto;
}

/* hit box == 보이는 이미지 영역:
   .poster 는 width=140px / height=auto 라 박스가 이미지(2:3)와 정확히 일치하고
   내부에 투명 패딩·마진이 없다(.poster-card 1px border 뿐). 겹친 영역에서는
   z-index 큰 포스터(호버 중 50, 아니면 --z)가 호버를 가져간다 — 의도된 동작. */

/* ── 호버 색상: 순수 CSS :hover 만 사용, JS 상태/핸들러 없음 ──────────
   1) 기본값 — 모든 포스터 컬러 (filter: none)
   2) 클러스터에 커서가 있으면 전부 흑백
   3) 그 중 :hover 중인 포스터만 다시 컬러
   커서가 클러스터를 벗어나면 (1)로 복귀 → 전부 컬러.
   (2)와 (3)은 특이도가 같아 소스 순서상 뒤에 오는 (3)이 이긴다.
   grayscale 은 .poster 에, depth blur/brightness 는 자식 .poster-card 에
   따로 걸어 두 filter 가 합성되게 한다(한 엘리먼트의 filter 는 덮어써지므로). */
.poster {
  z-index: var(--z, 0);
  filter: none;
  transition: filter 0.4s ease;
}
.cluster:hover .poster {
  filter: grayscale(1);
  transition: filter 0.4s ease;
}
.cluster .poster:hover {
  filter: none;
  z-index: 50; /* 호버 포스터를 맨 앞으로 */
}

/* ── depth 보강: 뒤 레이어일수록 흐리고 어둡게. 호버 시엔 선명·제 밝기로 팝 ── */
.poster-card {
  filter: blur(var(--depth-blur, 0)) brightness(var(--depth-brightness, 1));
  transition:
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.4s ease;
}
.poster:hover .poster-card {
  transform: scale(1.04); /* .poster 의 depth scale 위에 합성됨 */
  filter: none;
}

@media (prefers-reduced-motion: reduce) {
  .poster,
  .cluster:hover .poster,
  .cluster .poster:hover,
  .poster-card {
    transition: none;
  }
  .poster:hover .poster-card {
    transform: none;
  }
}
</style>
