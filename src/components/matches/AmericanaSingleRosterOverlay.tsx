import { useState } from 'react'
import type { PlayerTemplate } from '../../types/tournament'
import { getTheme } from '../../lib/templateTheme'

interface Player {
  id: string
  prenom: string
}

interface Props {
  players: Player[]
  restingPlayerIds: string[]
  template?: PlayerTemplate
  onClose: () => void
  onToggleRest: (playerId: string) => void
  onAddPlayer: (name: string) => void
}

const CLIP_BTN = 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)'

export default function AmericanaSingleRosterOverlay({
  players,
  restingPlayerIds,
  template,
  onClose,
  onToggleRest,
  onAddPlayer,
}: Props) {
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const theme = getTheme(template)

  const sorted = [...players].sort((a, b) => {
    const aResting = restingPlayerIds.includes(a.id)
    const bResting = restingPlayerIds.includes(b.id)
    if (aResting !== bResting) return aResting ? 1 : -1
    return a.prenom.localeCompare(b.prenom, 'fr')
  })

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setIsAdding(true)
    await onAddPlayer(trimmed)
    setNewName('')
    setIsAdding(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: theme.bg, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="h-14 flex items-center px-4 gap-3 shrink-0 border-b" style={{ borderColor: theme.divider }}>
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center transition-colors active:opacity-70"
          style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-sm font-black uppercase tracking-[0.15em] flex-1" style={{ color: theme.textPrimary }}>Joueurs</h2>
        <span className="text-xs" style={{ color: theme.textMuted }}>
          {players.length - restingPlayerIds.length} actif{players.length - restingPlayerIds.length > 1 ? 's' : ''} / {players.length}
        </span>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sorted.map((player) => {
          const isResting = restingPlayerIds.includes(player.id)
          return (
            <button
              key={player.id}
              onClick={() => onToggleRest(player.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
              style={{ background: isResting ? theme.itemBg : theme.itemBgActive, opacity: isResting ? 0.6 : 1 }}
            >
              <span className="text-sm font-semibold" style={{ color: isResting ? theme.textSecondary : theme.textPrimary, textDecoration: isResting ? 'line-through' : 'none' }}>
                {player.prenom}
              </span>
              <span
                className="text-xs font-bold px-2.5 py-1"
                style={{
                  background: isResting ? 'rgba(255,255,255,0.1)' : theme.accent,
                  color: isResting ? theme.textMuted : theme.accentText,
                  borderRadius: '999px',
                }}
              >
                {isResting ? 'En repos' : 'Actif'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Ajouter un joueur */}
      <div className="shrink-0 px-4 py-4 border-t" style={{ borderColor: theme.divider }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.textMuted }}>Nouveau joueur</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Prénom…"
            className="flex-1 text-sm px-4 py-2.5 rounded-xl outline-none"
            style={{ background: theme.inputBg, color: theme.textPrimary, fontSize: '16px' }}
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || isAdding}
            className="px-4 py-2.5 text-sm font-black disabled:opacity-40 active:scale-[0.97] transition-all"
            style={{
              background: theme.accent,
              color: theme.accentText,
              clipPath: theme.useClip ? CLIP_BTN : undefined,
              borderRadius: theme.useClip ? undefined : '12px',
            }}
          >
            {isAdding ? '…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}
