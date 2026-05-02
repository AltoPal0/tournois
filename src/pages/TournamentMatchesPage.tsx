import { useEffect, useMemo, useCallback, useState } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { TeamWithJoueurs, TournamentGraph, PhaseType } from '../types/tournament'
import PhaseSection from '../components/matches/PhaseSection'
import PhaseNav from '../components/matches/PhaseNav'
import PlayerAssignmentOverlay from '../components/matches/PlayerAssignmentOverlay'
import PlayerSelectSheet from '../components/matches/PlayerSelectSheet'
import NextMatchBanner from '../components/matches/NextMatchBanner'
import { topologicalSort } from '../lib/matchGeneration'
import { usePlayerIdentity } from '../hooks/usePlayerIdentity'

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
  const [isPlayerSheetOpen, setIsPlayerSheetOpen] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [showAllMatches, setShowAllMatches] = useState(false)

  const { identity, setIdentity, clearIdentity, findMyTeam } = usePlayerIdentity(id ?? '')

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

  // Rafraîchir matchs + équipes après assignation
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

  // Reset filtre quand l'identité ou la phase change
  useEffect(() => {
    setShowAllMatches(false)
  }, [identity?.joueurId, activePhaseId])

  // Phases racines (pour calcul assignation)
  const rootNodeIds = useMemo(
    () => new Set(nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id)),
    [nodes, edges],
  )

  function requiredMatchesForType(phaseType: PhaseType, phaseMatches: typeof matches) {
    if (phaseType === 'round_robin') return phaseMatches
    return phaseMatches.filter((m) => m.round === 1)
  }

  const allPlayersAssigned = useMemo(() => {
    const rootNodes = nodes.filter((n) => rootNodeIds.has(n.id) && n.data.config.type !== 'super_americana')
    if (rootNodes.length === 0) return false
    return rootNodes.every((node) => {
      const phaseMatches = matches.filter((m) => m.phase_node_id === node.id)
      const required = requiredMatchesForType(node.data.config.type, phaseMatches)
      return required.length > 0 && required.every((m) => m.equipe1_id && m.equipe2_id)
    })
  }, [matches, nodes, rootNodeIds])

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

  // Identité joueur
  const myTeam = findMyTeam(Array.from(teamsMap.values()))
  const myTeamId = myTeam?.id ?? null

  // Matchs filtrés pour affichage (null = afficher tout)
  const displayMatches = myTeamId && !showAllMatches
    ? activePhaseMatches.filter((m) => m.equipe1_id === myTeamId || m.equipe2_id === myTeamId)
    : undefined

  // Prochain match du joueur (toutes phases confondues)
  const nextMatch = useMemo(() => {
    if (!myTeamId) return null
    return matches
      .filter(
        (m) =>
          m.statut === 'a_jouer' &&
          (m.equipe1_id === myTeamId || m.equipe2_id === myTeamId),
      )
      .sort((a, b) => {
        if (a.horaire && b.horaire) return a.horaire.localeCompare(b.horaire)
        return a.ordre - b.ordre
      })[0] ?? null
  }, [myTeamId, matches])

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* Top bar navy */}
      <div className="h-14 bg-navy-900 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0">
        <Link
          to="/"
          className="text-white/70 hover:text-white transition-colors duration-150
            flex items-center gap-1 shrink-0 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline text-sm font-medium">Accueil</span>
        </Link>

        <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white truncate">{tournamentName}</span>
          {isActive && (
            <span className="shrink-0 text-xs font-bold text-padel-gold bg-padel-gold/15 border border-padel-gold/25 px-2 py-0.5 rounded-full">
              En cours
            </span>
          )}
        </div>

        {/* Boutons brouillon */}
        {isDraft && matches.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsPlayerOverlayOpen(true)}
              className="relative inline-flex items-center justify-center gap-1.5
                h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold
                transition-all duration-200 active:scale-[0.98]
                bg-white/10 border border-white/10 text-white hover:bg-white/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/70" viewBox="0 0 20 20" fill="currentColor">
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
                  h-9 px-2.5 sm:px-3 rounded-xl text-xs font-bold
                  transition-all duration-200 active:scale-[0.98] disabled:opacity-50
                  bg-padel-gold text-navy-900 hover:bg-padel-gold-dark shadow-sm"
              >
                {isActivating ? (
                  <div className="h-3.5 w-3.5 border-2 border-navy-900/30 border-t-navy-900 rounded-full animate-spin" />
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
        <div className="shrink-0">
          <PhaseNav
            phases={sortedPhases}
            activePhaseId={activePhaseId}
            onSelect={setActivePhaseId}
            playerIdentity={identity}
            onUserClick={() => setIsPlayerSheetOpen(true)}
          />
        </div>
      )}

      {/* Bannière prochain match */}
      {nextMatch && (
        <NextMatchBanner match={nextMatch} teamsMap={teamsMap} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || (matches.length === 0 && !tournamentId) ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-6 w-6 border-2 border-white/10 border-t-padel-blue rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          /* État vide */
          <div className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
            {nodes.length === 0 ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-navy-900/5 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-navy-700/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-navy-900 font-semibold mb-1">Tournoi non configuré</p>
                <p className="text-gray-400 text-sm mb-6">
                  Définissez les phases du tournoi avant de générer les matchs.
                </p>
                <Link
                  to={`/tournament/${id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                    bg-navy-900 text-white hover:bg-navy-800 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Configurer le tournoi
                </Link>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-padel-blue/10 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-padel-blue" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-navy-900 font-semibold mb-1">Prêt à générer les matchs</p>
                <p className="text-gray-400 text-sm mb-2">
                  {nodes.length} phase{nodes.length > 1 ? 's' : ''} configurée{nodes.length > 1 ? 's' : ''}
                </p>
                <p className="text-gray-400 text-xs mb-6 max-w-xs">
                  Une fois générés, assignez les équipes puis activez le tournoi pour saisir les scores.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                    bg-padel-blue text-white hover:bg-padel-blue-light transition-all duration-200
                    active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-padel-blue/25"
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
            {/* Toggle filtre */}
            {myTeamId && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => setShowAllMatches((v) => !v)}
                  className="text-xs font-semibold text-padel-blue/70 hover:text-padel-blue transition-colors"
                >
                  {showAllMatches ? '← Mes matchs' : 'Voir tous les matchs'}
                </button>
              </div>
            )}
            <PhaseSection
              name={activePhase.name}
              type={activePhase.type}
              matches={activePhaseMatches}
              displayMatches={displayMatches}
              teamsMap={teamsMap}
              isActive={isActive}
              sameDay={tournamentConfig.sameDay}
              myTeamId={myTeamId}
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

      {/* Sheet identification joueur */}
      <PlayerSelectSheet
        isOpen={isPlayerSheetOpen}
        onClose={() => setIsPlayerSheetOpen(false)}
        currentIdentity={identity}
        teamsMap={teamsMap}
        onSelect={setIdentity}
        onClear={clearIdentity}
      />
    </div>
  )
}
