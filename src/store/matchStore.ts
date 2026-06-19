import { create } from 'zustand'
import type { Match, TeamWithJoueurs, TournamentGraph } from '../types/tournament'
import { supabase } from '../lib/supabase'
import { generateAllMatches, computeInputSlotPairs, parseHandleIndex } from '../lib/matchGeneration'
import { computeAdvancements, computeAdvancementResets } from '../lib/advancement'
import { computeNextRoundPairings } from '../lib/swissPairing'
import { computeNextAmericanaSingleMatch } from '../lib/americanaSinglePairing'
import { computeAmericanaSingleStandings, computeWeightedAmericanoStandings } from '../lib/americanaSingleStandings'
import { snakeWeightedRound } from '../lib/matchGeneration'
import { useTournamentStore } from './tournamentStore'

interface MatchState {
  matches: Match[]
  isGenerating: boolean
  isGeneratingBatch: boolean
  isLoading: boolean
  isAssigning: boolean

  subscribeToMatches: (tournamentId: string) => () => void
  loadMatches: (tournamentId: string) => Promise<void>
  generateMatches: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignRandomTeams: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  seedRandomAssignments: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignTeamToPhaseSlot: (tournamentId: string, phaseNodeId: string, slot: number, teamId: string | null) => Promise<void>
  assignPlayersToSlot: (tournamentId: string, phaseNodeId: string, slot: number, player1Id: string | null, player2Id: string | null) => Promise<string | null>
  updateMatchScore: (matchId: string, score1: number, score2: number) => Promise<void>
  clearMatchScore: (matchId: string) => Promise<void>
  updateMatchPiste: (matchId: string, piste: number | null) => Promise<void>
  updateMatchHoraire: (matchId: string, horaire: string | null) => Promise<void>
  configureTournament: (tournamentId: string) => Promise<void>
  activateTournament: (tournamentId: string) => Promise<void>
  startAmericanaSinglePhase: (tournamentId: string, phaseNodeId: string, playerIds: string[], pistes: number[]) => Promise<void>
  generateAmericanaSingleBatch: (phaseNodeId: string) => Promise<void>
  terminateAmericanaSinglePhase: (phaseNodeId: string) => Promise<void>
  updateAmericanaSingleRoster: (phaseNodeId: string, restingPlayerIds: string[], newPlayerName?: string) => Promise<void>
  generateWeightedAmericanoNextRound: (phaseNodeId: string) => Promise<void>
  resetScores: (tournamentId: string) => Promise<void>
  clearMatches: (tournamentId: string) => Promise<void>
  clearSlotAssignments: (tournamentId: string) => Promise<void>
  reset: () => void
}

