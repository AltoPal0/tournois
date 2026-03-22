import { memo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react'
import type { PhaseNodeData } from '../../types/tournament'

const typeStyles = {
  round_robin: {
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
    selectedRing: 'ring-blue-500',
    label: 'Poule',
  },
  elimination: {
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-200',
    selectedRing: 'ring-orange-500',
    label: 'Élimination',
  },
  super_americana: {
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    selectedRing: 'ring-emerald-500',
    label: 'Super Americana',
  },
}

function PhaseNode({ id, data, selected }: NodeProps<Node<PhaseNodeData>>) {
  const { config } = data
  const style = typeStyles[config.type]
  const maxHandles = Math.max(config.inputCount, config.outputs.length)
  const minHeight = Math.max(120, maxHandles * 28)

  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, config.inputCount, config.outputs.length, updateNodeInternals])

  return (
    <div
      className={`relative bg-white rounded-xl border ${style.border} px-4 py-3 min-w-[200px]
        transition-all duration-200 hover:shadow-lg
        ${selected ? `ring-2 ${style.selectedRing} shadow-md` : 'shadow-sm'}`}
      style={{ minHeight }}
    >
      {/* Input handles */}
      {Array.from({ length: config.inputCount }, (_, i) => (
        <Handle
          key={`in-${i + 1}`}
          type="target"
          position={Position.Left}
          id={`in-${i + 1}`}
          className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white hover:!bg-gray-500
            !transition-all !duration-150 hover:!scale-150"
          style={{ top: `${((i + 1) / (config.inputCount + 1)) * 100}%` }}
        />
      ))}

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <span className={`inline-flex self-start text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm font-medium text-gray-900 truncate">
          {config.name}
        </span>
        <span className="text-xs text-gray-400">
          {config.inputCount} équipe{config.inputCount > 1 ? 's' : ''}
        </span>
      </div>

      {/* Output handles */}
      {config.outputs.map((output, i) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white hover:!bg-gray-500
            !transition-all !duration-150 hover:!scale-150"
          style={{ top: `${((i + 1) / (config.outputs.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  )
}

export default memo(PhaseNode)
