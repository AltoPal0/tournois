import { create } from 'zustand'
import type { Match, TournamentGraph } from '../types/tournament'
import { supabase } from '../lib/supabase'
import { generateAllMatches } from '../lib/matchGeneration'

interface MatchState {
  matches: Match[]
  isGenerating: boolean
  isLoading: boolean

  loadMatches: (tournamentId: string) => Promise<void>
  generateMatches: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  clearMatches: (tournamentId: string) => Promise<void>
  reset: () => void
}

export const useMatchStore = create<MatchState>((set) => ({
  matches: [],
  isGenerating: false,
  isLoading: false,

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

  clearMatches: async (tournamentId) => {
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)
    set({ matches: [] })
  },

  reset: () => set({ matches: [], isGenerating: false, isLoading: false }),
}))
