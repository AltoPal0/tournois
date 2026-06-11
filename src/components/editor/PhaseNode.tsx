import { memo, useEffect, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react'
import type { PhaseNodeData } from '../../types/tournament'
import { useTournamentStore } from '../../store/tournamentStore'

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
  americana_single: {
    badge: 'bg-teal-100 text-teal-700',
    border: 'border-teal-200',
    selectedRing: 'ring-teal-500',
    label: 'Americana Single',
  },
  tournante_libre: {
    badge: 'bg-violet-100 text-violet-700',
    border: 'border-violet-200',
    selectedRing: 'ring-violet-500',
    label: 'Tournante',
  },
  match_simple: {
    badge: 'bg-rose-100 text-rose-700',
    border: 'border-rose-200',
    selectedRing: 'ring-rose-500',
    label: 'Match',
  },
  americano: {
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
    selectedRing: 'ring-amber-500',
    label: 'Américano',
  },
  best_of: {
    badge: 'bg-purple-100 text-purple-700',
    border: 'border-purple-200',
    selectedRing: 'ring-purple-500',
    label: 'Meilleurs N',
  },
  team_builder: {
    badge: 'bg-indigo-100 text-indigo-700',
    border: 'border-indigo-200',
    selectedRing: 'ring-indigo-500',
    label: 'Formation',
  },
  team_splitter: {
    badge: 'bg-cyan-100 text-cyan-700',
    border: 'border-cyan-200',
    selectedRing: 'ring-cyan-500',
    label: 'Dissolution',
  },
}

function SlotDiagram({ nodeId, config }: { nodeId: string; config: PhaseNodeData['config'] }) {
  const updatePhaseConfig = useTournamentStore((s) => s.updatePhaseConfig)
  const [selectedInput, setSelectedInput] = useState<number | null>(null)

  const inputCount = config.inputCount
  const outputCount = config.outputs.length
  const rows = Math.max(inputCount, outputCount)
  const ROW_H = 28
  const COL_W = 70
  const CIRC_R = 8
  const svgH = rows * ROW_H
  const svgW = COL_W * 2 + 40
  const leftX = CIRC_R + 4
  const rightX = svgW - CIRC_R - 4
  const pairs = config.internalPairs ?? []

  const inputLabel = config.type === 'team_splitter' ? 'Éq.' : 'J'
  const outputLabel = config.type === 'team_splitter' ? 'J' : 'Éq.'

  function cy(index: number, total: number): number {
    return ((index + 0.5) / total) * svgH
  }

  function handleClickOutput(outputSlot: number) {
    if (selectedInput === null) return
    const inputSlot = selectedInput

    const maxPerOutput = config.type === 'team_builder' ? 2 : 1
    const outputOccupancy = pairs.filter((p) => p.outputSlot === outputSlot).length
    if (outputOccupancy >= maxPerOutput) { setSelectedInput(null); return }

    const alreadyLinked = pairs.some((p) => p.inputSlot === inputSlot && p.outputSlot === outputSlot)
    if (alreadyLinked) { setSelectedInput(null); return }

    const newPairs = [...pairs, { inputSlot, outputSlot }]
    updatePhaseConfig(nodeId, { internalPairs: newPairs })
    setSelectedInput(null)
  }

  function removePair(inputSlot: number, outputSlot: number) {
    updatePhaseConfig(nodeId, {
      internalPairs: pairs.filter((p) => !(p.inputSlot === inputSlot && p.outputSlot === outputSlot)),
    })
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      className="overflow-visible"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Lines */}
      {pairs.map((p, idx) => {
        const x1 = leftX + CIRC_R
        const y1 = cy(p.inputSlot - 1, inputCount)
        const x2 = rightX - CIRC_R
        const y2 = cy(p.outputSlot - 1, outputCount)
        return (
          <line
            key={idx}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#6366f1"
            strokeWidth={2}
            strokeOpacity={0.7}
            className="cursor-pointer hover:stroke-red-500"
            onClick={() => removePair(p.inputSlot, p.outputSlot)}
          />
        )
      })}

      {/* Input circles */}
      {Array.from({ length: inputCount }, (_, i) => {
        const slot = i + 1
        const cx = leftX
        const cy_ = cy(i, inputCount)
        const isSelected = selectedInput === slot
        return (
          <g key={`in-${slot}`} className="cursor-pointer" onClick={() => setSelectedInput(isSelected ? null : slot)}>
            <circle cx={cx} cy={cy_} r={CIRC_R} fill={isSelected ? '#6366f1' : '#e0e7ff'} stroke="#6366f1" strokeWidth={1.5} />
            <text x={cx} y={cy_ + 4} textAnchor="middle" fontSize={8} fill={isSelected ? 'white' : '#4338ca'} fontWeight="bold">
              {inputLabel}{slot}
            </text>
          </g>
        )
      })}

      {/* Output circles */}
      {Array.from({ length: outputCount }, (_, i) => {
        const slot = i + 1
        const cx = rightX
        const cy_ = cy(i, outputCount)
        const occupancy = pairs.filter((p) => p.outputSlot === slot).length
        const maxPerOutput = config.type === 'team_builder' ? 2 : 1
        const isFull = occupancy >= maxPerOutput
        const isClickable = selectedInput !== null && !isFull
        return (
          <g key={`out-${slot}`} className={isClickable ? 'cursor-pointer' : ''} onClick={() => handleClickOutput(slot)}>
            <circle cx={cx} cy={cy_} r={CIRC_R} fill={isFull ? '#a5f3fc' : '#e0e7ff'} stroke={isClickable ? '#6366f1' : '#94a3b8'} strokeWidth={1.5} />
            <text x={cx} y={cy_ + 4} textAnchor="middle" fontSize={8} fill={isFull ? '#0e7490' : '#4338ca'} fontWeight="bold">
              {outputLabel}{slot}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PhaseNode({ id, data, selected }: NodeProps<Node<PhaseNodeData>>) {
  const { config } = data
  const style = typeStyles[config.type]
  const isSlotDiagram = config.type === 'team_builder' || config.type === 'team_splitter'
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
        {isSlotDiagram ? (
          <SlotDiagram nodeId={id} config={config} />
        ) : (
          <span className="text-xs text-gray-400">
            {config.inputCount} équipe{config.inputCount > 1 ? 's' : ''}
          </span>
        )}
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
