import { useEffect, useMemo, useCallback, useState } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { TeamWithJoueurs, TournamentGraph, PhaseType } from '../types/tournament'
import PhaseSection from '../components/matches/PhaseSection'
import PhaseNav from '../components/matches/PhaseNav'
import PlayerAssignmentOverlay from '../components/matches/PlayerAssignmentOverlay'
import { topologicalSort } from '../lib/matchGeneration'

export default function TournamentMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const isGenerating = useMatchStore((s) => s.isGenerating)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const subscribeToMatches = useMatchStore((s) => s.subscribeToMatches)
  const generateMatches = useMatchStore((s) => s.generateMatches)
  const activateTournament = useMatchStore((s) => s.activateTournament)
  const resetMatches = useMatchStore((s) => s.reset)

  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const tournamentStatus = useTournamentStore((s) => s.tournamentStatus)
  const tournamentId = useTournamentStore((s) => s.tournamentId)
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const resetTournament = useTournamentStore((s) => s.reset)
  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)

  const [teamsMap, setTeamsMap] = useState<Map<string, TeamWithJoueurs>>(new Map())
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)
  const [isPlayerOverlayOpen, setIsPlayerOverlayOpen] = useState(false)
  const [isActivating, setIsActivating] = useState(false)

  useEffect(() => {
    if (!id) return
    loadTournament(id)
    loadMatches(id)
    const unsubscribe = subscribeToMatches(id)
    return () => {
      unsubscribe()
      resetMatches()
      resetTournament()
    }
  }, [id, loadTournament, loadMatches, subscribeToMatches, resetMatches, resetTournament])

  // Charger toutes les équipes avec noms de joueurs
  const fetchTeams = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // Rafraîchir matchs + équipes après assignation (overlay fermé ou modifié)
  const handleAssignmentChanged = useCallback(async () => {
    if (id) await loadMatches(id)
    await fetchTeams()
  }, [id, loadMatches, fetchTeams])

  // Graphe sérialisé pour PlayerAssignmentOverlay et topologicalSort
  const graph: TournamentGraph = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }),
    [nodes, edges],
  )

  // Phases triées topologiquement, filtrées à celles qui ont des matchs
  const sortedPhases = useMemo(() => {
    if (nodes.length === 0 || matches.length === 0) return []
    const phaseIdsWithMatches = new Set(matches.map((m) => m.phase_node_id))
    return topologicalSort(graph)
      .filter((n) => phaseIdsWithMatches.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.data.config.name,
        type: n.data.config.type as PhaseType,
      }))
  }, [nodes, graph, matches])

  // Init phase active sur la première phase dès que les données sont prêtes
  useEffect(() => {
    if (sortedPhases.length > 0 && !activePhaseId) {
      setActivePhaseId(sortedPhases[0].id)
    }
  }, [sortedPhases, activePhaseId])

  // Phases racines (pour calcul assignation)
  const rootNodeIds = useMemo(
    () => new Set(nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id)),
    [nodes, edges],
  )

  // Par type de phase, seuls certains matchs requièrent une assignation manuelle :
  // - round_robin : tous les matchs (slots directs sur chaque tour)
  // - elimination  : round 1 uniquement (les rounds suivants sont remplis par avancement)
  // - tournante_libre : round 1 uniquement (les rounds suivants sont calculés en suisse)
  function requiredMatchesForType(phaseType: PhaseType, phaseMatches: typeof matches) {
    if (phaseType === 'round_robin') return phaseMatches
    return phaseMatches.filter((m) => m.round === 1)
  }

  // Tous les matchs "requis" des phases racines ont-ils leurs deux équipes ?
  const allPlayersAssigned = useMemo(() => {
    const rootNodes = nodes.filter((n) => rootNodeIds.has(n.id) && n.data.config.type !== 'super_americana')
    if (rootNodes.length === 0) return false
    return rootNodes.every((node) => {
      const phaseMatches = matches.filter((m) => m.phase_node_id === node.id)
      const required = requiredMatchesForType(node.data.config.type, phaseMatches)
      return required.length > 0 && required.every((m) => m.equipe1_id && m.equipe2_id)
    })
  }, [matches, nodes, rootNodeIds])

  // Compte des équipes non assignées (slots requis des phases racines)
  const unassignedCount = useMemo(() => {
    const rootNodes = nodes.filter((n) => rootNodeIds.has(n.id) && n.data.config.type !== 'super_americana')
    let total = 0
    let assigned = 0
    for (const node of rootNodes) {
      const phaseMatches = matches.filter((m) => m.phase_node_id === node.id)
      const required = requiredMatchesForType(node.data.config.type, phaseMatches)
      total += required.length * 2
      assigned += required.filter((m) => m.equipe1_id).length + required.filter((m) => m.equipe2_id).length
    }
    return Math.max(0, total - assigned)
  }, [matches, nodes, rootNodeIds])

  const handleActivate = useCallback(async () => {
    if (!id) return
    setIsActivating(true)
    await activateTournament(id)
    setIsActivating(false)
  }, [id, activateTournament])

  const handleGenerate = useCallback(async () => {
    if (!id) return
    await generateMatches(id, graph)
  }, [id, graph, generateMatches])

  const activePhase = sortedPhases.find((p) => p.id === activePhaseId) ?? null
  const activePhaseMatches = activePhaseId ? matches.filter((m) => m.phase_node_id === activePhaseId) : []
  const isDraft = tournamentStatus === 'draft'
  const isActive = tournamentStatus === 'active'

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* Top bar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0">
        <Link
          to="/"
          className="text-gray-500 hover:text-gray-700 transition-colors duration-150
            flex items-center gap-1 shrink-0 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline text-sm">Accueil</span>
        </Link>

        <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-900 truncate">{tournamentName}</span>
          {isActive && (
            <span className="shrink-0 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              En cours
            </span>
          )}
        </div>

        {/* Boutons brouillon (gestion joueurs + activer) */}
        {isDraft && matches.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsPlayerOverlayOpen(true)}
              className="relative inline-flex items-center justify-center gap-1.5
                h-9 px-2.5 sm:px-3 rounded-xl text-xs font-medium
                transition-all duration-200 active:scale-[0.98]
                bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              <span className="hidden sm:inline">Joueurs</span>
              {unassignedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[1rem] px-1
                  bg-red-500 text-white text-[10px] font-bold rounded-full
                  flex items-center justify-center leading-none">
                  {unassignedCount}
                </span>
              )}
            </button>

            {allPlayersAssigned && (
              <button
                onClick={handleActivate}
                disabled={isActivating}
                className="inline-flex items-center justify-center gap-1.5
                  h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold
                  transition-all duration-200 active:scale-[0.98] disabled:opacity-50
                  bg-amber-400 text-amber-900 hover:bg-amber-300 shadow-sm"
              >
                {isActivating ? (
                  <div className="h-3.5 w-3.5 border-2 border-amber-900/30 border-t-amber-900 rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="hidden sm:inline">Activer</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phase nav */}
      {sortedPhases.length > 0 && (
        <div className="shrink-0 bg-white border-b border-gray-200 py-1">
          <PhaseNav
            phases={sortedPhases}
            activePhaseId={activePhaseId}
            onSelect={setActivePhaseId}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || (matches.length === 0 && !tournamentId) ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-6 w-6 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          /* État vide — tournoi configuré mais matchs pas encore générés */
          <div className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
            {nodes.length === 0 ? (
              /* Pas de phases configurées */
              <>
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-700 font-medium mb-1">Tournoi non configuré</p>
                <p className="text-gray-400 text-sm mb-6">
                  Définissez les phases du tournoi avant de générer les matchs.
                </p>
                <Link
                  to={`/tournament/${id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                    bg-gray-900 text-white hover:bg-gray-800 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Configurer le tournoi
                </Link>
              </>
            ) : (
              /* Phases configurées, matchs pas encore générés */
              <>
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-gray-700 font-medium mb-1">Prêt à générer les matchs</p>
                <p className="text-gray-400 text-sm mb-2">
                  {nodes.length} phase{nodes.length > 1 ? 's' : ''} configurée{nodes.length > 1 ? 's' : ''}
                </p>
                <p className="text-gray-400 text-xs mb-6 max-w-xs">
                  Une fois générés, assignez les équipes puis activez le tournoi pour saisir les scores.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                    bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200
                    active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                  {isGenerating ? (
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                  {isGenerating ? 'Génération…' : 'Générer les matchs'}
                </button>
                <Link
                  to={`/tournament/${id}`}
                  className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors duration-150"
                >
                  Modifier la configuration →
                </Link>
              </>
            )}
          </div>
        ) : activePhase ? (
          <div className="px-3 sm:px-6 py-4 sm:py-6">
            <PhaseSection
              name={activePhase.name}
              type={activePhase.type}
              matches={activePhaseMatches}
              teamsMap={teamsMap}
              isActive={isActive}
              sameDay={tournamentConfig.sameDay}
            />
          </div>
        ) : null}
      </div>

      {/* Overlay full-screen assignation joueurs */}
      <PlayerAssignmentOverlay
        isOpen={isPlayerOverlayOpen}
        onClose={() => setIsPlayerOverlayOpen(false)}
        tournamentId={id ?? ''}
        graph={graph}
        matches={matches}
        teamsMap={teamsMap}
        onAssignmentChanged={handleAssignmentChanged}
      />
    </div>
  )
}
