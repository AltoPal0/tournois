import { useState, useEffect, useRef } from 'react'
import { useTournamentStore } from '../../store/tournamentStore'
import type { TournamentConfig } from '../../types/tournament'

// ---------------------------------------------------------------------------
// Normalisation des URLs d'images (imgur gallery → lien direct)
// ---------------------------------------------------------------------------

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  // imgur gallery/album : https://imgur.com/gallery/slug-HASH ou /a/slug-HASH
  const galleryMatch = trimmed.match(/imgur\.com\/(?:gallery|a)\/[^/]*-([a-zA-Z0-9]+)$/)
  if (galleryMatch) return `https://i.imgur.com/${galleryMatch[1]}.jpg`
  // imgur page simple : https://imgur.com/HASH
  const singleMatch = trimmed.match(/^https?:\/\/imgur\.com\/([a-zA-Z0-9]+)$/)
  if (singleMatch) return `https://i.imgur.com/${singleMatch[1]}.jpg`
  return trimmed
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean
  onClose: () => void
  onDeleteTournament: () => Promise<void>
}

export default function TournamentConfigOverlay({ isOpen, onClose, onDeleteTournament }: Props) {
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const setTournamentConfig = useTournamentStore((s) => s.setTournamentConfig)
  const tournamentImageUrl = useTournamentStore((s) => s.tournamentImageUrl)
  const setTournamentImageUrl = useTournamentStore((s) => s.setTournamentImageUrl)
  const saveTournament = useTournamentStore((s) => s.saveTournament)
  const isSaving = useTournamentStore((s) => s.isSaving)

  const [rawUrl, setRawUrl] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const previewRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 50, y: 50 })

  // Synchroniser rawUrl à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setRawUrl(tournamentImageUrl ?? '')
      setConfirmDelete(false)
    }
  }, [isOpen, tournamentImageUrl])

  if (!isOpen) return null

  function update(patch: Partial<TournamentConfig>) {
    setTournamentConfig({ ...tournamentConfig, ...patch })
  }

  function handleUrlBlur() {
    const normalized = normalizeImageUrl(rawUrl)
    setRawUrl(normalized)
    setTournamentImageUrl(normalized || null)
  }

  const imagePos = tournamentConfig.imagePosition ?? { x: 50, y: 50 }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { x: imagePos.x, y: imagePos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    const newX = Math.max(0, Math.min(100, posStart.current.x - (dx / rect.width) * 100))
    const newY = Math.max(0, Math.min(100, posStart.current.y - (dy / rect.height) * 100))
    update({ imagePosition: { x: newX, y: newY } })
  }

  function handlePointerUp() {
    dragging.current = false
  }

  async function handleSave() {
    await saveTournament()
    onClose()
  }

  async function handleDelete() {
    setIsDeleting(true)
    await onDeleteTournament()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Paramètres</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-5">

          {/* Image */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Image du tournoi</label>
            <input
              type="text"
              value={rawUrl}
              onChange={(e) => setRawUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="URL de l'image…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-shadow duration-150"
            />
            {tournamentImageUrl && (
              <>
                <div
                  ref={previewRef}
                  className="mt-2 w-full h-28 rounded-lg overflow-hidden
                    cursor-grab active:cursor-grabbing select-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <img
                    src={tournamentImageUrl}
                    alt=""
                    draggable={false}
                    style={{ objectPosition: `${imagePos.x}% ${imagePos.y}%` }}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Faites glisser pour recadrer
                </p>
              </>
            )}
          </div>

          {/* Toggle : même jour */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-700">
              Tous les matchs le même jour
            </span>
            <button
              role="switch"
              aria-checked={tournamentConfig.sameDay}
              onClick={() =>
                update({
                  sameDay: !tournamentConfig.sameDay,
                  matchDate: !tournamentConfig.sameDay ? tournamentConfig.matchDate : null,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                ${tournamentConfig.sameDay ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
                  ${tournamentConfig.sameDay ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Date du tournoi (conditionnel) */}
          {tournamentConfig.sameDay && (
            <div className="-mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Date du tournoi</label>
              <input
                type="date"
                value={tournamentConfig.matchDate ?? ''}
                onChange={(e) => update({ matchDate: e.target.value || null })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-shadow duration-150"
              />
            </div>
          )}

          {/* Effacer le tournoi — dernière option */}
          <div className="border-t border-gray-100 pt-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg
                  hover:bg-red-100 transition-colors duration-150"
              >
                Effacer le tournoi
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex flex-col gap-3">
                <p className="text-sm font-medium text-red-700">Supprimer définitivement ce tournoi ?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200
                      rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg
                      hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? 'Suppression…' : 'Oui, effacer'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Bouton Sauver */}
        <div className="px-6 pb-5 pt-2 shrink-0 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-11 rounded-xl bg-gray-900 text-white text-sm font-semibold
              flex items-center justify-center gap-2
              hover:bg-gray-800 active:scale-[0.98] transition-all duration-150
              disabled:opacity-50"
          >
            {isSaving ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            Sauver
          </button>
        </div>

      </div>
    </div>
  )
}
