import type { Match, TournamentGraph } from '../types/tournament'
import { computeStandings } from './standings'

export interface AdvancementUpdate {
  matchId: string
  field: 'equipe1_id' | 'equipe2_id'
  teamId: string
}

/**
 * Après la saisie d'un score, calcule les équipes à avancer vers les matchs suivants.
 * Retourne une liste d'updates à appliquer (matchId + champ + teamId).
 */
export function computeAdvancements(
  completedMatchId: string,
  allMatches: Match[],
  graph: TournamentGraph,
): AdvancementUpdate[] {
  const updates: AdvancementUpdate[] = []

  const completedMatch = allMatches.find((m) => m.id === completedMatchId)
  if (!completedMatch) return updates
  if (!completedMatch.equipe1_id || !completedMatch.equipe2_id) return updates
  if (completedMatch.score_equipe1 == null || completedMatch.score_equipe2 == null) return updates
  if (completedMatch.score_equipe1 === completedMatch.score_equipe2) return updates

  const phaseNodeId = completedMatch.phase_node_id
  const node = graph.nodes.find((n) => n.id === phaseNodeId)
  if (!node) return updates

  const config = node.data.config
  const phaseMatches = allMatches.filter((m) => m.phase_node_id === phaseNodeId)

  if (config.type === 'round_robin' || config.type === 'tournante_libre') {
    advanceFromRoundRobin(phaseMatches, node, allMatches, updates)
  } else if (config.type === 'elimination') {
    advanceFromElimination(completedMatch, phaseMatches, node, allMatches, updates)
  }

  return updates
}

// ---------------------------------------------------------------------------
// Round Robin : avancer quand TOUS les matchs de la poule sont terminés
// ---------------------------------------------------------------------------

function advanceFromRoundRobin(
  phaseMatches: Match[],
  node: TournamentGraph['nodes'][number],
  allMatches: Match[],
  updates: AdvancementUpdate[],
) {
  // Vérifier que tous les matchs sont terminés
  const allDone = phaseMatches.every((m) => m.statut === 'termine')
  if (!allDone) return

  const config = node.data.config
  const standings = computeStandings(phaseMatches)

  // Pour chaque output de la phase, mapper le rang au classement
  for (const output of config.outputs) {
    const standingIndex = output.rank - 1
    if (standingIndex >= standings.length) continue

    const teamId = standings[standingIndex].teamId
    const label = `${output.label} de ${config.name}`

    // Trouver les matchs downstream qui référencent ce label
    const targets = findMatchesByLabel(label, allMatches)
    for (const target of targets) {
      updates.push({ matchId: target.matchId, field: target.field, teamId })
    }
  }
}

// ---------------------------------------------------------------------------
// Elimination : avancement interne (chaque match) + externe (finale)
// ---------------------------------------------------------------------------

function advanceFromElimination(
  completedMatch: Match,
  phaseMatches: Match[],
  node: TournamentGraph['nodes'][number],
  allMatches: Match[],
  updates: AdvancementUpdate[],
) {
  const winnerId =
    completedMatch.score_equipe1! > completedMatch.score_equipe2!
      ? completedMatch.equipe1_id!
      : completedMatch.equipe2_id!
  const loserId =
    completedMatch.score_equipe1! > completedMatch.score_equipe2!
      ? completedMatch.equipe2_id!
      : completedMatch.equipe1_id!

  // Avancement interne : vainqueur → match suivant dans la même phase
  const winnerLabel = `Vainqueur ${completedMatch.nom}`
  const internalTargets = findMatchesByLabel(winnerLabel, phaseMatches)
  for (const target of internalTargets) {
    updates.push({ matchId: target.matchId, field: target.field, teamId: winnerId })
  }

  // Avancement externe : si c'est la finale, avancer vers les phases downstream
  const maxRound = Math.max(...phaseMatches.map((m) => m.round ?? 0))
  const finalMatches = phaseMatches.filter((m) => m.round === maxRound)
  const isFinal = finalMatches.length === 1 && completedMatch.id === finalMatches[0].id

  if (isFinal) {
    const config = node.data.config
    for (const output of config.outputs) {
      const teamId = output.rank === 1 ? winnerId : output.rank === 2 ? loserId : null
      if (!teamId) continue

      const label = `${output.label} de ${config.name}`
      const targets = findMatchesByLabel(label, allMatches)
      for (const target of targets) {
        updates.push({ matchId: target.matchId, field: target.field, teamId })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utilitaire : trouver les matchs dont un label de provenance correspond
// ---------------------------------------------------------------------------

function findMatchesByLabel(
  label: string,
  matches: Match[],
): { matchId: string; field: 'equipe1_id' | 'equipe2_id' }[] {
  const results: { matchId: string; field: 'equipe1_id' | 'equipe2_id' }[] = []
  for (const m of matches) {
    if (m.equipe1_label === label && !m.equipe1_id) {
      results.push({ matchId: m.id, field: 'equipe1_id' })
    }
    if (m.equipe2_label === label && !m.equipe2_id) {
      results.push({ matchId: m.id, field: 'equipe2_id' })
    }
  }
  return results
}
