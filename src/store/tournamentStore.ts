import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'
import type { PhaseType, PhaseConfig, PhaseNodeData, PhaseOutput, TournamentStatus, TournamentConfig } from '../types/tournament'
import { supabase } from '../lib/supabase'

function generateId() {
  return crypto.randomUUID()
}

function createDefaultOutputs(type: PhaseType, inputCount?: number): PhaseOutput[] {
  const configs: Record<PhaseType, { count: number; labels: string[] }> = {
    round_robin: { count: 2, labels: ['1er', '2ème'] },
    elimination: { count: 3, labels: ['1er', '2ème', '3ème'] },
    super_americana: { count: 3, labels: ['1er', '2ème', '3ème'] },
    tournante_libre: { count: 2, labels: ['1er', '2ème'] },
    match_simple: { count: 2, labels: ['Vainqueur', 'Perdant'] },
    americano: { count: 2, labels: ['1er', '2ème'] },
    americana_single: { count: 3, labels: ['1er', '2ème', '3ème'] },
    americana_weighted: { count: 3, labels: ['1er', '2ème', '3ème'] },
    best_of: { count: 3, labels: ['1er meilleur', '2ème meilleur', '3ème meilleur'] },
    team_builder: { count: (inputCount ?? 4) / 2, labels: Array.from({ length: (inputCount ?? 4) / 2 }, (_, i) => `Équipe ${i + 1}`) },
    team_splitter: { count: (inputCount ?? 2) * 2, labels: Array.from({ length: (inputCount ?? 2) * 2 }, (_, i) => `J${i + 1}`) },
  }
  const { count, labels } = configs[type]
  return Array.from({ length: count }, (_, i) => ({
    id: `out-${i + 1}`,
    rank: i + 1,
    label: labels[i] ?? `${i + 1}ème`,
  }))
}

function createDefaultConfig(type: PhaseType): PhaseConfig {
  const names: Record<PhaseType, string> = {
    round_robin: 'Poule',
    elimination: 'Tableau',
    super_americana: 'Super Americana',
    tournante_libre: 'Tournante libre',
    match_simple: 'Match',
    americano: 'Américano',
    americana_single: 'Americana Single',
    americana_weighted: 'Americana Pondérée',
    best_of: 'Meilleurs N',
    team_builder: 'Formation d\'équipes',
    team_splitter: 'Dissolution d\'équipes',
  }
  const inputCounts: Record<PhaseType, number> = {
    round_robin: 4,
    elimination: 8,
    super_americana: 6,
    tournante_libre: 10,
    match_simple: 2,
    americano: 6,
    americana_single: 8,
    americana_weighted: 8,
    best_of: 3,
    team_builder: 4,
    team_splitter: 2,
  }
  const count = inputCounts[type]
  return {
    name: names[type],
    type,
    inputCount: count,
    outputs: createDefaultOutputs(type, count),
    setsCount: 1 as const,
    roundCount: (type === 'tournante_libre' || type === 'americano' || type === 'americana_weighted') ? 3 : undefined,
    playerNames: (type === 'americana_single' || type === 'americana_weighted') ? '' : undefined,
    internalPairs: (type === 'team_builder' || type === 'team_splitter') ? [] : undefined,
  }
}

export interface TournamentState {
  tournamentId: string | null
  tournamentName: string
  tournamentLieu: string | null
  tournamentImageUrl: string | null
  tournamentStatus: TournamentStatus
  tournamentConfig: TournamentConfig
  nodes: Node<PhaseNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null
  isDirty: boolean
  isSaving: boolean

  onNodesChange: OnNodesChange<Node<PhaseNodeData>>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  setSelectedNodeId: (id: string | null) => void
  addPhaseNode: (type: PhaseType, position: { x: number; y: number }) => void
  updatePhaseConfig: (nodeId: string, updates: Partial<PhaseConfig>) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  setTournamentName: (name: string) => void
  setTournamentLieu: (lieu: string | null) => void
  setTournamentImageUrl: (url: string | null) => void
  setTournamentStatus: (status: TournamentStatus) => void
  setTournamentConfig: (config: TournamentConfig) => void

  loadTournament: (id: string) => Promise<void>
  saveTournament: () => Promise<void>
  duplicateTournament: (newName: string) => Promise<string | null>
  reset: () => void
}

