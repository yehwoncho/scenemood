<script setup lang="ts">
/**
 * 전역 기본 메타 (OG / SEO). 페이지별로 useSeoMeta 를 다시 호출하면 덮어쓴다.
 * - og:image 는 크롤러가 상대경로를 못 읽으므로 반드시 절대 URL.
 * - canonical / og:url 은 현재 경로 기준으로 만든다 (모든 페이지를 / 로
 *   정규화하면 /pick 이 색인에서 빠진다).
 * - twitter:title/description 은 따로 두지 않는다 — 스크레이퍼가 없으면 og 를 쓴다.
 */
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
</script>

<template>
  <NuxtPage />
</template>
