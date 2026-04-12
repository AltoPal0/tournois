import type { PhaseType } from '../../types/tournament'

const phaseTypes: { type: PhaseType; label: string; description: string; color: string; disabled?: boolean }[] = [
  {
    type: 'round_robin',
    label: 'Poule',
    description: 'Round Robin',
    color: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  {
    type: 'elimination',
    label: 'Tableau',
    description: 'Élimination directe',
    color: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  {
    type: 'super_americana',
    label: 'Super Americana',
    description: 'Format mixte (bientôt)',
    color: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    disabled: true,
  },
  {
    type: 'tournante_libre',
    label: 'Tournante libre',
    description: 'Suisse simplifié',
    color: 'border-violet-200 bg-violet-50 text-violet-700',
  },
]

export default function Sidebar({ onOpenConfig }: { onOpenConfig?: () => void }) {
  function onDragStart(event: React.DragEvent, type: PhaseType) {
    event.dataTransfer.setData('application/tournois-phase', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-52 border-r border-gray-200 bg-white p-4 flex flex-col gap-3 h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        Phases
      </p>
      {phaseTypes.map(({ type, label, description, color, disabled }) => (
        <div
          key={type}
          draggable={!disabled}
          onDragStart={disabled ? undefined : (e) => onDragStart(e, type)}
          className={`border rounded-lg px-3 py-2.5
            transition-transform duration-150 ${color}
            ${disabled
              ? 'opacity-40 cursor-not-allowed grayscale'
              : 'cursor-grab active:cursor-grabbing hover:scale-[1.02] hover:shadow-sm'
            }`}
        >
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] opacity-70">{description}</p>
        </div>
      ))}

      <div className="flex-1" />

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Config
        </p>
        <button
          onClick={onOpenConfig}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200
            bg-white text-gray-700 text-sm font-medium
            hover:bg-gray-50 hover:border-gray-300 transition-colors duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Paramètres
        </button>
      </div>
    </div>
  )
}
