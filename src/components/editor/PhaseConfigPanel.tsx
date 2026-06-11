import { useReactFlow } from '@xyflow/react'
import { useTournamentStore } from '../../store/tournamentStore'
import type { PhaseType, PhaseConfig, PhaseOutput } from '../../types/tournament'

const phaseTypeOptions: { value: PhaseType; label: string }[] = [
  { value: 'round_robin', label: 'Poule (Round Robin)' },
  { value: 'elimination', label: 'Tableau (Élimination)' },
  { value: 'super_americana', label: 'Super Americana' },
  { value: 'tournante_libre', label: 'Tournante libre (Suisse)' },
  { value: 'match_simple', label: 'Match simple' },
  { value: 'americano', label: 'Américano' },
  { value: 'americana_single', label: 'Americana Single (individuel)' },
  { value: 'team_builder', label: 'Formation d\'équipes' },
  { value: 'team_splitter', label: 'Dissolution d\'équipes' },
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
  config: PhaseConfig
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

      {/* Nombre de rounds (tournante_libre et americano uniquement) */}
      {(config.type === 'tournante_libre' || config.type === 'americano') && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de rounds</label>
          <input
            type="number"
            min={2}
            max={8}
            value={config.roundCount ?? 4}
            onChange={(e) =>
              updatePhaseConfig(nodeId, {
                roundCount: Math.max(2, Math.min(8, parseInt(e.target.value) || 4)),
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
              transition-shadow duration-150"
          />
        </div>
      )}

      {/* Nombre de sets (pas pour team_builder/team_splitter) */}
      {config.type !== 'team_builder' && config.type !== 'team_splitter' && <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de sets</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => updatePhaseConfig(nodeId, { setsCount: n })}
              className={`flex-1 py-1.5 text-sm font-medium transition-colors duration-150
                ${(config.setsCount ?? 1) === n
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
                }
                ${n !== 1 ? 'border-l border-gray-200' : ''}
              `}
            >
              {n}
            </button>
          ))}
        </div>
      </div>}

      {/* Planification (pas pour team_builder/team_splitter) */}
      {config.type !== 'team_builder' && config.type !== 'team_splitter' &&
      <div className="flex flex-col gap-3">
        <label className="block text-xs font-medium text-gray-500">Planification</label>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Heure de début</label>
          <input
            type="time"
            value={config.heureDebut ?? ''}
            onChange={(e) => updatePhaseConfig(nodeId, { heureDebut: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              transition-shadow duration-150"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Durée d'un slot (min) — surcharge le global</label>
          <input
            type="number"
            min={1}
            value={config.dureeMatch ?? ''}
            placeholder="Défaut du tournoi"
            onChange={(e) =>
              updatePhaseConfig(nodeId, {
                dureeMatch: e.target.value ? Math.max(1, parseInt(e.target.value) || 1) : undefined,
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              transition-shadow duration-150"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Type de match — surcharge le global</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([
              { value: undefined, label: 'Hérite' },
              { value: 'time_fixed', label: 'Durée fixe' },
              { value: 'score_based', label: 'Par score' },
            ] as const).map(({ value, label }, i) => (
              <button
                key={String(value)}
                onClick={() => updatePhaseConfig(nodeId, { matchType: value })}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors duration-150
                  ${config.matchType === value
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'}
                  ${i !== 0 ? 'border-l border-gray-200' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>}

      {/* Input count — général */}
      {config.type !== 'match_simple' && config.type !== 'americana_single' && config.type !== 'team_builder' && config.type !== 'team_splitter' && (
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
      )}

      {/* Input count — team_builder (multiples de 2) */}
      {config.type === 'team_builder' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Nombre de joueurs (entrées)
          </label>
          <input
            type="number"
            min={4}
            max={32}
            step={2}
            value={config.inputCount}
            onChange={(e) => {
              const raw = parseInt(e.target.value) || 4
              const val = raw % 2 === 0 ? raw : raw + 1
              updatePhaseConfig(nodeId, { inputCount: Math.max(4, Math.min(32, val)) })
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              transition-shadow duration-150"
          />
          <p className="text-[11px] text-gray-400 mt-1">{config.inputCount} joueurs → {config.inputCount / 2} équipes</p>
        </div>
      )}

      {/* Input count — team_splitter */}
      {config.type === 'team_splitter' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Nombre d'équipes (entrées)
          </label>
          <input
            type="number"
            min={1}
            max={16}
            value={config.inputCount}
            onChange={(e) => {
              const val = Math.max(1, Math.min(16, parseInt(e.target.value) || 1))
              updatePhaseConfig(nodeId, { inputCount: val })
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent
              transition-shadow duration-150"
          />
          <p className="text-[11px] text-gray-400 mt-1">{config.inputCount} équipe{config.inputCount > 1 ? 's' : ''} → {config.inputCount * 2} joueurs</p>
        </div>
      )}

      {/* Joueurs en CSV (americana_single) */}
      {config.type === 'americana_single' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Joueurs (séparés par des virgules)
          </label>
          <textarea
            rows={3}
            value={config.playerNames ?? ''}
            placeholder="Alice, Bob, Carlos, Diana, Emma, Félix"
            onChange={(e) => {
              const names = e.target.value
              const count = names.split(',').map((s) => s.trim()).filter(Boolean).length
              updatePhaseConfig(nodeId, { playerNames: names, inputCount: count })
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none
              focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
              transition-shadow duration-150 font-mono"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            {(() => {
              const count = (config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean).length
              return count > 0 ? `${count} joueur${count > 1 ? 's' : ''}` : 'Aucun joueur'
            })()}
          </p>
        </div>
      )}

      {/* Nombre de matchs par batch (americana_single) */}
      {config.type === 'americana_single' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Matchs générés par batch
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={config.batchSize ?? 3}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val >= 1) updatePhaseConfig(nodeId, { batchSize: val })
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
              transition-shadow duration-150"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Nombre maximum de matchs générés à chaque clic (limité par le nombre de joueurs disponibles)
          </p>
        </div>
      )}

      {/* Modification joueurs live (americana_single) */}
      {config.type === 'americana_single' && (
        <div className="flex items-start justify-between gap-3 py-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium text-gray-500">Modification joueurs live</span>
            <div className="group relative shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 cursor-help" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-gray-900 text-white text-[11px] leading-relaxed
                opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl">
                Permet aux joueurs d'être mis en pause, retirés ou ajoutés pendant le tournoi sans affecter le classement. Un joueur en repos ne participe plus aux rotations mais reste dans le classement.
              </div>
            </div>
          </div>
          <button
            onClick={() => updatePhaseConfig(nodeId, { livePlayerManagement: !config.livePlayerManagement })}
            className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200
              ${config.livePlayerManagement ? 'bg-teal-500' : 'bg-gray-200'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
                ${config.livePlayerManagement ? 'translate-x-4.5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      )}

      {/* Outputs (pas pour team_builder/team_splitter : auto-calculés) */}
      {config.type !== 'team_builder' && config.type !== 'team_splitter' && <div>
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
      </div>}

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
