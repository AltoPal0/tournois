import { useNavigate } from 'react-router'
import type { Tournament } from '../../types/tournament'

interface Props {
  tournament: Tournament
  onDelete: (id: string) => void
}

export default function TournamentCard({ tournament, onDelete }: Props) {
  const navigate = useNavigate()

  const formattedDate = new Date(tournament.updated_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const phaseCount = tournament.graph_config?.nodes?.length ?? 0

  return (
    <div
      onClick={() => navigate(`/tournament/${tournament.id}`)}
      className="group relative bg-white rounded-xl border border-gray-200 p-5 cursor-pointer
        transition-all duration-200 hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-medium text-gray-900 truncate">
            {tournament.name}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {phaseCount} phase{phaseCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(tournament.id)
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150
            p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
          title="Supprimer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-400">{formattedDate}</p>
    </div>
  )
}
