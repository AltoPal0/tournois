import { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { TeamWithJoueurs, TournamentGraph, PhaseType, PlayerTemplate, FontScale } from '../types/tournament'
import PhaseSection from '../components/matches/PhaseSection'
import PlayerSelectSheet from '../components/matches/PlayerSelectSheet'
import NextMatchBanner from '../components/matches/NextMatchBanner'
import OnboardingOverlay from '../components/matches/OnboardingOverlay'
import AmericanaSingleRosterOverlay from '../components/matches/AmericanaSingleRosterOverlay'
import { topologicalSort } from '../lib/matchGeneration'
import { usePlayerIdentity } from '../hooks/usePlayerIdentity'
import { usePullToRefresh, PULL_THRESHOLD } from '../hooks/usePullToRefresh'
import { getTheme } from '../lib/templateTheme'

export default function TournamentMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const isGenerating = useMatchStore((s) => s.isGenerating)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const subscribeToMatches = useMatchStore((s) => s.subscribeToMatches)
  const generateMatches = useMatchStore((s) => s.generateMatches)
  const generateAmericanaSingleBatch = useMatchStore((s) => s.generateAmericanaSingleBatch)
  const terminateAmericanaSinglePhase = useMatchStore((s) => s.terminateAmericanaSinglePhase)
  const generateWeightedAmericanoNextRound = useMatchStore((s) => s.generateWeightedAmericanoNextRound)
  const isGeneratingBatch = useMatchStore((s) => s.isGeneratingBatch)
  const updateAmericanaSingleRoster = useMatchStore((s) => s.updateAmericanaSingleRoster)
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
  const [playersMap, setPlayersMap] = useState<Map<string, string>>(new Map())
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)
  const [isPlayerSheetOpen, setIsPlayerSheetOpen] = useState(false)
  const [isBurgerOpen, setIsBurgerOpen] = useState(false)
  const [fontScale, setFontScale] = useState<FontScale>(
    () => (localStorage.getItem('padel_font_scale') as FontScale) ?? 'normal'
  )
  // true = tous les matchs (défaut), false = seulement les matchs du joueur
  const [showAllMatches, setShowAllMatches] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(() =>
    id ? !localStorage.getItem(`padel_onboarded_${id}`) : false
  )
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const [extraPlayers, setExtraPlayers] = useState<{ id: string; prenom: string }[]>([])
  const [isRosterOpen, setIsRosterOpen] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false)
  const onboardingCheckDone = useRef(false)

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

  const fetchTeams = useCallback(async () => {
    if (!id) return
    // Récupérer uniquement les équipes assignées aux matchs de ce tournoi
    const { data: matchData } = await supabase
      .from('tt_matches')
      .select('equipe1_id, equipe2_id')
      .eq('tournament_id', id)
    const teamIds = new Set<string>()
    for (const m of (matchData ?? [])) {
      if (m.equipe1_id) teamIds.add(m.equipe1_id)
      if (m.equipe2_id) teamIds.add(m.equipe2_id)
    }
    if (teamIds.size === 0) {
      setTeamsLoaded(true)
      return
    }
    const { data } = await supabase
      .from('tt_teams')
      .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
      .in('id', [...teamIds])
    if (data) {
      const map = new Map<string, TeamWithJoueurs>()
      for (const t of data as unknown as TeamWithJoueurs[]) {
        map.set(t.id, t)
      }
      setTeamsMap(map)
      // Construire playersMap depuis les équipes (utile pour americana_single)
      const pm = new Map<string, string>()
      for (const t of data as unknown as TeamWithJoueurs[]) {
        pm.set(t.joueur1.id, t.joueur1.prenom)
        pm.set(t.joueur2.id, t.joueur2.prenom)
      }
      setPlayersMap(pm)
    }
    setTeamsLoaded(true)
  }, [id])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // Résoudre les joueurs des phases americana_single pour l'onboarding
  useEffect(() => {
    if (nodes.length === 0) return
    const names = nodes
      .filter((n) => (n.data.config.type === 'americana_single' || n.data.config.type === 'americana_weighted') && n.data.config.playerNames)
      .flatMap((n) =>
        (n.data.config.playerNames ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
      )
    if (names.length === 0) return
    supabase
      .from('tt_joueurs')
      .select('id, prenom')
      .in('prenom', names)
      .then(({ data }) => {
        if (data) setExtraPlayers(data as { id: string; prenom: string }[])
      })
  }, [nodes])

  // Fusionner extraPlayers dans playersMap pour les standings americana_single
  useEffect(() => {
    if (extraPlayers.length === 0) return
    setPlayersMap((prev) => {
      const updated = new Map(prev)
      for (const p of extraPlayers) updated.set(p.id, p.prenom)
      return updated
    })
  }, [extraPlayers])

  // Rafraîchir teamsMap quand de nouveaux matchs avec des équipes inconnues arrivent
  useEffect(() => {
    if (matches.length === 0) return
    const ids = matches.flatMap((m) => [m.equipe1_id, m.equipe2_id]).filter(Boolean) as string[]
    const hasUnknown = ids.some((id) => !teamsMap.has(id))
    if (hasUnknown) fetchTeams()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches])

  // Si les matchs existent mais aucune équipe n'est assignée → tournoi redémarré → réafficher l'onboarding
  useEffect(() => {
    if (onboardingCheckDone.current) return
    if (isLoading || !teamsLoaded || !id) return
    onboardingCheckDone.current = true
    if (matches.length > 0 && teamsMap.size === 0) {
      localStorage.removeItem(`padel_onboarded_${id}`)
      setShowOnboarding(true)
    }
  }, [isLoading, teamsLoaded, matches.length, teamsMap.size, id])

  // Rafraîchissement manuel (pull-to-refresh)
  const handleRefresh = useCallback(async () => {
    if (!id) return
    await Promise.all([loadMatches(id), fetchTeams()])
  }, [id, loadMatches, fetchTeams])

  const { pullDistance, isRefreshing, touchHandlers } = usePullToRefresh(handleRefresh)

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

  const INVISIBLE_PHASE_TYPES: PhaseType[] = ['best_of', 'team_builder', 'team_splitter', 'super_americana']

  const sortedPhases = useMemo(() => {
    if (nodes.length === 0) return []
    return topologicalSort(graph)
      .map((n) => ({
        id: n.id,
        name: n.data.config.name,
        type: n.data.config.type as PhaseType,
      }))
      .filter((p) => !INVISIBLE_PHASE_TYPES.includes(p.type))
  }, [nodes, graph])

  useEffect(() => {
    if (sortedPhases.length > 0 && !activePhaseId) {
      setActivePhaseId(sortedPhases[0].id)
    }
  }, [sortedPhases, activePhaseId])

  // Réinitialiser vers "tous les matchs" quand le joueur change d'identité
  useEffect(() => {
    setShowAllMatches(true)
  }, [identity?.joueurId])

  const handleGenerate = useCallback(async () => {
    if (!id) return
    await generateMatches(id, graph)
  }, [id, graph, generateMatches])

  const activePhase = sortedPhases.find((p) => p.id === activePhaseId) ?? null
  const activePhaseMatches = activePhaseId ? matches.filter((m) => m.phase_node_id === activePhaseId) : []
  const isActive = tournamentStatus === 'active'

  // Identité joueur
  const myTeam = findMyTeam(Array.from(teamsMap.values()))
  const myTeamId = myTeam?.id ?? null
  const myPlayerName = identity?.prenom ?? null

  function labelMatchesPlayer(label: string | null): boolean {
    if (!label || !myPlayerName) return false
    return label.split('/').some((n) => n.trim() === myPlayerName)
  }

  // La phase active contient-elle des matchs du joueur ?
  const phaseHasMyMatches = myTeamId
    ? activePhaseMatches.some((m) => m.equipe1_id === myTeamId || m.equipe2_id === myTeamId)
    : myPlayerName
    ? activePhaseMatches.some((m) => labelMatchesPlayer(m.equipe1_label) || labelMatchesPlayer(m.equipe2_label))
    : false

  // Filtre : seulement si la phase a des matchs du joueur ET showAllMatches est false
  const displayMatches = phaseHasMyMatches && !showAllMatches
    ? myTeamId
      ? activePhaseMatches.filter((m) => m.equipe1_id === myTeamId || m.equipe2_id === myTeamId)
      : activePhaseMatches.filter((m) => labelMatchesPlayer(m.equipe1_label) || labelMatchesPlayer(m.equipe2_label))
    : undefined

  // Prochain match du joueur (toutes phases)
  const nextMatch = useMemo(() => {
    if (!myTeamId && !myPlayerName) return null
    return (
      matches
        .filter((m) =>
          m.statut === 'a_jouer' && (
            myTeamId
              ? m.equipe1_id === myTeamId || m.equipe2_id === myTeamId
              : labelMatchesPlayer(m.equipe1_label) || labelMatchesPlayer(m.equipe2_label)
          )
        )
        .sort((a, b) => {
          if (a.horaire && b.horaire) return a.horaire.localeCompare(b.horaire)
          return a.ordre - b.ordre
        })[0] ?? null
    )
  }, [myTeamId, matches])

  const template: PlayerTemplate = tournamentConfig.playerTemplate ?? 'default'
  const theme = getTheme(template)

  const initials = identity ? identity.prenom.slice(0, 2).toUpperCase() : null

  const activePhaseIndicator = useMemo(() => {
    if (!activePhase?.name) return null
    const name = activePhase.name
    if (/finale?/i.test(name)) return 'F'
    const digit = name.match(/(\d)/)
    if (digit) return digit[1]
    const letter = name.match(/\b([A-Z])\b/)
    if (letter) return letter[1]
    return null
  }, [activePhase?.name])

  const pageBg =
    template === 'slick-dark' ? 'bg-gradient-to-bl from-[#01344C] to-[#0B5A78]' :
    template === 'palm-springs' ? 'bg-[#FAF7F2]' :
    template === 'green-turf' ? 'bg-[#FFF1E8]' :
    'bg-gray-50'

  const headerBg =
    template === 'slick-dark' ? 'bg-[#062E38]' :
    template === 'palm-springs' ? 'bg-[#7A3B28]' :
    template === 'green-turf' ? 'bg-[#B23A54]' :
    'bg-navy-900'

  // Indicateur pull-to-refresh
  const showPullIndicator = pullDistance > 0 || isRefreshing
  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1)

  // Tailles typographiques de la top bar selon fontScale
  const hdrTitle  = fontScale === 'xxl' ? 'text-lg'   : fontScale === 'xl' ? 'text-base' : 'text-sm'
  const hdrBadge  = fontScale === 'xxl' ? 'text-sm'   : 'text-xs'
  const hdrIcon   = fontScale === 'xxl' ? 'h-5 w-5'   : 'h-4 w-4'
  const hdrAvatar = fontScale === 'xxl' ? 'h-10 w-10' : fontScale === 'xl' ? 'h-9 w-9' : 'h-8 w-8'
  const hdrInitials = fontScale === 'xxl' ? 'text-sm' : 'text-xs'
  const hdrIndicator = fontScale === 'xxl' ? 'text-sm' : fontScale === 'xl' ? 'text-[12px]' : 'text-[11px]'
  const hdrH = fontScale === 'xxl' ? 'h-16' : 'h-14'

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${pageBg}`}>

      {/* Top bar — safe area en haut pour téléphones avec notch/dynamic island */}
      <div
        className={`${headerBg} shrink-0`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
      <div className={`${hdrH} flex items-center px-3 sm:px-4 gap-2`}>

        {/* Avatar joueur */}
        <button
          onClick={() => setIsPlayerSheetOpen(true)}
          className="shrink-0 transition-transform duration-150 active:scale-90"
          aria-label="Mon profil"
        >
          {initials ? (
            <div className={`${hdrAvatar} flex items-center justify-center
              ${template === 'slick-dark'
                ? 'bg-[#D4E800]'
                : template === 'palm-springs' || template === 'green-turf'
                ? 'bg-white/20'
                : 'bg-padel-gold'}`}
              style={template === 'slick-dark' ? { clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' } : { borderRadius: '50%' }}
            >
              <span className={`${hdrInitials} font-black leading-none
                ${template === 'slick-dark' ? 'text-[#062E38]' : 'text-navy-900'}`}>
                {initials}
              </span>
            </div>
          ) : (
            <div className={`${hdrAvatar} rounded-full flex items-center justify-center bg-white/10`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`${hdrIcon} text-white/50`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </button>

        {/* Titre centré */}
        <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
          <span className={`truncate
            ${template === 'slick-dark'
              ? `${hdrTitle} font-black uppercase tracking-[0.15em] text-white`
              : template === 'palm-springs'
              ? `${hdrTitle} font-bold text-[#E8C9A0]`
              : template === 'green-turf'
              ? `${hdrTitle} font-bold text-[#FFF1E8]`
              : `${hdrTitle} font-bold text-white`}`}>
            {activePhase?.name ?? tournamentName}
          </span>
          {isActive && (
            <span className={`shrink-0 ${hdrBadge} font-bold px-2 py-0.5
              ${template === 'slick-dark'
                ? 'text-[#062E38] bg-[#D4E800] font-black [clip-path:polygon(5px_0%,100%_0%,calc(100%-5px)_100%,0%_100%)]'
                : template === 'palm-springs'
                ? 'rounded-full text-[#E8A87C] bg-white/10 border border-white/20'
                : template === 'green-turf'
                ? 'rounded-full text-[#FFF1E8] bg-white/15 border border-white/20'
                : 'rounded-full text-padel-gold bg-padel-gold/15 border border-padel-gold/25'}`}>
              En cours
            </span>
          )}
        </div>

        {/* Icônes droite */}
        <div className="flex items-center gap-1">
          {/* Bouton Terminer l'americana — dans le header pour visibilité mobile */}
          {activePhase?.type === 'americana_single' &&
            !(nodes.find((n) => n.id === activePhase.id)?.data.config.completed) &&
            !(nodes.find((n) => n.id === activePhase.id)?.data.config.fixedRounds) && (
            <button
              onClick={() => setShowTerminateConfirm(true)}
              disabled={isTerminating}
              className="shrink-0 h-8 px-2.5 flex items-center gap-1 rounded-lg text-xs font-semibold
                text-amber-300 border border-amber-400/40 bg-amber-400/10
                hover:bg-amber-400/20 active:scale-90 transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Terminer l'americana"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`${hdrIcon} shrink-0`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Terminer</span>
            </button>
          )}

          {/* Engrenage roster americana_single */}
          {isActive && activePhase?.type === 'americana_single' &&
            nodes.find((n) => n.id === activePhase.id)?.data.config.livePlayerManagement && (
            <button
              onClick={() => setIsRosterOpen(true)}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg
                transition-all duration-150 active:scale-90 bg-white/10 hover:bg-white/20"
              aria-label="Gestion des joueurs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`${hdrIcon} text-white`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Burger menu — navigation entre phases */}
          {sortedPhases.length > 1 && (
            <button
              onClick={() => setIsBurgerOpen(true)}
              className="shrink-0 h-8 flex items-center gap-1 px-2 rounded-lg
                transition-all duration-150 active:scale-90 bg-white/10 hover:bg-white/20"
              aria-label="Navigation phases"
            >
              {activePhaseIndicator && (
                <span className={`text-yellow-400 ${hdrIndicator} font-black leading-none`}>
                  {activePhaseIndicator}
                </span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" className={`${hdrIcon} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Bannière prochain match — tap pour naviguer vers la bonne phase */}
      {nextMatch && (
        <NextMatchBanner
          match={nextMatch}
          teamsMap={teamsMap}
          template={template}
          fontScale={fontScale}
          onClick={() => setActivePhaseId(nextMatch.phase_node_id)}
        />
      )}

      {/* Content scrollable avec pull-to-refresh */}
      <div
        className="flex-1 overflow-y-auto relative"
        {...touchHandlers}
      >
        {/* Indicateur pull-to-refresh */}
        {showPullIndicator && (
          <div
            className="absolute top-0 left-0 right-0 flex justify-center z-10 pointer-events-none"
            style={{ paddingTop: `${Math.max(8, pullDistance * 0.8)}px` }}
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center shadow-lg"
              style={{
                background: theme.bg,
                opacity: isRefreshing ? 1 : pullProgress,
                transform: `scale(${isRefreshing ? 1 : 0.6 + pullProgress * 0.4})`,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                style={{ color: theme.accent, ...(isRefreshing ? {} : { transform: `rotate(${pullDistance * 4}deg)` }) }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
        )}

        {isLoading || (matches.length === 0 && !tournamentId) ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-6 w-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: theme.accent }} />
          </div>
        ) : matches.length === 0 ? (
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
            <PhaseSection
              name={activePhase.name}
              type={activePhase.type}
              matches={activePhaseMatches}
              displayMatches={displayMatches}
              teamsMap={teamsMap}
              playersMap={playersMap}
              isActive={isActive}
              sameDay={tournamentConfig.sameDay}
              scoreBasedSchedule={tournamentConfig.matchType === 'score_based'}
              myTeamId={myTeamId}
              myPlayerName={myPlayerName}
              template={template}
              fontScale={fontScale}
              showAllMatches={showAllMatches}
              onToggleFilter={() => setShowAllMatches((v) => !v)}
              onGenerateBatch={
                activePhase.type === 'americana_single' &&
                !(nodes.find((n) => n.id === activePhase.id)?.data.config.fixedRounds)
                  ? () => generateAmericanaSingleBatch(activePhase.id)
                  : undefined
              }
              isGeneratingBatch={activePhase.type === 'americana_single' ? isGeneratingBatch : false}
              batchSize={
                activePhase.type === 'americana_single'
                  ? (nodes.find((n) => n.id === activePhase.id)?.data.config.batchSize ?? 3)
                  : undefined
              }
              phaseCompleted={
                activePhase.type === 'americana_single' &&
                !(nodes.find((n) => n.id === activePhase.id)?.data.config.fixedRounds)
                  ? (nodes.find((n) => n.id === activePhase.id)?.data.config.completed ?? false)
                  : undefined
              }
              playerNames={
                (activePhase.type === 'americana_single' || activePhase.type === 'americana_weighted')
                  ? (nodes.find((n) => n.id === activePhase.id)?.data.config.playerNames ?? '')
                  : undefined
              }
              liveGeneration={
                activePhase.type === 'americana_weighted'
                  ? (nodes.find((n) => n.id === activePhase.id)?.data.config.liveGeneration ?? false)
                  : undefined
              }
              roundCount={
                activePhase.type === 'americana_weighted'
                  ? (nodes.find((n) => n.id === activePhase.id)?.data.config.roundCount ?? 3)
                  : undefined
              }
              onGenerateNextRound={
                activePhase.type === 'americana_weighted'
                  ? () => generateWeightedAmericanoNextRound(activePhase.id)
                  : undefined
              }
              isGeneratingNextRound={
                activePhase.type === 'americana_weighted' ? isGeneratingBatch : undefined
              }
              onTerminate={
                activePhase.type === 'americana_single' &&
                !(nodes.find((n) => n.id === activePhase.id)?.data.config.fixedRounds)
                  ? async () => {
                      setIsTerminating(true)
                      try { await terminateAmericanaSinglePhase(activePhase.id) }
                      finally { setIsTerminating(false) }
                    }
                  : undefined
              }
              isTerminating={isTerminating}
            />
          </div>
        ) : null}
      </div>

      {/* Roster americana_single */}
      {isRosterOpen && activePhase?.type === 'americana_single' && (() => {
        const phaseNode = nodes.find((n) => n.id === activePhase.id)
        const restingPlayerIds = phaseNode?.data.config.restingPlayerIds ?? []
        return (
          <AmericanaSingleRosterOverlay
            players={extraPlayers.length > 0 ? extraPlayers : Array.from(playersMap.entries()).map(([id, prenom]) => ({ id, prenom }))}
            restingPlayerIds={restingPlayerIds}
            template={template}
            onClose={() => setIsRosterOpen(false)}
            onToggleRest={(playerId) => {
              const next = restingPlayerIds.includes(playerId)
                ? restingPlayerIds.filter((id) => id !== playerId)
                : [...restingPlayerIds, playerId]
              updateAmericanaSingleRoster(activePhase.id, next)
            }}
            onAddPlayer={(name) => updateAmericanaSingleRoster(activePhase.id, restingPlayerIds, name)}
          />
        )
      })()}

      {/* Onboarding première visite */}
      {showOnboarding && id && (
        <OnboardingOverlay
          tournamentId={id}
          tournamentName={tournamentName ?? ''}
          teamsMap={teamsMap}
          teamsLoaded={teamsLoaded}
          extraPlayers={extraPlayers}
          template={template}
          onComplete={(joueur) => {
            if (joueur) setIdentity(joueur)
            setShowOnboarding(false)
          }}
        />
      )}

      {/* Confirmation terminer l'americana */}
      {showTerminateConfirm && activePhase?.type === 'americana_single' && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setShowTerminateConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: theme.bg }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold mb-1" style={{ color: theme.textPrimary }}>Terminer l'americana ?</p>
            <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>Le classement sera figé et la phase marquée comme terminée.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTerminateConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: theme.itemBg, color: theme.textSecondary }}
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  setShowTerminateConfirm(false)
                  setIsTerminating(true)
                  try { await terminateAmericanaSinglePhase(activePhase.id) }
                  finally { setIsTerminating(false) }
                }}
                disabled={isTerminating}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors
                  disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: theme.accent, color: theme.accentText }}
              >
                {isTerminating ? 'Clôture…' : 'Oui, terminer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Burger — navigation entre phases */}
      {isBurgerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end"
          onClick={() => setIsBurgerOpen(false)}
        >
          <div
            className={`w-full ${
              template === 'slick-dark' ? 'bg-[#062E38]' :
              template === 'palm-springs' ? 'bg-[#6B3020]' :
              template === 'green-turf' ? 'bg-[#8C2D40]' :
              'bg-navy-900'
            } rounded-t-2xl`}
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-4" />
            <div className={`${fontScale === 'xxl' ? 'text-xs' : 'text-[10px]'} font-bold text-white/30 uppercase tracking-[0.2em] px-5 mb-2`}>
              Phases du tournoi
            </div>
            {sortedPhases.map((phase) => (
              <button
                key={phase.id}
                onClick={() => { setActivePhaseId(phase.id); setIsBurgerOpen(false) }}
                className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition-colors ${
                  phase.id === activePhaseId
                    ? template === 'slick-dark'
                      ? 'text-[#D4E800]'
                      : template === 'palm-springs'
                      ? 'text-[#E8C9A0]'
                      : template === 'green-turf'
                      ? 'text-[#F9BCC8]'
                      : 'text-padel-gold'
                    : 'text-white/50'
                }`}
              >
                {phase.id === activePhaseId && (
                  <div className={`w-1 h-4 shrink-0 ${
                    template === 'slick-dark' ? 'bg-[#D4E800]' :
                    template === 'palm-springs' ? 'bg-[#E8C9A0]' :
                    template === 'green-turf' ? 'bg-[#F9BCC8]' :
                    'bg-padel-gold'
                  }`} />
                )}
                <span className={`font-${phase.id === activePhaseId ? 'black' : 'semibold'} ${fontScale === 'xxl' ? 'text-xl' : fontScale === 'xl' ? 'text-base' : 'text-sm'}`}>
                  {phase.name}
                </span>
              </button>
            ))}

            {/* Séparateur + lien vers le tableau iPad */}
            <div className="mx-5 my-3 h-px bg-white/10" />
            <Link
              to={`/tournament/${id}/board`}
              onClick={() => setIsBurgerOpen(false)}
              className="w-full text-left px-5 py-3.5 flex items-center gap-3 text-white/50 hover:text-white/80 transition-colors"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <span className={`font-semibold ${fontScale === 'xxl' ? 'text-xl' : fontScale === 'xl' ? 'text-base' : 'text-sm'}`}>
                Tableau des pistes
              </span>
            </Link>
          </div>
        </div>
      )}

      {/* Sheet identification joueur */}
      <PlayerSelectSheet
        isOpen={isPlayerSheetOpen}
        onClose={() => setIsPlayerSheetOpen(false)}
        currentIdentity={identity}
        teamsMap={teamsMap}
        extraPlayers={extraPlayers}
        template={template}
        fontScale={fontScale}
        onSelect={setIdentity}
        onClear={clearIdentity}
        onFontScaleChange={(scale) => {
          setFontScale(scale)
          localStorage.setItem('padel_font_scale', scale)
        }}
      />
    </div>
  )
}
