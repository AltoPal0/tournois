import { useNavigate } from 'react-router'
import type { Tournament, TournamentStatus } from '../../types/tournament'

interface Props {
  tournament: Tournament
}

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  completed: 'Terminé',
}

const STATUS_CLASSES: Record<TournamentStatus, string> = {
  draft: 'bg-gray-100 text-gray-500',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

export default function TournamentCard({ tournament }: Props) {
  const navigate = useNavigate()

  const matchDate = tournament.tournament_config?.matchDate
  const formattedDate = matchDate
    ? new Date(matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const status = tournament.status ?? 'draft'

  return (
    <div
      onClick={() => navigate(`/tournament/${tournament.id}/matches`)}
      className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer
        shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:border-gray-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <h3 className="text-base font-semibold text-gray-900 leading-snug pr-2 line-clamp-2">
          {tournament.name}
        </h3>

        {/* Gear icon → editor */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/tournament/${tournament.id}`)
          }}
          title="Configurer le tournoi"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150
            p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Image */}
      <div className="w-full h-36 overflow-hidden bg-gray-100">
        {(() => {
          const pos = tournament.tournament_config?.imagePosition
          return (
            <img
              src={tournament.image_url ?? ''}
              alt={tournament.name}
              referrerPolicy="no-referrer"
              style={pos ? { objectPosition: `${pos.x}% ${pos.y}%` } : undefined}
              className="w-full h-full object-cover"
            />
          )
        })()}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 space-y-1.5">
        {/* Lieu */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          {tournament.lieu ? (
            <span className="truncate">{tournament.lieu}</span>
          ) : (
            <span className="text-gray-300 italic">Lieu non renseigné</span>
          )}
        </div>

        {/* Date + statut */}
        <div className="flex items-center justify-between">
          {formattedDate ? (
            <span className="text-xs text-gray-400">{formattedDate}</span>
          ) : (
            <span className="text-xs text-gray-300 italic">Date non renseignée</span>
          )}
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>
    </div>
  )
}
