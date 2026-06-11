import type { Match, TournamentGraph } from '../types/tournament'
import { computeStandings } from './standings'
import { parseHandleIndex } from './matchGeneration'

export interface AdvancementUpdate {
  matchId: string
  field: 'equipe1_id' | 'equipe2_id'
  teamId: string
}

export interface TeamSplitterInput {
  nodeId: string
  inputSlot: number
  teamId: string
}

export interface AdvancementResult {
  matchUpdates: AdvancementUpdate[]
  teamSplitterInputs: TeamSplitterInput[]
}

/**
 * Après la saisie d'un score, calcule les équipes à avancer vers les matchs suivants.
 * Retourne les mises à jour de matchs ET les inputs team_splitter à traiter en aval.
 */
export function computeAdvancements(
  completedMatchId: string,
  allMatches: Match[],
  graph: TournamentGraph,
): AdvancementResult {
  const matchUpdates: AdvancementUpdate[] = []
  const teamSplitterInputs: TeamSplitterInput[] = []

  const completedMatch = allMatches.find((m) => m.id === completedMatchId)
  if (!completedMatch) return { matchUpdates, teamSplitterInputs }
  if (!completedMatch.equipe1_id || !completedMatch.equipe2_id) return { matchUpdates, teamSplitterInputs }
  if (completedMatch.score_equipe1 == null || completedMatch.score_equipe2 == null) return { matchUpdates, teamSplitterInputs }
  if (completedMatch.score_equipe1 === completedMatch.score_equipe2) return { matchUpdates, teamSplitterInputs }

  const phaseNodeId = completedMatch.phase_node_id
  const node = graph.nodes.find((n) => n.id === phaseNodeId)
  if (!node) return { matchUpdates, teamSplitterInputs }

  const config = node.data.config
  const phaseMatches = allMatches.filter((m) => m.phase_node_id === phaseNodeId)

  // americana_single n'est plus auto-avancée — la terminaison se fait via "Terminer l'americana"
  if (config.type === 'round_robin' || config.type === 'tournante_libre' || config.type === 'americano') {
    advanceFromRoundRobin(phaseMatches, node, allMatches, matchUpdates, teamSplitterInputs, graph)
    for (const edge of graph.edges) {
      if (edge.source !== phaseNodeId) continue
      const targetNode = graph.nodes.find((n) => n.id === edge.target)
      if (targetNode?.data.config.type === 'best_of') {
        advanceFromBestOf(targetNode, allMatches, graph, matchUpdates, teamSplitterInputs)
      }
    }
  } else if (config.type === 'elimination') {
    advanceFromElimination(completedMatch, phaseMatches, node, allMatches, matchUpdates, teamSplitterInputs, graph)
  } else if (config.type === 'match_simple') {
    advanceFromMatchSimple(completedMatch, node, allMatches, matchUpdates, teamSplitterInputs, graph)
  }

  return { matchUpdates, teamSplitterInputs }
}

// ---------------------------------------------------------------------------
// Round Robin : avancer quand TOUS les matchs de la poule sont terminés
// ---------------------------------------------------------------------------

function advanceFromRoundRobin(
  phaseMatches: Match[],
  node: TournamentGraph['nodes'][number],
  allMatches: Match[],
  matchUpdates: AdvancementUpdate[],
  teamSplitterInputs: TeamSplitterInput[],
  graph: TournamentGraph,
) {
  const allDone = phaseMatches.every((m) => m.statut === 'termine')
  if (!allDone) return

  const config = node.data.config
  const standings = computeStandings(phaseMatches)

  for (const output of config.outputs) {
    const standingIndex = output.rank - 1
    if (standingIndex >= standings.length) continue

    const teamId = standings[standingIndex].teamId
    const label = `${output.label} de ${config.name}`
    resolveOutputDownstream(node.id, output.rank, teamId, label, allMatches, graph, matchUpdates, teamSplitterInputs)
  }
}

// ---------------------------------------------------------------------------
// Best Of : compare N équipes de poules différentes, route les meilleures
// ---------------------------------------------------------------------------

