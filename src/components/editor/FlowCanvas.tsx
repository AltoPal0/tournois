import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTournamentStore } from '../../store/tournamentStore'
import type { PhaseType } from '../../types/tournament'
import PhaseNode from './PhaseNode'

const nodeTypes = { phase: PhaseNode }

function FlowCanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)
  const onNodesChange = useTournamentStore((s) => s.onNodesChange)
  const onEdgesChange = useTournamentStore((s) => s.onEdgesChange)
  const onConnect = useTournamentStore((s) => s.onConnect)
  const addPhaseNode = useTournamentStore((s) => s.addPhaseNode)
  const setSelectedNodeId = useTournamentStore((s) => s.setSelectedNodeId)

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      // No self-connections
      if (connection.source === connection.target) return false

      // 1-to-1: check if handles are already used
      const sourceUsed = edges.some(
        (e) => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
      )
      const targetUsed = edges.some(
        (e) => e.target === connection.target && e.targetHandle === connection.targetHandle,
      )

      return !sourceUsed && !targetUsed
    },
    [edges],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/tournois-phase') as PhaseType
      if (!type) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      addPhaseNode(type, position)
    },
    [screenToFlowPosition, addPhaseNode],
  )

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        className="bg-gray-50"
      >
        <Controls className="!rounded-lg !border-gray-200 !shadow-sm" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
        <MiniMap
          className="!rounded-lg !border-gray-200 !shadow-sm"
          nodeColor="#e5e7eb"
          maskColor="rgba(0,0,0,0.08)"
        />
      </ReactFlow>
    </div>
  )
}

export default function FlowCanvas() {
  return <FlowCanvasInner />
}
