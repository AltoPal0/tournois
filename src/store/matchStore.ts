import { create } from 'zustand'
import type { Match, TournamentGraph } from '../types/tournament'
import { supabase } from '../lib/supabase'
import { generateAllMatches, computeInputSlotPairs } from '../lib/matchGeneration'

interface MatchState {
  matches: Match[]
  isGenerating: boolean
  isLoading: boolean
  isAssigning: boolean

  loadMatches: (tournamentId: string) => Promise<void>
  generateMatches: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignRandomTeams: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  updateMatchScore: (matchId: string, score1: number, score2: number) => Promise<void>
  clearMatches: (tournamentId: string) => Promise<void>
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

    // Pour chaque phase racine, assigner les équipes
    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      if (type === 'super_americana') continue

      // Prendre inputCount équipes
      const phaseTeams = shuffled.slice(teamIndex, teamIndex + inputCount)
      teamIndex += inputCount

      // Mapping slot → team id
      const slotToTeam = new Map<number, string>()
      phaseTeams.forEach((t, i) => slotToTeam.set(i + 1, t.id))

      // Récupérer les paires de slots pour cette phase
      const slotPairs = computeInputSlotPairs(type, inputCount)

      // Matchs de cette phase triés par ordre
      const phaseMatches = matches
        .filter((m) => m.phase_node_id === node.id)
        .sort((a, b) => a.ordre - b.ordre)

      // Mettre à jour les matchs qui ont des slots directs
      for (const pair of slotPairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue

        await supabase
          .from('tt_matches')
          .update({
            equipe1_id: slotToTeam.get(pair.slot1) ?? null,
            equipe2_id: slotToTeam.get(pair.slot2) ?? null,
          })
          .eq('id', match.id)
      }
    }

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
  },

  clearMatches: async (tournamentId) => {
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)
    set({ matches: [] })
  },

  reset: () => set({ matches: [], isGenerating: false, isLoading: false, isAssigning: false }),
}))