function advanceFromBestOf(
  bestOfNode: TournamentGraph['nodes'][number],
  allMatches: Match[],
  graph: TournamentGraph,
  matchUpdates: AdvancementUpdate[],
  teamSplitterInputs: TeamSplitterInput[],
) {
  const config = bestOfNode.data.config
  const incomingEdges = graph.edges.filter((e) => e.target === bestOfNode.id)
  if (incomingEdges.length === 0) return

  const candidates: { teamId: string; points: number; diff: number; gamesWon: number }[] = []

  for (const edge of incomingEdges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source)
    if (!sourceNode) return

    const outputRank = parseHandleIndex(edge.sourceHandle)
    const poolMatches = allMatches.filter((m) => m.phase_node_id === sourceNode.id)
    if (poolMatches.length === 0) return
    if (!poolMatches.every((m) => m.statut === 'termine')) return

    const standings = computeStandings(poolMatches)
    const team = standings[outputRank - 1]
    if (!team) return

    candidates.push({
      teamId: team.teamId,
      points: team.points,
      diff: team.gamesWon - team.gamesLost,
      gamesWon: team.gamesWon,
    })
  }

  if (candidates.length !== incomingEdges.length) return

  candidates.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.diff !== a.diff) return b.diff - a.diff
    return b.gamesWon - a.gamesWon
  })

  const sortedOutputs = [...config.outputs].sort((a, b) => a.rank - b.rank)
  for (let i = 0; i < candidates.length; i++) {
    const output = sortedOutputs[i]
    if (!output) continue
    const label = `${output.label} de ${config.name}`
    resolveOutputDownstream(bestOfNode.id, output.rank, candidates[i].teamId, label, allMatches, graph, matchUpdates, teamSplitterInputs)
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
  matchUpdates: AdvancementUpdate[],
  teamSplitterInputs: TeamSplitterInput[],
  graph: TournamentGraph,
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
    matchUpdates.push({ matchId: target.matchId, field: target.field, teamId: winnerId })
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
      resolveOutputDownstream(node.id, output.rank, teamId, label, allMatches, graph, matchUpdates, teamSplitterInputs)
    }
  }
}

// ---------------------------------------------------------------------------
// Match simple : avancement immédiat après le seul match
// ---------------------------------------------------------------------------

function advanceFromMatchSimple(
  completedMatch: Match,
  node: TournamentGraph['nodes'][number],
  allMatches: Match[],
  matchUpdates: AdvancementUpdate[],
  teamSplitterInputs: TeamSplitterInput[],
  graph: TournamentGraph,
) {
  const winnerId =
    completedMatch.score_equipe1! > completedMatch.score_equipe2!
      ? completedMatch.equipe1_id!
      : completedMatch.equipe2_id!
  const loserId =
    completedMatch.score_equipe1! > completedMatch.score_equipe2!
      ? completedMatch.equipe2_id!
      : completedMatch.equipe1_id!

  const config = node.data.config
  for (const output of config.outputs) {
    const teamId = output.rank === 1 ? winnerId : output.rank === 2 ? loserId : null
    if (!teamId) continue
    const label = `${output.label} de ${config.name}`
    resolveOutputDownstream(node.id, output.rank, teamId, label, allMatches, graph, matchUpdates, teamSplitterInputs)
  }
}

// ---------------------------------------------------------------------------
// Routage d'output : vers team_splitter ou vers match standard
// ---------------------------------------------------------------------------

