import { useMemo, useState } from 'react'
import type { TeamWithJoueurs } from '../../types/tournament'
import type { PlayerIdentity } from '../../hooks/usePlayerIdentity'

interface PlayerSelectSheetProps {
  isOpen: boolean
  onClose: () => void
  currentIdentity: PlayerIdentity | null
  teamsMap: Map<string, TeamWithJoueurs>
  onSelect: (joueur: { id: string; prenom: string }) => void
  onClear: () => void
}

export default function PlayerSelectSheet({
  isOpen,
  onClose,
  currentIdentity,
  teamsMap,
  onSelect,
  onClear,
}: PlayerSelectSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    currentIdentity?.joueurId ?? null,
  )
  const [search, setSearch] = useState('')

  const players = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; prenom: string }[] = []
    for (const team of teamsMap.values()) {
      if (!seen.has(team.joueur1.id)) {
        seen.add(team.joueur1.id)
        list.push({ id: team.joueur1.id, prenom: team.joueur1.prenom })
      }
      if (!seen.has(team.joueur2.id)) {
        seen.add(team.joueur2.id)
        list.push({ id: team.joueur2.id, prenom: team.joueur2.prenom })
      }
    }
    return list.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
  }, [teamsMap])

  const filtered = search.trim()
    ? players.filter(p => p.prenom.toLowerCase().includes(search.toLowerCase()))
    : players

  const selectedPlayer = players.find(p => p.id === selectedId) ?? null

  const handleConfirm = () => {
    if (!selectedPlayer) return
    onSelect(selectedPlayer)
    onClose()
  }

  const handleClear = () => {
    setSelectedId(null)
    onClear()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
          flex flex-col max-h-[85svh]
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 className="text-lg font-black text-navy-900">Qui es-tu ?</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center
              text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Identité actuelle */}
        {currentIdentity && (
          <div className="mx-5 mb-3 px-3 py-2 bg-padel-gold/10 rounded-xl flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-padel-gold flex items-center justify-center">
                <span className="text-navy-900 text-[10px] font-black">
                  {currentIdentity.prenom.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-semibold text-navy-900">{currentIdentity.prenom}</span>
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
            >
              Se déconnecter
            </button>
          </div>
        )}

        {/* Recherche */}
        <div className="px-5 mb-3 shrink-0">
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200
              text-navy-900 placeholder-gray-400 text-sm
              focus:outline-none focus:border-padel-blue focus:bg-white transition-colors"
          />
        </div>

        {/* Liste joueurs */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Aucun joueur trouvé</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-150 active:scale-95
                    ${p.id === selectedId
                      ? 'bg-padel-blue text-white shadow-sm shadow-padel-blue/30'
                      : 'bg-gray-100 text-navy-900 hover:bg-gray-200'
                    }`}
                >
                  {p.prenom}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bouton confirmer */}
        <div className="px-5 pb-8 pt-3 shrink-0">
          <button
            onClick={handleConfirm}
            disabled={!selectedPlayer}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all duration-150
              flex items-center justify-center
              ${selectedPlayer
                ? 'bg-padel-blue text-white shadow-md shadow-padel-blue/25 active:scale-[0.98]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            {selectedPlayer ? `Je suis ${selectedPlayer.prenom}` : 'Sélectionne ton prénom'}
          </button>
        </div>
      </div>
    </>
  )
}
