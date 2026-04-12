import type { Match } from '../types/tournament'
import { computeStandings } from './standings'

export interface SwissTeamInfo {
  id: string
  points: number
  differential: number
}

/**
 * Retourne l'ensemble des confrontations déjà jouées.
 * Chaque paire est stockée sous la forme "idA:idB" avec idA < idB (ordre lexicographique).
 */
export function getPlayedPairs(matches: Match[]): Set<string> {
  const played = new Set<string>()
  for (const m of matches) {
    if (m.equipe1_id && m.equipe2_id && m.statut === 'termine') {
      const [a, b] = [m.equipe1_id, m.equipe2_id].sort()
      played.add(`${a}:${b}`)
    }
  }
  return played
}

/**
 * Algorithme glouton d'appariement suisse.
 * Trie par (points desc, differential desc), puis apparie chaque équipe
 * avec le meilleur adversaire non encore rencontré.
 */
export function computeSwissPairing(
  teams: SwissTeamInfo[],
  played: Set<string>,
): [string, string][] {
  const sorted = [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.differential - a.differential
  })

  const unmatched = [...sorted]
  const pairs: [string, string][] = []

  while (unmatched.length >= 2) {
    const team = unmatched.shift()!
    const idx = unmatched.findIndex((candidate) => {
      const [a, b] = [team.id, candidate.id].sort()
      return !played.has(`${a}:${b}`)
    })

    if (idx >= 0) {
      pairs.push([team.id, unmatched.splice(idx, 1)[0].id])
    } else {
      // Tous les adversaires déjà rencontrés → rematch avec le premier
      pairs.push([team.id, unmatched.splice(0, 1)[0].id])
    }
  }

  return pairs
}

/**
 * Après la saisie d'un score, vérifie si le round vient de se terminer
 * et calcule les appariements pour le round suivant.
 *
 * Retourne les updates à appliquer sur les matchs du round suivant.
 */
export function computeNextRoundPairings(
  completedMatchId: string,
  phaseMatches: Match[],
): { matchId: string; equipe1_id: string; equipe2_id: string }[] {
  const completedMatch = phaseMatches.find((m) => m.id === completedMatchId)
  if (!completedMatch) return []

  const currentRound = completedMatch.round
  if (currentRound == null) return []

  // Vérifier que tous les matchs du round courant sont terminés
  const currentRoundMatches = phaseMatches.filter((m) => m.round === currentRound)
  const allDone = currentRoundMatches.every((m) => m.statut === 'termine')
  if (!allDone) return []

  // Trouver les matchs du round suivant
  const nextRound = currentRound + 1
  const nextRoundMatches = phaseMatches
    .filter((m) => m.round === nextRound)
    .sort((a, b) => a.ordre - b.ordre)

  if (nextRoundMatches.length === 0) return []

  // Calculer les standings sur les matchs joués jusqu'ici
  const playedMatches = phaseMatches.filter((m) => m.statut === 'termine')
  const standings = computeStandings(playedMatches)

  // Construire les infos pour le pairing suisse
  const teamsInfo: SwissTeamInfo[] = standings.map((row) => ({
    id: row.teamId,
    points: row.points,
    differential: row.gamesWon - row.gamesLost,
  }))

  const played = getPlayedPairs(playedMatches)
  const pairs = computeSwissPairing(teamsInfo, played)

  // Mapper les paires sur les matchs du round suivant
  const updates: { matchId: string; equipe1_id: string; equipe2_id: string }[] = []
  for (let i = 0; i < pairs.length && i < nextRoundMatches.length; i++) {
    updates.push({
      matchId: nextRoundMatches[i].id,
      equipe1_id: pairs[i][0],
      equipe2_id: pairs[i][1],
    })
  }

  return updates
}
