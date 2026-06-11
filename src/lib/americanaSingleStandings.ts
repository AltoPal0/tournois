import type { Match, TeamWithJoueurs } from '../types/tournament'

// ---------------------------------------------------------------------------
// Americana Weighted : standings calculés depuis les labels (pas de team IDs)
// ---------------------------------------------------------------------------

export function computeWeightedAmericanoStandings(
  phaseMatches: Match[],
): IndividualStanding[] {
  const rows = new Map<string, IndividualStanding>()

  function getRow(name: string): IndividualStanding {
    if (!rows.has(name)) {
      rows.set(name, { playerId: name, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, points: 0 })
    }
    return rows.get(name)!
  }

  for (const m of phaseMatches) {
    // Inscrire tous les joueurs apparaissant dans les matchs (même non terminés)
    const names1 = m.equipe1_label ? m.equipe1_label.split(' / ').map((s) => s.trim()).filter(Boolean) : []
    const names2 = m.equipe2_label ? m.equipe2_label.split(' / ').map((s) => s.trim()).filter(Boolean) : []
    for (const n of [...names1, ...names2]) getRow(n)

    if (m.statut !== 'termine') continue
    if (m.score_equipe1 == null || m.score_equipe2 == null) continue
    if (names1.length === 0 || names2.length === 0) continue

    const team1Won = m.score_equipe1 > m.score_equipe2
    for (const name of names1) {
      const r = getRow(name)
      r.played++
      r.gamesWon += m.score_equipe1
      r.gamesLost += m.score_equipe2
      if (team1Won) { r.wins++; r.points++ } else r.losses++
    }
    for (const name of names2) {
      const r = getRow(name)
      r.played++
      r.gamesWon += m.score_equipe2
      r.gamesLost += m.score_equipe1
      if (!team1Won) { r.wins++; r.points++ } else r.losses++
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const diffA = a.gamesWon - a.gamesLost
    const diffB = b.gamesWon - b.gamesLost
    if (diffB !== diffA) return diffB - diffA
    return b.gamesWon - a.gamesWon
  })
}

export interface IndividualStanding {
  playerId: string
  played: number
  wins: number
  losses: number
  gamesWon: number
  gamesLost: number
  points: number
}

export function computeAmericanaSingleStandings(
  phaseMatches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
): IndividualStanding[] {
  const rows = new Map<string, IndividualStanding>()

  function getRow(playerId: string): IndividualStanding {
    if (!rows.has(playerId)) {
      rows.set(playerId, { playerId, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, points: 0 })
    }
    return rows.get(playerId)!
  }

  for (const m of phaseMatches) {
    if (m.statut !== 'termine') continue
    if (!m.equipe1_id || !m.equipe2_id) continue
    if (m.score_equipe1 == null || m.score_equipe2 == null) continue

    const t1 = teamsMap.get(m.equipe1_id)
    const t2 = teamsMap.get(m.equipe2_id)
    if (!t1 || !t2) continue

    const players1 = [t1.joueur1.id, t1.joueur2.id]
    const players2 = [t2.joueur1.id, t2.joueur2.id]
    const team1Won = m.score_equipe1 > m.score_equipe2

    for (const pid of players1) {
      const r = getRow(pid)
      r.played++
      r.gamesWon += m.score_equipe1
      r.gamesLost += m.score_equipe2
      if (team1Won) { r.wins++; r.points++ } else r.losses++
    }
    for (const pid of players2) {
      const r = getRow(pid)
      r.played++
      r.gamesWon += m.score_equipe2
      r.gamesLost += m.score_equipe1
      if (!team1Won) { r.wins++; r.points++ } else r.losses++
    }
  }

  // Ajouter les joueurs en cours (matchs a_jouer) avec 0 stats pour qu'ils apparaissent
  for (const m of phaseMatches) {
    if (!m.equipe1_id || !m.equipe2_id) continue
    for (const teamId of [m.equipe1_id, m.equipe2_id]) {
      const t = teamsMap.get(teamId)
      if (!t) continue
      for (const pid of [t.joueur1.id, t.joueur2.id]) {
        getRow(pid)
      }
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const diffA = a.gamesWon - a.gamesLost
    const diffB = b.gamesWon - b.gamesLost
    if (diffB !== diffA) return diffB - diffA
    return b.gamesWon - a.gamesWon
  })
}
