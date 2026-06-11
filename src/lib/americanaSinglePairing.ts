import type { Match, TeamWithJoueurs } from '../types/tournament'

export interface AmericanaSingleHistory {
  matchCount: Map<string, number>
  partnerCount: Map<string, Map<string, number>>
  opponentCount: Map<string, Map<string, number>>
  activePlayers: Set<string>
}

function inc(map: Map<string, Map<string, number>>, a: string, b: string) {
  if (!map.has(a)) map.set(a, new Map())
  map.get(a)!.set(b, (map.get(a)!.get(b) ?? 0) + 1)
}

function get2(map: Map<string, Map<string, number>>, a: string, b: string): number {
  return map.get(a)?.get(b) ?? 0
}

export function buildAmericanaSingleHistory(
  phaseMatches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
): AmericanaSingleHistory {
  const matchCount = new Map<string, number>()
  const partnerCount = new Map<string, Map<string, number>>()
  const opponentCount = new Map<string, Map<string, number>>()
  const activePlayers = new Set<string>()

  for (const m of phaseMatches) {
    if (!m.equipe1_id || !m.equipe2_id) continue
    const t1 = teamsMap.get(m.equipe1_id)
    const t2 = teamsMap.get(m.equipe2_id)
    if (!t1 || !t2) continue

    const p1A = t1.joueur1.id
    const p1B = t1.joueur2.id
    const p2A = t2.joueur1.id
    const p2B = t2.joueur2.id

    inc(partnerCount, p1A, p1B)
    inc(partnerCount, p1B, p1A)
    inc(partnerCount, p2A, p2B)
    inc(partnerCount, p2B, p2A)

    for (const a of [p1A, p1B]) {
      for (const b of [p2A, p2B]) {
        inc(opponentCount, a, b)
        inc(opponentCount, b, a)
      }
    }

    for (const pid of [p1A, p1B, p2A, p2B]) {
      matchCount.set(pid, (matchCount.get(pid) ?? 0) + 1)
      if (m.statut === 'a_jouer') activePlayers.add(pid)
    }
  }

  return { matchCount, partnerCount, opponentCount, activePlayers }
}

export function selectIdlePlayers(
  allPlayerIds: string[],
  history: AmericanaSingleHistory,
): string[] | null {
  if (allPlayerIds.length < 4) return null

  // Les matchs sont joués séquentiellement — pas de filtre activePlayers.
  // Tiebreaker déterministe qui tourne à chaque batch (salt = total matchs joués)
  // pour éviter qu'un joueur soit systématiquement défavorisé.
  const totalMatches = [...history.matchCount.values()].reduce((a, b) => a + b, 0)

  const sorted = [...allPlayerIds].sort((a, b) => {
    const da = history.matchCount.get(a) ?? 0
    const db = history.matchCount.get(b) ?? 0
    if (da !== db) return da - db
    let ha = totalMatches
    let hb = totalMatches
    for (const c of a) ha = (((ha << 5) - ha) + c.charCodeAt(0)) | 0
    for (const c of b) hb = (((hb << 5) - hb) + c.charCodeAt(0)) | 0
    return (ha >>> 0) - (hb >>> 0)
  })

  return sorted.slice(0, 4)
}

function scorePartition(
  p1: [string, string],
  p2: [string, string],
  history: AmericanaSingleHistory,
): number {
  const partnerScore = get2(history.partnerCount, p1[0], p1[1]) + get2(history.partnerCount, p2[0], p2[1])
  const oppScore =
    get2(history.opponentCount, p1[0], p2[0]) +
    get2(history.opponentCount, p1[0], p2[1]) +
    get2(history.opponentCount, p1[1], p2[0]) +
    get2(history.opponentCount, p1[1], p2[1])
  return partnerScore * 2 + oppScore
}

export function findBestPartition(
  fourPlayers: string[],
  history: AmericanaSingleHistory,
): [[string, string], [string, string]] {
  const [a, b, c, d] = fourPlayers
  const partitions: [[string, string], [string, string]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]
  let best = partitions[0]
  let bestScore = scorePartition(partitions[0][0], partitions[0][1], history)
  for (let i = 1; i < partitions.length; i++) {
    const s = scorePartition(partitions[i][0], partitions[i][1], history)
    if (s < bestScore) {
      bestScore = s
      best = partitions[i]
    }
  }
  return best
}

export function computeNextAmericanaSingleMatch(
  allPlayerIds: string[],
  phaseMatches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
  restingPlayerIds?: string[],
): { pair1: [string, string]; pair2: [string, string] } | null {
  const activePlayerIds = restingPlayerIds?.length
    ? allPlayerIds.filter((id) => !restingPlayerIds.includes(id))
    : allPlayerIds
  const history = buildAmericanaSingleHistory(phaseMatches, teamsMap)
  const four = selectIdlePlayers(activePlayerIds, history)
  if (!four) return null
  const [pair1, pair2] = findBestPartition(four, history)
  return { pair1, pair2 }
}
