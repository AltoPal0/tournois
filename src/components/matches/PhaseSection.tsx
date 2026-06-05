import { useMemo, useState } from 'react'
import type { Match, PhaseType, TeamWithJoueurs, PlayerTemplate, FontScale } from '../../types/tournament'
import { computeStandings } from '../../lib/standings'
import { computeAmericanaSingleStandings } from '../../lib/americanaSingleStandings'
import StandingsTable from './StandingsTable'
import ScoreInput from './ScoreInput'

// ---------------------------------------------------------------------------
// Helpers partagés
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

function getRoundLabel(type: PhaseType, round: number | null, matches: Match[]): string {
  if (type === 'round_robin') return `Tour ${round ?? '?'}`
  if (type === 'tournante_libre') return `Round ${round ?? '?'}`
  if (type === 'americana_single') return `Match ${matches[0]?.ordre ?? round ?? '?'}`
  const first = matches[0]
  if (first) {
    const nom = first.nom
    const de = nom.lastIndexOf(' de ')
    if (de > 0) return nom.slice(0, de).replace(/\s+\d+$/, '')
  }
  return `Round ${round ?? '?'}`
}

// Abrège les labels de provenance pour tenir sur mobile.
// Ex : "Vainqueur Quart de finale 1 de Tableau 1" → "V. 1/4F 1 T.1"
function abbrevLabel(label: string | null): string | null {
  if (!label) return null
  return label
    .replace(/^Vainqueur\s+/i, 'V. ')
    .replace(/Seizième de finale/gi, '1/16F')
    .replace(/Huitième de finale/gi, '1/8F')
    .replace(/Quart de finale/gi, '1/4F')
    .replace(/Demi[-\s]finale/gi, '1/2F')
    .replace(/\bFinale\b/gi, 'Fin.')
    .replace(/\s+de\s+/g, ' ')
    .replace(/\bTableau\b/gi, 'T.')
    .replace(/\bPoule\b/gi, 'P.')
    .replace(/\bGroupe\b/gi, 'G.')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fscale(scale: FontScale | undefined, normal: string, xl: string, xxl: string): string {
  if (scale === 'xxl') return xxl
  if (scale === 'xl') return xl
  return normal
}

interface CardProps {
  match: Match
  teamsMap: Map<string, TeamWithJoueurs>
  isActive: boolean
  scoreBasedSchedule?: boolean
  myTeamId?: string | null
  fontScale?: FontScale
  onScoreClick: (match: Match) => void
}

// ---------------------------------------------------------------------------
// DEFAULT — cartes blanches arrondies, score en colonne à droite
// ---------------------------------------------------------------------------

function MatchCardDefault({ match, teamsMap, isActive, scoreBasedSchedule, myTeamId, fontScale, onScoreClick }: CardProps) {
  const team1Name = getTeamName(match.equipe1_id, teamsMap)
  const team2Name = getTeamName(match.equipe2_id, teamsMap)
  const canScore = isActive && !!(match.equipe1_id && match.equipe2_id)
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null
  const team1Won = hasScore && match.score_equipe1! > match.score_equipe2!
  const team2Won = hasScore && match.score_equipe2! > match.score_equipe1!
  const isMyMatch = myTeamId ? match.equipe1_id === myTeamId || match.equipe2_id === myTeamId : false
  const pisteDisplay = match.piste != null ? `Piste ${match.piste}` : null
  const horaireRaw = formatHoraire(match.horaire)
  const horaireDisplay = horaireRaw && scoreBasedSchedule && !hasScore ? `~${horaireRaw}` : horaireRaw

  return (
    <button
      onClick={canScore ? () => onScoreClick(match) : undefined}
      className={`w-full text-left bg-white rounded-2xl border transition-all duration-200
        shadow-[0_1px_3px_rgba(0,0,0,0.06)]
        ${canScore ? 'cursor-pointer active:scale-[0.99] hover:shadow-[0_4px_16px_rgba(21,101,216,0.1)] hover:border-padel-blue/20' : 'cursor-default'}
        ${isMyMatch ? 'ring-2 ring-padel-gold/60 border-padel-gold/30' : 'border-gray-100'}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`${fscale(fontScale,'text-sm','text-base','text-xl')} leading-tight truncate font-semibold ${team1Name ? 'text-navy-900' : 'text-gray-300 italic'}`}>
              {team1Name ?? (abbrevLabel(match.equipe1_label) ?? 'À assigner')}
            </span>
            {team1Won && <span className="w-2 h-2 rounded-full bg-padel-blue shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${fscale(fontScale,'text-sm','text-base','text-xl')} leading-tight truncate font-semibold ${team2Name ? 'text-navy-900' : 'text-gray-300 italic'}`}>
              {team2Name ?? (abbrevLabel(match.equipe2_label) ?? 'À assigner')}
            </span>
            {team2Won && <span className="w-2 h-2 rounded-full bg-padel-blue shrink-0" />}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end justify-center gap-0 min-w-[3rem]">
          {hasScore ? (
            <div className="flex flex-col items-end">
              <span className={`text-xl font-black font-mono leading-tight tabular-nums ${team1Won ? 'text-padel-blue' : 'text-gray-300'}`}>{match.score_equipe1}</span>
              <span className={`text-xl font-black font-mono leading-tight tabular-nums ${team2Won ? 'text-padel-blue' : 'text-gray-300'}`}>{match.score_equipe2}</span>
            </div>
          ) : (
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
// MODERN SLICK — "Sport teal"
// Fond teal profond, coins coupés, jaune chartreuse comme accent unique.
// Inspiré du design padel sport UI avec chamfered corners.
// ---------------------------------------------------------------------------

// Clip-path extérieur (contour jaune) : coins coupés à 10px
const SLICK_CLIP = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'
// Clip-path intérieur (carte) : 8px pour que le contour jaune de 2px suive la coupe
const SLICK_CLIP_INNER = 'polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)'

function MatchCardSlickDark({ match, teamsMap, isActive, scoreBasedSchedule, myTeamId, fontScale, onScoreClick }: CardProps) {
  const team1Name = getTeamName(match.equipe1_id, teamsMap)
  const team2Name = getTeamName(match.equipe2_id, teamsMap)
  const canScore = isActive && !!(match.equipe1_id && match.equipe2_id)
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null
  const team1Won = hasScore && match.score_equipe1! > match.score_equipe2!
  const team2Won = hasScore && match.score_equipe2! > match.score_equipe1!
  const isMyMatch = myTeamId ? match.equipe1_id === myTeamId || match.equipe2_id === myTeamId : false
  const pisteDisplay = match.piste != null ? `Pista ${match.piste}` : null
  const horaireRaw = formatHoraire(match.horaire)
  const horaireDisplay = horaireRaw && scoreBasedSchedule && !hasScore ? `~${horaireRaw}` : horaireRaw

  const cardBody = (
    <button
      onClick={canScore ? () => onScoreClick(match) : undefined}
      style={{
        clipPath: isMyMatch ? SLICK_CLIP_INNER : SLICK_CLIP,
        background: isMyMatch ? '#0A4E5C' : '#0E6070',
      }}
      className={`w-full text-left transition-all duration-150
        ${canScore ? 'cursor-pointer active:brightness-110' : 'cursor-default'}`}
    >
      {/* Ligne équipe 1 */}
      <div className="px-4 pt-3.5 pb-0 flex items-center gap-2">
        <span className={`flex-1 ${fscale(fontScale,'text-sm','text-base','text-xl')} font-black uppercase tracking-wide leading-none truncate
          ${team1Name ? 'text-white' : 'text-white/30'}`}>
          {team1Name ?? (abbrevLabel(match.equipe1_label) ?? '———')}
        </span>
        {hasScore && (
          <>
            <div className="w-4 shrink-0 flex items-center justify-center">
              {team1Won && <span className="w-2 h-2 bg-[#D4E800]" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />}
            </div>
            <span className={`text-2xl font-black font-mono leading-none tabular-nums w-8 text-right shrink-0
              ${team1Won ? 'text-[#D4E800]' : 'text-white/30'}`}>
              {match.score_equipe1}
            </span>
          </>
        )}
      </div>

      {/* Séparateur */}
      <div className="mx-4 my-2.5 h-px bg-white/10" />

      {/* Ligne équipe 2 */}
      <div className="px-4 pb-3.5 flex items-center gap-2">
        <span className={`flex-1 ${fscale(fontScale,'text-sm','text-base','text-xl')} font-black uppercase tracking-wide leading-none truncate
          ${team2Name ? 'text-white' : 'text-white/30'}`}>
          {team2Name ?? (abbrevLabel(match.equipe2_label) ?? '———')}
        </span>
        {hasScore && (
          <>
            <div className="w-4 shrink-0 flex items-center justify-center">
              {team2Won && <span className="w-2 h-2 bg-[#D4E800]" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />}
            </div>
            <span className={`text-2xl font-black font-mono leading-none tabular-nums w-8 text-right shrink-0
              ${team2Won ? 'text-[#D4E800]' : 'text-white/30'}`}>
              {match.score_equipe2}
            </span>
          </>
        )}
      </div>

      {/* Meta info court/horaire */}
      {!hasScore && (pisteDisplay || horaireDisplay) && (
        <div className="px-4 pb-3 flex items-center gap-2">
          {pisteDisplay && (
            <span
              style={{ clipPath: 'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)' }}
              className="text-[10px] font-black text-[#062E38] bg-[#D4E800] px-2.5 py-0.5 uppercase tracking-widest"
            >
              {pisteDisplay}
            </span>
          )}
          {horaireDisplay && (
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{horaireDisplay}</span>
          )}
        </div>
      )}
    </button>
  )

  if (isMyMatch) {
    return (
      <div style={{ clipPath: SLICK_CLIP, background: '#D4E800', padding: '2px' }}>
        {cardBody}
      </div>
    )
  }
  return cardBody
}

// ---------------------------------------------------------------------------
// PALM SPRINGS — "Duel côte à côte"
// Les deux équipes s'affrontent visuellement en face à face sur la même carte.
// Score affiché horizontalement au centre. Palette chaude terracotta + crème.
// ---------------------------------------------------------------------------

function MatchCardPalmSprings({ match, teamsMap, isActive, scoreBasedSchedule, myTeamId, fontScale, onScoreClick }: CardProps) {
  const team1Name = getTeamName(match.equipe1_id, teamsMap)
  const team2Name = getTeamName(match.equipe2_id, teamsMap)
  const canScore = isActive && !!(match.equipe1_id && match.equipe2_id)
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null
  const team1Won = hasScore && match.score_equipe1! > match.score_equipe2!
  const team2Won = hasScore && match.score_equipe2! > match.score_equipe1!
  const isMyMatch = myTeamId ? match.equipe1_id === myTeamId || match.equipe2_id === myTeamId : false
  const pisteDisplay = match.piste != null ? `Court ${match.piste}` : null
  const horaireRaw = formatHoraire(match.horaire)
  const horaireDisplay = horaireRaw && scoreBasedSchedule && !hasScore ? `~${horaireRaw}` : horaireRaw

  return (
    <button
      onClick={canScore ? () => onScoreClick(match) : undefined}
      className={`w-full text-left bg-white rounded-xl overflow-hidden transition-all duration-200
        ${canScore ? 'cursor-pointer active:scale-[0.99] hover:shadow-[0_6px_24px_rgba(200,75,49,0.15)]' : 'cursor-default'}
        ${isMyMatch
          ? 'shadow-[0_0_0_2px_#C84B31,0_4px_20px_rgba(200,75,49,0.2)]'
          : 'shadow-[0_2px_12px_rgba(180,120,80,0.1)]'}`}
    >
      {/* Barre de couleur en haut — terracotta si mon match, crème sinon */}
      <div className={`h-1 ${isMyMatch ? 'bg-[#C84B31]' : 'bg-gradient-to-r from-[#E8C9A0] to-[#D4A574]'}`} />

      {/* Corps : deux équipes face-à-face */}
      <div className="px-4 py-4 flex items-center gap-2">
        {/* Équipe 1 — côté gauche */}
        <div className={`flex-1 min-w-0 ${team1Won ? 'text-[#C84B31]' : 'text-stone-600'}`}>
          <div className={`${fscale(fontScale,'text-sm','text-base','text-xl')} font-bold leading-snug truncate ${team1Won ? 'text-[#C84B31]' : 'text-stone-800'}`}>
            {team1Name ?? abbrevLabel(match.equipe1_label) ?? <span className="text-stone-400 italic text-sm">À assigner</span>}
          </div>
        </div>

        {/* Score ou VS au centre */}
        <div className="shrink-0 flex flex-col items-center w-16">
          {hasScore ? (
            <div className="flex items-center gap-1.5">
              <span className={`text-2xl font-black tabular-nums leading-none ${team1Won ? 'text-[#C84B31]' : 'text-stone-400'}`}>
                {match.score_equipe1}
              </span>
              <span className="text-stone-300 text-lg font-light leading-none">—</span>
              <span className={`text-2xl font-black tabular-nums leading-none ${team2Won ? 'text-[#C84B31]' : 'text-stone-400'}`}>
                {match.score_equipe2}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-black text-stone-400 uppercase tracking-[0.2em]">vs</span>
          )}
        </div>

        {/* Équipe 2 — côté droit */}
        <div className="flex-1 min-w-0 text-right">
          <div className={`${fscale(fontScale,'text-sm','text-base','text-xl')} font-bold leading-snug truncate ${team2Won ? 'text-[#C84B31]' : 'text-stone-800'}`}>
            {team2Name ?? abbrevLabel(match.equipe2_label) ?? <span className="text-stone-400 italic text-sm">À assigner</span>}
          </div>
        </div>
      </div>

      {/* Pied de carte — court et horaire */}
      {(pisteDisplay || horaireDisplay) && (
        <div className="px-4 py-2 bg-[#FAF7F2] border-t border-stone-100 flex items-center justify-center gap-3">
          {pisteDisplay && <span className="text-[10px] text-stone-400 font-medium">📍 {pisteDisplay}</span>}
          {horaireDisplay && <span className="text-[10px] text-stone-400 font-medium">⏱ {horaireDisplay}</span>}
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// PINK LOVE — "Carte romantique"
// Fond crème chaud #FFF1E8, bordure gauche rose profond #B23A54.
// Scores en rose vif #E85D75. Texte plum #3A1F2B. Doux et lisible.
// ---------------------------------------------------------------------------

function MatchCardGreenTurf({ match, teamsMap, isActive, scoreBasedSchedule, myTeamId, fontScale, onScoreClick }: CardProps) {
  const team1Name = getTeamName(match.equipe1_id, teamsMap)
  const team2Name = getTeamName(match.equipe2_id, teamsMap)
  const canScore = isActive && !!(match.equipe1_id && match.equipe2_id)
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null
  const team1Won = hasScore && match.score_equipe1! > match.score_equipe2!
  const team2Won = hasScore && match.score_equipe2! > match.score_equipe1!
  const isMyMatch = myTeamId ? match.equipe1_id === myTeamId || match.equipe2_id === myTeamId : false
  const pisteDisplay = match.piste != null ? `Piste ${match.piste}` : null
  const horaireRaw = formatHoraire(match.horaire)
  const horaireDisplay = horaireRaw && scoreBasedSchedule && !hasScore ? `~${horaireRaw}` : horaireRaw

  return (
    <button
      onClick={canScore ? () => onScoreClick(match) : undefined}
      style={{ borderLeft: `4px solid ${isMyMatch ? '#E85D75' : '#B23A54'}` }}
      className={`w-full text-left bg-[#FFF1E8] rounded-r-2xl rounded-l-none transition-all duration-200
        shadow-[0_2px_8px_rgba(58,31,43,0.08)]
        ${canScore ? 'cursor-pointer active:scale-[0.99] hover:bg-white hover:shadow-[0_4px_16px_rgba(232,93,117,0.2)]' : 'cursor-default'}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Noms des équipes */}
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`${fscale(fontScale,'text-sm','text-base','text-xl')} leading-tight truncate font-semibold
              ${team1Name ? 'text-[#3A1F2B]' : 'text-[#C4A0B0] italic'}`}>
              {team1Name ?? (abbrevLabel(match.equipe1_label) ?? 'À assigner')}
            </span>
            {team1Won && <span className="w-2 h-2 rounded-full bg-[#E85D75] shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${fscale(fontScale,'text-sm','text-base','text-xl')} leading-tight truncate font-semibold
              ${team2Name ? 'text-[#3A1F2B]' : 'text-[#C4A0B0] italic'}`}>
              {team2Name ?? (abbrevLabel(match.equipe2_label) ?? 'À assigner')}
            </span>
            {team2Won && <span className="w-2 h-2 rounded-full bg-[#E85D75] shrink-0" />}
          </div>
        </div>

        {/* Score ou piste/horaire */}
        <div className="shrink-0 flex flex-col items-end justify-center gap-0 min-w-[3rem]">
          {hasScore ? (
            <div className="flex flex-col items-end">
              <span className={`text-xl font-black font-mono leading-tight tabular-nums
                ${team1Won ? 'text-[#E85D75]' : 'text-[#C4A0B0]'}`}>{match.score_equipe1}</span>
              <span className={`text-xl font-black font-mono leading-tight tabular-nums
                ${team2Won ? 'text-[#E85D75]' : 'text-[#C4A0B0]'}`}>{match.score_equipe2}</span>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              {pisteDisplay && (
                <span className="bg-[#B23A54] text-[#FFF1E8] text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                  {pisteDisplay}
                </span>
              )}
              {horaireDisplay && (
                <span className="bg-[#B23A54] text-[#FFF1E8] text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                  {horaireDisplay}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Interface props
// ---------------------------------------------------------------------------

interface PhaseSectionProps {
  name: string
  type: PhaseType
  matches: Match[]
  displayMatches?: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
  playersMap?: Map<string, string>
  isActive?: boolean
  sameDay?: boolean
  scoreBasedSchedule?: boolean
  myTeamId?: string | null
  template?: PlayerTemplate
  fontScale?: FontScale
  showAllMatches?: boolean
  onToggleFilter?: () => void
  onGenerateBatch?: () => void
  isGeneratingBatch?: boolean
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function PhaseSection({
  type,
  matches,
  displayMatches,
  teamsMap,
  playersMap,
  isActive = false,
  scoreBasedSchedule,
  myTeamId,
  template = 'default',
  fontScale = 'normal',
  showAllMatches = true,
  onToggleFilter,
  onGenerateBatch,
  isGeneratingBatch = false,
}: PhaseSectionProps) {
  const [scoringMatch, setScoringMatch] = useState<Match | null>(null)

  const standings = useMemo(
    () => (type === 'round_robin' || type === 'tournante_libre' || type === 'americano' ? computeStandings(matches) : []),
    [type, matches],
  )

  const individualStandings = useMemo(
    () => (type === 'americana_single' ? computeAmericanaSingleStandings(matches, teamsMap) : []),
    [type, matches, teamsMap],
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

  const cardProps = { teamsMap, isActive, scoreBasedSchedule, myTeamId, fontScale, onScoreClick: setScoringMatch }

  const MatchCardComponent =
    template === 'slick-dark' ? MatchCardSlickDark :
    template === 'palm-springs' ? MatchCardPalmSprings :
    template === 'green-turf' ? MatchCardGreenTurf :
    MatchCardDefault

  function RoundHeader({ label }: { label: string }) {
    const headerSize = fscale(fontScale, 'text-[11px]', 'text-xs', 'text-sm')
    if (template === 'slick-dark') {
      return (
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-5 bg-[#D4E800] shrink-0" />
          <span className={`${headerSize} font-black text-white/60 uppercase tracking-[0.2em]`}>{label}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )
    }
    if (template === 'palm-springs') {
      return (
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-stone-200" />
          <span className={`${headerSize} font-bold text-stone-400 uppercase tracking-[0.2em] whitespace-nowrap`}>{label}</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>
      )
    }
    if (template === 'green-turf') {
      return (
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center bg-[#B23A54] text-[#FFF1E8] ${headerSize} font-bold uppercase tracking-wider px-3 py-1 rounded-r-full`}>
            {label}
          </span>
        </div>
      )
    }
    return (
      <h3 className={`${headerSize} font-bold text-navy-700/50 uppercase tracking-wider mb-2.5 px-0.5`}>
        {label}
      </h3>
    )
  }

  const roundSpacing = template === 'slick-dark' ? 'space-y-1.5' : 'space-y-2'
  const sectionSpacing = template === 'slick-dark' ? 'mb-5' : 'mb-5'

  const phaseHasMyMatches = myTeamId
    ? matches.some((m) => m.equipe1_id === myTeamId || m.equipe2_id === myTeamId)
    : false

  function FilterToggle() {
    if (!phaseHasMyMatches || !onToggleFilter) return null
    if (template === 'slick-dark') {
      return (
        <div className="flex items-center gap-3 mb-4 mt-1">
          <button
            onClick={onToggleFilter}
            style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
            className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              showAllMatches
                ? 'bg-white/10 text-white/60'
                : 'bg-[#D4E800] text-[#062E38]'
            }`}
          >
            Mon équipe
          </button>
          <button
            onClick={onToggleFilter}
            style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
            className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              showAllMatches
                ? 'bg-[#D4E800] text-[#062E38]'
                : 'bg-white/10 text-white/60'
            }`}
          >
            Tous les matchs
          </button>
        </div>
      )
    }
    return (
      <div className="flex justify-end mb-3">
        <button
          onClick={onToggleFilter}
          className={`text-xs font-semibold transition-colors ${
            template === 'palm-springs' ? 'text-[#C84B31]/70 hover:text-[#C84B31]' :
            template === 'green-turf' ? 'text-[#B23A54]/70 hover:text-[#B23A54]' :
            'text-padel-blue/70 hover:text-padel-blue'
          }`}
        >
          {showAllMatches ? '← Mon équipe' : 'Tous les matchs →'}
        </button>
      </div>
    )
  }

  return (
    <section>
      {(type === 'round_robin' || type === 'tournante_libre' || type === 'americano') && standings.length > 0 && (
        <div className="mb-4">
          <StandingsTable standings={standings} teamsMap={teamsMap} template={template} fontScale={fontScale} />
        </div>
      )}

      {type === 'americana_single' && individualStandings.length > 0 && (
        <div className="mb-4">
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className={`w-full ${fscale(fontScale, 'text-xs', 'text-sm', 'text-base')}`}>
              <thead>
                <tr className="bg-gray-50 text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Joueur</th>
                  <th className="px-3 py-2 text-center">J</th>
                  <th className="px-3 py-2 text-center">V</th>
                  <th className="px-3 py-2 text-center">Pts</th>
                  <th className="px-3 py-2 text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {individualStandings.map((row, idx) => (
                  <tr key={row.playerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 text-gray-400 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">
                      {playersMap?.get(row.playerId) ?? row.playerId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-500">{row.played}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{row.wins}</td>
                    <td className="px-3 py-2 text-center font-bold text-teal-700">{row.points}</td>
                    <td className="px-3 py-2 text-center text-gray-500">
                      {row.gamesWon - row.gamesLost > 0 ? '+' : ''}{row.gamesWon - row.gamesLost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FilterToggle />

      {matchesByRound.map(({ round, label, matches: roundMatches }) => (
        <div key={round} className={sectionSpacing}>
          <RoundHeader label={label} />
          <div className={roundSpacing}>
            {roundMatches.map((match) => (
              <MatchCardComponent key={match.id} match={match} {...cardProps} />
            ))}
          </div>
        </div>
      ))}

      {type === 'americana_single' &&
        isActive &&
        matches.length > 0 &&
        matches.every((m) => m.statut === 'termine') &&
        onGenerateBatch && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={onGenerateBatch}
              disabled={isGeneratingBatch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                bg-padel-blue text-white hover:bg-padel-blue-light transition-all duration-200
                active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-padel-blue/25"
            >
              {isGeneratingBatch ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
              {isGeneratingBatch ? 'Génération…' : 'Générer 3 nouveaux matchs'}
            </button>
          </div>
        )}

      {scoringMatch && (
        <ScoreInput
          key={scoringMatch.id}
          match={scoringMatch}
          team1Name={scoringTeam1Name}
          team2Name={scoringTeam2Name}
          isOpen={true}
          onClose={() => setScoringMatch(null)}
          template={template}
        />
      )}
    </section>
  )
}
