import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import { supabase } from '../lib/supabase'
import type { Match, PlayerTemplate } from '../types/tournament'
import ScoreInput from '../components/matches/ScoreInput'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function teamLabel(m: Match, slot: 1 | 2, teamNames: Record<string, string>): string {
  const id = slot === 1 ? m.equipe1_id : m.equipe2_id
  const label = slot === 1 ? m.equipe1_label : m.equipe2_label
  if (id && teamNames[id]) return teamNames[id]
  if (label) return label
  return '—'
}

function toMinutes(horaire: string): number {
  const m = horaire.match(/T(\d{2}):(\d{2})/) ?? horaire.match(/^(\d{2}):(\d{2})/)
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

function fmtTime(horaire: string | null): string | null {
  if (!horaire) return null
  const m = horaire.match(/T(\d{2}):(\d{2})/) ?? horaire.match(/^(\d{2}):(\d{2})/)
  if (!m) return null
  return `${m[1]}:${m[2]}`
}

// ---------------------------------------------------------------------------
// Match card
// ---------------------------------------------------------------------------

function MatchCard({
  match,
  team1,
  team2,
  onTap,
}: {
  match: Match
  team1: string
  team2: string
  onTap: () => void
}) {
  const done = match.statut === 'termine'
  const time = fmtTime(match.horaire)

  return (
    <button
      onClick={onTap}
      className={`w-full text-left rounded-xl border transition-all active:scale-[0.98] ${
        done
          ? 'bg-green-50 border-green-200 hover:bg-green-100'
          : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 shadow-sm'
      }`}
    >
      <div className="px-3 pt-2.5 pb-2">
        {/* Heure + phase */}
        <div className="flex items-center justify-between mb-2">
          {time && (
            <span className="text-[10px] font-semibold text-gray-400">{time}</span>
          )}
          {done && (
            <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
              ✓
            </span>
          )}
        </div>

        {/* Équipes + scores */}
        <div className="flex items-center gap-2">
          {/* Équipes */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className={`text-xs font-bold truncate leading-tight ${
              done && match.score_equipe1! > match.score_equipe2! ? 'text-green-700' : 'text-gray-800'
            }`}>{team1}</p>
            <div className="h-px bg-gray-100" />
            <p className={`text-xs font-bold truncate leading-tight ${
              done && match.score_equipe2! > match.score_equipe1! ? 'text-green-700' : 'text-gray-800'
            }`}>{team2}</p>
          </div>

          {/* Scores */}
          {done ? (
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className={`text-base font-black w-7 text-center leading-none ${
                match.score_equipe1! > match.score_equipe2! ? 'text-green-700' : 'text-gray-400'
              }`}>{match.score_equipe1}</span>
              <div className="h-px w-5 bg-gray-200" />
              <span className={`text-base font-black w-7 text-center leading-none ${
                match.score_equipe2! > match.score_equipe1! ? 'text-green-700' : 'text-gray-400'
              }`}>{match.score_equipe2}</span>
            </div>
          ) : (
            <div className="shrink-0 w-7 flex items-center justify-center">
              <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function LiveBoardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const subscribeToMatches = useMatchStore((s) => s.subscribeToMatches)
  const resetMatches = useMatchStore((s) => s.reset)

  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const resetTournament = useTournamentStore((s) => s.reset)

  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [scoreMatch, setScoreMatch] = useState<Match | null>(null)

  // Charger le tournoi et s'abonner au realtime
  useEffect(() => {
    if (!id) return
    loadTournament(id)
    loadMatches(id)
    const unsub = subscribeToMatches(id)
    return () => { unsub(); resetTournament(); resetMatches() }
  }, [id, loadTournament, loadMatches, subscribeToMatches, resetTournament, resetMatches])

  // Résoudre les noms d'équipes
  useEffect(() => {
    const teamIds = [...new Set(
      matches.flatMap((m) => [m.equipe1_id, m.equipe2_id].filter((x): x is string => x != null))
    )]
    if (!teamIds.length) return
    ;(async () => {
      const { data: teams } = await supabase
        .from('tt_teams').select('id, joueur1_id, joueur2_id').in('id', teamIds)
      if (!teams?.length) return
      const joueurIds = [...new Set(teams.flatMap((t) => [t.joueur1_id, t.joueur2_id]))]
      const { data: joueurs } = await supabase
        .from('tt_joueurs').select('id, prenom').in('id', joueurIds)
      if (!joueurs) return
      const jMap = Object.fromEntries(joueurs.map((j) => [j.id, j.prenom as string]))
      const map: Record<string, string> = {}
      teams.forEach((t) => { map[t.id] = `${jMap[t.joueur1_id] ?? '?'} / ${jMap[t.joueur2_id] ?? '?'}` })
      setTeamNames(map)
    })()
  }, [matches])

  // Grouper les matchs par piste
  const columns = useMemo(() => {
    const withPiste = matches.filter((m) => m.piste != null)
    const pisteSet = [...new Set(withPiste.map((m) => m.piste as number))].sort((a, b) => a - b)

    return pisteSet.map((piste) => {
      const pisteMatches = withPiste
        .filter((m) => m.piste === piste)
        .sort((a, b) => {
          if (a.horaire && b.horaire) return toMinutes(a.horaire) - toMinutes(b.horaire)
          return a.ordre - b.ordre
        })
      return { piste, matches: pisteMatches }
    })
  }, [matches])

  // Template du tournoi
  const template = (tournamentConfig as { playerTemplate?: PlayerTemplate }).playerTemplate ?? 'default'

  // Couleur d'accent du template pour le header
  const headerBg =
    template === 'slick-dark' ? 'bg-[#062E38]' :
    template === 'palm-springs' ? 'bg-[#6B3020]' :
    template === 'green-turf' ? 'bg-[#1A3A2A]' :
    'bg-navy-900'

  const matchForScore = scoreMatch
    ? matches.find((m) => m.id === scoreMatch.id) ?? scoreMatch
    : null

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className={`${headerBg} text-white shrink-0`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(`/tournament/${id}/matches`)}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-sm font-black uppercase tracking-wider truncate">{tournamentName}</h1>
          <span className="text-xs font-semibold text-white/40 shrink-0">
            {matches.filter((m) => m.statut === 'termine').length}/{matches.length} matchs
          </span>
        </div>
      </div>

      {/* Corps */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
        </div>
      ) : columns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <p className="text-gray-400 font-semibold mb-1">Aucun match planifié</p>
            <p className="text-gray-300 text-sm">Assignez les pistes depuis le planning opérateur.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 h-full px-3 py-3" style={{ minWidth: `${columns.length * 220}px` }}>
            {columns.map(({ piste, matches: col }) => (
              <div key={piste} className="flex flex-col w-52 shrink-0">
                {/* En-tête colonne */}
                <div className="text-center mb-2 shrink-0">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500">
                    Piste {piste}
                  </span>
                  <div className="mt-1 text-[10px] text-gray-400">
                    {col.filter((m) => m.statut === 'termine').length}/{col.length}
                  </div>
                </div>

                {/* Liste matchs */}
                <div className="flex-1 overflow-y-auto space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-3">
                  {col.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      team1={teamLabel(m, 1, teamNames)}
                      team2={teamLabel(m, 2, teamNames)}
                      onTap={() => setScoreMatch(m)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score input */}
      {matchForScore && (
        <ScoreInput
          match={matchForScore}
          team1Name={teamLabel(matchForScore, 1, teamNames)}
          team2Name={teamLabel(matchForScore, 2, teamNames)}
          isOpen={true}
          onClose={() => setScoreMatch(null)}
          template={template}
        />
      )}
    </div>
  )
}
