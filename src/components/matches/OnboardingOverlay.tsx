import { useState, useMemo, useEffect } from 'react'
import type { TeamWithJoueurs } from '../../types/tournament'

interface OnboardingOverlayProps {
  tournamentId: string
  tournamentName: string
  teamsMap: Map<string, TeamWithJoueurs>
  onComplete: (joueur?: { id: string; prenom: string }) => void
}

const CLIP = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'
const CLIP_BTN = 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)'
const CLIP_SMALL = 'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)'

type Platform = 'ios' | 'android' | 'unknown'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'unknown'
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone)
  )
}

// ---------------------------------------------------------------------------
// Slide 0 — Couverture
// ---------------------------------------------------------------------------
function SlideWelcome({ tournamentName, onNext, onSkip }: {
  tournamentName: string
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
            className="text-[10px] font-black uppercase tracking-[0.25em] text-[#062E38] bg-[#D4E800] px-4 py-1.5"
            style={{ clipPath: CLIP_SMALL }}
          >
            Tournoi
          </span>
        </div>

        {/* Titre */}
        <div className="mt-auto mb-8">
          <h1 className="text-4xl font-black text-white uppercase leading-tight tracking-tight mb-2">
            Bienvenue
          </h1>
          <p className="text-xl font-bold text-[#D4E800] uppercase tracking-wider leading-tight">
            {tournamentName}
          </p>
          <p className="text-white/50 text-sm mt-3 leading-relaxed">
            Suis tes matchs, consulte le classement et installe l'app sur ton téléphone.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onNext}
            style={{ clipPath: CLIP_BTN, background: '#D4E800' }}
            className="w-full py-4 text-[#062E38] font-black uppercase tracking-widest text-sm
              transition-all active:brightness-90"
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
function SlidePlayerSelect({ teamsMap, onSelect, onSkip }: {
  teamsMap: Map<string, TeamWithJoueurs>
  onSelect: (joueur: { id: string; prenom: string }) => void
  onSkip: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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
    return list.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
  }, [teamsMap])

  const filtered = search.trim()
    ? players.filter(p => p.prenom.toLowerCase().includes(search.toLowerCase()))
    : players

  const selectedJoueur = players.find(p => p.id === selectedId) ?? null

  return (
    <div className="flex flex-col h-full px-5 pt-8 pb-8">
      {/* En-tête */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-[#D4E800]" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Étape 1 sur 2</span>
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Qui es-tu ?</h2>
        <p className="text-white/50 text-sm mt-1">Choisis ton nom pour suivre tes matchs en temps réel.</p>
      </div>

      {/* Recherche */}
      <div
        className="flex items-center gap-2 bg-white/10 px-4 py-3 mb-4"
        style={{ clipPath: CLIP_SMALL }}
      >
        <svg className="h-4 w-4 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un joueur…"
          className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
        />
      </div>

      {/* Liste joueurs */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {teamsMap.size === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 border-2 border-white/20 border-t-[#D4E800] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">Aucun joueur trouvé</p>
        ) : (
          filtered.map(p => {
            const isSelected = p.id === selectedId
            return (
              <div
                key={p.id}
                style={isSelected
                  ? { clipPath: CLIP, background: '#D4E800', padding: '2px' }
                  : {}}
              >
                <button
                  onClick={() => setSelectedId(isSelected ? null : p.id)}
                  style={{
                    clipPath: isSelected ? 'polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)' : CLIP,
                    background: isSelected ? '#0A4E5C' : 'rgba(255,255,255,0.07)',
                  }}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all"
                >
                  <span className={`flex-1 text-sm font-bold ${isSelected ? 'text-[#D4E800]' : 'text-white'}`}>
                    {p.prenom}
                  </span>
                  {isSelected && (
                    <div
                      className="h-5 w-5 flex items-center justify-center bg-[#D4E800] shrink-0"
                      style={{ clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)' }}
                    >
                      <svg className="h-3 w-3 text-[#062E38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
          style={{ clipPath: CLIP_BTN, background: selectedJoueur ? '#D4E800' : 'rgba(255,255,255,0.1)' }}
          className={`w-full py-4 font-black uppercase tracking-widest text-sm transition-all
            ${selectedJoueur ? 'text-[#062E38] active:brightness-90' : 'text-white/30 cursor-default'}`}
        >
          {selectedJoueur ? `Continuer en tant que ${selectedJoueur.prenom} →` : 'Sélectionne ton nom'}
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
// Slide 2 — Guide "Ajouter à l'écran d'accueil"
// ---------------------------------------------------------------------------

type StepDef = { icon: React.ReactNode; title: string; desc: string }

function detectBrowser(): 'safari' | 'chrome' | 'other' {
  const ua = navigator.userAgent
  if (/CriOS/.test(ua)) return 'chrome'      // Chrome sur iOS
  if (/FxiOS|OPiOS|EdgiOS/.test(ua)) return 'other'
  if (/Chrome/.test(ua) && !/Edg\//.test(ua)) return 'chrome'
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari'
  return 'other'
}

const STEP_OPEN_SAFARI: StepDef = {
  icon: (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
    </svg>
  ),
  title: 'Ouvre ce lien dans Safari',
  desc: 'Copie l\'adresse et colle-la dans Safari — seul Safari permet d\'installer l\'app sur iPhone.',
}

const STEP_OPEN_CHROME: StepDef = {
  icon: (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
    </svg>
  ),
  title: 'Ouvre ce lien dans Chrome',
  desc: 'Copie l\'adresse et colle-la dans Chrome — c\'est nécessaire pour pouvoir installer l\'app.',
}

const IOS_STEPS_CORE: StepDef[] = [
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    title: 'Appuie sur Partager',
    desc: 'L\'icône carrée avec une flèche vers le haut, en bas de l\'écran Safari.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
    title: 'Sur l\'écran d\'accueil',
    desc: 'Défile dans le menu Partager et appuie sur « Sur l\'écran d\'accueil ».',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Appuie sur Ajouter',
    desc: 'En haut à droite de la fenêtre de confirmation.',
  },
]

const ANDROID_STEPS_CORE: StepDef[] = [
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
      </svg>
    ),
    title: 'Ouvre le menu',
    desc: 'Appuie sur les trois points ⋮ en haut à droite de Chrome.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    title: 'Ajouter à l\'écran d\'accueil',
    desc: 'Sélectionne cette option dans le menu déroulant.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Confirme',
    desc: 'Appuie sur « Ajouter » dans la boîte de dialogue.',
  },
]

function buildSteps(platform: Platform): StepDef[] {
  const browser = detectBrowser()
  if (platform === 'ios') {
    const needsSafari = browser !== 'safari'
    return needsSafari ? [STEP_OPEN_SAFARI, ...IOS_STEPS_CORE] : IOS_STEPS_CORE
  }
  if (platform === 'android') {
    const needsChrome = browser !== 'chrome'
    return needsChrome ? [STEP_OPEN_CHROME, ...ANDROID_STEPS_CORE] : ANDROID_STEPS_CORE
  }
  return []
}

function SlideHomescreen({ onDone }: { onDone: () => void }) {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform())
  const [currentStep, setCurrentStep] = useState(0)
  const already = isStandalone()

  const steps = useMemo(() => buildSteps(platform), [platform])
  const totalSteps = steps.length
  const isLastStep = currentStep === totalSteps - 1

  useEffect(() => { setCurrentStep(0) }, [platform])

  if (already) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div
          className="w-16 h-16 flex items-center justify-center bg-[#D4E800] mb-6"
          style={{ clipPath: CLIP }}
        >
          <svg className="h-8 w-8 text-[#062E38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Déjà installée !</h2>
        <p className="text-white/50 text-sm mb-10">L'application est déjà sur ton écran d'accueil. Tu es prêt.</p>
        <button
          onClick={onDone}
          style={{ clipPath: CLIP_BTN, background: '#D4E800' }}
          className="w-full py-4 text-[#062E38] font-black uppercase tracking-widest text-sm"
        >
          C'est parti →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-5 pt-8 pb-8">
      {/* En-tête */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-[#D4E800]" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Étape 2 sur 2</span>
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Installer l'app</h2>
        <p className="text-white/50 text-sm mt-1">Accès rapide depuis ton écran d'accueil, sans passer par le navigateur.</p>
      </div>

      {/* Sélecteur de plateforme */}
      {platform === 'unknown' && (
        <div className="flex gap-2 mb-6">
          {(['ios', 'android'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                clipPath: CLIP_BTN,
                background: platform === p ? '#D4E800' : 'rgba(255,255,255,0.1)',
              }}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all
                ${platform === p ? 'text-[#062E38]' : 'text-white/50'}`}
            >
              {p === 'ios' ? '🍎 iPhone' : '🤖 Android'}
            </button>
          ))}
        </div>
      )}

      {platform !== 'unknown' && steps.length > 0 && (
        <>
          {/* Switch platform */}
          <div className="flex gap-2 mb-5">
            {(['ios', 'android'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                style={{
                  clipPath: CLIP_BTN,
                  background: platform === p ? '#D4E800' : 'rgba(255,255,255,0.08)',
                }}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider transition-all
                  ${platform === p ? 'text-[#062E38]' : 'text-white/30'}`}
              >
                {p === 'ios' ? 'iPhone' : 'Android'}
              </button>
            ))}
          </div>

          {/* Étape courante */}
          <div
            className="flex-1 flex flex-col justify-center"
            style={{ clipPath: CLIP, background: 'rgba(255,255,255,0.06)', padding: '0' }}
          >
            <div style={{ clipPath: CLIP, background: 'rgba(255,255,255,0.06)' }} className="flex-1 flex flex-col">
              {/* Numéro d'étape */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                <div
                  className="w-8 h-8 flex items-center justify-center bg-[#D4E800] shrink-0"
                  style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
                >
                  <span className="text-xs font-black text-[#062E38]">{currentStep + 1}</span>
                </div>
                <div className="flex gap-1">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 transition-all duration-300 ${i === currentStep ? 'w-6 bg-[#D4E800]' : 'w-2 bg-white/20'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="px-5 pb-6 flex flex-col gap-4 flex-1 justify-center">
                <div className="text-white/60">{steps[currentStep].icon}</div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">
                    {steps[currentStep].title}
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    {steps[currentStep].desc}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation étapes */}
          <div className="flex gap-2 mt-4">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(s => s - 1)}
                style={{ clipPath: CLIP_BTN, background: 'rgba(255,255,255,0.1)' }}
                className="px-5 py-3.5 text-white/60 font-black uppercase tracking-wider text-xs transition-all"
              >
                ←
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setCurrentStep(s => s + 1)}
                style={{ clipPath: CLIP_BTN, background: '#D4E800' }}
                className="flex-1 py-3.5 text-[#062E38] font-black uppercase tracking-widest text-sm transition-all active:brightness-90"
              >
                Étape suivante →
              </button>
            ) : (
              <button
                onClick={onDone}
                style={{ clipPath: CLIP_BTN, background: '#D4E800' }}
                className="flex-1 py-3.5 text-[#062E38] font-black uppercase tracking-widest text-sm transition-all active:brightness-90"
              >
                C'est fait, allons-y →
              </button>
            )}
          </div>
        </>
      )}

      {/* Skip */}
      <button
        onClick={onDone}
        className="w-full py-3 text-white/30 text-sm font-semibold text-center mt-2 transition-colors hover:text-white/60"
      >
        Passer cette étape
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function OnboardingOverlay({ tournamentId, tournamentName, teamsMap, onComplete }: OnboardingOverlayProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [selectedJoueur, setSelectedJoueur] = useState<{ id: string; prenom: string } | undefined>()

  function finish(joueur?: { id: string; prenom: string }) {
    localStorage.setItem(`padel_onboarded_${tournamentId}`, '1')
    onComplete(joueur)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #01344C 0%, #0B5A78 100%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Barre de progression globale */}
      <div className="shrink-0 h-0.5 w-full bg-white/10">
        <div
          className="h-full bg-[#D4E800] transition-all duration-500"
          style={{ width: step === 0 ? '5%' : step === 1 ? '50%' : '100%' }}
        />
      </div>

      {/* Corps des slides */}
      <div className="flex-1 overflow-hidden">
        {step === 0 && (
          <SlideWelcome
            tournamentName={tournamentName}
            onNext={() => setStep(1)}
            onSkip={() => finish()}
          />
        )}
        {step === 1 && (
          <SlidePlayerSelect
            teamsMap={teamsMap}
            onSelect={joueur => {
              setSelectedJoueur(joueur)
              setStep(2)
            }}
            onSkip={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <SlideHomescreen
            onDone={() => finish(selectedJoueur)}
          />
        )}
      </div>
    </div>
  )
}
