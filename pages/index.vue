<script setup lang="ts">
/**
 * 랜딩 히어로 — 포스터 클러스터 + 마우스 패럴랙스 (DESIGN.md §2.2)
 *
 * 역할 분리 (DESIGN.md §6):
 * - Tailwind: 레이아웃(absolute/inset), 색상, grayscale/brightness 필터, 타이포, 반응형
 * - GSAP: transform(x/y — 패럴랙스, scale — 호버) 만 담당. quickTo로 매 mousemove마다
 *   gsap.to()를 새로 만들지 않는다 (프레임 붕괴 방지).
 * - 랜덤 위치/회전은 마운트 시 1회만 정하는 "정적 배치"이므로 top/left/rotate를
 *   인라인 스타일로 한 번만 찍는다 (계속 애니메이션하는 속성이 아니라 §5의
 *   "top/left 금지" 규칙과 충돌하지 않음).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'

type LayerName = 'back' | 'mid' | 'front'

interface PosterItem {
  id: number
  title: string
  posterUrl: string
  layer: LayerName
  top: number // %
  left: number // %
  rotation: number // deg
  size: number // px, 너비
  brightness: number // 레이어별 기본 밝기 (CSS 변수로 전달)
  zIndex: number
}

// DESIGN.md §1 --z-back/--z-mid/--z-front 와 동일한 값. 패럴랙스 이동량 계수로 사용.
const DEPTH: Record<LayerName, number> = { back: 0.3, mid: 0.6, front: 1.0 }
const LAYER_ORDER: LayerName[] = ['back', 'mid', 'front']

// "뒤 작고 어둡게 / 앞 크게" (DESIGN.md §2.2) — 레이어별 크기·밝기 범위
const SIZE_RANGE: Record<LayerName, [number, number]> = {
  back: [96, 124],
  mid: [132, 164],
  front: [172, 204],
}
const BRIGHTNESS: Record<LayerName, number> = { back: 0.5, mid: 0.65, front: 0.8 }
const BASE_Z: Record<LayerName, number> = { back: 10, mid: 20, front: 30 }

// 타원 궤도 배치 — 뒷레이어일수록 반경을 살짝 키워 원근감을 준다
const LAYER_RADIUS_MUL: Record<LayerName, number> = { back: 1.14, mid: 1.0, front: 0.88 }

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

const posters = ref<PosterItem[]>([])
const isLoading = ref(true)
const loadFailed = ref(false)

const backPosters = computed(() => posters.value.filter((p) => p.layer === 'back'))
const midPosters = computed(() => posters.value.filter((p) => p.layer === 'mid'))
const frontPosters = computed(() => posters.value.filter((p) => p.layer === 'front'))
function postersOf(layer: LayerName) {
  return layer === 'back' ? backPosters.value : layer === 'mid' ? midPosters.value : frontPosters.value
}

async function loadPosters() {
  try {
    const res = await $fetch<{ results: Array<{ id: number, title?: string, poster_path?: string | null }> }>(
      '/api/discover',
      { params: { mediaType: 'movie', 'vote_count.gte': 300 } },
    )
    const candidates = (res.results ?? []).filter((m) => !!m.poster_path).slice(0, 16)
    const total = candidates.length

    posters.value = candidates.map((m, i) => {
      const layer: LayerName = i < 5 ? 'back' : i < 11 ? 'mid' : 'front'
      const [minSize, maxSize] = SIZE_RANGE[layer]

      // 타원 궤도 배치: 인덱스 순서로 원주(2π)에 고르게 분산 + 지터
      const baseAngle = (i / total) * Math.PI * 2
      const angle = baseAngle + rand(-0.15, 0.15)

      // 가로(42~48%) / 세로(28~35%) 타원 — 가로가 더 넓은 납작한 형태
      const baseRadiusX = rand(42, 48)
      const baseRadiusY = rand(28, 35)
      // 반경에 0.7~1.0 계수를 곱해 링에 두께를 줌 (완벽한 원주 정렬 방지).
      // 최소값(0.28*0.7*0.88 ≈ 17%)도 중앙 30% 영역(반경 15%)보다 커서
      // BLINK 타이틀과 겹치지 않는다.
      const ringFactor = rand(0.7, 1.0)
      const radiusMul = LAYER_RADIUS_MUL[layer] * ringFactor
      const radiusX = baseRadiusX * radiusMul
      const radiusY = baseRadiusY * radiusMul

      return {
        id: m.id,
        title: m.title ?? '',
        posterUrl: `https://image.tmdb.org/t/p/w342${m.poster_path}`,
        layer,
        top: 50 + Math.sin(angle) * radiusY,
        left: 50 + Math.cos(angle) * radiusX,
        rotation: rand(-4, 4),
        size: rand(minSize, maxSize),
        brightness: BRIGHTNESS[layer],
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
    width: `${p.size}px`,
    // top/left는 타원 궤도 위의 "중심점"이므로 -50%/-50%로 앵커를 중앙에 맞춘다.
    // (마운트 시 1회만 찍는 정적 transform — GSAP은 이후 scale만 별도로 얹는다)
    transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
    zIndex: p.zIndex,
    '--poster-brightness': p.brightness,
  }
}

function onPosterEnter(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.zIndex = '50'
  gsap.to(el, { scale: 1.04, duration: 0.4, ease: 'power3.out' })
}
function onPosterLeave(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.zIndex = el.dataset.z ?? ''
  gsap.to(el, { scale: 1, duration: 0.4, ease: 'power3.out' })
}

// --- 마우스 패럴랙스 (레이어 단위 quickTo) ---
const clusterEl = ref<HTMLElement | null>(null)
const layerEls: Record<LayerName, HTMLElement | null> = { back: null, mid: null, front: null }
function setLayerRef(name: LayerName, el: Element | null) {
  layerEls[name] = (el as HTMLElement) ?? null
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

onMounted(() => {
  setupParallax() // 레이어 DOM은 항상 렌더되므로 포스터 로드를 기다릴 필요 없음
  loadPosters()
})

onUnmounted(() => {
  if (onMouseMove) window.removeEventListener('mousemove', onMouseMove)
  floatTweens.forEach((t) => t.kill())
  for (const name of LAYER_ORDER) {
    const el = layerEls[name]
    if (el) gsap.killTweensOf(el)
  }
})
</script>

<template>
  <section class="relative h-screen w-full overflow-hidden bg-bg">
    <!-- 헤드라인 -->
    <div
      class="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center px-gutter text-center"
    >
      <h1 class="text-display text-text">BLINK</h1>
      <p class="mt-4 max-w-site text-body text-text-dim">
        "뭐 보지?"를 30초 만에 끝내는 무드 기반 콘텐츠 큐레이터
      </p>
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
        <div
          v-for="poster in postersOf(name)"
          :key="poster.id"
          class="poster absolute overflow-hidden rounded-base border border-line grayscale brightness-[var(--poster-brightness)] transition-[filter] duration-fast ease-out hover:grayscale-0 hover:brightness-100"
          :style="posterStyle(poster)"
          :data-z="poster.zIndex"
          @mouseenter="onPosterEnter"
          @mouseleave="onPosterLeave"
        >
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
  </section>
</template>
