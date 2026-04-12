import { create } from 'zustand'
import type { Match, TournamentGraph } from '../types/tournament'
import { supabase } from '../lib/supabase'
import { generateAllMatches, computeInputSlotPairs } from '../lib/matchGeneration'
import { computeAdvancements } from '../lib/advancement'
import { useTournamentStore } from './tournamentStore'

interface MatchState {
  matches: Match[]
  isGenerating: boolean
  isLoading: boolean
  isAssigning: boolean

  loadMatches: (tournamentId: string) => Promise<void>
  generateMatches: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignRandomTeams: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignTeamToPhaseSlot: (tournamentId: string, phaseNodeId: string, slot: number, teamId: string | null) => Promise<void>
  assignPlayersToSlot: (tournamentId: string, phaseNodeId: string, slot: number, player1Id: string | null, player2Id: string | null) => Promise<string | null>
  updateMatchScore: (matchId: string, score1: number, score2: number) => Promise<void>
  clearMatchScore: (matchId: string) => Promise<void>
  updateMatchPiste: (matchId: string, piste: number | null) => Promise<void>
  updateMatchHoraire: (matchId: string, horaire: string | null) => Promise<void>
  activateTournament: (tournamentId: string) => Promise<void>
  resetScores: (tournamentId: string) => Promise<void>
  clearMatches: (tournamentId: string) => Promise<void>
  clearSlotAssignments: (tournamentId: string) => Promise<void>
  reset: () => void
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
  isLoading: false,
  isAssigning: false,

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

    // Supprimer les matchs existants
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)

    // Générer les nouveaux matchs
    const newMatches = generateAllMatches(graph, tournamentId)

    if (newMatches.length > 0) {
      const { data } = await supabase
        .from('tt_matches')
        .insert(newMatches)
        .select()

      set({ matches: data ?? [], isGenerating: false })
    } else {
      set({ matches: [], isGenerating: false })
    }
  },

  assignRandomTeams: async (tournamentId, graph) => {
    set({ isAssigning: true })

    // Identifier les phases racine (pas d'arêtes entrantes)
    const rootNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana',
    )

    // Calculer le nombre total d'équipes nécessaires
    const totalNeeded = rootNodes.reduce((sum, n) => sum + n.data.config.inputCount, 0)

    // Récupérer les équipes disponibles
    const { data: teams } = await supabase
      .from('tt_teams')
      .select('id')
      .limit(totalNeeded)

    if (!teams || teams.length < totalNeeded) {
      set({ isAssigning: false })
      return
    }

    const shuffled = shuffle(teams)
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

      const slotPairs = computeInputSlotPairs(type, inputCount)
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

  updateMatchScore: async (matchId, score1, score2) => {
    await supabase
      .from('tt_matches')
      .update({
        score_equipe1: score1,
        score_equipe2: score2,
        statut: 'termine' as const,
      })
      .eq('id', matchId)

    // Mise à jour optimiste locale
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: score1, score_equipe2: score2, statut: 'termine' as const }
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

    const advancements = computeAdvancements(matchId, get().matches, graph)

    if (advancements.length > 0) {
      for (const adv of advancements) {
        await supabase
          .from('tt_matches')
          .update({ [adv.field]: adv.teamId })
          .eq('id', adv.matchId)
      }

      // Mise à jour optimiste locale des avancements
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
  },

  clearMatchScore: async (matchId) => {
    await supabase
      .from('tt_matches')
      .update({ score_equipe1: null, score_equipe2: null, statut: 'a_jouer' })
      .eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: null, score_equipe2: null, statut: 'a_jouer' as const }
          : m,
      ),
    }))
  },

  assignTeamToPhaseSlot: async (tournamentId, phaseNodeId, slot, teamId) => {
    const { nodes } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || node.data.config.type === 'super_americana') return

    const { type, inputCount } = node.data.config
    const pairs = computeInputSlotPairs(type, inputCount)
    const { matches } = get()
    const phaseMatches = matches.filter((m) => m.phase_node_id === phaseNodeId)

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

    void tournamentId // unused but kept for API clarity
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

  activateTournament: async (tournamentId) => {
    await supabase.from('tt_tournaments').update({ status: 'active' }).eq('id', tournamentId)
    useTournamentStore.getState().setTournamentStatus('active')
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
