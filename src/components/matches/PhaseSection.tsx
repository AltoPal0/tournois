import { useMemo, useState, useRef } from 'react'
import type { Match, PhaseType, TeamWithJoueurs } from '../../types/tournament'
import { computeStandings } from '../../lib/standings'
import StandingsTable from './StandingsTable'
import ScoreInput, { TennisBall, ScoreDisplay } from './ScoreInput'
import { useMatchStore } from '../../store/matchStore'

interface PhaseSectionProps {
  name: string
  type: PhaseType
  matches: Match[]
  displayMatches?: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
  isActive?: boolean
  sameDay?: boolean
  myTeamId?: string | null
}

// ---------------------------------------------------------------------------
// Cellule éditable inline (piste / horaire)
// ---------------------------------------------------------------------------

interface InlineEditCellProps {
  display: string | null
  inputValue: string
  inputType: 'number' | 'datetime-local' | 'time'
  onSave: (raw: string) => void
  placeholder?: string
}

function InlineEditCell({ display, inputValue, inputType, onSave, placeholder }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const committed = useRef(false)

  const commit = () => {
    if (!committed.current) {
      committed.current = true
      onSave(draft)
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          committed.current = false
          setDraft(inputValue)
          setEditing(true)
        }}
        className="text-xs text-navy-700/50 hover:text-padel-blue hover:bg-padel-blue/5 px-1.5 py-0.5
          rounded transition-colors duration-100 whitespace-nowrap font-medium"
      >
        {display ?? <span className="text-gray-300">{placeholder ?? '—'}</span>}
      </button>
    )
  }

  return (
    <input
      type={inputType}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="text-xs border border-padel-blue/40 rounded px-1.5 py-0.5 w-24
        focus:outline-none focus:border-padel-blue"
    />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTeamName(teamId: string | null, teamsMap: Map<string, TeamWithJoueurs>): string | null {
  if (!teamId) return null
  const t = teamsMap.get(teamId)
  if (!t) return null
  return `${t.joueur1.prenom} & ${t.joueur2.prenom}`
}

function formatHoraire(horaire: string | null): string | null {
  if (!horaire) return null
  const tIdx = horaire.indexOf('T')
  if (tIdx >= 0) return horaire.slice(tIdx + 1, tIdx + 6)
  if (horaire.includes(':')) return horaire.slice(0, 5)
  return null
}

function horaireToInput(horaire: string | null): string {
  if (!horaire) return ''
  return horaire.slice(0, 16)
}

function horaireToTimeInput(horaire: string | null): string {
  if (!horaire) return ''
  if (!horaire.includes('T') && !horaire.includes(' ')) return horaire.slice(0, 5)
  return horaire.slice(11, 16)
}

function getRoundLabel(type: PhaseType, round: number | null, matches: Match[]): string {
  if (type === 'round_robin') return `Tour ${round ?? '?'}`
  if (type === 'tournante_libre') return `Round ${round ?? '?'}`
  const first = matches[0]
  if (first) {
    const nom = first.nom
    const de = nom.lastIndexOf(' de ')
    if (de > 0) {
      return nom.slice(0, de).replace(/\s+\d+$/, '')
    }
  }
  return `Round ${round ?? '?'}`
}

// ---------------------------------------------------------------------------
// Carte d'un match (mobile-first)
// ---------------------------------------------------------------------------

function MatchCard({
  match,
  teamsMap,
  isActive,
  sameDay,
  myTeamId,
  onScoreClick,
}: {
  match: Match
  teamsMap: Map<string, TeamWithJoueurs>
  isActive: boolean
  sameDay: boolean
  myTeamId?: string | null
  onScoreClick: (match: Match) => void
}) {
  const updateMatchPiste = useMatchStore((s) => s.updateMatchPiste)
  const updateMatchHoraire = useMatchStore((s) => s.updateMatchHoraire)

  const team1Name = getTeamName(match.equipe1_id, teamsMap)
  const team2Name = getTeamName(match.equipe2_id, teamsMap)
  const canScore = isActive && !!(match.equipe1_id && match.equipe2_id)
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null
  const team1Won = hasScore && match.score_equipe1! > match.score_equipe2!
  const team2Won = hasScore && match.score_equipe2! > match.score_equipe1!
  const isMyMatch = myTeamId
    ? match.equipe1_id === myTeamId || match.equipe2_id === myTeamId
    : false

  const pisteDisplay = match.piste != null ? `Piste ${match.piste}` : null
  const horaireDisplay = formatHoraire(match.horaire)

  return (
    <button
      onClick={canScore ? () => onScoreClick(match) : undefined}
      className={`w-full text-left bg-white rounded-2xl border transition-all duration-200
        ${canScore
          ? 'cursor-pointer active:scale-[0.99] hover:shadow-[0_4px_16px_rgba(21,101,216,0.1)] hover:border-padel-blue/20'
          : 'cursor-default'}
        ${isMyMatch
          ? 'ring-2 ring-padel-gold/60 border-padel-gold/30'
          : match.statut === 'termine' ? 'border-gray-100' : 'border-gray-100'}
        shadow-[0_1px_3px_rgba(0,0,0,0.06)]
      `}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">

        {/* Noms équipes */}
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm leading-tight truncate font-semibold
              ${team1Name ? 'text-navy-900' : 'text-gray-300 italic'}`}>
              {team1Name ?? (match.equipe1_label ?? 'À assigner')}
            </span>
            {team1Won && <TennisBall className="w-3.5 h-3.5 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm leading-tight truncate font-semibold
              ${team2Name ? 'text-navy-900' : 'text-gray-300 italic'}`}>
              {team2Name ?? (match.equipe2_label ?? 'À assigner')}
            </span>
            {team2Won && <TennisBall className="w-3.5 h-3.5 shrink-0" />}
          </div>
        </div>

        {/* Zone droite : score si joué, sinon piste/horaire */}
        <div className="shrink-0 flex flex-col items-end justify-center gap-0.5 min-w-[4rem]">
          {hasScore ? (
            <ScoreDisplay v1={match.score_equipe1!} v2={match.score_equipe2!} />
          ) : isActive ? (
            /* Actif : cellules inline éditables */
            <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <InlineEditCell
                display={pisteDisplay}
                inputValue={match.piste != null ? String(match.piste) : ''}
                inputType="number"
                placeholder="Piste"
                onSave={(raw) => updateMatchPiste(match.id, raw === '' ? null : (parseInt(raw, 10) || null))}
              />
              <InlineEditCell
                display={horaireDisplay}
                inputValue={sameDay ? horaireToTimeInput(match.horaire) : horaireToInput(match.horaire)}
                inputType={sameDay ? 'time' : 'datetime-local'}
                placeholder="Horaire"
                onSave={(raw) => {
                  if (!raw) { updateMatchHoraire(match.id, null); return }
                  updateMatchHoraire(match.id, sameDay ? raw : raw + ':00')
                }}
              />
            </div>
          ) : (
            /* Brouillon : lecture seule */
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-gray-400 whitespace-nowrap font-medium">{pisteDisplay ?? ''}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap font-medium">{horaireDisplay ?? ''}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function PhaseSection({
  type,
  matches,
  displayMatches,
  teamsMap,
  isActive = false,
  sameDay = false,
  myTeamId,
}: PhaseSectionProps) {
  const [scoringMatch, setScoringMatch] = useState<Match | null>(null)

  const standings = useMemo(
    () => (type === 'round_robin' || type === 'tournante_libre' ? computeStandings(matches) : []),
    [type, matches],
  )

  const matchesToShow = displayMatches ?? matches

  const matchesByRound = useMemo(() => {
    const groups = new Map<number, Match[]>()
    for (const m of matchesToShow) {
      const r = m.round ?? 0
      if (!groups.has(r)) groups.set(r, [])
      groups.get(r)!.push(m)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, roundMatches]) => ({
        round,
        label: getRoundLabel(type, round, roundMatches),
        matches: roundMatches,
      }))
  }, [matchesToShow, type])

  const scoringTeam1Name = scoringMatch ? getTeamName(scoringMatch.equipe1_id, teamsMap) : null
  const scoringTeam2Name = scoringMatch ? getTeamName(scoringMatch.equipe2_id, teamsMap) : null

  return (
    <section>
      {/* Tableau des scores — round_robin et tournante_libre */}
      {(type === 'round_robin' || type === 'tournante_libre') && (
        <div className="mb-5">
          <StandingsTable standings={standings} teamsMap={teamsMap} />
        </div>
      )}

      {/* Rounds / matchs */}
      {matchesByRound.map(({ round, label, matches: roundMatches }) => (
        <div key={round} className="mb-5">
          <h3 className="text-xs font-bold text-navy-700/50 uppercase tracking-wider mb-2.5 px-0.5">
            {label}
          </h3>
          <div className="space-y-2">
            {roundMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                teamsMap={teamsMap}
                isActive={isActive}
                sameDay={sameDay}
                myTeamId={myTeamId}
                onScoreClick={setScoringMatch}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Overlay saisie score */}
      {scoringMatch && (
        <ScoreInput
          key={scoringMatch.id}
          match={scoringMatch}
          team1Name={scoringTeam1Name}
          team2Name={scoringTeam2Name}
          isOpen={true}
          onClose={() => setScoringMatch(null)}
        />
      )}
    </section>
  )
}
