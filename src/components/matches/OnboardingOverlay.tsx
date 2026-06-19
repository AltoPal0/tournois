import { useState, useMemo, useEffect } from 'react'
import type { TeamWithJoueurs, PlayerTemplate } from '../../types/tournament'
import { getTheme, type TemplateTheme } from '../../lib/templateTheme'

interface OnboardingOverlayProps {
  tournamentId: string
  tournamentName: string
  teamsMap: Map<string, TeamWithJoueurs>
  teamsLoaded: boolean
  extraPlayers?: { id: string; prenom: string }[]
  template?: PlayerTemplate
  onComplete: (joueur?: { id: string; prenom: string }) => void
}

const CLIP = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'
const CLIP_BTN = 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)'
const CLIP_SMALL = 'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)'

// ---------------------------------------------------------------------------
// Slide 0 — Couverture
// ---------------------------------------------------------------------------
function SlideWelcome({ tournamentName, theme, onNext, onSkip }: {
  tournamentName: string
  theme: TemplateTheme
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <div className="relative h-full flex flex-col">
      {/* Image de fond */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/cover-bk.jpg)' }}
      />
      {/* Gradient sombre */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#01344C] via-[#01344C]/80 to-[#01344C]/30" />

      {/* Contenu */}
      <div className="relative flex flex-col h-full px-6 pt-16 pb-10">
        {/* Badge tournoi */}
        <div className="flex justify-center mb-auto">
          <span
            className="text-[10px] font-black uppercase tracking-[0.25em] px-4 py-1.5"
            style={{
              background: theme.accent,
              color: theme.accentText,
              clipPath: theme.useClip ? CLIP_SMALL : undefined,
              borderRadius: theme.useClip ? undefined : '999px',
            }}
          >
            Tournoi
          </span>
        </div>

        {/* Titre */}
        <div className="mt-auto mb-8">
          <h1 className="text-4xl font-black text-white uppercase leading-tight tracking-tight mb-2">
            Bienvenue
          </h1>
          <p className="text-xl font-bold uppercase tracking-wider leading-tight" style={{ color: theme.accent }}>
            {tournamentName}
          </p>
          <p className="text-white/50 text-sm mt-3 leading-relaxed">
            Suis tes matchs et consulte le classement en temps réel.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onNext}
            style={{
              clipPath: theme.useClip ? CLIP_BTN : undefined,
              borderRadius: theme.useClip ? undefined : '12px',
              background: theme.accent,
              color: theme.accentText,
            }}
            className="w-full py-4 font-black uppercase tracking-widest text-sm transition-all active:brightness-90"
          >
            Choisir mon joueur →
          </button>
          <button
            onClick={onSkip}
            className="w-full py-3 text-white/40 text-sm font-semibold text-center
              transition-colors hover:text-white/70"
          >
            Accéder directement
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide 1 — Sélection joueur
// ---------------------------------------------------------------------------
function SlidePlayerSelect({ teamsMap, teamsLoaded, extraPlayers, theme, onSelect, onSkip }: {
  teamsMap: Map<string, TeamWithJoueurs>
  teamsLoaded: boolean
  extraPlayers?: { id: string; prenom: string }[]
  theme: TemplateTheme
  onSelect: (joueur: { id: string; prenom: string }) => void
  onSkip: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Empêche le zoom iOS/Android quand le clavier sort — restaure à la sortie
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const original = meta.getAttribute('content') ?? ''
    meta.setAttribute('content', original + ', maximum-scale=1, user-scalable=no')
    return () => meta.setAttribute('content', original)
  }, [])

  const players = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; prenom: string }[] = []
    for (const team of teamsMap.values()) {
      for (const j of [team.joueur1, team.joueur2]) {
        if (!seen.has(j.id)) {
          seen.add(j.id)
          list.push({ id: j.id, prenom: j.prenom })
        }
      }
    }
    for (const p of (extraPlayers ?? [])) {
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

  const selectedJoueur = players.find(p => p.id === selectedId) ?? null

  return (
    <div className="flex flex-col h-full px-5 pt-8 pb-8">
      {/* En-tête */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Qui es-tu ?</h2>
        <p className="text-white/50 text-sm mt-1">Choisis ton nom pour suivre tes matchs en temps réel.</p>
      </div>

      {/* Recherche */}
      <div
        className="flex items-center gap-2 px-4 py-3 mb-4"
        style={{ background: theme.inputBg, clipPath: theme.useClip ? CLIP_SMALL : undefined, borderRadius: theme.useClip ? undefined : '12px' }}
      >
        <svg className="h-4 w-4 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un joueur…"
          className="flex-1 bg-transparent text-white placeholder-white/30 outline-none"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Liste joueurs */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!teamsLoaded ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 border-2 border-white/20 rounded-full animate-spin" style={{ borderTopColor: theme.accent }} />
          </div>
        ) : teamsMap.size === 0 && !extraPlayers?.length ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg className="h-5 w-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">Aucun joueur assigné pour l'instant.</p>
            <p className="text-white/25 text-xs">L'organisateur doit d'abord assigner les équipes.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">Aucun joueur trouvé</p>
        ) : (
          filtered.map(p => {
            const isSelected = p.id === selectedId
            return (
              <div
                key={p.id}
                style={isSelected ? {
                  clipPath: theme.useClip ? CLIP : undefined,
                  borderRadius: theme.useClip ? undefined : '12px',
                  background: theme.accent,
                  padding: '2px',
                } : {}}
              >
                <button
                  onClick={() => setSelectedId(isSelected ? null : p.id)}
                  style={{
                    clipPath: theme.useClip ? (isSelected ? 'polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)' : CLIP) : undefined,
                    borderRadius: theme.useClip ? undefined : '10px',
                    background: isSelected ? theme.itemBgActive : theme.itemBg,
                  }}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all"
                >
                  <span className="flex-1 text-sm font-bold" style={{ color: isSelected ? theme.accent : theme.textPrimary }}>
                    {p.prenom}
                  </span>
                  {isSelected && (
                    <div
                      className="h-5 w-5 flex items-center justify-center shrink-0"
                      style={{
                        background: theme.accent,
                        clipPath: theme.useClip ? 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)' : undefined,
                        borderRadius: theme.useClip ? undefined : '50%',
                      }}
                    >
                      <svg className="h-3 w-3" style={{ color: theme.accentText }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-4 shrink-0">
        <button
          onClick={() => selectedJoueur && onSelect(selectedJoueur)}
          disabled={!selectedJoueur}
          style={{
            clipPath: theme.useClip ? CLIP_BTN : undefined,
            borderRadius: theme.useClip ? undefined : '12px',
            background: selectedJoueur ? theme.accent : 'rgba(255,255,255,0.1)',
            color: selectedJoueur ? theme.accentText : theme.textMuted,
          }}
          className="w-full py-4 font-black uppercase tracking-widest text-sm transition-all active:brightness-90 cursor-default"
        >
          {selectedJoueur ? `C'est parti en tant que ${selectedJoueur.prenom} →` : 'Sélectionne ton nom'}
        </button>
        <button
          onClick={onSkip}
          className="w-full py-3 text-white/40 text-sm font-semibold text-center transition-colors hover:text-white/70"
        >
          Continuer sans choisir
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function OnboardingOverlay({ tournamentId, tournamentName, teamsMap, teamsLoaded, extraPlayers, template, onComplete }: OnboardingOverlayProps) {
  const [step, setStep] = useState<0 | 1>(0)
  const theme = getTheme(template)

  function finish(joueur?: { id: string; prenom: string }) {
    localStorage.setItem(`padel_onboarded_${tournamentId}`, '1')
    onComplete(joueur)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{
        background: theme.gradient,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Barre de progression globale */}
      <div className="shrink-0 h-0.5 w-full bg-white/10">
        <div
          className="h-full transition-all duration-500"
          style={{ width: step === 0 ? '5%' : '100%', background: theme.accent }}
        />
      </div>

      {/* Corps des slides */}
      <div className="flex-1 overflow-hidden">
        {step === 0 && (
          <SlideWelcome
            tournamentName={tournamentName}
            theme={theme}
            onNext={() => setStep(1)}
            onSkip={() => finish()}
          />
        )}
        {step === 1 && (
          <SlidePlayerSelect
            teamsMap={teamsMap}
            teamsLoaded={teamsLoaded}
            extraPlayers={extraPlayers}
            theme={theme}
            onSelect={joueur => finish(joueur)}
            onSkip={() => finish()}
          />
        )}
      </div>
    </div>
  )
}
