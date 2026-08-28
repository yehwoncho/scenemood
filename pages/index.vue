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
 * - 포스터 위치(left/top px)는 마운트 시 1회 계산 + resize 시에만 재계산하는
 *   "정적 배치"다. 매 프레임 바뀌는 속성이 아니라 §5의 "top/left 애니메이션 금지"
 *   규칙과 충돌하지 않는다. arrangement(각도·반경계수)는 고정, px 만 뷰포트에 맞춰 스케일.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'

type LayerName = 'back' | 'mid' | 'front'

interface PosterItem {
  uid: string // `${mediaType}-${id}` — movie/tv 간 id 충돌 방지용 v-for key
  title: string
  posterUrl: string
  layer: LayerName
  arrangement: Arrangement // resize 시 px 재계산용 (각도·반경계수는 고정)
  x: number // px, 뷰포트 좌상단 기준 포스터 중심
  y: number // px
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

// ── 타원 클러스터 배치 ───────────────────────────────────────────────
// 반경·중심·최소거리를 전부 뷰포트 px 로 계산한다 (%가 아니라).
// left:% 는 가로에 vw, top:% 는 세로에 vh 를 곱하므로, 이 둘을 섞어 거리 판정을
// 하면 16:10 처럼 비율이 바뀔 때 좌우 밀도가 쏠린다. window.innerWidth/Height 를
// 런타임에 읽고, resize 시 arrangement(각도·반경계수)는 그대로 둔 채 px 만 다시 계산한다.
const RADIUS_FRAC = { x: 0.42, y: 0.32 } // 각 축 기준 기본 반경 비율 (가로가 넓은 납작한 타원)
const LAYER_RADIUS_MUL: Record<LayerName, number> = { back: 1.06, mid: 1.0, front: 0.92 }
const RING_MIN = 0.55 // 반경에 0.55~1.0 계수 → 링에 두께를 줘 tangential 뭉침 완화
const MIN_DIST_FRAC = 0.16 // 포스터 간 최소 중심거리 = min(vw, vh) * 이 값
const MAX_PLACE_TRIES = 24
const EDGE_MARGIN = 64 // 화면 밖으로 나가지 않도록 좌표를 가두는 최소 여백(px)
const SAFE_PAD = { x: 40, y: 44 } // 중앙 카피(제목·태그라인·CTA) 안전 영역 여유(px)

interface Arrangement {
  angle: number
  ring: number
}
type PxPoint = { x: number, y: number }
type SafeBox = { l: number, r: number, t: number, b: number }

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function layerOf(index: number): LayerName {
  return index < 5 ? 'back' : index < 11 ? 'mid' : 'front'
}

// 인덱스로 원주(2π)에 고르게 나눈 기준 각도 + 지터, 반경 계수는 랜덤.
function randomArrangement(index: number, total: number): Arrangement {
  return {
    angle: (index / total) * Math.PI * 2 + rand(-0.22, 0.22),
    ring: rand(RING_MIN, 1.0),
  }
}

// arrangement → 현재 뷰포트 기준 실제 px 좌표. 화면 밖으로는 안 나가게 clamp.
function resolvePos(a: Arrangement, layer: LayerName, vw: number, vh: number): PxPoint {
  const mul = LAYER_RADIUS_MUL[layer] * a.ring
  return {
    x: clampNum(vw / 2 + Math.cos(a.angle) * vw * RADIUS_FRAC.x * mul, EDGE_MARGIN, vw - EDGE_MARGIN),
    y: clampNum(vh / 2 + Math.sin(a.angle) * vh * RADIUS_FRAC.y * mul, EDGE_MARGIN, vh - EDGE_MARGIN),
  }
}

const inBox = (p: PxPoint, b: SafeBox) => p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b

function minGapPx(cand: PxPoint, placed: PxPoint[]) {
  let m = Infinity
  for (const p of placed) {
    const d = Math.hypot(p.x - cand.x, p.y - cand.y)
    if (d < m) m = d
  }
  return m
}

// 포아송 디스크 근사: 후보를 최대 24회 뽑아, 중앙 카피 안전 영역을 피하면서
// 최소거리(min(vw,vh) * MIN_DIST_FRAC)를 만족하는 첫 후보를 채택.
// 24회 내내 실패하면 그중 가장 멀리 떨어진 후보로 타협한다.
function placeArrangements(count: number, vw: number, vh: number, safe: SafeBox | null): Arrangement[] {
  const minDist = Math.min(vw, vh) * MIN_DIST_FRAC
  const chosen: Arrangement[] = []
  const chosenPos: PxPoint[] = []
  for (let i = 0; i < count; i++) {
    const layer = layerOf(i)
    let best: Arrangement | null = null
    let bestPos: PxPoint | null = null
    let bestGap = -1
    for (let t = 0; t < MAX_PLACE_TRIES; t++) {
      const a = randomArrangement(i, count)
      const pos = resolvePos(a, layer, vw, vh)
      if (safe && inBox(pos, safe)) continue // 중앙 카피 안전 영역이면 후보 폐기
      const gap = chosenPos.length ? minGapPx(pos, chosenPos) : Infinity
      if (gap >= minDist) {
        best = a
        bestPos = pos
        break
      }
      if (gap > bestGap) {
        best = a
        bestPos = pos
        bestGap = gap
      }
    }
    if (!best || !bestPos) {
      // 24회 모두 안전 영역에 걸린 극단적 경우 — 링 최대 반경으로 바깥쪽에 둔다
      best = { angle: randomArrangement(i, count).angle, ring: 1.0 }
      bestPos = resolvePos(best, layer, vw, vh)
    }
    chosen.push(best)
    chosenPos.push(bestPos)
  }
  return chosen
}

const posters = ref<PosterItem[]>([])
const isLoading = ref(true)
const loadFailed = ref(false)

const router = useRouter()
const isLeaving = ref(false) // /pick 이동 전환 중 — 중복 클릭 잠금

// 중앙 카피 블록(제목·태그라인·CTA) — 배치 안전 영역 측정용
const copyEl = ref<HTMLElement | null>(null)

function copySafeBox(vw: number, vh: number): SafeBox {
  const r = copyEl.value?.getBoundingClientRect()
  if (!r) {
    // 폴백: 화면 중앙 세로 스트립
    const halfW = Math.min(vw * 0.32, 360)
    return { l: vw / 2 - halfW, r: vw / 2 + halfW, t: vh / 2 - 150, b: vh / 2 + 170 }
  }
  return {
    l: r.left - SAFE_PAD.x,
    r: r.right + SAFE_PAD.x,
    t: r.top - SAFE_PAD.y,
    b: r.bottom + SAFE_PAD.y,
  }
}

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

