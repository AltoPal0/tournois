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
]

export default function Sidebar() {
  function onDragStart(event: React.DragEvent, type: PhaseType) {
    event.dataTransfer.setData('application/tournois-phase', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-52 border-r border-gray-200 bg-white p-4 flex flex-col gap-3">
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
    </div>
  )
}
