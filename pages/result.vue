<script setup lang="ts">
/**
 * /result — 결과 3장. 다음 세션에서 구현 예정.
 * 지금은 /pick STEP 3의 "결과 보기"가 라우팅할 대상만 존재하면 된다.
 */
import { usePickStore } from '~/stores/pick'

const pick = usePickStore()
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center bg-bg px-gutter text-center">
    <p class="text-h2 text-text-dim">결과 화면 — 다음 세션에서 구현 예정</p>
    <p class="mt-4 text-caption text-text-mute">
      상황 <span class="text-accent">{{ pick.situation ?? '없음' }}</span>
      · 기분 <span class="text-accent">{{ pick.moods.join(', ') || '없음' }}</span>
      · 러닝타임 <span class="text-accent">{{ pick.runtime }}분 이하</span>
    </p>
    <NuxtLink
      to="/pick"
      class="mt-8 inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent"
    >
      다시 고르기
    </NuxtLink>
  </main>
</template>
