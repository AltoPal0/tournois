
interface Phase {
  id: string
  name: string
}

interface PhaseNavProps {
  phases: Phase[]
  activePhaseId: string | null
  onSelect: (id: string) => void
}

export default function PhaseNav({ phases, activePhaseId, onSelect }: PhaseNavProps) {
  const activeIndex = phases.findIndex((p) => p.id === activePhaseId)

  const goPrev = () => {
    if (activeIndex > 0) onSelect(phases[activeIndex - 1].id)
  }

  const goNext = () => {
    if (activeIndex < phases.length - 1) onSelect(phases[activeIndex + 1].id)
  }

  return (
    <div className="flex items-center bg-navy-800 px-2 py-1.5">
      {/* Prev arrow */}
      <button
        onClick={goPrev}
        disabled={activeIndex <= 0}
        className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10
          disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Phase tabs — zone scrollable */}
      <div className="flex-1 flex items-center overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {phases.map((phase, index) => (
          <div key={phase.id} className="flex items-center shrink-0">
            <button
              onClick={() => onSelect(phase.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 whitespace-nowrap
                ${phase.id === activePhaseId
                  ? 'bg-padel-blue text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
            >
              {phase.name}
            </button>
            {index < phases.length - 1 && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white/20 mx-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
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
        className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10
          disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

    </div>
  )
}
