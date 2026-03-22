import type { Match } from '../types/tournament'

export interface StandingRow {
  teamId: string
  played: number
  wins: number
  losses: number
  gamesWon: number
  gamesLost: number
  points: number
}

/**
 * Calcule le classement d'une poule à partir de ses matchs.
 * Règles :
 *   - 1 point par victoire (plus de jeux gagnés)
 *   - Tri : points desc → confrontation directe → diff jeux desc
 */
export function computeStandings(matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()

  function getRow(teamId: string): StandingRow {
    if (!rows.has(teamId)) {
      rows.set(teamId, {
        teamId,
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0,
      })
    }
    return rows.get(teamId)!
  }

  // Accumuler les stats depuis les matchs terminés
  for (const m of matches) {
    if (m.statut !== 'termine') continue
    if (m.equipe1_id == null || m.equipe2_id == null) continue
    if (m.score_equipe1 == null || m.score_equipe2 == null) continue

    const r1 = getRow(m.equipe1_id)
    const r2 = getRow(m.equipe2_id)

    r1.played++
    r2.played++
    r1.gamesWon += m.score_equipe1
    r1.gamesLost += m.score_equipe2
    r2.gamesWon += m.score_equipe2
    r2.gamesLost += m.score_equipe1

    if (m.score_equipe1 > m.score_equipe2) {
      r1.wins++
      r1.points++
      r2.losses++
    } else if (m.score_equipe2 > m.score_equipe1) {
      r2.wins++
      r2.points++
      r1.losses++
    }
    // Égalité : pas de point (ne devrait pas arriver en padel)
  }

  // Construire la map des confrontations directes pour le tie-break
  // headToHead[teamA][teamB] = true si teamA a battu teamB
  const headToHead = new Map<string, Map<string, boolean>>()
  for (const m of matches) {
    if (m.statut !== 'termine') continue
    if (m.equipe1_id == null || m.equipe2_id == null) continue
    if (m.score_equipe1 == null || m.score_equipe2 == null) continue

    if (m.score_equipe1 > m.score_equipe2) {
      if (!headToHead.has(m.equipe1_id)) headToHead.set(m.equipe1_id, new Map())
      headToHead.get(m.equipe1_id)!.set(m.equipe2_id, true)
    } else if (m.score_equipe2 > m.score_equipe1) {
      if (!headToHead.has(m.equipe2_id)) headToHead.set(m.equipe2_id, new Map())
      headToHead.get(m.equipe2_id)!.set(m.equipe1_id, true)
    }
  }

  // Trier : points desc → confrontation directe → diff jeux desc
  const sorted = Array.from(rows.values()).sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points

    // 2. Confrontation directe
    const aBeatsB = headToHead.get(a.teamId)?.get(b.teamId) === true
    const bBeatsA = headToHead.get(b.teamId)?.get(a.teamId) === true
    if (aBeatsB && !bBeatsA) return -1
    if (bBeatsA && !aBeatsB) return 1

    // 3. Différence de jeux
    const diffA = a.gamesWon - a.gamesLost
    const diffB = b.gamesWon - b.gamesLost
    if (diffB !== diffA) return diffB - diffA

    // 4. Jeux gagnés
    return b.gamesWon - a.gamesWon
  })

  return sorted
}
