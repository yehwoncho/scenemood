/**
 * 히어로 클러스터에 고정으로 띄우는 큐레이션 목록 (16장).
 *
 * 기존엔 매 방문마다 /api/discover 를 랜덤 호출해 채웠지만, 구도가 지저분한
 * 포스터가 섞이거나 매번 화면이 바뀌는 문제가 있어 고정 목록으로 전환했다.
 * 서버(server/api/hero-posters.ts)가 이 id 들의 poster_path 만 TMDB 에서 조회한다.
 *
 * ── 교체 방법 ──
 * TMDB 상세 URL 의 숫자가 곧 id 다. 예) themoviedb.org/movie/693134 → id 693134,
 * themoviedb.org/tv/100088 → id 100088. mediaType 만 'movie' / 'tv' 로 맞춰
 * 아래 배열에서 원하는 줄을 바꾸면 된다. 순서는 무관 (배치는 무작위).
 */
export type HeroMediaType = 'movie' | 'tv'

export interface HeroPosterRef {
  id: number
  mediaType: HeroMediaType
}

// 임시 채움 — 최신·대표 인기작 위주로 구도가 깔끔한 것들. 눈으로 보고 교체 가능.
export const HERO_POSTERS: HeroPosterRef[] = [
  { id: 693134, mediaType: 'movie' }, // Dune: Part Two
  { id: 872585, mediaType: 'movie' }, // Oppenheimer
  { id: 414906, mediaType: 'movie' }, // The Batman
  { id: 545611, mediaType: 'movie' }, // Everything Everywhere All at Once
  { id: 792307, mediaType: 'movie' }, // Poor Things
  { id: 569094, mediaType: 'movie' }, // Spider-Man: Across the Spider-Verse
  { id: 940721, mediaType: 'movie' }, // Godzilla Minus One
  { id: 496243, mediaType: 'movie' }, // Parasite
  { id: 335984, mediaType: 'movie' }, // Blade Runner 2049
  { id: 313369, mediaType: 'movie' }, // La La Land
  { id: 157336, mediaType: 'movie' }, // Interstellar
  { id: 100088, mediaType: 'tv' }, //    The Last of Us
  { id: 126308, mediaType: 'tv' }, //    Shōgun
  { id: 136315, mediaType: 'tv' }, //    The Bear
  { id: 95396, mediaType: 'tv' }, //     Severance
  { id: 93405, mediaType: 'tv' }, //     Squid Game
]
