import type { PlayerIdentity } from '../../hooks/usePlayerIdentity'
import type { PlayerTemplate } from '../../types/tournament'

interface Phase {
  id: string
  name: string
}

interface PhaseNavProps {
  phases: Phase[]
  activePhaseId: string | null
  onSelect: (id: string) => void
  playerIdentity?: PlayerIdentity | null
  onUserClick?: () => void
  template?: PlayerTemplate
}

type NavStyles = {
  bg: string
  activeTab: string
  inactiveTab: string
  arrow: string
  divider: string
  avatar: string
  avatarText: string
  separator: string
  dot: string
  tabShape: string
}

function getNavStyles(template: PlayerTemplate): NavStyles {
  switch (template) {
    case 'slick-dark':
      return {
        bg: 'bg-[#062E38]',
        activeTab: 'bg-[#D4E800] text-[#062E38] font-black',
        inactiveTab: 'text-white/50 hover:text-white hover:bg-white/10',
        arrow: 'text-white/40 hover:text-white hover:bg-white/10',
        divider: 'bg-white/15',
        avatar: 'bg-[#D4E800]',
        avatarText: 'text-[#062E38]',
        separator: 'text-white/20',
        dot: 'text-white/20',
        tabShape: '[clip-path:polygon(6px_0%,100%_0%,calc(100%-6px)_100%,0%_100%)]',
      }
    case 'palm-springs':
      return {
        bg: 'bg-[#8C4732]',
        activeTab: 'bg-white/20 text-white',
        inactiveTab: 'text-white/60 hover:text-white hover:bg-white/10',
        arrow: 'text-white/50 hover:text-white hover:bg-white/10',
        divider: 'bg-white/15',
        avatar: 'bg-[#C84B31]',
        avatarText: 'text-white',
        separator: 'text-white/20',
        dot: 'text-white/20',
        tabShape: 'rounded-full',
      }
    case 'green-turf':
      return {
        bg: 'bg-[#B23A54]',
        activeTab: 'bg-[#E85D75] text-white',
        inactiveTab: 'text-white/70 hover:text-white hover:bg-white/15',
        arrow: 'text-white/60 hover:text-white hover:bg-white/15',
        divider: 'bg-white/20',
        avatar: 'bg-[#E85D75]',
        avatarText: 'text-white',
        separator: 'text-white/30',
        dot: 'text-white/30',
        tabShape: 'rounded-full',
      }
    default:
      return {
        bg: 'bg-navy-800',
        activeTab: 'bg-padel-blue text-white',
        inactiveTab: 'text-white/60 hover:text-white hover:bg-white/10',
        arrow: 'text-white/50 hover:text-white hover:bg-white/10',
        divider: 'bg-white/10',
        avatar: 'bg-padel-gold',
        avatarText: 'text-navy-900',
        separator: 'text-white/20',
        dot: 'text-white/20',
        tabShape: 'rounded-full',
      }
  }
}

export default function PhaseNav({
  phases,
  activePhaseId,
  onSelect,
  playerIdentity,
  onUserClick,
  template = 'default',
}: PhaseNavProps) {
  const s = getNavStyles(template)
  const activeIndex = phases.findIndex((p) => p.id === activePhaseId)

  const goPrev = () => { if (activeIndex > 0) onSelect(phases[activeIndex - 1].id) }
  const goNext = () => { if (activeIndex < phases.length - 1) onSelect(phases[activeIndex + 1].id) }

  const initials = playerIdentity ? playerIdentity.prenom.slice(0, 2).toUpperCase() : null

  return (
    <div className={`flex items-center ${s.bg} px-2 py-1.5`}>
      {/* Prev arrow */}
      <button
        onClick={goPrev}
        disabled={activeIndex <= 0}
        className={`p-1.5 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 shrink-0 ${s.arrow}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Phase tabs */}
      <div className="flex-1 flex items-center overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {phases.map((phase, index) => (
          <div key={phase.id} className="flex items-center shrink-0">
            <button
              onClick={() => onSelect(phase.id)}
              className={`px-3 py-1.5 text-sm font-semibold transition-all duration-150 whitespace-nowrap
                ${s.tabShape} ${phase.id === activePhaseId ? s.activeTab : s.inactiveTab}`}
            >
              {phase.name}
            </button>
            {index < phases.length - 1 && (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 mx-0.5 shrink-0 ${s.dot}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* Next arrow */}
      <button
        onClick={goNext}
        disabled={activeIndex >= phases.length - 1}
        className={`p-1.5 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 shrink-0 ${s.arrow}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Séparateur vertical */}
      <div className={`w-px h-5 mx-1.5 shrink-0 ${s.divider}`} />

      {/* Icône utilisateur */}
      <button onClick={onUserClick} className="shrink-0 transition-transform duration-150 active:scale-90" aria-label="Mon profil">
        {initials ? (
          <div className={`h-7 w-7 rounded-full flex items-center justify-center ${s.avatar}`}>
            <span className={`text-xs font-black leading-none ${s.avatarText}`}>{initials}</span>
          </div>
        ) : (
          <div className={`h-7 w-7 rounded-full flex items-center justify-center ${s.divider.replace('bg-', 'bg-')}`}
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/60" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </button>
    </div>
  )
}
