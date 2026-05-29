import type { Match, TournamentGraph } from '../types/tournament'
import { topologicalSort } from './matchGeneration'

export const FLOATING_MATCH_DURATION_MIN = 45

export function findNextMatchForCourt(
  _freedPiste: number,
  matches: Match[],
  graph: TournamentGraph,
): Match | null {
  const sorted = topologicalSort(graph)
  const phaseOrder = new Map(sorted.map((n, i) => [n.id, i]))

  // Équipes actuellement sur une piste (match en cours)
  const playingTeams = new Set<string>()
  for (const m of matches) {
    if (m.piste != null && m.statut === 'a_jouer') {
      if (m.equipe1_id) playingTeams.add(m.equipe1_id)
      if (m.equipe2_id) playingTeams.add(m.equipe2_id)
    }
  }

  const candidates = matches.filter(
    (m) =>
      m.statut === 'a_jouer' &&
      m.piste == null &&
      m.equipe1_id != null &&
      m.equipe2_id != null &&
      !playingTeams.has(m.equipe1_id!) &&
      !playingTeams.has(m.equipe2_id!),
  )

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const depthA = phaseOrder.get(a.phase_node_id) ?? 0
    const depthB = phaseOrder.get(b.phase_node_id) ?? 0
    if (depthA !== depthB) return depthA - depthB
    return a.ordre - b.ordre
  })

  return candidates[0]
}

export function computeEstimatedHoraire(bufferMin: number): string {
  return new Date(Date.now() + bufferMin * 60_000).toISOString().slice(0, 19)
}
