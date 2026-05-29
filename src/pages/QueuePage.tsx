import { useEffect, useCallback, useState } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { Match, TeamWithJoueurs, TournamentGraph } from '../types/tournament'
import { topologicalSort } from '../lib/matchGeneration'
import { computeEstimatedHoraire, FLOATING_MATCH_DURATION_MIN } from '../lib/courtAssignment'

function getTeamName(id: string | null, map: Map<string, TeamWithJoueurs>): string | null {
  if (!id) return null
  const t = map.get(id)
  return t ? `${t.joueur1.prenom} & ${t.joueur2.prenom}` : null
}

// "Tour 1 Match 3 de Poule A" → "Tour 1 · Match 3"
// "Demi-finale 1 de Tableau" → "Demi-finale 1"
// "Finale de Tableau Final" → "Finale"
function formatMatchLabel(nom: string): string {
  const de = nom.lastIndexOf(' de ')
  const base = de > 0 ? nom.slice(0, de) : nom
  return base.replace(/\s+(\d+)$/, ' · Match $1').replace(/^(Tour \d+) Match (\d+)$/, '$1 · Match $2')
}

function formatHoraire(h: string | null): string | null {
  if (!h) return null
  const m = h.match(/T(\d{2}:\d{2})/) ?? h.match(/^(\d{2}:\d{2})/)
  return m ? m[1] : null
}

