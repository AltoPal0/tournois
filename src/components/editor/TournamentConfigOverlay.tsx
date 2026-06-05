import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useTournamentStore } from '../../store/tournamentStore'
import { useMatchStore } from '../../store/matchStore'
import { supabase } from '../../lib/supabase'
import type { TournamentConfig, PlayerTemplate, Joueur } from '../../types/tournament'

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
  onOpenPlayerAssignment?: () => void
}

export default function TournamentConfigOverlay({ isOpen, onClose, onDeleteTournament, onOpenPlayerAssignment }: Props) {
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const setTournamentConfig = useTournamentStore((s) => s.setTournamentConfig)
  const tournamentImageUrl = useTournamentStore((s) => s.tournamentImageUrl)
  const setTournamentImageUrl = useTournamentStore((s) => s.setTournamentImageUrl)
  const saveTournament = useTournamentStore((s) => s.saveTournament)
  const duplicateTournament = useTournamentStore((s) => s.duplicateTournament)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const isSaving = useTournamentStore((s) => s.isSaving)
  const tournamentId = useTournamentStore((s) => s.tournamentId)
  const nodes = useTournamentStore((s) => s.nodes)
  const edges = useTournamentStore((s) => s.edges)
  const assignPlayersToSlot = useMatchStore((s) => s.assignPlayersToSlot)
  const matchesLoaded = useMatchStore((s) => s.matches.length > 0)

  const navigate = useNavigate()

  const [rawUrl, setRawUrl] = useState('')
  const [rawPistes, setRawPistes] = useState('')
  const [pistesError, setPistesError] = useState(false)
  const [rawJoueurs, setRawJoueurs] = useState('')
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [jsonImportText, setJsonImportText] = useState('')
  const [jsonImportError, setJsonImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [isCopying, setIsCopying] = useState(false)

  const previewRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 50, y: 50 })

  // Synchroniser rawUrl, rawPistes et rawJoueurs à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setRawUrl(tournamentImageUrl ?? '')
      setRawPistes(tournamentConfig.pistes?.join(', ') ?? '')
      setPistesError(false)
      setRawJoueurs(tournamentConfig.joueursInscrits?.join(', ') ?? '')
      setConfirmDelete(false)
      setShowCopyModal(false)
    }
  }, [isOpen, tournamentImageUrl, tournamentConfig.pistes, tournamentConfig.joueursInscrits])

  if (!isOpen) return null

  function update(patch: Partial<TournamentConfig>) {
    setTournamentConfig({ ...tournamentConfig, ...patch })
  }

  function handleUrlBlur() {
    const normalized = normalizeImageUrl(rawUrl)
    setRawUrl(normalized)
    setTournamentImageUrl(normalized || null)
  }

  function handlePistesBlur() {
    const trimmed = rawPistes.trim()
    if (!trimmed) {
      setPistesError(false)
      update({ pistes: undefined })
      return
    }
    const isValid = /^\s*\d+(\s*,\s*\d+)*\s*$/.test(trimmed)
    if (!isValid) {
      setPistesError(true)
      return
    }
    const parsed = trimmed.split(',').map((s) => parseInt(s.trim(), 10))
    if (parsed.some((n) => n <= 0)) {
      setPistesError(true)
      return
    }
    setPistesError(false)
    update({ pistes: parsed })
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

  function handleJoueursBlur() {
    const trimmed = rawJoueurs.trim()
    if (!trimmed) {
      update({ joueursInscrits: undefined })
      return
    }
    const names = [...new Set(trimmed.split(',').map((s) => s.trim()).filter(Boolean))]
    setRawJoueurs(names.join(', '))
    update({ joueursInscrits: names })
  }

  async function handleJsonImport() {
    if (!tournamentId) return
    setJsonImportError(null)

    let parsed: { teams: { player1: string; player2: string }[] }
    try {
      parsed = JSON.parse(jsonImportText)
    } catch {
      setJsonImportError('JSON invalide')
      return
    }
    if (!Array.isArray(parsed?.teams)) {
      setJsonImportError('Format invalide — attendu : { "teams": [{ "player1": "…", "player2": "…" }] }')
      return
    }

    setIsImporting(true)

    const allNames = new Set<string>()
    for (const t of parsed.teams) {
      if (t.player1?.trim()) allNames.add(t.player1.trim())
      if (t.player2?.trim()) allNames.add(t.player2.trim())
    }

    const { data: existingData } = await supabase.from('tt_joueurs').select('id, prenom, created_at')
    const dbPlayers = (existingData ?? []) as Joueur[]
    const nameToPlayer = new Map(dbPlayers.map((p) => [p.prenom.toLowerCase(), p]))

    const playerMap = new Map<string, Joueur>()
    const toCreate: string[] = []
    for (const name of allNames) {
      const found = nameToPlayer.get(name.toLowerCase())
      if (found) playerMap.set(name, found)
      else toCreate.push(name)
    }

    if (toCreate.length > 0) {
      const { data: created } = await supabase
        .from('tt_joueurs')
        .insert(toCreate.map((prenom) => ({ prenom })))
        .select('id, prenom, created_at')
      for (const p of (created ?? []) as Joueur[]) {
        playerMap.set(p.prenom, p)
      }
    }

    const rootNodes = nodes.filter(
      (n) => !edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana',
    )

    const slotList: { phaseNodeId: string; slot: number }[] = []
    for (const node of rootNodes) {
      for (let s = 1; s <= node.data.config.inputCount; s++) {
        slotList.push({ phaseNodeId: node.id, slot: s })
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(parsed.teams.length, slotList.length) }, (_, i) => {
        const team = parsed.teams[i]
        const p1 = team.player1?.trim() ? playerMap.get(team.player1.trim()) : undefined
        const p2 = team.player2?.trim() ? playerMap.get(team.player2.trim()) : undefined
        const { phaseNodeId, slot } = slotList[i]
        return assignPlayersToSlot(tournamentId, phaseNodeId, slot, p1?.id ?? null, p2?.id ?? null)
      })
    )

    // Mettre à jour joueursInscrits avec tous les noms extraits
    const allNamesArray = Array.from(allNames)
    update({ joueursInscrits: allNamesArray })
    setRawJoueurs(allNamesArray.join(', '))

    setIsImporting(false)
    setShowJsonImport(false)
    setJsonImportText('')
  }

  async function handleSave() {
    await saveTournament()
    onClose()
  }

  async function handleDelete() {
    setIsDeleting(true)
    await onDeleteTournament()
  }

  function openCopyModal() {
    setCopyName(`${tournamentName} (copie)`)
    setShowCopyModal(true)
  }

  async function handleCopy() {
    if (!copyName.trim()) return
    setIsCopying(true)
    const newId = await duplicateTournament(copyName.trim())
    setIsCopying(false)
    if (newId) {
      onClose()
      navigate(`/tournament/${newId}`)
    }
  }

  return (
    <>
    {/* Modal import JSON équipes */}
    {showJsonImport && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-base font-semibold text-gray-900">Importer des équipes</h3>
            <button
              onClick={() => setShowJsonImport(false)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="px-6 pb-2">
            <p className="text-xs text-gray-500 mb-2">
              Collez un JSON de la forme <code className="bg-gray-100 px-1 rounded">{"{ \"teams\": [{\"player1\": \"…\", \"player2\": \"…\"}] }"}</code>.
              Les équipes seront assignées dans l'ordre des slots.
            </p>
            <textarea
              value={jsonImportText}
              onChange={(e) => { setJsonImportText(e.target.value); setJsonImportError(null) }}
              placeholder={'{\n  "teams": [\n    { "player1": "Alice", "player2": "Bob" }\n  ]\n}'}
              rows={12}
              autoFocus
              className="w-full px-3 py-2.5 text-xs font-mono border border-gray-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                resize-none transition-shadow duration-150"
            />
            {jsonImportError && (
              <p className="text-xs text-red-500 mt-1.5">{jsonImportError}</p>
            )}
          </div>
          <div className="px-6 pb-5 pt-3 flex gap-3">
            <button
              onClick={() => setShowJsonImport(false)}
              className="flex-1 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200
                rounded-xl hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => void handleJsonImport()}
              disabled={isImporting || !jsonImportText.trim()}
              className="flex-1 px-3 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl
                hover:bg-purple-700 transition-colors disabled:opacity-50
                flex items-center justify-center gap-2"
            >
              {isImporting && (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {isImporting ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
        </div>
      </div>
    )}

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
            <span className="text-sm font-medium text-gray-700">Tous les matchs le même jour</span>
            <button
              role="switch"
              aria-checked={tournamentConfig.sameDay}
              onClick={() => update({ sameDay: !tournamentConfig.sameDay, matchDate: !tournamentConfig.sameDay ? tournamentConfig.matchDate : null })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                ${tournamentConfig.sameDay ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
                ${tournamentConfig.sameDay ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Date du tournoi — toujours visible */}
          <div className="-mt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date du tournoi</label>
            <input
              type="date"
              value={tournamentConfig.matchDate ?? ''}
              onChange={(e) => update({ matchDate: e.target.value || null, sameDay: !!e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-shadow duration-150"
            />
          </div>

          {/* Pistes disponibles */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Pistes disponibles
            </label>
            <input
              type="text"
              value={rawPistes}
              onChange={(e) => { setRawPistes(e.target.value); setPistesError(false) }}
              onBlur={handlePistesBlur}
              placeholder="Ex : 1, 2, 3"
              className={`w-full px-3 py-2 text-sm border rounded-lg
                focus:outline-none focus:ring-2 focus:border-transparent
                transition-shadow duration-150
                ${pistesError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-gray-200 focus:ring-blue-500'
                }`}
            />
            {pistesError && (
              <p className="text-xs text-red-500 mt-1">
                Entrée invalide — ex : 1, 2, 3
              </p>
            )}
          </div>

          {/* Heure de début */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Heure de début
            </label>
            <input
              type="time"
              value={tournamentConfig.heureDebut ?? ''}
              onChange={(e) => update({ heureDebut: e.target.value || undefined })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-shadow duration-150"
            />
          </div>

          {/* Durée d'un slot */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Durée d'un slot (min)
            </label>
            <input
              type="number"
              min={1}
              value={tournamentConfig.dureeMatch ?? ''}
              placeholder="Ex : 75"
              onChange={(e) =>
                update({ dureeMatch: e.target.value ? Math.max(1, parseInt(e.target.value) || 1) : undefined })
              }
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-shadow duration-150"
            />
            <p className="text-xs text-gray-400 mt-1">Peut être surchargé par phase</p>
          </div>

          {/* Type de match */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">Type de match</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([
                { value: 'time_fixed', label: 'Durée fixe' },
                { value: 'score_based', label: 'Terminé par score' },
              ] as const).map(({ value, label }, i) => (
                <button
                  key={value}
                  onClick={() => update({ matchType: value })}
                  className={`flex-1 py-2 text-xs font-medium transition-colors duration-150
                    ${(tournamentConfig.matchType ?? 'time_fixed') === value
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'}
                    ${i !== 0 ? 'border-l border-gray-200' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {(tournamentConfig.matchType ?? 'time_fixed') === 'score_based' && (
              <p className="text-xs text-blue-500 mt-1.5">
                Les horaires seront recalculés à chaque score saisi. Peut être surchargé par phase.
              </p>
            )}
          </div>

          {/* Apparence joueurs */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-3">Apparence joueurs</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  value: 'default' as PlayerTemplate,
                  label: 'Default',
                  bg: '#0F172A',
                  card: '#1E293B',
                  accent: '#F59E0B',
                  accent2: '#3B82F6',
                },
                {
                  value: 'slick-dark' as PlayerTemplate,
                  label: 'Modern Slick',
                  bg: '#EEF3FF',
                  card: '#FFFFFF',
                  accent: '#0044EE',
                  accent2: '#FFD100',
                },
                {
                  value: 'palm-springs' as PlayerTemplate,
                  label: 'Palm Springs',
                  bg: '#FAF7F2',
                  card: '#FFFFFF',
                  accent: '#C84B31',
                  accent2: '#7A9E7E',
                },
                {
                  value: 'green-turf' as PlayerTemplate,
                  label: 'Pink Love',
                  bg: '#FFF1E8',
                  card: '#FFFFFF',
                  accent: '#B23A54',
                  accent2: '#E85D75',
                },
              ]).map(({ value, label, bg, card, accent, accent2 }) => {
                const isSelected = (tournamentConfig.playerTemplate ?? 'default') === value
                return (
                  <button
                    key={value}
                    onClick={() => update({ playerTemplate: value })}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all duration-150
                      ${isSelected ? 'border-blue-500 shadow-md shadow-blue-500/20' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    {/* Aperçu miniature */}
                    <div className="p-2" style={{ background: bg }}>
                      {/* Header simulé */}
                      <div className="h-2 mb-1.5 w-full" style={{ background: accent }} />
                      {/* Cartes de match simulées */}
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="h-4 mb-1 flex items-center px-1.5 gap-1"
                          style={{
                            background: card,
                            borderLeft: `3px solid ${i === 0 ? accent : accent2}`,
                            borderRadius: '0 2px 2px 0',
                          }}
                        >
                          <div className="h-1.5 rounded-full flex-1" style={{ background: '#00000022' }} />
                          <div className="h-1.5 w-2.5 rounded-full" style={{ background: i === 0 ? accent : accent2, opacity: 0.9 }} />
                        </div>
                      ))}
                    </div>
                    {/* Nom du template */}
                    <div className={`px-2 py-1.5 text-center
                      ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                      <span className={`text-[11px] font-semibold
                        ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}>
                        {label}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Joueurs inscrits */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Joueurs inscrits
            </label>
            <textarea
              value={rawJoueurs}
              onChange={(e) => setRawJoueurs(e.target.value)}
              onBlur={handleJoueursBlur}
              placeholder="Alice, Bob, Charlie…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-shadow duration-150 resize-none"
            />
            {(tournamentConfig.joueursInscrits?.length ?? 0) > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {tournamentConfig.joueursInscrits!.length} joueur(s) inscrit(s)
              </p>
            )}
          </div>

          {/* Gestion des équipes */}
          {matchesLoaded && (
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
              {onOpenPlayerAssignment && (
                <button
                  onClick={onOpenPlayerAssignment}
                  className="w-full px-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200
                    rounded-lg hover:bg-gray-100 transition-colors duration-150 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                  Gérer les joueurs / équipes
                </button>
              )}
              <button
                onClick={() => { setJsonImportText(''); setJsonImportError(null); setShowJsonImport(true) }}
                className="w-full px-3 py-2.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200
                  rounded-lg hover:bg-purple-100 transition-colors duration-150 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Importer équipes depuis JSON
              </button>
            </div>
          )}

          {/* Copier le tournoi */}
          <div className="border-t border-gray-100 pt-2">
            {!showCopyModal ? (
              <button
                onClick={openCopyModal}
                className="w-full px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg
                  hover:bg-blue-100 transition-colors duration-150 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
                Copier le tournoi
              </button>
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-3">
                <p className="text-sm font-medium text-blue-700">Nom du nouveau tournoi</p>
                <input
                  type="text"
                  value={copyName}
                  onChange={(e) => setCopyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCopy(); if (e.key === 'Escape') setShowCopyModal(false) }}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCopyModal(false)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200
                      rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={isCopying || !copyName.trim()}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                      hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isCopying ? (
                      <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    {isCopying ? 'Copie…' : 'Copier'}
                  </button>
                </div>
              </div>
            )}
          </div>

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
    </>
  )
}
