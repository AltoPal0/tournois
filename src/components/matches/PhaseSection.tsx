import { useMemo } from 'react'
import type { Match, PhaseType, TeamWithJoueurs } from '../../types/tournament'
import { computeStandings } from '../../lib/standings'
import StandingsTable from './StandingsTable'
import ScoreInput from './ScoreInput'

interface PhaseSectionProps {
  name: string
  type: PhaseType
  matches: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
}

function TeamLabel({
  label,
  teamId,
  teamsMap,
}: {
  label: string | null
  teamId: string | null
  teamsMap: Map<string, TeamWithJoueurs>
}) {
  if (teamId) {
    const team = teamsMap.get(teamId)
    if (team) {
      return (
        <span className="text-sm text-gray-900">
          {team.joueur1.prenom} & {team.joueur2.prenom}
        </span>
      )
    }
    return <span className="text-sm text-gray-900">Équipe assignée</span>
  }
  if (label) {
    return <span className="text-sm text-gray-400 italic">{label}</span>
  }
  return <span className="text-sm text-gray-300 italic">À assigner</span>
}

function getRoundLabel(type: PhaseType, round: number | null, matches: Match[]): string {
  if (type === 'round_robin') {
    return `Tour ${round ?? '?'}`
  }
  // Pour l'élimination, extraire le nom du round depuis le nom du premier match
  const first = matches[0]
  if (first) {
    const nom = first.nom
    // "Quart de finale 1 de Tableau" → "Quart de finale"
    // "Finale de Tableau" → "Finale"
    const de = nom.lastIndexOf(' de ')
    if (de > 0) {
      const prefix = nom.slice(0, de)
      // Enlever le numéro final ("Quart de finale 1" → "Quart de finale")
      return prefix.replace(/\s+\d+$/, '')
    }
  }
  return `Round ${round ?? '?'}`
}

export default function PhaseSection({ name, type, matches, teamsMap }: PhaseSectionProps) {
  const standings = useMemo(
    () => (type === 'round_robin' ? computeStandings(matches) : []),
    [type, matches],
  )

  // Grouper les matchs par round
  const matchesByRound = useMemo(() => {
    const groups = new Map<number, Match[]>()
    for (const m of matches) {
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
  }, [matches, type])

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
        {name}
        <span className="ml-2 text-gray-400 font-normal normal-case">
          ({matches.length} match{matches.length > 1 ? 's' : ''})
        </span>
      </h2>

      {/* Classement pour les poules */}
      {type === 'round_robin' && standings.length > 0 && (
        <StandingsTable standings={standings} teamsMap={teamsMap} />
      )}

      {/* Matchs groupés par tour/round */}
      {matchesByRound.map(({ round, label, matches: roundMatches }) => (
        <div key={round} className="mb-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            {label}
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Match</th>
                  <th className="text-right px-4 py-2">Équipe 1</th>
                  <th className="text-center px-2 py-2 w-32">Score</th>
                  <th className="text-left px-4 py-2">Équipe 2</th>
                  <th className="text-left px-3 py-2 w-16">Piste</th>
                </tr>
              </thead>
              <tbody>
                {roundMatches.map((match) => (
                  <tr
                    key={match.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50
                      transition-colors duration-100"
                  >
                    <td className="px-4 py-2.5 text-sm text-gray-500">
                      {match.nom}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <TeamLabel label={match.equipe1_label} teamId={match.equipe1_id} teamsMap={teamsMap} />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <ScoreInput match={match} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TeamLabel label={match.equipe2_label} teamId={match.equipe2_id} teamsMap={teamsMap} />
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-400">
                      {match.piste ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}
