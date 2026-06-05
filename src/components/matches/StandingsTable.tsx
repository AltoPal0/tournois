import type { StandingRow } from '../../lib/standings'
import type { TeamWithJoueurs, PlayerTemplate, FontScale } from '../../types/tournament'

function fscale(scale: FontScale | undefined, normal: string, xl: string, xxl: string): string {
  if (scale === 'xxl') return xxl
  if (scale === 'xl') return xl
  return normal
}

interface StandingsTableProps {
  standings: StandingRow[]
  teamsMap: Map<string, TeamWithJoueurs>
  template?: PlayerTemplate
  fontScale?: FontScale
}

function getTeamDisplay(teamId: string, teamsMap: Map<string, TeamWithJoueurs>): string | null {
  const team = teamsMap.get(teamId)
  if (!team) return null
  return `${team.joueur1.prenom} & ${team.joueur2.prenom}`
}

function fmtDiff(diff: number): string {
  if (diff > 0) return `+${diff}`
  return String(diff)
}

// ---------------------------------------------------------------------------
// DEFAULT — table classique navy
// Colonnes : J  V  +/-  Pts
// ---------------------------------------------------------------------------

function StandingsDefault({ standings, teamsMap, fontScale }: StandingsTableProps) {
  const hdr = fscale(fontScale, 'text-[11px]', 'text-xs', 'text-sm')
  const name = fscale(fontScale, 'text-sm', 'text-base', 'text-lg')
  const stat = fscale(fontScale, 'text-sm', 'text-base', 'text-base')
  const row_py = fscale(fontScale, 'py-2.5', 'py-3', 'py-3.5')
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="bg-navy-900 px-4 py-2.5 flex items-center justify-between">
        <span className={`${hdr} font-bold text-white/60 uppercase tracking-wider`}>Classement</span>
        <div className="flex gap-2">
          {['V', '+/-', 'Pts'].map((h) => (
            <span key={h} className={`${hdr} font-bold text-white/40 uppercase tracking-wider w-8 text-center`}>{h}</span>
          ))}
        </div>
      </div>
      {standings.length === 0 ? (
        <div className="px-4 py-4 text-xs text-gray-300 italic text-center">Aucune équipe assignée</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {standings.map((row, i) => {
            const hasPlayed = row.played > 0
            const isLeader = i === 0 && hasPlayed
            const diff = row.gamesWon - row.gamesLost
            return (
              <div key={row.teamId} className={`px-4 ${row_py} flex items-center gap-3 ${isLeader ? 'bg-padel-blue/5 border-l-4 border-l-padel-blue' : 'pl-[calc(1rem+4px)]'}`}>
                <span className={`text-xs font-black w-5 shrink-0 text-center ${isLeader ? 'text-padel-blue' : 'text-gray-300'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0 truncate">
                  <span className={`${name} font-semibold ${getTeamDisplay(row.teamId, teamsMap) ? 'text-navy-900' : 'text-gray-300 italic'}`}>
                    {getTeamDisplay(row.teamId, teamsMap) ?? 'À assigner'}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className={`${stat} text-gray-500 w-8 text-center`}>{row.wins}</span>
                  <span className={`${stat} font-medium w-8 text-center ${!hasPlayed ? 'text-gray-200' : diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {hasPlayed ? fmtDiff(diff) : '—'}
                  </span>
                  <span className={`${stat} font-bold w-8 text-center ${isLeader ? 'text-padel-blue' : row.points > 0 ? 'text-navy-900' : 'text-gray-300'}`}>
                    {hasPlayed ? row.points : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MODERN SLICK — "Classement sport teal"
// Fond teal, coins coupés, accent jaune chartreuse.
// ---------------------------------------------------------------------------

const SLICK_CLIP_TABLE = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'

function StandingsSlickDark({ standings, teamsMap, fontScale }: StandingsTableProps) {
  const hdr = fscale(fontScale, 'text-[11px]', 'text-xs', 'text-sm')
  const name = fscale(fontScale, 'text-sm', 'text-base', 'text-lg')
  const stat = fscale(fontScale, 'text-xs', 'text-sm', 'text-base')
  const row_py = fscale(fontScale, 'py-2.5', 'py-3', 'py-3.5')
  return (
    <div style={{ clipPath: SLICK_CLIP_TABLE, background: '#0E6070' }} className="overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: '#062E38' }}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#D4E800] shrink-0" />
          <span className={`${hdr} font-black text-white uppercase tracking-[0.18em]`}>Classement</span>
        </div>
        <div className="flex gap-1">
          {['V', '+/-', 'Pts'].map((h) => (
            <span key={h} className={`${hdr} font-black text-white/30 uppercase tracking-wider w-8 text-center`}>{h}</span>
          ))}
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="px-4 py-4 text-xs text-white/30 italic text-center">Aucune équipe assignée</div>
      ) : (
        <div>
          {standings.map((row, i) => {
            const hasPlayed = row.played > 0
            const isLeader = i === 0 && hasPlayed
            const diff = row.gamesWon - row.gamesLost
            return (
              <div
                key={row.teamId}
                style={isLeader ? { borderLeft: '3px solid #D4E800' } : { paddingLeft: '3px' }}
                className={`px-3 ${row_py} flex items-center gap-2 border-b border-white/5`}
              >
                <span className={`text-xs font-black w-5 shrink-0 text-center font-mono ${isLeader ? 'text-[#D4E800]' : 'text-white/25'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 truncate">
                  <span className={`${name} font-black uppercase tracking-wide ${getTeamDisplay(row.teamId, teamsMap) ? 'text-white' : 'text-white/30'}`}>
                    {getTeamDisplay(row.teamId, teamsMap) ?? '———'}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className={`${stat} font-mono text-white/40 w-8 text-center`}>{row.wins}</span>
                  <span className={`${stat} font-mono w-8 text-center ${!hasPlayed ? 'text-white/20' : diff > 0 ? 'text-[#D4E800]' : diff < 0 ? 'text-red-400' : 'text-white/40'}`}>
                    {hasPlayed ? fmtDiff(diff) : '—'}
                  </span>
                  <span className={`${fscale(fontScale,'text-sm','text-base','text-lg')} font-black font-mono w-8 text-center ${isLeader ? 'text-[#D4E800]' : hasPlayed && row.points > 0 ? 'text-white' : 'text-white/20'}`}>
                    {hasPlayed ? row.points : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PALM SPRINGS — "Tableau de club"
// Colonnes : J  V  +/-  Pts
// ---------------------------------------------------------------------------

function StandingsPalmSprings({ standings, teamsMap, fontScale }: StandingsTableProps) {
  const hdr = fscale(fontScale, 'text-[11px]', 'text-xs', 'text-sm')
  const name = fscale(fontScale, 'text-sm', 'text-base', 'text-lg')
  const stat = fscale(fontScale, 'text-sm', 'text-base', 'text-base')
  const row_py = fscale(fontScale, 'py-3', 'py-3.5', 'py-4')
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(180,100,60,0.1)]">
      <div className="bg-[#7A3B28] px-4 py-3 flex items-center justify-between">
        <span className={`${hdr} font-bold text-[#E8C9A0] uppercase tracking-[0.2em]`}>Classement</span>
        <div className="flex gap-3">
          {['V', '+/-', 'Pts'].map((h) => (
            <span key={h} className={`${hdr} font-bold text-[#C4906A]/60 uppercase tracking-wider w-8 text-center`}>{h}</span>
          ))}
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="px-4 py-4 text-xs text-stone-300 italic text-center">Aucune équipe assignée</div>
      ) : (
        <div>
          {standings.map((row, i) => {
            const hasPlayed = row.played > 0
            const isLeader = i === 0 && hasPlayed
            const diff = row.gamesWon - row.gamesLost
            return (
              <div
                key={row.teamId}
                className={`px-4 ${row_py} flex items-center gap-3 border-b border-stone-50 last:border-0 ${isLeader ? 'bg-[#FDF6F0]' : 'bg-white'}`}
              >
                <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                  {isLeader ? (
                    <div className="w-5 h-5 rounded-full bg-[#C84B31] flex items-center justify-center">
                      <span className="text-[9px] font-black text-white">1</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-stone-300">{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 truncate">
                  <span className={`${name} font-semibold ${getTeamDisplay(row.teamId, teamsMap) ? (isLeader ? 'text-[#7A3B28]' : 'text-stone-700') : 'text-stone-300 italic'}`}>
                    {getTeamDisplay(row.teamId, teamsMap) ?? 'À assigner'}
                  </span>
                </div>
                <div className="flex gap-3 shrink-0">
                  <span className={`${stat} text-stone-400 w-8 text-center`}>{row.wins}</span>
                  <span className={`${stat} font-medium w-8 text-center ${!hasPlayed ? 'text-stone-200' : diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-400' : 'text-stone-400'}`}>
                    {hasPlayed ? fmtDiff(diff) : '—'}
                  </span>
                  <span className={`${stat} font-bold w-8 text-center ${isLeader ? 'text-[#C84B31]' : hasPlayed && row.points > 0 ? 'text-stone-700' : 'text-stone-200'}`}>
                    {hasPlayed ? row.points : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PINK LOVE — "Classement romantique"
// Colonnes : J  V  +/-  Pts
// ---------------------------------------------------------------------------

function StandingsGreenTurf({ standings, teamsMap, fontScale }: StandingsTableProps) {
  const hdr = fscale(fontScale, 'text-[11px]', 'text-xs', 'text-sm')
  const name = fscale(fontScale, 'text-sm', 'text-base', 'text-lg')
  const stat = fscale(fontScale, 'text-sm', 'text-base', 'text-base')
  const row_py = fscale(fontScale, 'py-2.5', 'py-3', 'py-3.5')
  return (
    <div className="bg-[#FFF1E8] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(58,31,43,0.1)] border border-[#F7C6D0]">
      <div className="bg-[#B23A54] px-4 py-2.5 flex items-center justify-between">
        <span className={`${hdr} font-bold text-[#FFF1E8]/80 uppercase tracking-wider`}>Classement</span>
        <div className="flex gap-2">
          {['V', '+/-', 'Pts'].map((h) => (
            <span key={h} className={`${hdr} font-bold text-white/70 uppercase tracking-wider w-8 text-center`}>{h}</span>
          ))}
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="px-4 py-4 text-xs text-[#C4A0B0] italic text-center">Aucune équipe assignée</div>
      ) : (
        <div>
          {standings.map((row, i) => {
            const hasPlayed = row.played > 0
            const isLeader = i === 0 && hasPlayed
            const diff = row.gamesWon - row.gamesLost
            return (
              <div
                key={row.teamId}
                className={`px-4 ${row_py} flex items-center gap-3 border-b border-[#F7C6D0]/50 last:border-0
                  ${isLeader ? 'bg-[#FCE8EE] border-l-4 border-l-[#E85D75]' : 'pl-[calc(1rem+4px)] bg-[#FFF1E8]'}`}
              >
                <span className={`text-xs font-black w-5 shrink-0 text-center ${isLeader ? 'text-[#E85D75]' : 'text-[#D4A0B0]'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0 truncate">
                  <span className={`${name} font-semibold ${getTeamDisplay(row.teamId, teamsMap) ? (isLeader ? 'text-[#B23A54]' : 'text-[#3A1F2B]') : 'text-[#C4A0B0] italic'}`}>
                    {getTeamDisplay(row.teamId, teamsMap) ?? 'À assigner'}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className={`${stat} text-[#B28090] w-8 text-center`}>{row.wins}</span>
                  <span className={`${stat} font-medium w-8 text-center ${!hasPlayed ? 'text-[#D4A0B0]' : diff > 0 ? 'text-[#B23A54]' : diff < 0 ? 'text-[#E85D75]' : 'text-[#B28090]'}`}>
                    {hasPlayed ? fmtDiff(diff) : '—'}
                  </span>
                  <span className={`${stat} font-bold w-8 text-center ${isLeader ? 'text-[#E85D75]' : hasPlayed && row.points > 0 ? 'text-[#3A1F2B]' : 'text-[#D4A0B0]'}`}>
                    {hasPlayed ? row.points : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export default function StandingsTable({ standings, teamsMap, template = 'default', fontScale }: StandingsTableProps) {
  if (template === 'slick-dark') return <StandingsSlickDark standings={standings} teamsMap={teamsMap} fontScale={fontScale} />
  if (template === 'palm-springs') return <StandingsPalmSprings standings={standings} teamsMap={teamsMap} fontScale={fontScale} />
  if (template === 'green-turf') return <StandingsGreenTurf standings={standings} teamsMap={teamsMap} fontScale={fontScale} />
  return <StandingsDefault standings={standings} teamsMap={teamsMap} fontScale={fontScale} />
}
