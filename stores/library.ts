import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 보관함(찜하기 · 별점) — supabase/schema.sql 의 bookmarks / watch_records 를
 * 직접 다룬다(중간 서버 API 없음. RLS 가 "본인 데이터만" 을 이미 보장하므로
 * 클라이언트에서 anon key 로 바로 읽고 써도 안전하다).
 *
 * - 앱 전체가 영화만 다루므로(recommend/detail/review-insight 전부 mediaType
 *   하드코딩) 여기서도 MEDIA_TYPE = 'movie' 로 고정한다.
 * - 키는 `${mediaType}:${tmdbId}` 문자열 — Map 조회/삭제를 O(1) 로 하기 위함.
 * - 로그인 여부는 이 스토어가 판단하지 않는다. 호출부(BookmarkButton 등)가
 *   useSupabaseUser() 로 먼저 확인하고, 비로그인이면 authStore.openLogin() 을 부른다.
 * - 주의: @nuxtjs/supabase v2 의 useSupabaseUser() 는 Supabase `User` 객체가 아니라
 *   auth.getClaims() 의 JWT payload 를 반환한다 — 사용자 id 는 `.id` 가 아니라
 *   `.sub` 다 (RLS 의 auth.uid() 와 매칭돼야 하는 값도 이 sub).
 */

export const MEDIA_TYPE = 'movie' as const

export interface LibraryItem {
  id: number
  title: string
  poster_path: string | null
}

interface BookmarkRow {
  id: string
  tmdb_id: number
  media_type: string
  title: string
  poster_path: string | null
  saved_at: string
}

interface WatchRecordRow {
  id: string
  tmdb_id: number
  media_type: string
  rating: number
}

function keyOf(tmdbId: number, mediaType: string = MEDIA_TYPE) {
  return `${mediaType}:${tmdbId}`
}

export const useLibraryStore = defineStore('library', () => {
  const bookmarks = ref<Map<string, BookmarkRow>>(new Map())
  const ratings = ref<Map<string, number>>(new Map())
  const pending = ref<Set<string>>(new Set()) // 요청 진행 중인 키 — 중복 클릭 방지
  const loaded = ref(false)
  const loading = ref(false)

  // 찜한 순서(최근 저장순) 그대로 노출 — library.vue 목록용
  const bookmarkList = computed(() =>
    Array.from(bookmarks.value.values()).sort((a, b) => b.saved_at.localeCompare(a.saved_at)),
  )

  function isBookmarked(tmdbId: number) {
    return bookmarks.value.has(keyOf(tmdbId))
  }
  function ratingOf(tmdbId: number): number | null {
    return ratings.value.get(keyOf(tmdbId)) ?? null
  }
  function isPending(tmdbId: number) {
    return pending.value.has(keyOf(tmdbId))
  }

  /** 로그인 상태에서 내 찜/별점을 통째로 불러온다. 로그아웃 시엔 clear() 를 쓴다. */
  async function loadAll() {
    const supabase = useSupabaseClient()
    loading.value = true
    try {
      const [bm, wr] = await Promise.all([
        supabase.from('bookmarks').select('id, tmdb_id, media_type, title, poster_path, saved_at'),
        supabase.from('watch_records').select('id, tmdb_id, media_type, rating'),
      ])
      if (bm.error) throw bm.error
      if (wr.error) throw wr.error

      bookmarks.value = new Map(
        (bm.data as BookmarkRow[]).map((row) => [keyOf(row.tmdb_id, row.media_type), row]),
      )
      ratings.value = new Map(
        (wr.data as WatchRecordRow[]).map((row) => [keyOf(row.tmdb_id, row.media_type), row.rating]),
      )
      loaded.value = true
    }
    catch (err) {
      console.error('[library] 보관함 로드 실패', err)
    }
    finally {
      loading.value = false
    }
  }

  /** 로그아웃 시 로컬 상태 비우기 (다음 사용자의 데이터가 섞이지 않도록). */
  function clear() {
    bookmarks.value = new Map()
    ratings.value = new Map()
    loaded.value = false
  }

  /** 찜 토글. 호출부가 로그인 여부를 이미 확인했다고 가정한다. */
  async function toggleBookmark(item: LibraryItem) {
    const supabase = useSupabaseClient()
    const user = useSupabaseUser()
    if (!user.value) return

    const k = keyOf(item.id)
    if (pending.value.has(k)) return
    pending.value.add(k)
    try {
      const existing = bookmarks.value.get(k)
      if (existing) {
        const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id)
        if (error) throw error
        bookmarks.value.delete(k)
      }
      else {
        const { data, error } = await supabase
          .from('bookmarks')
          .insert({
            user_id: user.value.sub,
            tmdb_id: item.id,
            media_type: MEDIA_TYPE,
            title: item.title,
            poster_path: item.poster_path,
          })
          .select('id, tmdb_id, media_type, title, poster_path, saved_at')
          .single()
        if (error) throw error
        bookmarks.value.set(k, data as BookmarkRow)
      }
    }
    catch (err) {
      console.error('[library] 찜하기 실패', err)
    }
    finally {
      pending.value.delete(k)
    }
  }

  /** 별점 등록/수정 (1~5). 호출부가 로그인 여부를 이미 확인했다고 가정한다. */
  async function setRating(item: LibraryItem, rating: number) {
    const supabase = useSupabaseClient()
    const user = useSupabaseUser()
    if (!user.value) return

    const k = keyOf(item.id)
    if (pending.value.has(k)) return
    pending.value.add(k)
    try {
      const { data, error } = await supabase
        .from('watch_records')
        .upsert(
          { user_id: user.value.sub, tmdb_id: item.id, media_type: MEDIA_TYPE, rating },
          { onConflict: 'user_id,tmdb_id,media_type' },
        )
        .select('id, tmdb_id, media_type, rating')
        .single()
      if (error) throw error
      ratings.value.set(k, (data as WatchRecordRow).rating)
    }
    catch (err) {
      console.error('[library] 별점 저장 실패', err)
    }
    finally {
      pending.value.delete(k)
    }
  }

  return {
    bookmarks,
    ratings,
    loaded,
    loading,
    bookmarkList,
    isBookmarked,
    ratingOf,
    isPending,
    loadAll,
    clear,
    toggleBookmark,
    setRating,
  }
})