    const vw = window.innerWidth
    const vh = window.innerHeight
    const arrangements = placeArrangements(total, vw, vh, copySafeBox(vw, vh))

    // 현재 화면에 뜬 고정 목록 확인용 (개발 모드 전용)
    if (import.meta.dev) {
      console.table(candidates.map((m) => ({ id: m.id, media_type: m.mediaType, title: m.title })))
    }

    posters.value = candidates.map((m, i) => {
      const layer = layerOf(i)
      const s = LAYER_STYLE[layer]
      const pos = resolvePos(arrangements[i], layer, vw, vh)
      return {
        uid: `${m.mediaType}-${m.id}`,
        title: m.title,
        posterUrl: `https://image.tmdb.org/t/p/w342${m.poster_path}`,
        layer,
        arrangement: arrangements[i],
        x: pos.x,
        y: pos.y,
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
    left: `${p.x}px`, // 뷰포트 px — resize 시 relayout() 가 갱신
    top: `${p.y}px`,
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

// resize: arrangement(각도·반경계수)는 고정한 채 새 뷰포트로 px 만 다시 계산.
// → 클러스터 "모양"은 유지되고 화면 비율에 맞게 스케일만 바뀐다 (재랜덤 없음).
let resizeRaf = 0
function relayout() {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    for (const p of posters.value) {
      const pos = resolvePos(p.arrangement, p.layer, vw, vh)
      p.x = pos.x
      p.y = pos.y
    }
  })
}

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
  window.addEventListener('resize', relayout)
})

onUnmounted(() => {
  if (onMouseMove) window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', relayout)
  cancelAnimationFrame(resizeRaf)
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
      class="hero-copy pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-gutter"
    >
      <!-- 카피 뒤 스크림 — 클러스터(z 10~30) 위, 텍스트 아래.
           좁은/세로 화면에서 타원 클러스터가 중앙으로 몰려 카피를 가려도
           최소한 읽히게 한다 (제약사항 "모바일은 레이아웃 깨짐 방지 수준"). -->
      <div class="hero-scrim" aria-hidden="true" />

      <!-- copyEl: 실제 카피 블록. 배치 안전 영역을 이 요소의 bounding box 로 잰다. -->
      <div ref="copyEl" class="relative flex flex-col items-center text-center">
        <h1 class="text-display text-text">BLINK</h1>
        <p class="mt-4 max-w-site text-body text-text-dim">
          "뭐 보지?"를 30초 만에 끝내는 무드 기반 콘텐츠 큐레이터
        </p>

        <!-- CTA — 배경 없이 테두리만. 호버/포커스 시 border·텍스트만 --accent 로 (무드 유지).
             focus:outline-none 으로 UA 포커스 사각 테두리 제거, focus-visible 로 대체 -->
        <button
          type="button"
          class="pointer-events-auto mt-7 inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus:outline-none disabled:opacity-40"
          :disabled="isLeaving"
          @click="goToPick"
        >
          Start
        </button>

        <p v-if="isLoading" class="mt-8 text-caption text-text-mute">포스터를 불러오는 중…</p>
        <p v-else-if="loadFailed" class="mt-8 text-caption text-text-mute">
          포스터를 불러오지 못했어요 — 시작하는 데는 문제 없어요
        </p>
      </div>
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

/* ── 카피 뒤 스크림 ──────────────────────────────────────────────
   .hero-copy(z-40) 의 첫 자식이므로 클러스터(z 10~30) 위, 텍스트(뒤 형제) 아래.
   데스크톱은 중앙 안전 영역이 이미 확보돼 거의 안 보일 만큼 옅게, 900px 이하에서는
   타원 클러스터가 중앙으로 몰리므로 진하게 깔아 카피 가독성을 지킨다. */
.hero-scrim {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(820px, 94vw);
  height: min(560px, 64vh);
  transform: translate(-50%, -50%);
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    rgba(10, 10, 10, 0.45) 0%,
    rgba(10, 10, 10, 0.28) 44%,
    rgba(10, 10, 10, 0) 74%
  );
}
@media (max-width: 900px) {
  .hero-scrim {
    background: radial-gradient(
      ellipse at center,
      rgba(10, 10, 10, 0.95) 0%,
      rgba(10, 10, 10, 0.85) 40%,
      rgba(10, 10, 10, 0) 76%
    );
  }
}
</style>
