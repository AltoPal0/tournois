import { useEffect, useMemo, useCallback, useState } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { TeamWithJoueurs, TournamentGraph, PhaseType } from '../types/tournament'
import PhaseSection from '../components/matches/PhaseSection'

export default function TournamentMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const isAssigning = useMatchStore((s) => s.isAssigning)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const assignRandomTeams = useMatchStore((s) => s.assignRandomTeams)
  const resetMatches = useMatchStore((s) => s.reset)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const resetTournament = useTournamentStore((s) => s.reset)
  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)
  const [teamsMap, setTeamsMap] = useState<Map<string, TeamWithJoueurs>>(new Map())

  useEffect(() => {
    if (id) {
      loadTournament(id)
      loadMatches(id)
    }
    return () => {
      resetMatches()
      resetTournament()
    }
  }, [id, loadTournament, loadMatches, resetMatches, resetTournament])

  // Charger les équipes avec noms de joueurs
  useEffect(() => {
    async function fetchTeams() {
      const { data } = await supabase
        .from('tt_teams')
        .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
      if (data) {
        const map = new Map<string, TeamWithJoueurs>()
        for (const t of data as unknown as TeamWithJoueurs[]) {
          map.set(t.id, t)
        }
        setTeamsMap(map)
      }
    }
    fetchTeams()
  }, [matches])

  const hasUnassignedMatches = useMemo(
    () => matches.some((m) => !m.equipe1_id && !m.equipe1_label),
    [matches],
  )

  const handleAssignRandom = useCallback(() => {
    if (!id) return
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
    assignRandomTeams(id, graph)
  }, [id, nodes, edges, assignRandomTeams])

  // Grouper les matchs par phase avec le type
  const matchesByPhase = useMemo(() => {
    const groups = new Map<string, { name: string; type: PhaseType; matches: typeof matches }>()
    for (const match of matches) {
      if (!groups.has(match.phase_node_id)) {
        const node = nodes.find((n) => n.id === match.phase_node_id)
        groups.set(match.phase_node_id, {
          name: node?.data.config.name ?? match.phase_node_id,
          type: node?.data.config.type ?? 'round_robin',
          matches: [],
        })
      }
      groups.get(match.phase_node_id)!.matches.push(match)
    }
    return Array.from(groups.values())
  }, [matches, nodes])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-4 shrink-0">
        <Link
          to={`/tournament/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-150
            flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Designer
        </Link>

        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-gray-900">{tournamentName}</span>
          <span className="text-xs text-gray-400 ml-2">— Matchs</span>
        </div>

        <div className="flex items-center gap-3">
          {hasUnassignedMatches && (
            <button
              onClick={handleAssignRandom}
              disabled={isAssigning}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg
                transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]"
            >
              {isAssigning ? (
                <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
                </svg>
              )}
              Assigner aléatoirement
            </button>
          )}
          <span className="text-xs text-gray-400">
            {matches.length} match{matches.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-sm">Aucun match généré</p>
            <Link to={`/tournament/${id}`} className="text-sm text-blue-600 hover:underline mt-2">
              Retour au designer
            </Link>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-10">
            {matchesByPhase.map(({ name, type, matches: phaseMatches }) => (
              <PhaseSection
                key={name}
                name={name}
                type={type}
                matches={phaseMatches}
                teamsMap={teamsMap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
