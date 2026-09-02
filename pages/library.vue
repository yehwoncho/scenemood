<script setup lang="ts">
/**
 * /library — 보관함 (찜 목록 + 내 별점).
 *
 * - 로그인 상태는 app.vue 가 전역으로 감시해 useLibraryStore().loadAll() 을 호출한다
 *   (로그인 직후·앱 부팅 시 이미 로그인된 경우 모두 커버). 이 페이지는 그 결과를
 *   그대로 읽기만 하면 된다 — 다만 이 페이지로 직접 들어온 레이스를 대비해
 *   onMounted 에서 한 번 더 방어적으로 확인한다.
 * - 카드 클릭 시 TitleModal 을 그대로 재사용한다. bookmarks 테이블엔 overview 등
 *   상세 정보가 없지만, TitleModal 이 마운트되면서 /api/detail 로 채우므로
 *   0/빈 문자열 폴백은 아주 잠깐만 보인다.
 */
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useLibraryStore } from '~/stores/library'
import type { PoolItem } from '~/stores/result'

useSeoMeta({
  title: '보관함 - BLINK',
  description: '내가 찜한 작품과 별점을 모아볼 수 있는 보관함',
})

const user = useSupabaseUser()
const library = useLibraryStore()
const auth = useAuthStore()
const route = useRoute()

// /auth/confirm 서버 콜백이 code 교환에 실패하면 ?auth_error=<사유> 를 달고 돌려보낸다.
const authError = computed(() =>
  typeof route.query.auth_error === 'string' ? route.query.auth_error : '',
)

onMounted(() => {
  if (user.value && !library.loaded && !library.loading) library.loadAll()
})

function posterUrl(path: string | null) {
  return path ? `https://image.tmdb.org/t/p/w342${path}` : ''
}

const activeItem = ref<PoolItem | null>(null)
function openDetail(row: { tmdb_id: number, title: string, poster_path: string | null }) {
  activeItem.value = {
    id: row.tmdb_id,
    title: row.title,
    poster_path: row.poster_path,
    overview: '',
    runtime: null,
    vote_average: 0,
  }
}

function removeBookmark(row: { tmdb_id: number, title: string, poster_path: string | null }) {
  library.toggleBookmark({ id: row.tmdb_id, title: row.title, poster_path: row.poster_path })
}
</script>

<template>
  <main class="flex min-h-screen flex-col bg-bg px-gutter py-24">
    <div class="mx-auto w-full max-w-site flex-1">
      <header class="mb-12">
        <span class="pick-card__eyebrow">LIBRARY</span>
        <h1 class="mt-3 text-h1 text-text">내 보관함</h1>
      </header>

      <!-- 비로그인 -->
      <div v-if="!user" class="library-empty">
        <p v-if="authError" class="library-error">{{ authError }}</p>
        <p class="text-body text-text-dim">로그인하면 찜한 작품과 별점을 모아볼 수 있어요.</p>
        <button type="button" class="library-cta" @click="auth.openLogin">
          이메일로 로그인
        </button>
      </div>

      <!-- 로딩 -->
      <p v-else-if="library.loading" class="text-caption text-text-mute">불러오는 중…</p>

      <!-- 빈 보관함 -->
      <div v-else-if="!library.bookmarkList.length" class="library-empty">
        <p class="text-body text-text-dim">아직 찜한 작품이 없어요.</p>
        <NuxtLink to="/pick" class="library-cta">
          작품 찾으러 가기
        </NuxtLink>
      </div>

      <!-- 목록 -->
      <div v-else class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <article v-for="row in library.bookmarkList" :key="row.id" class="library-card">
          <div
            class="library-card__poster"
            role="button"
            tabindex="0"
            :aria-label="`${row.title} 상세 보기`"
            @click="openDetail(row)"
            @keydown.enter.prevent="openDetail(row)"
            @keydown.space.prevent="openDetail(row)"
          >
            <img
              v-if="row.poster_path"
              :src="posterUrl(row.poster_path)"
              :alt="row.title"
              loading="lazy"
            >
            <span v-else class="library-card__poster-fallback">{{ row.title }}</span>
            <button
              type="button"
              class="library-card__remove"
              aria-label="찜 해제"
              @click.stop="removeBookmark(row)"
            >
              ✕
            </button>
          </div>
          <h2 class="library-card__title">{{ row.title }}</h2>
          <StarRating :item="{ id: row.tmdb_id, title: row.title, poster_path: row.poster_path }" size="sm" class="mt-1.5" />
        </article>
      </div>
    </div>

    <TitleModal
      v-if="activeItem"
      :item="activeItem"
      @close="activeItem = null"
    />
  </main>
</template>

<style>
.library-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.25rem;
  padding: 4rem 0;
}
.library-error {
  font-size: 13px;
  line-height: 1.6;
  color: #ff6b6b;
  word-break: keep-all;
}
.library-cta {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  padding: 0.85rem 2rem;
  font-size: 13px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--text);
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.library-cta:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.library-card__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--line);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.library-card__poster:hover,
.library-card__poster:focus-visible {
  border-color: var(--accent);
  outline: none;
}
.library-card__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.library-card__poster-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}
.library-card__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-dim);
  background: rgba(10, 10, 10, 0.55);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.library-card__remove:hover {
  color: var(--accent);
}
.library-card__title {
  margin-top: 0.6rem;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
  word-break: keep-all;
}
</style>
