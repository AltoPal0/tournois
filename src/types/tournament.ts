export type PhaseType = 'round_robin' | 'elimination' | 'super_americana'

export interface PhaseOutput {
  id: string
  rank: number
  label: string
}

export interface PhaseConfig {
  name: string
  type: PhaseType
  inputCount: number
  outputs: PhaseOutput[]
}

export interface PhaseNodeData {
  config: PhaseConfig
}

export interface SerializedNode {
  id: string
  position: { x: number; y: number }
  data: PhaseNodeData
}

export interface SerializedEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface TournamentGraph {
  nodes: SerializedNode[]
  edges: SerializedEdge[]
}

export interface Tournament {
  id: string
  name: string
  graph_config: TournamentGraph
  created_at: string
  updated_at: string
}
