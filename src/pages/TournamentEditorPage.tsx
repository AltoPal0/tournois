import { useEffect, useCallback, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { useTournamentStore } from '../store/tournamentStore'
import { useMatchStore } from '../store/matchStore'
import { supabase } from '../lib/supabase'
import FlowCanvas from '../components/editor/FlowCanvas'
import Sidebar from '../components/editor/Sidebar'
import PhaseConfigPanel from '../components/editor/PhaseConfigPanel'
import TournamentConfigOverlay from '../components/editor/TournamentConfigOverlay'

export default function TournamentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const saveTournament = useTournamentStore((s) => s.saveTournament)
  const reset = useTournamentStore((s) => s.reset)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const setTournamentName = useTournamentStore((s) => s.setTournamentName)
  const tournamentLieu = useTournamentStore((s) => s.tournamentLieu)
  const setTournamentLieu = useTournamentStore((s) => s.setTournamentLieu)
const isDirty = useTournamentStore((s) => s.isDirty)
  const isSaving = useTournamentStore((s) => s.isSaving)
  const tournamentStatus = useTournamentStore((s) => s.tournamentStatus)
  const setTournamentStatus = useTournamentStore((s) => s.setTournamentStatus)
  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)
  const generateMatches = useMatchStore((s) => s.generateMatches)
  const resetScores = useMatchStore((s) => s.resetScores)
  const clearMatches = useMatchStore((s) => s.clearMatches)
  const isGenerating = useMatchStore((s) => s.isGenerating)
  const matches = useMatchStore((s) => s.matches)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showConfigOverlay, setShowConfigOverlay] = useState(false)
  const [showActiveConfirm, setShowActiveConfirm] = useState(false)

  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)

  const canViewSchedule =
    (tournamentConfig.pistes?.length ?? 0) > 0 &&
    matches.some((m) => m.horaire != null)

  useEffect(() => {
    if (id) {
      loadTournament(id)
      loadMatches(id)
    }
    return () => reset()
  }, [id, loadTournament, loadMatches, reset])

  const handleSave = useCallback(() => {
    if (tournamentStatus === 'active') {
      setShowActiveConfirm(true)
    } else {
      saveTournament()
    }
  }, [tournamentStatus, saveTournament])

  const handleSaveActiveConfirmed = useCallback(async () => {
    if (!id) return
    setShowActiveConfirm(false)
    await resetScores(id)
    setTournamentStatus('draft')
    saveTournament()
  }, [id, resetScores, setTournamentStatus, saveTournament])

  const handleDeleteTournament = useCallback(async () => {
    if (!id) return
    await clearMatches(id)
    await supabase.from('tt_tournaments').delete().eq('id', id)
    navigate('/')
  }, [id, clearMatches, navigate])

  const handleGenerate = useCallback(async () => {
    if (!id) return
    const graph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }
    await generateMatches(id, graph)
    setShowConfirm(false)
    navigate(`/tournament/${id}/matches`)
  }, [id, nodes, edges, generateMatches, navigate])

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

          <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
            {/* Nom */}
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              placeholder="Nom du tournoi"
              className="text-center text-sm font-medium text-gray-900 bg-transparent border-none
                focus:outline-none focus:bg-gray-100 rounded-lg px-3 py-1.5
                hover:bg-gray-50 transition-colors duration-150 w-44"
            />
            <span className="text-gray-200 select-none">|</span>
            {/* Lieu */}
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                value={tournamentLieu ?? ''}
                onChange={(e) => setTournamentLieu(e.target.value || null)}
                placeholder="Lieu"
                className="text-sm text-gray-700 bg-transparent border-none focus:outline-none
                  focus:bg-gray-100 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors duration-150 w-36"
              />
            </div>
          </div>

          {canViewSchedule && (
            <button
              onClick={() => navigate(`/tournament/${id}/schedule`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                transition-all duration-200
                bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L13 10.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-6.586L3.293 6.707A1 1 0 013 6V4z" clipRule="evenodd" />
              </svg>
              Planning des pistes
            </button>
          )}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={isDirty || isGenerating || nodes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
              bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]"
          >
            {isGenerating ? (
              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
            )}
            Générer les matchs
          </button>

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
          <Sidebar onOpenConfig={() => setShowConfigOverlay(true)} />
          <FlowCanvas />
          <PhaseConfigPanel />
        </div>
      </div>

      {/* Overlay config tournoi */}
      <TournamentConfigOverlay
        isOpen={showConfigOverlay}
        onClose={() => setShowConfigOverlay(false)}
        onDeleteTournament={handleDeleteTournament}
      />

      {/* Modal : sauvegarde d'un tournoi actif */}
      {showActiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Modifier un tournoi en cours ?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Le tournoi est actif. Sauvegarder ces modifications va <strong>effacer tous les scores</strong> et remettre le tournoi en brouillon.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowActiveConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg
                  hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveActiveConfirmed}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg
                  hover:bg-red-700 transition-colors"
              >
                Effacer les scores et sauver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Générer les matchs ?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Les matchs existants seront supprimés et régénérés à partir du design actuel.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg
                  hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                  hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isGenerating ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ReactFlowProvider>
  )
}
