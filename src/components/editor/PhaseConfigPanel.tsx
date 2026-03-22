import { useReactFlow } from '@xyflow/react'
import { useTournamentStore } from '../../store/tournamentStore'
import type { PhaseType, PhaseOutput } from '../../types/tournament'

const phaseTypeOptions: { value: PhaseType; label: string }[] = [
  { value: 'round_robin', label: 'Poule (Round Robin)' },
  { value: 'elimination', label: 'Tableau (Élimination)' },
  { value: 'super_americana', label: 'Super Americana' },
]

export default function PhaseConfigPanel() {
  const { fitView } = useReactFlow()
  const selectedNodeId = useTournamentStore((s) => s.selectedNodeId)
  const nodes = useTournamentStore((s) => s.nodes)
  const updatePhaseConfig = useTournamentStore((s) => s.updatePhaseConfig)
  const deleteNode = useTournamentStore((s) => s.deleteNode)
  const duplicateNode = useTournamentStore((s) => s.duplicateNode)

  const node = nodes.find((n) => n.id === selectedNodeId)
  const isOpen = !!node

  function handleDuplicate(nodeId: string) {
    duplicateNode(nodeId)
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
  }

  return (
    <div
      className={`w-80 border-l border-gray-200 bg-white overflow-y-auto
        transition-all duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      style={{ display: isOpen ? undefined : 'none' }}
    >
      {node && <PanelContent key={node.id} nodeId={node.id} config={node.data.config} updatePhaseConfig={updatePhaseConfig} deleteNode={deleteNode} onDuplicate={handleDuplicate} />}
    </div>
  )
}

function PanelContent({
  nodeId,
  config,
  updatePhaseConfig,
  deleteNode,
  onDuplicate,
}: {
  nodeId: string
  config: { name: string; type: PhaseType; inputCount: number; outputs: PhaseOutput[] }
  updatePhaseConfig: (nodeId: string, updates: Record<string, unknown>) => void
  deleteNode: (nodeId: string) => void
  onDuplicate: (nodeId: string) => void
}) {
  function addOutput() {
    const newRank = config.outputs.length + 1
    const newOutput: PhaseOutput = {
      id: `out-${newRank}`,
      rank: newRank,
      label: `${newRank}ème`,
    }
    updatePhaseConfig(nodeId, { outputs: [...config.outputs, newOutput] })
  }

  function removeOutput(index: number) {
    if (config.outputs.length <= 1) return
    updatePhaseConfig(nodeId, {
      outputs: config.outputs.filter((_, i) => i !== index),
    })
  }

  function updateOutputLabel(index: number, label: string) {
    const updated = config.outputs.map((o, i) => (i === index ? { ...o, label } : o))
    updatePhaseConfig(nodeId, { outputs: updated })
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Configuration
      </h3>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Nom de la phase</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => updatePhaseConfig(nodeId, { name: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-shadow duration-150"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
        <select
          value={config.type}
          onChange={(e) => updatePhaseConfig(nodeId, { type: e.target.value as PhaseType })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-shadow duration-150"
        >
          {phaseTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Input count */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Nombre d'équipes (entrées)
        </label>
        <input
          type="number"
          min={2}
          max={32}
          value={config.inputCount}
          onChange={(e) =>
            updatePhaseConfig(nodeId, {
              inputCount: Math.max(2, Math.min(32, parseInt(e.target.value) || 2)),
            })
          }
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-shadow duration-150"
        />
      </div>

      {/* Outputs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Sorties (classement)</label>
          <button
            onClick={addOutput}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium
              transition-colors duration-150"
          >
            + Ajouter
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {config.outputs.map((output, i) => (
            <div key={output.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-6 text-right">{output.rank}.</span>
              <input
                type="text"
                value={output.label}
                onChange={(e) => updateOutputLabel(i, e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-shadow duration-150"
              />
              {config.outputs.length > 1 && (
                <button
                  onClick={() => removeOutput(i)}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors duration-150"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Duplicate + Delete */}
      <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
        <button
          onClick={() => onDuplicate(nodeId)}
          className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg
            hover:bg-gray-200 transition-colors duration-150 font-medium"
        >
          Dupliquer la phase
        </button>
        <button
          onClick={() => {
            if (window.confirm('Supprimer cette phase ?')) {
              deleteNode(nodeId)
            }
          }}
          className="w-full px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg
            hover:bg-red-100 transition-colors duration-150 font-medium"
        >
          Supprimer la phase
        </button>
      </div>
    </div>
  )
}
