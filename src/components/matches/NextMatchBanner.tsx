import type { Match, TeamWithJoueurs } from '../../types/tournament'

interface NextMatchBannerProps {
  match: Match
  teamsMap: Map<string, TeamWithJoueurs>
}

function getTeamName(id: string | null | undefined, teamsMap: Map<string, TeamWithJoueurs>): string {
  if (!id) return '?'
  const t = teamsMap.get(id)
  return t ? `${t.joueur1.prenom} & ${t.joueur2.prenom}` : '?'
}

function formatTime(horaire: string | null | undefined): string | null {
  if (!horaire) return null
  const tIdx = horaire.indexOf('T')
  if (tIdx >= 0) return horaire.slice(tIdx + 1, tIdx + 6)
  if (horaire.includes(':')) return horaire.slice(0, 5)
  return null
}

export default function NextMatchBanner({ match, teamsMap }: NextMatchBannerProps) {
  const team1 = getTeamName(match.equipe1_id, teamsMap)
  const team2 = getTeamName(match.equipe2_id, teamsMap)
  const horaire = formatTime(match.horaire)

  return (
    <div className="bg-navy-900 border-b border-white/5 px-4 py-2.5 flex items-center gap-3">
      {/* Icône éclair */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-padel-gold shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
      </svg>

      {/* Texte central */}
      <div className="flex-1 min-w-0">
        <div className="text-padel-gold text-[9px] font-bold uppercase tracking-widest mb-0.5">
          Prochain match
        </div>
        <div className="text-white text-sm font-semibold truncate">
          {team1} <span className="text-white/40">vs</span> {team2}
        </div>
      </div>

      {/* Horaire + piste */}
      <div className="shrink-0 text-right">
        {horaire && (
          <div className="text-padel-gold font-mono text-sm font-bold">{horaire}</div>
        )}
        {match.piste != null && (
          <div className="text-white/50 text-xs">Piste {match.piste}</div>
        )}
      </div>
    </div>
  )
}
