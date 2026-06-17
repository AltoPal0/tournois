import { useMemo, useState, useEffect } from 'react'
import type { TeamWithJoueurs, PlayerTemplate, FontScale } from '../../types/tournament'
import type { PlayerIdentity } from '../../hooks/usePlayerIdentity'
import { getTheme } from '../../lib/templateTheme'

interface PlayerSelectSheetProps {
  isOpen: boolean
  onClose: () => void
  currentIdentity: PlayerIdentity | null
  teamsMap: Map<string, TeamWithJoueurs>
  extraPlayers?: { id: string; prenom: string }[]
  template?: PlayerTemplate
  fontScale?: FontScale
  onSelect: (joueur: { id: string; prenom: string }) => void
  onClear: () => void
  onFontScaleChange?: (scale: FontScale) => void
}

export default function PlayerSelectSheet({
  isOpen,
  onClose,
  currentIdentity,
  teamsMap,
  extraPlayers = [],
  template,
  fontScale = 'normal',
  onSelect,
  onClear,
  onFontScaleChange,
}: PlayerSelectSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    currentIdentity?.joueurId ?? null,
  )
  const [search, setSearch] = useState('')
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const theme = getTheme(template)

  // Remonte la feuille quand le clavier apparaît (iOS ne resize pas le viewport)
  useEffect(() => {
    if (!isOpen) { setKeyboardOffset(0); return }
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setKeyboardOffset(Math.max(0, offset))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setKeyboardOffset(0)
    }
  }, [isOpen])

  // Empêche le zoom iOS quand le clavier sort sur cette feuille
  useEffect(() => {
    if (!isOpen) return
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const original = meta.getAttribute('content') ?? ''
    meta.setAttribute('content', original + ', maximum-scale=1, user-scalable=no')
    return () => meta.setAttribute('content', original)
  }, [isOpen])

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
    for (const p of extraPlayers) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        list.push(p)
      }
    }
    return list.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
  }, [teamsMap, extraPlayers])

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
        className={`fixed left-0 right-0 z-50 shadow-2xl
          flex flex-col max-h-[85svh]
          transition-[transform,bottom] duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ bottom: keyboardOffset, background: theme.bg, borderRadius: '24px 24px 0 0' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: theme.divider }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 className="text-lg font-black" style={{ color: theme.textPrimary }}>Qui es-tu ?</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: theme.inputBg, color: theme.textSecondary }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Identité actuelle */}
        {currentIdentity && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-xl flex items-center justify-between shrink-0" style={{ background: theme.itemBgActive }}>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: theme.accent }}>
                <span className="text-[10px] font-black" style={{ color: theme.accentText }}>
                  {currentIdentity.prenom.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <span className={`${fontScale === 'xxl' ? 'text-lg' : fontScale === 'xl' ? 'text-base' : 'text-sm'} font-semibold`} style={{ color: theme.textPrimary }}>{currentIdentity.prenom}</span>
            </div>
            <button
              onClick={handleClear}
              className={`${fontScale === 'xxl' ? 'text-sm' : 'text-xs'} font-medium transition-colors`}
              style={{ color: theme.textMuted }}
            >
              Se déconnecter
            </button>
          </div>
        )}

        {/* Taille du texte */}
        {onFontScaleChange && (
          <div className="px-5 mb-4 shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.textMuted }}>
              Taille du texte
            </div>
            <div className="flex gap-2">
              {([
                { scale: 'normal' as FontScale, label: 'Normal', size: 'text-sm' },
                { scale: 'xl' as FontScale, label: 'Grand', size: 'text-base' },
                { scale: 'xxl' as FontScale, label: 'Très grand', size: 'text-xl' },
              ]).map(({ scale, label, size }) => (
                <button
                  key={scale}
                  onClick={() => onFontScaleChange(scale)}
                  className="flex-1 py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95"
                  style={{
                    background: fontScale === scale ? theme.accent : theme.itemBg,
                    color: fontScale === scale ? theme.accentText : theme.textPrimary,
                  }}
                >
                  <span className={`${size} font-black leading-none`}>Aa</span>
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recherche */}
        <div className="px-5 mb-3 shrink-0">
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 px-3 rounded-xl outline-none transition-colors"
            style={{ background: theme.inputBg, color: theme.textPrimary, fontSize: '16px' }}
          />
        </div>

        {/* Liste joueurs */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: theme.textMuted }}>Aucun joueur trouvé</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  className={`px-4 py-2 rounded-full ${fontScale === 'xxl' ? 'text-lg' : fontScale === 'xl' ? 'text-base' : 'text-sm'} font-semibold transition-all duration-150 active:scale-95`}
                  style={{
                    background: p.id === selectedId ? theme.accent : theme.itemBg,
                    color: p.id === selectedId ? theme.accentText : theme.textPrimary,
                  }}
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
            className={`w-full h-14 rounded-2xl ${fontScale === 'xxl' ? 'text-xl' : fontScale === 'xl' ? 'text-lg' : 'text-base'} font-bold transition-all duration-150 flex items-center justify-center disabled:opacity-40 active:scale-[0.98]`}
            style={{
              background: selectedPlayer ? theme.accent : theme.itemBg,
              color: selectedPlayer ? theme.accentText : theme.textMuted,
            }}
          >
            {selectedPlayer ? `Je suis ${selectedPlayer.prenom}` : 'Sélectionne ton prénom'}
          </button>
        </div>
      </div>
    </>
  )
}
