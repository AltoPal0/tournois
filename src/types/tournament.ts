export type PhaseType = 'round_robin' | 'elimination' | 'super_americana' | 'tournante_libre'

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
  setsCount?: 1 | 2 | 3
  roundCount?: number
  heureDebut?: string
  dureeMatch?: number
  reposMatch?: number
}

export interface TournamentConfig {
  sameDay: boolean
  matchDate: string | null
  imagePosition?: { x: number; y: number }
  pistes?: number[]
  joueursInscrits?: string[]
}

export interface PhaseNodeData extends Record<string, unknown> {
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

export type TournamentStatus = 'draft' | 'active' | 'completed'

export interface Tournament {
  id: string
  name: string
  graph_config: TournamentGraph
  created_at: string
  updated_at: string
  lieu: string | null
  image_url: string | null
  status: TournamentStatus
  tournament_config: TournamentConfig | null
}

export interface Joueur {
  id: string
  prenom: string
  created_at: string
}

export interface Team {
  id: string
  joueur1_id: string
  joueur2_id: string
  created_at: string
}

export interface TeamWithJoueurs {
  id: string
  joueur1: Pick<Joueur, 'id' | 'prenom'>
  joueur2: Pick<Joueur, 'id' | 'prenom'>
  created_at: string
}

export type MatchStatus = 'a_jouer' | 'termine'

export interface Match {
  id: string
  tournament_id: string
  phase_node_id: string
  nom: string
  statut: MatchStatus
  equipe1_id: string | null
  equipe2_id: string | null
  equipe1_label: string | null
  equipe2_label: string | null
  horaire: string | null
  piste: number | null
  ordre: number
  round: number | null
  score_equipe1: number | null
  score_equipe2: number | null
  created_at: string
}
