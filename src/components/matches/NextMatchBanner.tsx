import type { Match, TeamWithJoueurs, PlayerTemplate } from '../../types/tournament'

interface NextMatchBannerProps {
  match: Match
  teamsMap: Map<string, TeamWithJoueurs>
  template?: PlayerTemplate
  onClick?: () => void
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

type BannerStyles = {
  bg: string
  label: string
  teamText: string
  teamVs: string
  accent: string
  pingBg: string
}

function getBannerStyles(template: PlayerTemplate): BannerStyles {
  switch (template) {
    case 'slick-dark':
      return {
        bg: 'bg-[#D4E800] border-b-2 border-[#062E38]/20',
        label: 'text-[#0C5968]',
        teamText: 'text-[#062E38]',
        teamVs: 'text-[#062E38]/40',
        accent: 'text-[#0C5968]',
        pingBg: 'bg-[#062E38]/20',
      }
    case 'palm-springs':
      return {
        bg: 'bg-[#7A3B28] border-b border-white/10',
        label: 'text-orange-200',
        teamText: 'text-white',
        teamVs: 'text-white/40',
        accent: 'text-orange-200',
        pingBg: 'bg-orange-300/30',
      }
    case 'green-turf':
      return {
        bg: 'bg-[#B23A54] border-b border-[#B23A54]',
        label: 'text-[#FFF1E8]',
        teamText: 'text-white',
        teamVs: 'text-[#F7C6D0]',
        accent: 'text-[#F7C6D0]',
        pingBg: 'bg-[#F7C6D0]/30',
      }
    default:
      return {
        bg: 'bg-navy-900 border-b border-white/5',
        label: 'text-padel-gold',
        teamText: 'text-white',
        teamVs: 'text-white/40',
        accent: 'text-padel-gold',
        pingBg: 'bg-padel-gold/30',
      }
  }
}

export default function NextMatchBanner({ match, teamsMap, template = 'default', onClick }: NextMatchBannerProps) {
  const s = getBannerStyles(template)
  const team1 = getTeamName(match.equipe1_id, teamsMap)
  const team2 = getTeamName(match.equipe2_id, teamsMap)
  const horaire = formatTime(match.horaire)

  return (
    <button
      onClick={onClick}
      className={`w-full ${s.bg} px-4 py-2.5 flex items-center gap-3
        text-left active:opacity-70 transition-opacity cursor-pointer`}
    >
      {/* Icône éclair avec halo ping */}
      <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
        <div className={`absolute inset-0 rounded-full ${s.pingBg} animate-ping`} />
        <svg xmlns="http://www.w3.org/2000/svg" className={`relative h-4 w-4 ${s.accent}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
      </div>

      {/* Texte central */}
      <div className="flex-1 min-w-0">
        <div className={`${s.label} text-[9px] font-bold uppercase tracking-widest mb-0.5`}>
          Prochain match
        </div>
        <div className={`${s.teamText} text-sm font-semibold truncate`}>
          {team1} <span className={s.teamVs}>vs</span> {team2}
        </div>
      </div>

      {/* Horaire + piste */}
      <div className="shrink-0 text-right">
        {horaire && (
          <div className={`${s.accent} font-mono text-sm font-bold`}>{horaire}</div>
        )}
        {match.piste != null && (
          <div className={`${s.teamVs} text-xs`}>Piste {match.piste}</div>
        )}
      </div>
    </button>
  )
}
