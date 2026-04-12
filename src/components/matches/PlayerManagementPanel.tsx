import { useMemo } from 'react'
import type { Match, TournamentGraph, TeamWithJoueurs, PhaseType } from '../../types/tournament'
import { computeInputSlotPairs } from '../../lib/matchGeneration'
import { useMatchStore } from '../../store/matchStore'

interface Props {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  graph: TournamentGraph
  matches: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
}

function teamDisplayName(team: TeamWithJoueurs): string {
  return `${team.joueur1.prenom} & ${team.joueur2.prenom}`
}

function buildSlotMap(
  phaseNodeId: string,
  type: PhaseType,
  inputCount: number,
  matches: Match[],
): Map<number, string | null> {
  if (type === 'super_americana') return new Map()
  const pairs = computeInputSlotPairs(type, inputCount)
  const phaseMatches = matches.filter((m) => m.phase_node_id === phaseNodeId)
  const slotMap = new Map<number, string | null>()

  for (const pair of pairs) {
    const match = phaseMatches.find((m) => m.ordre === pair.ordre)
    if (!match) continue
    if (!slotMap.has(pair.slot1)) slotMap.set(pair.slot1, match.equipe1_id)
    if (!slotMap.has(pair.slot2)) slotMap.set(pair.slot2, match.equipe2_id)
  }

  for (let i = 1; i <= inputCount; i++) {
    if (!slotMap.has(i)) slotMap.set(i, null)
  }

  return slotMap
}

export default function PlayerManagementPanel({
  isOpen,
  onClose,
  tournamentId,
  graph,
  matches,
  teamsMap,
}: Props) {
  const assignTeamToPhaseSlot = useMatchStore((s) => s.assignTeamToPhaseSlot)
  const assignRandomTeams = useMatchStore((s) => s.assignRandomTeams)
  const isAssigning = useMatchStore((s) => s.isAssigning)

  // Phases racines (sans arête entrante)
  const rootNodes = useMemo(
    () => graph.nodes.filter((n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana'),
    [graph],
  )

  // IDs de toutes les équipes actuellement assignées
  const assignedTeamIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of matches) {
      if (m.equipe1_id) ids.add(m.equipe1_id)
      if (m.equipe2_id) ids.add(m.equipe2_id)
    }
    return ids
  }, [matches])

  // Toutes les équipes triées par nom
  const allTeams = useMemo(
    () =>
      Array.from(teamsMap.values()).sort((a, b) =>
        teamDisplayName(a).localeCompare(teamDisplayName(b), 'fr'),
      ),
    [teamsMap],
  )

  const handleSlotChange = (phaseNodeId: string, slot: number, teamId: string | null) => {
    assignTeamToPhaseSlot(tournamentId, phaseNodeId, slot, teamId)
  }

  const handleRandomAssign = () => {
    assignRandomTeams(tournamentId, graph)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-96 bg-white border-l border-gray-200 shadow-2xl
          flex flex-col transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Gestion des joueurs</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {assignedTeamIds.size} équipe{assignedTeamIds.size > 1 ? 's' : ''} assignée{assignedTeamIds.size > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {rootNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
              Aucune phase racine trouvée
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rootNodes.map((node) => {
                const { name, type, inputCount } = node.data.config
                const slotMap = buildSlotMap(node.id, type, inputCount, matches)

                return (
                  <div key={node.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-800">{name}</h3>
                      <span className="text-xs text-gray-400">{inputCount} équipes</span>
                    </div>

                    <div className="space-y-2">
                      {Array.from({ length: inputCount }, (_, i) => i + 1).map((slot) => {
                        const currentTeamId = slotMap.get(slot) ?? null

                        return (
                          <div key={slot} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-14 shrink-0">Équipe {slot}</span>
                            <select
                              value={currentTeamId ?? ''}
                              onChange={(e) =>
                                handleSlotChange(node.id, slot, e.target.value || null)
                              }
                              className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5
                                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                                bg-white text-gray-800 transition-colors duration-150 cursor-pointer"
                            >
                              <option value="">— Non assigné</option>
                              {allTeams.map((team) => {
                                const isAssignedElsewhere =
                                  assignedTeamIds.has(team.id) && team.id !== currentTeamId
                                return (
                                  <option key={team.id} value={team.id}>
                                    {teamDisplayName(team)}
                                    {isAssignedElsewhere ? ' (assigné)' : ''}
                                  </option>
                                )
                              })}
                            </select>
                          </div>
                        )
                      })}
                    </div>

                    {/* Indicateur d'assignation */}
                    <div className="mt-3 flex items-center gap-1.5">
                      {Array.from({ length: inputCount }, (_, i) => i + 1).map((slot) => (
                        <div
                          key={slot}
                          className={`h-1.5 flex-1 rounded-full transition-colors duration-300
                            ${slotMap.get(slot) ? 'bg-blue-500' : 'bg-gray-200'}`}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleRandomAssign}
            disabled={isAssigning}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
              text-sm font-medium transition-all duration-200
              bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAssigning ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
              </svg>
            )}
            Répartition aléatoire
          </button>
        </div>
      </div>
    </>
  )
}