async function resolvePlayerIds(names: string[]): Promise<string[]> {
  const { data: existing } = await supabase.from('tt_joueurs').select('id, prenom')
  const joueurs = (existing ?? []) as { id: string; prenom: string }[]
  const ids: string[] = []
  for (const name of names) {
    const found = joueurs.find((j) => j.prenom.toLowerCase() === name.toLowerCase())
    if (found) {
      ids.push(found.id)
    } else {
      const { data: created } = await supabase
        .from('tt_joueurs')
        .insert({ prenom: name })
        .select('id')
        .single()
      if (created) ids.push(created.id)
    }
  }
  return ids
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minToTimeStr(n: number): string {
  return `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

/**
 * Reschedule global pour les phases americana_single fixedRounds :
 * interleave toutes les phases sur les pistes disponibles, round par round,
 * en remplissant chaque créneau avec jusqu'à P matchs (P = nb de pistes).
 * Retourne les matchs mis à jour (piste + horaire corrigés).
 */
async function reScheduleAmericanaSingleFixed(
  matchesByPhase: Map<string, Match[]>,
  phaseNodeConfigs: Array<{ heureDebut?: string; dureeMatch?: number }>,
  pistes: number[],
  matchDate: string,
  globalDureeMatch: number,
  globalHeureDebut?: string,
): Promise<Match[]> {
  if (pistes.length === 0) return [...matchesByPhase.values()].flat()

  // Calculer heureDebut et duree en prenant le minimum/maximum des phases
  // (le global peut être absent si chaque phase a sa propre config)
  let startMin = globalHeureDebut ? timeToMin(globalHeureDebut) : null
  let duree = globalDureeMatch
  for (const cfg of phaseNodeConfigs) {
    if (cfg.heureDebut) {
      const m = timeToMin(cfg.heureDebut)
      startMin = startMin === null ? m : Math.min(startMin, m)
    }
    if (cfg.dureeMatch) duree = Math.max(duree, cfg.dureeMatch)
  }

  if (duree === 0 || startMin === null) return [...matchesByPhase.values()].flat()

  // Regrouper par phase → round
  // Scheduler round-by-round synchronisé :
  // toutes les phases font leur round 1 ensemble, puis round 2, puis round 3, etc.
  // Ainsi les groupes avancent à la même vitesse et les pistes sont partagées équitablement.
  const allMatches = [...matchesByPhase.values()].flat()
  const maxRound = allMatches.reduce((max, m) => Math.max(max, m.round ?? 1), 0)

  // Tri au sein de chaque round : phases avec le plus de matchs totaux en premier
  const phaseTotals = new Map<string, number>()
  for (const [id, matches] of matchesByPhase) phaseTotals.set(id, matches.length)

  const batches: Match[][] = []
  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = allMatches
      .filter((m) => (m.round ?? 1) === round)
      .sort((a, b) => {
        const pa = phaseTotals.get(a.phase_node_id) ?? 0
        const pb = phaseTotals.get(b.phase_node_id) ?? 0
        return pa !== pb ? pb - pa : a.ordre - b.ordre
      })
    // Empaqueter par tranches de P pistes
    for (let i = 0; i < roundMatches.length; i += pistes.length) {
      batches.push(roundMatches.slice(i, i + pistes.length))
    }
  }

  // Construire la map des mises à jour
  const updatesMap = new Map<string, { piste: number; horaire: string }>()
  for (let idx = 0; idx < batches.length; idx++) {
    const horaire = `${matchDate}T${minToTimeStr(startMin + idx * duree)}:00`
    batches[idx].forEach((m, i) => updatesMap.set(m.id, { piste: pistes[i]!, horaire }))
  }

  // Appliquer en DB
  await Promise.all(
    [...updatesMap.entries()].map(([id, { piste, horaire }]) =>
      supabase.from('tt_matches').update({ piste, horaire }).eq('id', id),
    ),
  )

  // Retourner les matchs avec les valeurs corrigées
  return [...matchesByPhase.values()].flat().map((m) => {
    const upd = updatesMap.get(m.id)
    return upd ? { ...m, piste: upd.piste, horaire: upd.horaire } : m
  })
}

async function upsertSoloTeam(playerId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('tt_teams')
    .select('id')
    .eq('joueur1_id', playerId)
    .is('joueur2_id', null)
    .limit(1)
  if (existing && existing.length > 0) return existing[0].id
  const { data } = await supabase
    .from('tt_teams')
    .insert({ joueur1_id: playerId, joueur2_id: null })
    .select('id')
    .single()
  return data?.id ?? null
}

async function upsertTeam(player1Id: string, player2Id: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('tt_teams')
    .select('id')
    .or(`and(joueur1_id.eq.${player1Id},joueur2_id.eq.${player2Id}),and(joueur1_id.eq.${player2Id},joueur2_id.eq.${player1Id})`)
    .limit(1)
  if (existing && existing.length > 0) return existing[0].id
  const { data } = await supabase
    .from('tt_teams')
    .insert({ joueur1_id: player1Id, joueur2_id: player2Id })
    .select('id')
    .single()
  return data?.id ?? null
}

async function fetchTeamsMapForMatches(matches: Match[]): Promise<Map<string, TeamWithJoueurs>> {
  const teamIds = new Set<string>()
  for (const m of matches) {
    if (m.equipe1_id) teamIds.add(m.equipe1_id)
    if (m.equipe2_id) teamIds.add(m.equipe2_id)
  }
  if (teamIds.size === 0) return new Map()
  const { data } = await supabase
    .from('tt_teams')
    .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    .in('id', [...teamIds])
  const map = new Map<string, TeamWithJoueurs>()
  if (data) {
    for (const t of data as unknown as TeamWithJoueurs[]) map.set(t.id, t)
  }
  return map
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matches: [],
  isGenerating: false,
  isGeneratingBatch: false,
  isLoading: false,
  isAssigning: false,

  subscribeToMatches: (tournamentId) => {
    const channel = supabase
      .channel(`matches:${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tt_matches', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Match
            set((state) => ({
              matches: state.matches.map((m) => (m.id === updated.id ? updated : m)),
            }))
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Match
            set((state) => {
              if (state.matches.some((m) => m.id === inserted.id)) return state
              return { matches: [...state.matches, inserted] }
            })
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string }
            set((state) => ({
              matches: state.matches.filter((m) => m.id !== deleted.id),
            }))
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  loadMatches: async (tournamentId) => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: data ?? [], isLoading: false })
  },

  generateMatches: async (tournamentId, graph) => {
    set({ isGenerating: true })
    try {

    // Phases americana_single : leurs matchs sont gérés séparément, on les préserve
    const americanaSingleIds = new Set(
      graph.nodes
        .filter((n) => n.data.config.type === 'americana_single')
        .map((n) => n.id),
    )

    // Charger les matchs existants (statut inclus pour détecter les phases en cours)
    const { data: existingMatches } = await supabase
      .from('tt_matches')
      .select('phase_node_id, ordre, equipe1_id, equipe2_id, statut')
      .eq('tournament_id', tournamentId)

    // Sauvegarder les assignations d'équipes des phases non-americana_single
    const assignationMap = new Map<string, { equipe1_id: string | null; equipe2_id: string | null }>()
    for (const m of existingMatches ?? []) {
      if (!americanaSingleIds.has(m.phase_node_id as string)) {
        assignationMap.set(`${m.phase_node_id}:${m.ordre}`, {
          equipe1_id: m.equipe1_id as string | null,
          equipe2_id: m.equipe2_id as string | null,
        })
      }
    }

    // Americana_single avec au moins un match terminé → préservées intégralement
    // Americana_single sans match terminé → supprimées et régénérées (nouvelle liste de joueurs)
    const americanaIdsToPreserve = new Set(
      (existingMatches ?? [])
        .filter((m) => americanaSingleIds.has(m.phase_node_id as string) && (m.statut as string) === 'termine')
        .map((m) => m.phase_node_id as string),
    )

    // Supprimer les matchs : phases non-americana + americana sans matchs terminés
    const idsToDelete = graph.nodes
      .filter((n) => !americanaIdsToPreserve.has(n.id))
      .map((n) => n.id)
    if (idsToDelete.length > 0) {
      await supabase
        .from('tt_matches')
        .delete()
        .eq('tournament_id', tournamentId)
        .in('phase_node_id', idsToDelete)
    }

    // Générer les nouveaux matchs (americana_single déjà skippée dans generateAllMatches)
    const { tournamentConfig } = useTournamentStore.getState()
    const newMatches = generateAllMatches(graph, tournamentId, {
      pistes: tournamentConfig?.pistes,
      matchDate: tournamentConfig?.matchDate,
      heureDebut: tournamentConfig?.heureDebut,
      dureeMatch: tournamentConfig?.dureeMatch,
    })

    // Réappliquer les assignations sauvegardées
    const matchesWithAssignments = newMatches.map((m) => ({
      ...m,
      ...(assignationMap.get(`${m.phase_node_id}:${m.ordre}`) ?? {}),
    }))

    if (matchesWithAssignments.length > 0) {
      const { data: inserted } = await supabase
        .from('tt_matches')
        .insert(matchesWithAssignments)
        .select()
      set({ matches: inserted ?? [] })
    }

    // Démarrer le premier batch pour les americana_single régénérées
    if (americanaSingleIds.size > 0) {
      const { tournamentConfig: tc } = useTournamentStore.getState()
      const pistes = tc?.pistes ?? []

      for (const nodeId of americanaSingleIds) {
        if (americanaIdsToPreserve.has(nodeId)) continue
        const node = graph.nodes.find((n) => n.id === nodeId)
        if (!node) continue
        const names = (node.data.config.playerNames ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (names.length < 4) continue
        const playerIds = await resolvePlayerIds(names)
        if (playerIds.length >= 4) {
          await get().startAmericanaSinglePhase(tournamentId, nodeId, playerIds, pistes)
        }
      }

      // Récupérer tous les matchs americana_single (existants + nouveaux)
      const { data: americanaMatches } = await supabase
        .from('tt_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .in('phase_node_id', [...americanaSingleIds])

      // Reschedule global pour les phases fixedRounds régénérées (interleave pistes entre phases)
      let finalAmericanaMatches = (americanaMatches ?? []) as Match[]
      const fixedRegeneratedNodes = graph.nodes.filter(
        (n) =>
          n.data.config.type === 'americana_single' &&
          n.data.config.fixedRounds &&
          !americanaIdsToPreserve.has(n.id),
      )
      if (fixedRegeneratedNodes.length > 0 && tc?.matchDate && pistes.length > 0) {
        const matchesByPhase = new Map<string, Match[]>()
        for (const node of fixedRegeneratedNodes) {
          const pm = finalAmericanaMatches.filter((m) => m.phase_node_id === node.id)
          if (pm.length > 0) matchesByPhase.set(node.id, pm)
        }
        if (matchesByPhase.size > 0) {
          const phaseConfigs = fixedRegeneratedNodes.map((n) => ({
            heureDebut: n.data.config.heureDebut as string | undefined,
            dureeMatch: n.data.config.dureeMatch as number | undefined,
          }))
          const rescheduled = await reScheduleAmericanaSingleFixed(
            matchesByPhase,
            phaseConfigs,
            pistes,
            tc.matchDate,
            tc.dureeMatch ?? 0,
            tc.heureDebut ?? undefined,
          )
          // Remplacer dans finalAmericanaMatches les matchs reschedule
          const rescheduledMap = new Map(rescheduled.map((m) => [m.id, m]))
          finalAmericanaMatches = finalAmericanaMatches.map((m) => rescheduledMap.get(m.id) ?? m)
        }
      }

      set((state) => ({
        matches: [
          ...state.matches.filter((m) => !americanaSingleIds.has(m.phase_node_id)),
          ...finalAmericanaMatches,
        ],
      }))
    }

    } finally {
      set({ isGenerating: false })
    }
  },

  assignRandomTeams: async (tournamentId, graph) => {
    set({ isAssigning: true })

    // Identifier les phases racine (pas d'arêtes entrantes)
    const rootNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana' && n.data.config.type !== 'americana_single' && n.data.config.type !== 'americana_weighted',
    )

    // Calculer le nombre total d'équipes nécessaires
    const totalNeeded = rootNodes.reduce((sum, n) => sum + n.data.config.inputCount, 0)

    // Résoudre la liste des équipes selon joueurs inscrits ou pool global
    const { tournamentConfig } = useTournamentStore.getState()
    const inscrits = tournamentConfig?.joueursInscrits

    let teams: { id: string }[]

    if (inscrits && inscrits.length > 0) {
      // Récupérer les IDs des joueurs inscrits
      const { data: joueurs } = await supabase.from('tt_joueurs').select('id, prenom')
      if (!joueurs) { set({ isAssigning: false }); return }

      const nameSet = new Set(inscrits.map((n) => n.toLowerCase()))
      const playerIds = shuffle(
        joueurs.filter((j) => nameSet.has(j.prenom.toLowerCase())).map((j) => j.id),
      )

      if (playerIds.length < totalNeeded * 2) { set({ isAssigning: false }); return }

      // Apparier les joueurs deux par deux et trouver/créer les équipes
      const resolvedTeams: { id: string }[] = []
      for (let i = 0; i < totalNeeded * 2; i += 2) {
        const p1 = playerIds[i]
        const p2 = playerIds[i + 1]

        // Chercher équipe existante
        const { data: existing } = await supabase
          .from('tt_teams')
          .select('id')
          .or(`and(joueur1_id.eq.${p1},joueur2_id.eq.${p2}),and(joueur1_id.eq.${p2},joueur2_id.eq.${p1})`)
          .limit(1)

        if (existing && existing.length > 0) {
          resolvedTeams.push({ id: existing[0].id })
        } else {
          const { data: created } = await supabase
            .from('tt_teams')
            .insert({ joueur1_id: p1, joueur2_id: p2 })
            .select('id')
            .single()
          if (created) resolvedTeams.push({ id: created.id })
        }
      }

      if (resolvedTeams.length < totalNeeded) { set({ isAssigning: false }); return }
      teams = resolvedTeams
    } else {
      // Pool global : piocher dans les équipes existantes
      const { data: allTeams } = await supabase.from('tt_teams').select('id').limit(totalNeeded)
      if (!allTeams || allTeams.length < totalNeeded) { set({ isAssigning: false }); return }
      teams = shuffle(allTeams)
    }

    const shuffled = teams
    let teamIndex = 0

    const { matches } = get()

    // Construire toutes les mises à jour pour toutes les phases racine
    const allUpdates: PromiseLike<unknown>[] = []

    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      if (type === 'super_americana') continue

      const phaseTeams = shuffled.slice(teamIndex, teamIndex + inputCount)
      teamIndex += inputCount

      const slotToTeam = new Map<number, string>()
      phaseTeams.forEach((t, i) => slotToTeam.set(i + 1, t.id))

      const slotPairs = computeInputSlotPairs(type, inputCount, node.data.config.roundCount)
      const phaseMatches = matches
        .filter((m) => m.phase_node_id === node.id)
        .sort((a, b) => a.ordre - b.ordre)

      for (const pair of slotPairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue

        allUpdates.push(
          supabase
            .from('tt_matches')
            .update({
              equipe1_id: slotToTeam.get(pair.slot1) ?? null,
              equipe2_id: slotToTeam.get(pair.slot2) ?? null,
            })
            .eq('id', match.id),
        )
      }
    }

    // Envoyer tous les updates en parallèle
    await Promise.all(allUpdates)

    // Recharger les matchs
    const { data: updatedMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: updatedMatches ?? [], isAssigning: false })
  },

  seedRandomAssignments: async (tournamentId, graph) => {
    set({ isAssigning: true })

    const rootNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana' && n.data.config.type !== 'americana_single' && n.data.config.type !== 'americana_weighted',
    )

    // Recharger les matchs depuis DB pour avoir les équipes actuellement assignées
    const { data: dbMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    const currentMatches = (dbMatches ?? []) as Match[]

    // Construire le mapping slot → équipe actuelle pour chaque phase
    const slotTeamEntries: { phaseNodeId: string; slot: number; teamId: string | null }[] = []

    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      const pairs = computeInputSlotPairs(type as Exclude<typeof type, 'super_americana' | 'americana_single' | 'americana_weighted' | 'best_of' | 'team_builder' | 'team_splitter'>, inputCount, node.data.config.roundCount)
      const phaseMatches = currentMatches.filter((m) => m.phase_node_id === node.id)

      const slotToTeam = new Map<number, string | null>()
      for (const pair of pairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue
        if (!slotToTeam.has(pair.slot1)) slotToTeam.set(pair.slot1, match.equipe1_id)
        if (!slotToTeam.has(pair.slot2)) slotToTeam.set(pair.slot2, match.equipe2_id)
      }

      for (let s = 1; s <= inputCount; s++) {
        slotTeamEntries.push({ phaseNodeId: node.id, slot: s, teamId: slotToTeam.get(s) ?? null })
      }
    }

    // Extraire et mélanger uniquement les équipes assignées (non-nulles)
    const assignedTeamIds = shuffle(
      slotTeamEntries.map((e) => e.teamId).filter(Boolean) as string[],
    )

    // Réaffecter les équipes mélangées aux slots dans l'ordre
    const slotToShuffled = new Map<string, string | null>()
    let idx = 0
    for (const entry of slotTeamEntries) {
      slotToShuffled.set(`${entry.phaseNodeId}-${entry.slot}`, entry.teamId !== null ? (assignedTeamIds[idx++] ?? null) : null)
    }

    // Mettre à jour chaque match en DB
    const allUpdates: PromiseLike<unknown>[] = []
    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      const pairs = computeInputSlotPairs(type as Exclude<typeof type, 'super_americana' | 'americana_single' | 'americana_weighted' | 'best_of' | 'team_builder' | 'team_splitter'>, inputCount, node.data.config.roundCount)
      const phaseMatches = currentMatches.filter((m) => m.phase_node_id === node.id)

      for (const pair of pairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue
        allUpdates.push(
          supabase.from('tt_matches').update({
            equipe1_id: slotToShuffled.get(`${node.id}-${pair.slot1}`) ?? null,
            equipe2_id: slotToShuffled.get(`${node.id}-${pair.slot2}`) ?? null,
          }).eq('id', match.id),
        )
      }
    }

    await Promise.all(allUpdates)

    // Recharger le store
    const { data: updatedMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: updatedMatches ?? [], isAssigning: false })
  },

  updateMatchScore: async (matchId, score1, score2) => {
    const finishedAt = new Date().toISOString()

    await supabase
      .from('tt_matches')
      .update({
        score_equipe1: score1,
        score_equipe2: score2,
        statut: 'termine' as const,
        finished_at: finishedAt,
      })
      .eq('id', matchId)

    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: score1, score_equipe2: score2, statut: 'termine' as const, finished_at: finishedAt }
          : m,
      ),
    }))

    // Avancement automatique des équipes vers les phases suivantes
    const { nodes, edges } = useTournamentStore.getState()
    const graph: TournamentGraph = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }

    const { matchUpdates: advancements } = computeAdvancements(matchId, get().matches, graph)

    if (advancements.length > 0) {
      for (const adv of advancements) {
        await supabase
          .from('tt_matches')
          .update({ [adv.field]: adv.teamId })
          .eq('id', adv.matchId)
      }

      set((state) => ({
        matches: state.matches.map((m) => {
          const matchUpdates = advancements.filter((a) => a.matchId === m.id)
          if (matchUpdates.length === 0) return m
          const patched = { ...m }
          for (const u of matchUpdates) {
            ;(patched as Record<string, unknown>)[u.field] = u.teamId
          }
          return patched
        }),
      }))
    }

    // Appariement suisse pour tournante_libre + auto-complétion americana_single fixe
    const updatedMatch = get().matches.find((m) => m.id === matchId)
    if (updatedMatch) {
      const { nodes } = useTournamentStore.getState()
      const phaseNode = nodes.find((n) => n.id === updatedMatch.phase_node_id)

      // Auto-complétion : americana_single fixedRounds → terminer quand tous les matchs sont finis
      if (
        phaseNode?.data.config.type === 'americana_single' &&
        phaseNode.data.config.fixedRounds &&
        !phaseNode.data.config.completed
      ) {
        const phaseMatches = get().matches.filter((m) => m.phase_node_id === phaseNode.id)
        if (phaseMatches.length > 0 && phaseMatches.every((m) => m.statut === 'termine')) {
          await get().terminateAmericanaSinglePhase(phaseNode.id)
        }
      }

      if (phaseNode?.data.config.type === 'tournante_libre') {
        const phaseMatches = get().matches.filter((m) => m.phase_node_id === updatedMatch.phase_node_id)
        const pairUpdates = computeNextRoundPairings(matchId, phaseMatches)
        if (pairUpdates.length > 0) {
          for (const u of pairUpdates) {
            await supabase
              .from('tt_matches')
              .update({ equipe1_id: u.equipe1_id, equipe2_id: u.equipe2_id })
              .eq('id', u.matchId)
          }
          set((state) => ({
            matches: state.matches.map((m) => {
              const u = pairUpdates.find((p) => p.matchId === m.id)
              return u ? { ...m, equipe1_id: u.equipe1_id, equipe2_id: u.equipe2_id } : m
            }),
          }))
        }
      }
    }

  },

  clearMatchScore: async (matchId) => {
    await supabase
      .from('tt_matches')
      .update({ score_equipe1: null, score_equipe2: null, statut: 'a_jouer', finished_at: null })
      .eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: null, score_equipe2: null, statut: 'a_jouer' as const, finished_at: null }
          : m,
      ),
    }))

    // Nullifier les équipes déjà avancées downstream depuis cette phase
    const { nodes, edges } = useTournamentStore.getState()
    const graph: TournamentGraph = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }
    const resets = computeAdvancementResets(matchId, get().matches, graph)
    if (resets.length > 0) {
      for (const r of resets) {
        await supabase.from('tt_matches').update({ [r.field]: null }).eq('id', r.matchId)
      }
      set((state) => ({
        matches: state.matches.map((m) => {
          const matchResets = resets.filter((r) => r.matchId === m.id)
          if (matchResets.length === 0) return m
          const patched = { ...m }
          for (const r of matchResets) {
            ;(patched as Record<string, unknown>)[r.field] = null
          }
          return patched
        }),
      }))
    }
  },

  assignTeamToPhaseSlot: async (tournamentId, phaseNodeId, slot, teamId) => {
    const { nodes } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || node.data.config.type === 'super_americana' || node.data.config.type === 'americana_single' || node.data.config.type === 'americana_weighted' || node.data.config.type === 'best_of' || node.data.config.type === 'team_builder' || node.data.config.type === 'team_splitter') return

    const { type, inputCount } = node.data.config
    const pairs = computeInputSlotPairs(type, inputCount, node.data.config.roundCount)
    let phaseMatches = get().matches.filter((m) => m.phase_node_id === phaseNodeId)

    // Si le store est vide (pas encore chargé), recharger depuis DB
    if (phaseMatches.length === 0) {
      const { data } = await supabase
        .from('tt_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('phase_node_id', phaseNodeId)
      phaseMatches = (data ?? []) as Match[]
      if (phaseMatches.length > 0) {
        set((state) => {
          const existingIds = new Set(state.matches.map((m) => m.id))
          const newMatches = phaseMatches.filter((m) => !existingIds.has(m.id))
          return newMatches.length > 0 ? { matches: [...state.matches, ...newMatches] } : state
        })
      }
    }

    type MatchUpdate = { matchId: string; field: 'equipe1_id' | 'equipe2_id'; value: string | null }
    const updates: MatchUpdate[] = []

    for (const pair of pairs) {
      const match = phaseMatches.find((m) => m.ordre === pair.ordre)
      if (!match) continue
      if (pair.slot1 === slot) updates.push({ matchId: match.id, field: 'equipe1_id', value: teamId })
      if (pair.slot2 === slot) updates.push({ matchId: match.id, field: 'equipe2_id', value: teamId })
    }

    for (const u of updates) {
      await supabase.from('tt_matches').update({ [u.field]: u.value }).eq('id', u.matchId)
    }

    set((state) => ({
      matches: state.matches.map((m) => {
        const matchUpdates = updates.filter((u) => u.matchId === m.id)
        if (matchUpdates.length === 0) return m
        let patched = { ...m }
        for (const u of matchUpdates) {
          patched = { ...patched, [u.field]: u.value }
        }
        return patched
      }),
    }))

  },

  assignPlayersToSlot: async (tournamentId, phaseNodeId, slot, player1Id, player2Id) => {
    let teamId: string | null = null

    if (player1Id && player2Id) {
      // Chercher une équipe existante avec ces deux joueurs (dans n'importe quel ordre)
      const { data: existing } = await supabase
        .from('tt_teams')
        .select('id')
        .or(
          `and(joueur1_id.eq.${player1Id},joueur2_id.eq.${player2Id}),and(joueur1_id.eq.${player2Id},joueur2_id.eq.${player1Id})`,
        )
        .limit(1)

      if (existing && existing.length > 0) {
        teamId = existing[0].id
      } else {
        // Créer une nouvelle équipe
        const { data: newTeam } = await supabase
          .from('tt_teams')
          .insert({ joueur1_id: player1Id, joueur2_id: player2Id })
          .select('id')
          .single()
        if (newTeam) teamId = newTeam.id
      }
    }

    await get().assignTeamToPhaseSlot(tournamentId, phaseNodeId, slot, teamId)
    return teamId
  },

  updateMatchPiste: async (matchId, piste) => {
    await supabase.from('tt_matches').update({ piste }).eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) => (m.id === matchId ? { ...m, piste } : m)),
    }))
  },

  updateMatchHoraire: async (matchId, horaire) => {
    await supabase.from('tt_matches').update({ horaire }).eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) => (m.id === matchId ? { ...m, horaire } : m)),
    }))
  },

  configureTournament: async (tournamentId) => {
    await supabase.from('tt_tournaments').update({ status: 'configured' }).eq('id', tournamentId)
    useTournamentStore.getState().setTournamentStatus('configured')

    // Créer les matchs initiaux des phases americana_single
    const { nodes, tournamentConfig } = useTournamentStore.getState()
    const pistes = tournamentConfig?.pistes ?? []
    for (const node of nodes) {
      if (node.data.config.type === 'americana_single') {
        const names = (node.data.config.playerNames ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (names.length < 4) continue
        // Vérifier si des matchs existent déjà pour cette phase (idempotent)
        const { data: existing } = await supabase
          .from('tt_matches')
          .select('id')
          .eq('phase_node_id', node.id)
          .limit(1)
        if (existing && existing.length > 0) continue
        const playerIds = await resolvePlayerIds(names)
        if (playerIds.length >= 4) {
          await get().startAmericanaSinglePhase(tournamentId, node.id, playerIds, pistes)
        }
      }
    }
  },

  activateTournament: async (tournamentId) => {
    await supabase.from('tt_tournaments').update({ status: 'active' }).eq('id', tournamentId)
    useTournamentStore.getState().setTournamentStatus('active')
  },

  startAmericanaSinglePhase: async (tournamentId, phaseNodeId, playerIds, pistes) => {
    const { nodes, tournamentConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node) return

    const isFixed = node.data.config.fixedRounds ?? false
    const rounds = node.data.config.roundCount ?? 5
    const matchesPerRound = Math.max(1, Math.floor(playerIds.length / 4))
    const initialCount = isFixed ? rounds * matchesPerRound : (node.data.config.batchSize ?? 3)

    // Calcul horaire : durée par round et heure de début
    const dureeMin = node.data.config.dureeMatch ?? tournamentConfig?.dureeMatch ?? 0
    const heureDebutStr = node.data.config.heureDebut ?? tournamentConfig?.heureDebut ?? null
    const heureDebutTotalMin = heureDebutStr
      ? (() => { const [h, m] = heureDebutStr.split(':').map(Number); return h * 60 + m })()
      : null

    let currentPhaseMatches: Match[] = get().matches.filter((m) => m.phase_node_id === phaseNodeId)

    for (let i = 0; i < initialCount; i++) {
      const teamsMap = await fetchTeamsMapForMatches(currentPhaseMatches)
      const result = computeNextAmericanaSingleMatch(playerIds, currentPhaseMatches, teamsMap)
      if (!result) break

      const teamId1 = await upsertTeam(result.pair1[0], result.pair1[1])
      const teamId2 = await upsertTeam(result.pair2[0], result.pair2[1])
      if (!teamId1 || !teamId2) break

      const ordre = currentPhaseMatches.length + 1

      // Piste : distribution cyclique par position dans le round
      const matchWithinRound = i % matchesPerRound
      const piste = pistes.length > 0 ? (pistes[matchWithinRound % pistes.length] ?? null) : null

      // Horaire : heure de début + (numéro de round × durée)
      const roundIndex = Math.floor(i / matchesPerRound)
      let horaire: string | null = null
      if (heureDebutTotalMin !== null && dureeMin > 0 && tournamentConfig?.matchDate) {
        const startMin = heureDebutTotalMin + roundIndex * dureeMin
        const hh = Math.floor(startMin / 60).toString().padStart(2, '0')
        const mm = (startMin % 60).toString().padStart(2, '0')
        horaire = `${tournamentConfig.matchDate}T${hh}:${mm}:00`
      }

      const { data: newMatch } = await supabase
        .from('tt_matches')
        .insert({
          tournament_id: tournamentId,
          phase_node_id: phaseNodeId,
          nom: `Match ${ordre} de ${node.data.config.name}`,
          statut: 'a_jouer',
          equipe1_id: teamId1,
          equipe2_id: teamId2,
          piste,
          ordre,
          round: roundIndex + 1,
          score_equipe1: null,
          score_equipe2: null,
          finished_at: null,
          horaire,
          equipe1_label: null,
          equipe2_label: null,
        })
        .select()
        .single()

      if (newMatch) {
        currentPhaseMatches = [...currentPhaseMatches, newMatch as Match]
        set((state) => ({ matches: [...state.matches, newMatch as Match] }))
      }
    }
  },

  generateAmericanaSingleBatch: async (phaseNodeId) => {
    if (get().isGeneratingBatch) return
    set({ isGeneratingBatch: true })

    try {
    const { nodes, tournamentConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || node.data.config.type !== 'americana_single') return
    if (node.data.config.fixedRounds) return

    // Vérifier en mémoire que tous les matchs sont terminés
    const phaseMatchesLocal = get().matches.filter((m) => m.phase_node_id === phaseNodeId)
    if (phaseMatchesLocal.length > 0 && phaseMatchesLocal.some((m) => m.statut === 'a_jouer')) return

    // Anti-conflit : vérifier en DB qu'aucun match actif n'existe déjà
    const { data: activeCheck } = await supabase
      .from('tt_matches')
      .select('id')
      .eq('phase_node_id', phaseNodeId)
      .eq('statut', 'a_jouer')
      .limit(1)
    if (activeCheck && activeCheck.length > 0) return

    const playerIds = await resolvePlayerIds(
      (node.data.config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    )
    if (playerIds.length < 4) return

    // Recharger les matchs depuis la DB pour avoir l'état exact
    const { data: dbMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('phase_node_id', phaseNodeId)
    let currentPhaseMatches: Match[] = (dbMatches ?? []) as Match[]

    const pistes = tournamentConfig?.pistes ?? []
    const restingPlayerIds = node.data.config.restingPlayerIds ?? []
    const batchSize = node.data.config.batchSize ?? 3
    if (batchSize === 0) return

    for (let i = 0; i < batchSize; i++) {
      const teamsMap = await fetchTeamsMapForMatches(currentPhaseMatches)
      const result = computeNextAmericanaSingleMatch(playerIds, currentPhaseMatches, teamsMap, restingPlayerIds)
      if (!result) break

      const teamId1 = await upsertTeam(result.pair1[0], result.pair1[1])
      const teamId2 = await upsertTeam(result.pair2[0], result.pair2[1])
      if (!teamId1 || !teamId2) break

      const ordre = currentPhaseMatches.length + 1
      const { data: newMatch } = await supabase
        .from('tt_matches')
        .insert({
          tournament_id: currentPhaseMatches[0]?.tournament_id ?? node.id,
          phase_node_id: phaseNodeId,
          nom: `Match ${ordre} de ${node.data.config.name}`,
          statut: 'a_jouer',
          equipe1_id: teamId1,
          equipe2_id: teamId2,
          piste: pistes[i] ?? null,
          ordre,
          round: null,
          score_equipe1: null,
          score_equipe2: null,
          finished_at: null,
          horaire: null,
          equipe1_label: null,
          equipe2_label: null,
        })
        .select()
        .single()

      if (newMatch) {
        currentPhaseMatches = [...currentPhaseMatches, newMatch as Match]
        set((state) => {
          if (state.matches.some((m) => m.id === (newMatch as Match).id)) return state
          return { matches: [...state.matches, newMatch as Match] }
        })
      }
    }
    } finally {
      set({ isGeneratingBatch: false })
    }
  },

  terminateAmericanaSinglePhase: async (phaseNodeId) => {
    const { nodes, edges, tournamentId, updatePhaseConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || !tournamentId) return

    const phaseMatches = get().matches.filter((m) => m.phase_node_id === phaseNodeId)
    const teamsMap = await fetchTeamsMapForMatches(phaseMatches)
    const standings = computeAmericanaSingleStandings(phaseMatches, teamsMap)

    const graph: TournamentGraph = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }

    // Collecter les inputs pour les team_builder downstream (builderNodeId → inputSlot → joueurId)
    const teamBuilderInputs = new Map<string, Map<number, string>>()

    // Pour chaque output de la phase, avancer le joueur correspondant vers les phases aval
    for (const output of node.data.config.outputs) {
      const row = standings[output.rank - 1]
      if (!row) continue

      const outEdge = graph.edges.find(
        (e) => e.source === phaseNodeId && e.sourceHandle === `out-${output.rank}`,
      )
      if (!outEdge) continue

      const targetNode = graph.nodes.find((n) => n.id === outEdge.target)
      if (!targetNode) continue

      if (targetNode.data.config.type === 'team_builder') {
        // Stocker le joueur pour ce slot d'entrée du team_builder
        const inputSlot = parseInt(outEdge.targetHandle.replace('in-', ''))
        if (!teamBuilderInputs.has(targetNode.id)) teamBuilderInputs.set(targetNode.id, new Map())
        teamBuilderInputs.get(targetNode.id)!.set(inputSlot, row.playerId)
      } else if (targetNode.data.config.type !== 'team_splitter') {
        const soloTeamId = await upsertSoloTeam(row.playerId)
        if (!soloTeamId) continue
        const label = `${output.label} de ${node.data.config.name}`
        const allMatches = get().matches
        const targets = allMatches.filter(
          (m) => m.equipe1_label === label || m.equipe2_label === label,
        )
        for (const t of targets) {
          const field = t.equipe1_label === label ? 'equipe1_id' : 'equipe2_id'
          await supabase.from('tt_matches').update({ [field]: soloTeamId }).eq('id', t.id)
        }
        set((state) => ({
          matches: state.matches.map((m) => {
            if (m.equipe1_label === label) return { ...m, equipe1_id: soloTeamId }
            if (m.equipe2_label === label) return { ...m, equipe2_id: soloTeamId }
            return m
          }),
        }))
      }
      // team_splitter downstream sera géré dans une future itération
    }

    // Construire les équipes et propager pour chaque team_builder downstream
    for (const [builderNodeId, slotMap] of teamBuilderInputs) {
      const builderNode = graph.nodes.find((n) => n.id === builderNodeId)
      if (!builderNode) continue
      const builderConfig = builderNode.data.config

      // Grouper les joueurs par outputSlot via internalPairs
      const outputSlotPlayers = new Map<number, string[]>()
      for (const pair of (builderConfig.internalPairs ?? [])) {
        const joueurId = slotMap.get(pair.inputSlot)
        if (!joueurId) continue
        if (!outputSlotPlayers.has(pair.outputSlot)) outputSlotPlayers.set(pair.outputSlot, [])
        outputSlotPlayers.get(pair.outputSlot)!.push(joueurId)
      }

      for (const [outputSlot, joueurIds] of outputSlotPlayers) {
        if (joueurIds.length < 2) continue
        const teamId = await upsertTeam(joueurIds[0], joueurIds[1])
        if (!teamId) continue

        // Construire le label de la même façon que buildProvenanceMap pour team_builder :
        // composite des provenances des slots d'entrée qui alimentent cet outputSlot
        const inputSlotsForOutput = (builderConfig.internalPairs ?? [])
          .filter((p) => p.outputSlot === outputSlot)
          .map((p) => p.inputSlot)
          .sort((a, b) => a - b)
        const label = inputSlotsForOutput.length > 0
          ? inputSlotsForOutput.map((slot) => {
              const inEdge = graph.edges.find(
                (e) => e.target === builderNodeId && parseHandleIndex(e.targetHandle) === slot,
              )
              if (!inEdge) return `#${slot}`
              const srcNode = graph.nodes.find((n) => n.id === inEdge.source)
              if (!srcNode) return `#${slot}`
              const srcOutputRank = parseHandleIndex(inEdge.sourceHandle)
              const srcOutput = srcNode.data.config.outputs.find((o) => o.rank === srcOutputRank)
              return srcOutput ? `${srcOutput.label} de ${srcNode.data.config.name}` : `#${slot}`
            }).join(' + ')
          : `${builderConfig.outputs.find((o) => o.rank === outputSlot)?.label ?? outputSlot} de ${builderConfig.name}`

        const allMatches = get().matches
        const targets = allMatches.filter((m) => m.equipe1_label === label || m.equipe2_label === label)
        for (const t of targets) {
          const field = t.equipe1_label === label ? 'equipe1_id' : 'equipe2_id'
          await supabase.from('tt_matches').update({ [field]: teamId }).eq('id', t.id)
        }
        set((state) => ({
          matches: state.matches.map((m) => {
            if (m.equipe1_label === label) return { ...m, equipe1_id: teamId }
            if (m.equipe2_label === label) return { ...m, equipe2_id: teamId }
            return m
          }),
        }))
      }
    }

    // Marquer la phase comme terminée
    updatePhaseConfig(phaseNodeId, { completed: true })
    const updatedNodes = useTournamentStore.getState().nodes
    await supabase.from('tt_tournaments').update({
      graph_config: {
        nodes: updatedNodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      },
    }).eq('id', tournamentId)
  },

  updateAmericanaSingleRoster: async (phaseNodeId, restingPlayerIds, newPlayerName) => {
    const { nodes, edges, tournamentId, updatePhaseConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || !tournamentId) return

    const updates: Record<string, unknown> = { restingPlayerIds }

    if (newPlayerName) {
      const trimmed = newPlayerName.trim()
      if (trimmed) {
        await resolvePlayerIds([trimmed])
        const current = (node.data.config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (!current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
          current.push(trimmed)
          updates.playerNames = current.join(', ')
          updates.inputCount = current.length
        }
      }
    }

    updatePhaseConfig(phaseNodeId, updates as Parameters<typeof updatePhaseConfig>[1])

    // Sauvegarder immédiatement sans passer par isDirty
    const updatedNodes = useTournamentStore.getState().nodes
    await supabase.from('tt_tournaments').update({
      graph_config: {
        nodes: updatedNodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      },
    }).eq('id', tournamentId)
  },

  resetScores: async (tournamentId) => {
    await supabase
      .from('tt_matches')
      .update({ score_equipe1: null, score_equipe2: null, statut: 'a_jouer' })
      .eq('tournament_id', tournamentId)
    set((state) => ({
      matches: state.matches.map((m) =>
        m.tournament_id === tournamentId
          ? { ...m, score_equipe1: null, score_equipe2: null, statut: 'a_jouer' as const }
          : m,
      ),
    }))
  },

  clearMatches: async (tournamentId) => {
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)
    set({ matches: [] })
  },

  generateWeightedAmericanoNextRound: async (phaseNodeId) => {
    const { nodes, tournamentId } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || !tournamentId) return

    const config = node.data.config
    const allPlayers = (config.playerNames ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    if (allPlayers.length < 4) return

    const phaseMatches = get().matches.filter((m) => m.phase_node_id === phaseNodeId)
    const currentRound = phaseMatches.reduce((max, m) => Math.max(max, m.round ?? 0), 0)
    const nextRound = currentRound + 1

    // Trier les joueurs par standings actuels (mode live = appariement par forme)
    const standings = computeWeightedAmericanoStandings(phaseMatches)
    const rankedNames = standings.map((s) => s.playerId)
    // Ajouter les joueurs n'ayant pas encore joué (pas dans standings)
    for (const p of allPlayers) {
      if (!rankedNames.includes(p)) rankedNames.push(p)
    }

    const topPlayerSet = new Set(
      (config.topPlayers ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    )

    // roundIndex = 0 car les joueurs sont déjà triés par forme — la diversité
    // de partenaires est assurée par la variation des standings entre rounds
    const roundMatches = snakeWeightedRound(rankedNames, 0, topPlayerSet.size > 0 ? topPlayerSet : undefined)
    if (roundMatches.length === 0) return

    const toInsert = roundMatches.map((rm, i) => ({
      tournament_id: tournamentId,
      phase_node_id: phaseNodeId,
      nom: `Round ${nextRound} Match ${i + 1} de ${config.name}`,
      statut: 'a_jouer',
      equipe1_id: null,
      equipe2_id: null,
      equipe1_label: `${rm.team1[0]} / ${rm.team1[1]}`,
      equipe2_label: `${rm.team2[0]} / ${rm.team2[1]}`,
      horaire: null,
      piste: null,
      ordre: (phaseMatches.length + 1) + i,
      round: nextRound,
      score_equipe1: null,
      score_equipe2: null,
      finished_at: null,
    }))

    set({ isGeneratingBatch: true })
    try {
      const { data } = await supabase.from('tt_matches').insert(toInsert).select()
      if (data) {
        set((state) => ({ matches: [...state.matches, ...(data as Match[])] }))
      }
    } finally {
      set({ isGeneratingBatch: false })
    }
  },

  clearSlotAssignments: async (tournamentId) => {
    await supabase
      .from('tt_matches')
      .update({ equipe1_id: null, equipe2_id: null })
      .eq('tournament_id', tournamentId)

    set((state) => ({
      matches: state.matches.map((m) =>
        m.tournament_id === tournamentId
          ? { ...m, equipe1_id: null, equipe2_id: null }
          : m,
      ),
    }))
  },

  reset: () => set({ matches: [], isGenerating: false, isLoading: false, isAssigning: false }),
}))
