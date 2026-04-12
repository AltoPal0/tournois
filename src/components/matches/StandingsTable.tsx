import type { StandingRow } from '../../lib/standings'
import type { TeamWithJoueurs } from '../../types/tournament'

interface StandingsTableProps {
  standings: StandingRow[]
  teamsMap: Map<string, TeamWithJoueurs>
}

function TeamName({ teamId, teamsMap }: { teamId: string; teamsMap: Map<string, TeamWithJoueurs> }) {
  const team = teamsMap.get(teamId)
  if (!team) return <span className="text-gray-300 italic text-xs">À assigner</span>
  return (
    <span className="text-sm font-medium text-gray-900">
      {team.joueur1.prenom} <span className="text-gray-400 font-normal">&</span> {team.joueur2.prenom}
    </span>
  )
}

export default function StandingsTable({ standings, teamsMap }: StandingsTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

      {/* En-tête */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Classement</span>
        <div className="flex gap-2">
          {['J', 'G', 'D', 'P', '+/-'].map((h) => (
            <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-6 text-center">
              {h}
            </span>
          ))}
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="px-4 py-4 text-xs text-gray-300 italic text-center">
          Aucune équipe assignée
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {standings.map((row, i) => {
            const hasPlayed = row.played > 0
            const isLeader = i === 0 && hasPlayed

            return (
              <div
                key={row.teamId}
                className={`px-4 py-2.5 flex items-center gap-3
                  ${isLeader ? 'bg-blue-50/50' : ''}`}
              >
                {/* Rang */}
                <span className={`text-xs font-bold w-5 shrink-0 text-center
                  ${isLeader ? 'text-blue-500' : 'text-gray-300'}`}>
                  {i + 1}
                </span>

                {/* Nom */}
                <div className="flex-1 min-w-0 truncate">
                  <TeamName teamId={row.teamId} teamsMap={teamsMap} />
                </div>

                {/* Stats */}
                <div className="flex gap-2 shrink-0">
                  <span className="text-sm text-gray-500 w-6 text-center">{row.played}</span>
                  <span className="text-sm text-gray-500 w-6 text-center">{row.wins}</span>
                  <span className="text-sm text-gray-500 w-6 text-center">{row.losses}</span>
                  <span className={`text-sm font-bold w-6 text-center
                    ${isLeader ? 'text-blue-600' : row.points > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                    {hasPlayed ? row.points : (
                      <span className="text-gray-200 font-normal text-xs">—</span>
                    )}
                  </span>
                  {(() => {
                    const diff = row.gamesWon - row.gamesLost
                    return (
                      <span className={`text-sm font-medium w-6 text-center
                        ${!hasPlayed ? 'text-gray-200' : diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {hasPlayed ? (diff > 0 ? `+${diff}` : diff) : '—'}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