function resolveOutputDownstream(
  sourceNodeId: string,
  outputRank: number,
  teamId: string,
  label: string,
  allMatches: Match[],
  graph: TournamentGraph,
  matchUpdates: AdvancementUpdate[],
  teamSplitterInputs: TeamSplitterInput[],
) {
  const outEdge = graph.edges.find(
    (e) => e.source === sourceNodeId && parseHandleIndex(e.sourceHandle) === outputRank,
  )
  if (!outEdge) {
    // Pas d'edge → remplissage par label dans les matchs existants
    const targets = findMatchesByLabel(label, allMatches)
    for (const target of targets) {
      matchUpdates.push({ matchId: target.matchId, field: target.field, teamId })
    }
    return
  }

  const targetNode = graph.nodes.find((n) => n.id === outEdge.target)
  if (targetNode?.data.config.type === 'team_splitter') {
    const inputSlot = parseHandleIndex(outEdge.targetHandle)
    teamSplitterInputs.push({ nodeId: targetNode.id, inputSlot, teamId })
  } else {
    const targets = findMatchesByLabel(label, allMatches)
    for (const target of targets) {
      matchUpdates.push({ matchId: target.matchId, field: target.field, teamId })
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
    if (m.equipe1_label === label) {
      results.push({ matchId: m.id, field: 'equipe1_id' })
    }
    if (m.equipe2_label === label) {
      results.push({ matchId: m.id, field: 'equipe2_id' })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Resets : nullifier les slots downstream déjà remplis depuis une phase
// Utilisé par clearMatchScore pour nettoyer les avancements obsolètes.
// ---------------------------------------------------------------------------

export function computeAdvancementResets(
  matchId: string,
  allMatches: Match[],
  graph: TournamentGraph,
): { matchId: string; field: 'equipe1_id' | 'equipe2_id' }[] {
  const results: { matchId: string; field: 'equipe1_id' | 'equipe2_id' }[] = []

  const match = allMatches.find((m) => m.id === matchId)
  if (!match) return results

  const node = graph.nodes.find((n) => n.id === match.phase_node_id)
  if (!node) return results

  const config = node.data.config

  if (
    config.type === 'round_robin' ||
    config.type === 'americano' ||
    config.type === 'tournante_libre' ||
    config.type === 'match_simple' ||
    config.type === 'americana_single' ||
    config.type === 'americana_weighted'
  ) {
    for (const output of config.outputs) {
      // Si cet output alimente un nœud best_of, vider les slots downstream du best_of
      const outEdge = graph.edges.find(
        (e) => e.source === node.id && parseHandleIndex(e.sourceHandle) === output.rank,
      )
      if (outEdge) {
        const targetNode = graph.nodes.find((n) => n.id === outEdge.target)
        if (targetNode?.data.config.type === 'best_of') {
          for (const bestOfOutput of targetNode.data.config.outputs) {
            const bestOfLabel = `${bestOfOutput.label} de ${targetNode.data.config.name}`
            for (const m of allMatches) {
              if (m.equipe1_label === bestOfLabel && m.equipe1_id) {
                results.push({ matchId: m.id, field: 'equipe1_id' })
              }
              if (m.equipe2_label === bestOfLabel && m.equipe2_id) {
                results.push({ matchId: m.id, field: 'equipe2_id' })
              }
            }
          }
          continue
        }
      }

      // Cas normal : slots cross-phase remplis directement via les output labels
      const label = `${output.label} de ${config.name}`
      for (const m of allMatches) {
        if (m.equipe1_label === label && m.equipe1_id) {
          results.push({ matchId: m.id, field: 'equipe1_id' })
        }
        if (m.equipe2_label === label && m.equipe2_id) {
          results.push({ matchId: m.id, field: 'equipe2_id' })
        }
      }
    }
  } else if (config.type === 'elimination') {
    const phaseMatches = allMatches.filter((m) => m.phase_node_id === match.phase_node_id)

    // Avancement interne : le slot rempli via "Vainqueur {match.nom}"
    const winnerLabel = `Vainqueur ${match.nom}`
    for (const m of phaseMatches) {
      if (m.equipe1_label === winnerLabel && m.equipe1_id) {
        results.push({ matchId: m.id, field: 'equipe1_id' })
      }
      if (m.equipe2_label === winnerLabel && m.equipe2_id) {
        results.push({ matchId: m.id, field: 'equipe2_id' })
      }
    }

    // Avancement externe : si c'était la finale, cherche les slots cross-phase
    const maxRound = Math.max(...phaseMatches.map((m) => m.round ?? 0))
    const finalMatches = phaseMatches.filter((m) => m.round === maxRound)
    if (finalMatches.length === 1 && match.id === finalMatches[0].id) {
      for (const output of config.outputs) {
        const label = `${output.label} de ${config.name}`
        for (const m of allMatches) {
          if (m.equipe1_label === label && m.equipe1_id) {
            results.push({ matchId: m.id, field: 'equipe1_id' })
          }
          if (m.equipe2_label === label && m.equipe2_id) {
            results.push({ matchId: m.id, field: 'equipe2_id' })
          }
        }
      }
    }
  }

  return results
}
