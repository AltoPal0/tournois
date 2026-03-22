import type { StandingRow } from '../../lib/standings'
import type { TeamWithJoueurs } from '../../types/tournament'

interface StandingsTableProps {
  standings: StandingRow[]
  teamsMap: Map<string, TeamWithJoueurs>
}

export default function StandingsTable({ standings, teamsMap }: StandingsTableProps) {
  if (standings.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            <th className="text-center px-3 py-2.5 w-8">#</th>
            <th className="text-left px-4 py-2.5">Équipe</th>
            <th className="text-center px-2 py-2.5 w-10">J</th>
            <th className="text-center px-2 py-2.5 w-10">V</th>
            <th className="text-center px-2 py-2.5 w-10">D</th>
            <th className="text-center px-2 py-2.5 w-12">Pts</th>
            <th className="text-center px-2 py-2.5 w-14">+/-</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const team = teamsMap.get(row.teamId)
            const diff = row.gamesWon - row.gamesLost
            const isFirst = i === 0 && row.points > 0

            return (
              <tr
                key={row.teamId}
                className={`border-b border-gray-50 last:border-0 transition-colors duration-100
                  ${isFirst ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'}`}
              >
                <td className="text-center px-3 py-2.5 text-xs font-semibold text-gray-400">
                  {i + 1}
                </td>
                <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                  {team ? `${team.joueur1.prenom} & ${team.joueur2.prenom}` : row.teamId.slice(0, 8)}
                </td>
                <td className="text-center px-2 py-2.5 text-sm text-gray-500">{row.played}</td>
                <td className="text-center px-2 py-2.5 text-sm text-gray-500">{row.wins}</td>
                <td className="text-center px-2 py-2.5 text-sm text-gray-500">{row.losses}</td>
                <td className="text-center px-2 py-2.5 text-sm font-semibold text-gray-900">{row.points}</td>
                <td className={`text-center px-2 py-2.5 text-sm font-medium
                  ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {diff > 0 ? '+' : ''}{diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
