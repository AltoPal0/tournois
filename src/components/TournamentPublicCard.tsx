import { useNavigate } from 'react-router'
import type { Tournament } from '../types/tournament'

interface Props {
  tournament: Tournament
}

export default function TournamentPublicCard({ tournament }: Props) {
  const navigate = useNavigate()

  const isActive = tournament.status === 'active'
  const matchDate = tournament.tournament_config?.matchDate
  const formattedDate = matchDate
    ? new Date(matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const pos = tournament.tournament_config?.imagePosition

  return (
    <div
      onClick={() => navigate(`/tournament/${tournament.id}/matches`)}
      className="group relative bg-white rounded-3xl overflow-hidden cursor-pointer
        shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl
        border border-white/20 max-w-sm w-full"
    >
      {/* Image */}
      <div className="w-full h-52 overflow-hidden bg-gray-800">
        {tournament.image_url ? (
          <img
            src={tournament.image_url}
            alt={tournament.name}
            referrerPolicy="no-referrer"
            style={pos ? { objectPosition: `${pos.x}% ${pos.y}%` } : undefined}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Badge statut */}
      <div className="absolute top-4 right-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full shadow-sm
          ${isActive
            ? 'bg-orange-500 text-white'
            : 'bg-teal-500 text-white'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-orange-200 animate-pulse' : 'bg-teal-200'}`} />
          {isActive ? 'En cours' : 'Prêt à démarrer'}
        </span>
      </div>

      {/* Contenu */}
      <div className="px-5 py-4">
        <h2 className="text-lg font-bold text-gray-900 leading-snug mb-1">
          {tournament.name}
        </h2>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          {tournament.lieu && (
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{tournament.lieu}</span>
            </div>
          )}
          {formattedDate && (
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span>{formattedDate}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
            Voir le tournoi
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all duration-200" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </div>
  )
}
