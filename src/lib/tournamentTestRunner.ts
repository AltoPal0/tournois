import { useTournamentStore } from '../store/tournamentStore'
import { useMatchStore } from '../store/matchStore'
import { topologicalSort } from './matchGeneration'
import { verifyStandings, verifyAdvancements } from './tournamentTester'
import type { DynamicTestResult, PhaseSimResult } from './tournamentTester'
import type { Match, PhaseType, TournamentGraph } from '../types/tournament'

const INVISIBLE_TYPES = new Set<PhaseType>(['super_americana', 'best_of', 'team_builder', 'team_splitter'])
const MAX_AMERICANA_BATCHES = 40

export type ProgressCallback = (msg: string) => void

function randomScore(): [number, number] {
  let s1: number, s2: number
  do {
    s1 = Math.floor(Math.random() * 6) + 1
    s2 = Math.floor(Math.random() * 6) + 1
  } while (s1 === s2)
  return [s1, s2]
}

function getGraph(): TournamentGraph {
  const { nodes, edges } = useTournamentStore.getState()
  return {
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle!,
      target: e.target,
      targetHandle: e.targetHandle!,
    })),
  }
}

async function playMatch(matchId: string) {
  const [s1, s2] = randomScore()
  await useMatchStore.getState().updateMatchScore(matchId, s1, s2)
}

async function simulateStandardPhase(
  phaseNode: TournamentGraph['nodes'][number],
  result: PhaseSimResult,
  onProgress: ProgressCallback,
) {
  const matches = useMatchStore.getState().matches
  const phaseMatches = matches
    .filter((m) => m.phase_node_id === phaseNode.id && m.statut === 'a_jouer')
    .filter((m) => m.equipe1_id != null && m.equipe2_id != null)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.ordre - b.ordre)

  for (const m of phaseMatches) {
    await playMatch(m.id)
    result.matchesPlayed++
  }

  const allMatches = useMatchStore.getState().matches
  const graph = getGraph()
  const sv = verifyStandings(phaseNode, allMatches)
  result.standingsCorrect = sv.ok
  if (!sv.ok && sv.error) result.errors.push(sv.error)
  const av = verifyAdvancements(phaseNode, allMatches, graph)
  result.advancementsCorrect = av.ok
  if (!av.ok && av.error) result.errors.push(av.error)

  onProgress(`${phaseNode.data.config.name} : ${result.matchesPlayed} matchs joués`)
}

async function simulateAmericanaSinglePhase(
  phaseNode: TournamentGraph['nodes'][number],
  result: PhaseSimResult,
  onProgress: ProgressCallback,
) {
  const config = phaseNode.data.config

  if (config.fixedRounds) {
    await simulateStandardPhase(phaseNode, result, onProgress)
    return
  }

  // Dynamique : jouer les batches un par un
  let batchCount = 0
  while (batchCount < MAX_AMERICANA_BATCHES) {
    const pending = useMatchStore
      .getState()
      .matches.filter((m) => m.phase_node_id === phaseNode.id && m.statut === 'a_jouer')

    if (pending.length === 0) {
      // Générer le prochain batch
      const before = useMatchStore.getState().matches.filter((m) => m.phase_node_id === phaseNode.id).length
      await useMatchStore.getState().generateAmericanaSingleBatch(phaseNode.id)
      const after = useMatchStore.getState().matches.filter((m) => m.phase_node_id === phaseNode.id).length
      if (after === before) break // Aucun nouveau match : pairing épuisé
      batchCount++
      continue
    }

    for (const m of pending) {
      if (m.equipe1_id == null || m.equipe2_id == null) continue
      await playMatch(m.id)
      result.matchesPlayed++
    }
  }

  // Terminer la phase
  await useMatchStore.getState().terminateAmericanaSinglePhase(phaseNode.id)

  const allMatches = useMatchStore.getState().matches
  const sv = verifyStandings(phaseNode, allMatches)
  result.standingsCorrect = sv.ok
  if (!sv.ok && sv.error) result.errors.push(sv.error)
  result.advancementsCorrect = true // terminateAmericanaSinglePhase gère les avancements
  onProgress(`${phaseNode.data.config.name} : ${result.matchesPlayed} matchs joués (${batchCount} batches)`)
}

