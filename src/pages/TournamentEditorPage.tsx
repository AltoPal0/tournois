import { useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { useTournamentStore } from '../store/tournamentStore'
import FlowCanvas from '../components/editor/FlowCanvas'
import Sidebar from '../components/editor/Sidebar'
import PhaseConfigPanel from '../components/editor/PhaseConfigPanel'

export default function TournamentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const saveTournament = useTournamentStore((s) => s.saveTournament)
  const reset = useTournamentStore((s) => s.reset)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const setTournamentName = useTournamentStore((s) => s.setTournamentName)
  const isDirty = useTournamentStore((s) => s.isDirty)
  const isSaving = useTournamentStore((s) => s.isSaving)

  useEffect(() => {
    if (id) loadTournament(id)
    return () => reset()
  }, [id, loadTournament, reset])

  const handleSave = useCallback(() => {
    saveTournament()
  }, [saveTournament])

  // Ctrl+S / Cmd+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Top bar */}
        <div className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-4 shrink-0">
          <Link
            to="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-150
              flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Retour
          </Link>

          <div className="flex-1 flex justify-center">
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              className="text-center text-sm font-medium text-gray-900 bg-transparent border-none
                focus:outline-none focus:bg-gray-100 rounded-lg px-3 py-1.5
                hover:bg-gray-50 transition-colors duration-150 max-w-xs w-full"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
              bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]"
          >
            {isSaving ? (
              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isDirty ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            Sauver
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <FlowCanvas />
          <PhaseConfigPanel />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