export default function QueuePage() {
  const { id } = useParams<{ id: string }>()

  const matches = useMatchStore((s) => s.matches)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const subscribeToMatches = useMatchStore((s) => s.subscribeToMatches)
  const resetMatches = useMatchStore((s) => s.reset)
  const updateMatchPiste = useMatchStore((s) => s.updateMatchPiste)
  const updateMatchHoraire = useMatchStore((s) => s.updateMatchHoraire)

  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const resetTournament = useTournamentStore((s) => s.reset)

  const [teamsMap, setTeamsMap] = useState<Map<string, TeamWithJoueurs>>(new Map())
  const [calling, setCalling] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    loadTournament(id)
    loadMatches(id)
    const unsub = subscribeToMatches(id)
    return () => {
      unsub()
      resetMatches()
      resetTournament()
    }
  }, [id, loadTournament, loadMatches, subscribeToMatches, resetMatches, resetTournament])

  useEffect(() => {
    const teamIds = [...new Set(
      matches.flatMap((m) => [m.equipe1_id, m.equipe2_id].filter((x): x is string => x != null))
    )]
    if (!teamIds.length) return
    ;(async () => {
      const { data } = await supabase
        .from('tt_teams')
        .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
        .in('id', teamIds)
      if (data) {
        const map = new Map<string, TeamWithJoueurs>()
        for (const t of data as unknown as TeamWithJoueurs[]) map.set(t.id, t)
        setTeamsMap(map)
      }
    })()
  }, [matches])

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

  const pistes = tournamentConfig.pistes ?? []

  // Matchs en cours (convoqués, pas encore terminés)
  const enCours = matches.filter((m) => m.piste != null && m.statut === 'a_jouer')

  // Équipes actuellement sur une piste
  const playingTeams = new Set<string>()
  for (const m of enCours) {
    if (m.equipe1_id) playingTeams.add(m.equipe1_id)
    if (m.equipe2_id) playingTeams.add(m.equipe2_id)
  }

  // File d'attente : assignés, pas encore convoqués, et aucun joueur n'est en train de jouer
  const sorted = nodes.length > 0 ? topologicalSort(graph) : []
  const phaseOrder = new Map(sorted.map((n, i) => [n.id, i]))

  const enAttente = matches
    .filter((m) =>
      m.statut === 'a_jouer' &&
      m.piste == null &&
      m.equipe1_id != null &&
      m.equipe2_id != null &&
      !playingTeams.has(m.equipe1_id) &&
      !playingTeams.has(m.equipe2_id),
    )
    .sort((a, b) => {
      const da = phaseOrder.get(a.phase_node_id) ?? 0
      const db = phaseOrder.get(b.phase_node_id) ?? 0
      return da !== db ? da - db : a.ordre - b.ordre
    })

  // Pistes libres (pas de match en cours dessus)
  const pistesOccupees = new Set(enCours.map((m) => m.piste))
  const pistesLibres = pistes.filter((p) => !pistesOccupees.has(p))

  // Heure estimée pour chaque match en file : batch de N pistes, 45 min par batch
  const nbPistes = Math.max(pistes.length, 1)
  const estimatedHoraireForQueue = (idx: number): string | null => {
    const batchDelay = (Math.floor(idx / nbPistes) + 1) * FLOATING_MATCH_DURATION_MIN
    return computeEstimatedHoraire(batchDelay)
  }

  const handleConvoquer = useCallback(async (match: Match) => {
    if (pistesLibres.length === 0) return
    const piste = pistesLibres[0]
    const phaseNode = nodes.find((n) => n.id === match.phase_node_id)
    const buffer = phaseNode?.data.config.reposMatch ?? 5
    setCalling(match.id)
    await Promise.all([
      updateMatchPiste(match.id, piste),
      updateMatchHoraire(match.id, computeEstimatedHoraire(buffer)),
    ])
    setCalling(null)
  }, [pistesLibres, nodes, updateMatchPiste, updateMatchHoraire])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div
        className="bg-navy-900 shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-14 flex items-center px-3 sm:px-4 gap-3">
          <Link
            to={`/tournament/${id}/matches`}
            className="text-white/70 hover:text-white transition-colors p-1 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-white text-sm font-bold truncate">{tournamentName}</span>
            <span className="text-white/40 text-xs font-medium uppercase tracking-wider">File d'attente</span>
          </div>
          {pistesLibres.length > 0 && (
            <span className="shrink-0 text-xs font-bold text-padel-gold bg-padel-gold/15 border border-padel-gold/25 px-2 py-0.5 rounded-full">
              {pistesLibres.length} piste{pistesLibres.length > 1 ? 's' : ''} libre{pistesLibres.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-3 sm:px-4 py-4 space-y-5 max-w-lg mx-auto w-full">

        {/* En cours */}
        <section>
          <h2 className="text-xs font-bold text-navy-700/50 uppercase tracking-wider mb-2.5 px-0.5">
            En cours ({enCours.length})
          </h2>
          {enCours.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-1">Aucun match en cours</p>
          ) : (
            <div className="space-y-2">
              {enCours
                .sort((a, b) => (a.piste ?? 0) - (b.piste ?? 0))
                .map((m) => {
                  const t1 = getTeamName(m.equipe1_id, teamsMap)
                  const t2 = getTeamName(m.equipe2_id, teamsMap)
                  const heure = formatHoraire(m.horaire)
                  const matchLabel = formatMatchLabel(m.nom)
                  return (
                    <div key={m.id} className="bg-white border border-padel-blue/20 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-navy-900 mb-1">{matchLabel}</p>
                          <p className="text-sm text-navy-700 truncate">{t1 ?? '—'}</p>
                          <p className="text-sm text-navy-700 truncate">{t2 ?? '—'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold text-padel-blue">Piste {m.piste}</p>
                          {heure && <p className="text-xs text-gray-400 font-mono">{heure}</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </section>

        {/* File d'attente */}
        <section>
          <h2 className="text-xs font-bold text-navy-700/50 uppercase tracking-wider mb-2.5 px-0.5">
            File d'attente ({enAttente.length})
          </h2>
          {enAttente.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-1">Aucun match en attente</p>
          ) : (
            <div className="space-y-2">
              {enAttente.map((m, idx) => {
                const t1 = getTeamName(m.equipe1_id, teamsMap)
                const t2 = getTeamName(m.equipe2_id, teamsMap)
                const isCalling = calling === m.id
                const canCall = pistesLibres.length > 0 && idx === 0
                const estHoraire = formatHoraire(estimatedHoraireForQueue(idx))
                const matchLabel = formatMatchLabel(m.nom)
                return (
                  <div
                    key={m.id}
                    className={`bg-white rounded-2xl px-4 py-3 shadow-sm border transition-all duration-200
                      ${idx === 0 ? 'border-amber-200' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-navy-900 mb-1">{matchLabel}</p>
                        <p className="text-sm text-navy-700 truncate">{t1 ?? '—'}</p>
                        <p className="text-sm text-navy-700 truncate">{t2 ?? '—'}</p>
                        {estHoraire && (
                          <p className="text-[10px] text-gray-400 font-mono mt-1">~{estHoraire}</p>
                        )}
                      </div>
                      {canCall && (
                        <button
                          onClick={() => handleConvoquer(m)}
                          disabled={isCalling}
                          className="shrink-0 self-center inline-flex items-center gap-1.5
                            h-8 px-3 rounded-xl text-xs font-bold
                            bg-padel-blue text-white hover:bg-padel-blue-light
                            transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                        >
                          {isCalling ? (
                            <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                              </svg>
                              Convoquer
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