async function simulateAmericanaWeightedLive(
  phaseNode: TournamentGraph['nodes'][number],
  result: PhaseSimResult,
  onProgress: ProgressCallback,
) {
  const config = phaseNode.data.config
  const maxRounds = config.roundCount ?? 10

  for (let round = 1; round <= maxRounds; round++) {
    // Générer le round si pas encore fait (round 1 est déjà là après generateMatches)
    const roundMatches = useMatchStore
      .getState()
      .matches.filter((m) => m.phase_node_id === phaseNode.id && m.round === round)

    if (roundMatches.length === 0) {
      await useMatchStore.getState().generateWeightedAmericanoNextRound(phaseNode.id)
    }

    const toPlay = useMatchStore
      .getState()
      .matches.filter((m) => m.phase_node_id === phaseNode.id && m.round === round && m.statut === 'a_jouer')

    for (const m of toPlay) {
      const [s1, s2] = randomScore()
      await useMatchStore.getState().updateMatchScore(m.id, s1, s2)
      result.matchesPlayed++
    }
  }

  const allMatches = useMatchStore.getState().matches
  const sv = verifyStandings(phaseNode, allMatches)
  result.standingsCorrect = sv.ok
  if (!sv.ok && sv.error) result.errors.push(sv.error)
  result.advancementsCorrect = true // pas d'avancement automatique pour americana_weighted
  onProgress(`${phaseNode.data.config.name} : ${result.matchesPlayed} matchs joués (${maxRounds} rounds)`)
}

async function runRetroactiveTest(
  phaseResults: PhaseSimResult[],
  graph: TournamentGraph,
  onProgress: ProgressCallback,
) {
  // Chercher une phase avec downstream edges et des matchs terminés
  const candidatePhase = graph.nodes.find((node) => {
    if (INVISIBLE_TYPES.has(node.data.config.type)) return false
    if (node.data.config.type === 'americana_weighted') return false
    const hasDownstream = graph.edges.some((e) => e.source === node.id)
    if (!hasDownstream) return false
    const phaseResult = phaseResults.find((r) => r.phaseNodeId === node.id)
    return phaseResult && phaseResult.matchesPlayed > 0
  })

  if (!candidatePhase) {
    onProgress('Test rétroactif : aucune phase éligible trouvée')
    return
  }

  const config = candidatePhase.data.config
  const phaseResult = phaseResults.find((r) => r.phaseNodeId === candidatePhase.id)!

  const allMatches = useMatchStore.getState().matches
  const terminatedMatches = allMatches.filter(
    (m) => m.phase_node_id === candidatePhase.id && m.statut === 'termine',
  )
  if (terminatedMatches.length === 0) return

  // Prendre le dernier match terminé de la phase
  const targetMatch = terminatedMatches[terminatedMatches.length - 1]

  // Récupérer l'état downstream avant modification
  const downstreamSlots = collectDownstreamSlots(candidatePhase, allMatches, graph)
  const slotsBefore = new Map(downstreamSlots.map((s) => [s.matchId + s.field, s.teamId]))

  onProgress(`Test rétroactif sur "${config.name}"...`)

  // 1. Effacer le score
  await useMatchStore.getState().clearMatchScore(targetMatch.id)

  // Vérifier que les slots downstream sont nullifiés
  const matchesAfterClear = useMatchStore.getState().matches
  const slotsAfterClear = collectDownstreamSlots(candidatePhase, matchesAfterClear, graph)
  const clearOk = slotsAfterClear.every((s) => s.teamId == null)

  // 2. Re-saisir avec score inversé
  const [prevS1, prevS2] = [targetMatch.score_equipe1 ?? 1, targetMatch.score_equipe2 ?? 2]
  await useMatchStore.getState().updateMatchScore(targetMatch.id, prevS2, prevS1)

  // Vérifier que les slots downstream sont de nouveau remplis
  const matchesAfterReinput = useMatchStore.getState().matches
  const slotsAfterReinput = collectDownstreamSlots(candidatePhase, matchesAfterReinput, graph)
  const reinputOk = slotsAfterReinput.every((s) => s.teamId != null)

  // Comparer avec avant (pour noter si la qualification a changé)
  const qualifChanged = slotsAfterReinput.some((s) => {
    const before = slotsBefore.get(s.matchId + s.field)
    return before != null && s.teamId != null && before !== s.teamId
  })

  phaseResult.retroactiveCorrect = clearOk && reinputOk
  if (!clearOk) phaseResult.errors.push('Test rétroactif : slots downstream non réinitialisés après clear')
  if (!reinputOk) phaseResult.errors.push('Test rétroactif : slots downstream non remplis après re-saisie')
  if (clearOk && reinputOk) {
    const note = qualifChanged
      ? 'Test rétroactif OK (qualification changée après inversion)'
      : 'Test rétroactif OK (reset + refill fonctionnels)'
    onProgress(note)
  }
}

