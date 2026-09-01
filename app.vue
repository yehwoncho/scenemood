<script setup lang="ts">
/**
 * 전역 기본 메타 (OG / SEO). 페이지별로 useSeoMeta 를 다시 호출하면 덮어쓴다.
 * - og:image 는 크롤러가 상대경로를 못 읽으므로 반드시 절대 URL.
 * - canonical / og:url 은 현재 경로 기준으로 만든다 (모든 페이지를 / 로
 *   정규화하면 /pick 이 색인에서 빠진다).
 * - twitter:title/description 은 따로 두지 않는다 — 스크레이퍼가 없으면 og 를 쓴다.
 *
 * 보관함(찜하기·별점) 로그인 상태 감시 — 앱 전역에서 한 번만.
 * 로그인되면(부팅 시 이미 로그인돼 있던 경우 포함) useLibraryStore().loadAll(),
 * 로그아웃되면 이전 사용자 데이터가 남지 않도록 clear().
 */
import { watch } from 'vue'
import { useLibraryStore } from '~/stores/library'

const SITE_URL = 'https://scenemood-277.vercel.app'
const OG_IMAGE = `${SITE_URL}/og-image.png`
const DESCRIPTION = '"뭐 보지?"를 30초 만에 끝내는 무드 기반 콘텐츠 큐레이터'

const route = useRoute()
const canonical = computed(() => SITE_URL + (route.path === '/' ? '' : route.path))

useHead({
  htmlAttrs: { lang: 'ko' },
  link: [{ rel: 'canonical', href: () => canonical.value }],
})

useSeoMeta({
  title: 'BLINK — 뭐 보지? 30초면 충분해요',
  description: DESCRIPTION,
  ogType: 'website',
  ogLocale: 'ko_KR',
  ogSiteName: 'BLINK',
  ogTitle: 'BLINK — 뭐 보지? 30초면 충분해요',
  ogDescription: DESCRIPTION,
  ogUrl: () => canonical.value,
  ogImage: OG_IMAGE,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'BLINK — 무드 기반 콘텐츠 큐레이터',
  twitterCard: 'summary_large_image',
  twitterImage: OG_IMAGE,
})

const user = useSupabaseUser()
const library = useLibraryStore()
watch(
  user,
  (u) => {
    if (u) library.loadAll()
    else library.clear()
  },
  { immediate: true },
)
</script>

<template>
  <NuxtPage />
  <LoginModal />
</template>
