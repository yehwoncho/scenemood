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

// TMDB /trending/all/week (2026-08-27 기준) popularity 상위에서 poster_path 있는
// movie 11 + tv 5. 최신 유행작이라 시간이 지나면 교체 필요 — 위 "교체 방법" 참고.
export const HERO_POSTERS: HeroPosterRef[] = [
  { id: 969681, mediaType: 'movie' }, //  스파이더맨: 브랜드 뉴 데이
  { id: 1368337, mediaType: 'movie' }, // 오디세이 (The Odyssey)
  { id: 1288445, mediaType: 'movie' }, // 뮤티니 (Mutiny)
  { id: 1621552, mediaType: 'movie' }, // 엘 차포를 체포하라 (La captura)
  { id: 1084244, mediaType: 'movie' }, // 토이 스토리 5
  { id: 1339713, mediaType: 'movie' }, // 옵세션 (Obsession)
  { id: 1315772, mediaType: 'movie' }, // 미니언즈 & 몬스터즈
  { id: 1083381, mediaType: 'movie' }, // 백룸 (Backrooms)
  { id: 1212763, mediaType: 'movie' }, // 이블 데드 번 (Evil Dead Burn)
  { id: 1101383, mediaType: 'movie' }, // 오크 스트리트의 마지막 날
  { id: 1291595, mediaType: 'movie' }, // 인시디어스: 그들이 넘어왔다
  { id: 108978, mediaType: 'tv' }, //    리처 (Reacher)
  { id: 113962, mediaType: 'tv' }, //    라이어니스: 특수 작전팀 (Lioness)
  { id: 100757, mediaType: 'tv' }, //    아우터뱅크스 (Outer Banks)
  { id: 95350, mediaType: 'tv' }, //     랜턴스 (Lanterns)
  { id: 125988, mediaType: 'tv' }, //    사일로 (Silo)
]
