import { useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router'
import { useMatchStore } from '../store/matchStore'
import { useTournamentStore } from '../store/tournamentStore'
import type { Match } from '../types/tournament'

function StatusBadge({ statut }: { statut: Match['statut'] }) {
  const styles =
    statut === 'a_jouer'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-green-50 text-green-700 border-green-200'
  const label = statut === 'a_jouer' ? 'À jouer' : 'Terminé'
  return (
    <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles}`}>
      {label}
    </span>
  )
}

function TeamLabel({ label, teamId }: { label: string | null; teamId: string | null }) {
  if (teamId) {
    // TODO: afficher le nom de l'équipe quand assignée
    return <span className="text-sm text-gray-900">Équipe assignée</span>
  }
  if (label) {
    return <span className="text-sm text-gray-400 italic">{label}</span>
  }
  return <span className="text-sm text-gray-300 italic">À assigner</span>
}

export default function TournamentMatchesPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const resetMatches = useMatchStore((s) => s.reset)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const resetTournament = useTournamentStore((s) => s.reset)
  const nodes = useTournamentStore((s) => s.nodes)

  useEffect(() => {
    if (id) {
      loadTournament(id)
      loadMatches(id)
    }
    return () => {
      resetMatches()
      resetTournament()
    }
  }, [id, loadTournament, loadMatches, resetMatches, resetTournament])

  // Grouper les matchs par phase
  const matchesByPhase = useMemo(() => {
    const groups = new Map<string, { name: string; matches: Match[] }>()
    for (const match of matches) {
      if (!groups.has(match.phase_node_id)) {
        const node = nodes.find((n) => n.id === match.phase_node_id)
        groups.set(match.phase_node_id, {
          name: node?.data.config.name ?? match.phase_node_id,
          matches: [],
        })
      }
      groups.get(match.phase_node_id)!.matches.push(match)
    }
    return Array.from(groups.values())
  }, [matches, nodes])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-4 shrink-0">
        <Link
          to={`/tournament/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-150
            flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Designer
        </Link>

        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-gray-900">{tournamentName}</span>
          <span className="text-xs text-gray-400 ml-2">— Matchs</span>
        </div>

        <div className="text-xs text-gray-400">
          {matches.length} match{matches.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-sm">Aucun match généré</p>
            <Link to={`/tournament/${id}`} className="text-sm text-blue-600 hover:underline mt-2">
              Retour au designer
            </Link>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            {matchesByPhase.map(({ name, matches: phaseMatches }) => (
              <section key={name}>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  {name}
                  <span className="ml-2 text-gray-400 font-normal normal-case">
                    ({phaseMatches.length} match{phaseMatches.length > 1 ? 's' : ''})
                  </span>
                </h2>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5">Match</th>
                        <th className="text-left px-4 py-2.5">Équipe 1</th>
                        <th className="text-left px-4 py-2.5">Équipe 2</th>
                        <th className="text-left px-4 py-2.5">Horaire</th>
                        <th className="text-left px-4 py-2.5">Piste</th>
                        <th className="text-left px-4 py-2.5">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseMatches.map((match) => (
                        <tr
                          key={match.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50
                            transition-colors duration-100"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {match.nom}
                          </td>
                          <td className="px-4 py-3">
                            <TeamLabel label={match.equipe1_label} teamId={match.equipe1_id} />
                          </td>
                          <td className="px-4 py-3">
                            <TeamLabel label={match.equipe2_label} teamId={match.equipe2_id} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {match.horaire ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {match.piste ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge statut={match.statut} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