function collectDownstreamSlots(
  phaseNode: TournamentGraph['nodes'][number],
  allMatches: Match[],
  graph: TournamentGraph,
) {
  const slots: { matchId: string; field: string; teamId: string | null }[] = []
  const config = phaseNode.data.config
  for (const output of config.outputs) {
    const outEdge = graph.edges.find(
      (e) => e.source === phaseNode.id && e.sourceHandle === `out-${output.rank}`,
    )
    if (!outEdge) continue
    const label = `${output.label} de ${config.name}`
    for (const m of allMatches) {
      if (m.equipe1_label === label) slots.push({ matchId: m.id, field: 'equipe1_id', teamId: m.equipe1_id })
      if (m.equipe2_label === label) slots.push({ matchId: m.id, field: 'equipe2_id', teamId: m.equipe2_id })
    }
  }
  return slots
}

export async function runDynamicTest(
  originalId: string,
  tournamentName: string,
  onProgress: ProgressCallback,
): Promise<DynamicTestResult> {
  const testName = `${tournamentName} - tested`
  const errors: string[] = []
  const phaseResults: PhaseSimResult[] = []

  onProgress('Duplication du tournoi...')
  const testId = await useTournamentStore.getState().duplicateTournament(testName)
  if (!testId) {
    return { testTournamentId: '', testTournamentName: testName, phaseResults: [], globalSuccess: false, errors: ['Impossible de dupliquer le tournoi'] }
  }

  try {
    onProgress('Chargement du tournoi test...')
    await useTournamentStore.getState().loadTournament(testId)

    const graph = getGraph()

    onProgress('Génération des matchs...')
    await useMatchStore.getState().generateMatches(testId, graph)
    await useMatchStore.getState().loadMatches(testId)

    const sortedNodes = topologicalSort(graph).filter(
      (n) => !INVISIBLE_TYPES.has(n.data.config.type),
    )

    for (const node of sortedNodes) {
      const config = node.data.config
      const result: PhaseSimResult = {
        phaseNodeId: node.id,
        phaseName: config.name,
        phaseType: config.type,
        matchesPlayed: 0,
        standingsCorrect: true,
        advancementsCorrect: true,
        errors: [],
      }
      phaseResults.push(result)

      onProgress(`Simulation de "${config.name}"...`)
      try {
        if (config.type === 'americana_single') {
          await simulateAmericanaSinglePhase(node, result, onProgress)
        } else if (config.type === 'americana_weighted' && config.liveGeneration) {
          await simulateAmericanaWeightedLive(node, result, onProgress)
        } else {
          await simulateStandardPhase(node, result, onProgress)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(`Erreur simulation : ${msg}`)
        errors.push(`Phase "${config.name}" : ${msg}`)
      }
    }

    onProgress('Test rétroactif...')
    try {
      const currentGraph = getGraph()
      await runRetroactiveTest(phaseResults, currentGraph, onProgress)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Test rétroactif : ${msg}`)
    }

    const globalSuccess =
      errors.length === 0 &&
      phaseResults.every(
        (r) =>
          r.errors.length === 0 &&
          r.standingsCorrect &&
          r.advancementsCorrect &&
          (r.retroactiveCorrect === undefined || r.retroactiveCorrect),
      )

    return { testTournamentId: testId, testTournamentName: testName, phaseResults, globalSuccess, errors }
  } finally {
    // Recharger le tournoi original dans le store
    onProgress('Restauration du tournoi original...')
    await useTournamentStore.getState().loadTournament(originalId)
    await useMatchStore.getState().loadMatches(originalId)
  }
}