export const useTournamentStore = create<TournamentState>((set, get) => ({
  tournamentId: null,
  tournamentName: 'Nouveau Tournoi',
  tournamentLieu: null,
  tournamentImageUrl: null,
  tournamentStatus: 'draft',
  tournamentConfig: { sameDay: false, matchDate: null },
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }))
  },

  onConnect: (connection: Connection) => {
    const { edges } = get()

    // Enforce 1-to-1: reject if sourceHandle or targetHandle already used
    const sourceUsed = edges.some(
      (e) => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
    )
    const targetUsed = edges.some(
      (e) => e.target === connection.target && e.targetHandle === connection.targetHandle,
    )
    if (sourceUsed || targetUsed) return

    set((state) => ({
      edges: addEdge({ ...connection, id: generateId() }, state.edges),
      isDirty: true,
    }))
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  addPhaseNode: (type, position) => {
    const config = createDefaultConfig(type)
    const newNode: Node<PhaseNodeData> = {
      id: generateId(),
      type: 'phase',
      position,
      data: { config },
    }
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }))
  },

  updatePhaseConfig: (nodeId, updates) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId)
      if (!node) return state

      const oldConfig = node.data.config
      const newConfig = { ...oldConfig, ...updates }

      // If outputs changed, rebuild output ids
      if (updates.outputs) {
        newConfig.outputs = updates.outputs.map((o, i) => ({
          ...o,
          id: `out-${i + 1}`,
          rank: i + 1,
        }))
      }

      // Pour team_builder/team_splitter, recalculer les outputs automatiquement si inputCount change
      if (
        updates.inputCount !== undefined &&
        (newConfig.type === 'team_builder' || newConfig.type === 'team_splitter')
      ) {
        const newOutputs = createDefaultOutputs(newConfig.type, updates.inputCount)
        newConfig.outputs = newOutputs
        newConfig.internalPairs = []
      }

      const updatedNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: newConfig } } : n,
      )

      // Clean up edges connected to removed handles
      let updatedEdges = state.edges
      const oldInputCount = oldConfig.inputCount
      const newInputCount = newConfig.inputCount
      const oldOutputCount = oldConfig.outputs.length
      const newOutputCount = newConfig.outputs.length

      if (newInputCount < oldInputCount) {
        updatedEdges = updatedEdges.filter((e) => {
          if (e.target !== nodeId) return true
          const handleNum = parseInt(e.targetHandle?.replace('in-', '') ?? '0')
          return handleNum <= newInputCount
        })
      }

      if (newOutputCount < oldOutputCount) {
        updatedEdges = updatedEdges.filter((e) => {
          if (e.source !== nodeId) return true
          const handleNum = parseInt(e.sourceHandle?.replace('out-', '') ?? '0')
          return handleNum <= newOutputCount
        })
      }

      return { nodes: updatedNodes, edges: updatedEdges, isDirty: true }
    })
  },

  deleteNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      isDirty: true,
    }))
  },

  duplicateNode: (nodeId) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId)
      if (!node) return state

      const nodeHeight = node.measured?.height ?? 120
      const gap = 30

      const newNode: Node<PhaseNodeData> = {
        id: generateId(),
        type: 'phase',
        position: { x: node.position.x, y: node.position.y + nodeHeight + gap },
        data: {
          config: {
            ...node.data.config,
            name: `${node.data.config.name} (copie)`,
            outputs: node.data.config.outputs.map((o, i) => ({
              ...o,
              id: `out-${i + 1}`,
            })),
          },
        },
      }

      return {
        nodes: [...state.nodes, newNode],
        selectedNodeId: newNode.id,
        isDirty: true,
      }
    })
  },

  setTournamentName: (name) => set({ tournamentName: name, isDirty: true }),
  setTournamentLieu: (lieu) => set({ tournamentLieu: lieu, isDirty: true }),
  setTournamentImageUrl: (url) => set({ tournamentImageUrl: url, isDirty: true }),
  setTournamentStatus: (status) => set({ tournamentStatus: status }),
  setTournamentConfig: (config) => set({ tournamentConfig: config, isDirty: true }),

  loadTournament: async (id) => {
    const { data, error } = await supabase
      .from('tt_tournaments')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return

    const graph = data.graph_config ?? { nodes: [], edges: [] }
    const nodes: Node<PhaseNodeData>[] = graph.nodes.map((n: { id: string; position: { x: number; y: number }; data: PhaseNodeData }) => ({
      ...n,
      type: 'phase',
    }))

    set({
      tournamentId: data.id,
      tournamentName: data.name,
      tournamentLieu: data.lieu ?? null,
      tournamentImageUrl: data.image_url ?? null,
      tournamentStatus: (data.status ?? 'draft') as TournamentStatus,
      tournamentConfig: (data.tournament_config as TournamentConfig | null) ?? { sameDay: false, matchDate: null },
      nodes,
      edges: graph.edges ?? [],
      isDirty: false,
      selectedNodeId: null,
    })
  },

  saveTournament: async () => {
    const { tournamentId, tournamentName, tournamentLieu, tournamentImageUrl, tournamentConfig, nodes, edges } = get()
    if (!tournamentId) return

    set({ isSaving: true })

    const graphConfig = {
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      })),
    }

    await supabase
      .from('tt_tournaments')
      .update({ name: tournamentName, graph_config: graphConfig, lieu: tournamentLieu, image_url: tournamentImageUrl, tournament_config: tournamentConfig, status: get().tournamentStatus })
      .eq('id', tournamentId)

    set({ isDirty: false, isSaving: false })
  },

  duplicateTournament: async (newName) => {
    const { tournamentName, tournamentLieu, tournamentImageUrl, tournamentConfig, nodes, edges } = get()

    const graphConfig = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
    }

    const { data, error } = await supabase
      .from('tt_tournaments')
      .insert({
        name: newName || `${tournamentName} (copie)`,
        lieu: tournamentLieu,
        image_url: tournamentImageUrl,
        tournament_config: tournamentConfig,
        graph_config: graphConfig,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error || !data) return null
    return data.id as string
  },

  reset: () =>
    set({
      tournamentId: null,
      tournamentName: 'Nouveau Tournoi',
      tournamentLieu: null,
      tournamentImageUrl: null,
      tournamentStatus: 'draft',
      tournamentConfig: { sameDay: false, matchDate: null },
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isDirty: false,
      isSaving: false,
    }),
}))
