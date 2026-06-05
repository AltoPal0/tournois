import { useState } from 'react'
import { GiTennisBall } from 'react-icons/gi'
import { useMatchStore } from '../../store/matchStore'
import type { Match, PlayerTemplate } from '../../types/tournament'

export function TennisBall({ className }: { className?: string }) {
  return <GiTennisBall className={className} style={{ color: '#f5c518' }} />
}

export function ScoreDisplay({
  v1,
  v2,
  winnerClass = 'text-padel-blue',
  loserClass = 'text-gray-300',
}: {
  v1: number
  v2: number
  winnerClass?: string
  loserClass?: string
}) {
  const team1Won = v1 > v2
  const team2Won = v2 > v1
  return (
    <div className="flex flex-col items-end gap-0">
      <span className={`text-xl font-black font-mono leading-tight tabular-nums ${team1Won ? winnerClass : loserClass}`}>{v1}</span>
      <span className={`text-xl font-black font-mono leading-tight tabular-nums ${team2Won ? winnerClass : loserClass}`}>{v2}</span>
    </div>
  )
}

interface ScoreInputProps {
  match: Match
  team1Name: string | null
  team2Name: string | null
  isOpen: boolean
  onClose: () => void
  template?: PlayerTemplate
}

export default function ScoreInput({ match, team1Name, team2Name, isOpen, onClose, template = 'default' }: ScoreInputProps) {
  const updateMatchScore = useMatchStore((s) => s.updateMatchScore)
  const clearMatchScore = useMatchStore((s) => s.clearMatchScore)
  const [s1, setS1] = useState(() => match.score_equipe1 ?? 0)
  const [s2, setS2] = useState(() => match.score_equipe2 ?? 0)

  const team1Leads = s1 > s2
  const team2Leads = s2 > s1
  const isTie = s1 === s2
  const hasExistingScore = match.score_equipe1 != null && match.score_equipe2 != null

  const handleConfirm = () => {
    if (isTie) return
    updateMatchScore(match.id, s1, s2)
    onClose()
  }

  const handleClear = () => {
    clearMatchScore(match.id)
    onClose()
  }

  if (!isOpen) return null

  if (template === 'slick-dark') return <ScoreInputSlickDark {...{ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }} />
  if (template === 'palm-springs') return <ScoreInputPalmSprings {...{ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }} />
  if (template === 'green-turf') return <ScoreInputGreenTurf {...{ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }} />
  return <ScoreInputDefault {...{ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }} />
}

// ---------------------------------------------------------------------------
// Shared inner props
// ---------------------------------------------------------------------------

interface InnerProps {
  match: Match
  team1Name: string | null
  team2Name: string | null
  s1: number
  s2: number
  setS1: (fn: (v: number) => number) => void
  setS2: (fn: (v: number) => number) => void
  team1Leads: boolean
  team2Leads: boolean
  isTie: boolean
  hasExistingScore: boolean
  handleConfirm: () => void
  handleClear: () => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// DEFAULT — blanc, navy, bleu padel
// ---------------------------------------------------------------------------

function ScoreInputDefault({ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }: InnerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-navy-900 flex items-center justify-between px-5 pt-5 pb-4">
          <span className="text-sm font-bold text-white/90 uppercase tracking-widest">{match.nom}</span>
          <CloseButton onClick={onClose} className="bg-white/10 text-white/60 hover:bg-white/20 hover:text-white" />
        </div>
        <div className="px-4 space-y-2.5 py-4">
          <DefaultTeamPanel name={team1Name} score={s1} isLeading={team1Leads}
            onInc={() => setS1((v) => v + 1)} onDec={() => setS1((v) => Math.max(0, v - 1))} />
          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <DefaultTeamPanel name={team2Name} score={s2} isLeading={team2Leads}
            onInc={() => setS2((v) => v + 1)} onDec={() => setS2((v) => Math.max(0, v - 1))} />
        </div>
        <DefaultActions isTie={isTie} hasExistingScore={hasExistingScore} onConfirm={handleConfirm} onClear={handleClear} onClose={onClose} />
      </div>
    </div>
  )
}

function DefaultTeamPanel({ name, score, isLeading, onInc, onDec }: { name: string | null; score: number; isLeading: boolean; onInc: () => void; onDec: () => void }) {
  return (
    <div className={`rounded-2xl p-4 transition-colors duration-200 ${isLeading ? 'bg-navy-900/5 ring-2 ring-padel-gold/40' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4 min-h-[1.75rem]">
        <span className="text-2xl font-bold leading-tight text-navy-900">{name ?? 'Équipe'}</span>
        {isLeading && <TennisBall className="w-5 h-5 shrink-0" />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button onPointerDown={(e) => { e.preventDefault(); onDec() }}
          className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-thin select-none transition-transform duration-75 active:scale-90 bg-navy-800 text-white hover:bg-navy-700">−</button>
        <span key={score} className={`text-8xl font-black tabular-nums select-none ${isLeading ? 'text-padel-gold' : 'text-navy-800'}`}>{score}</span>
        <button onPointerDown={(e) => { e.preventDefault(); onInc() }}
          className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-thin select-none transition-transform duration-75 active:scale-90 bg-padel-blue text-white shadow-lg shadow-padel-blue/25 hover:bg-padel-blue-light">+</button>
      </div>
    </div>
  )
}

function DefaultActions({ isTie, hasExistingScore, onConfirm, onClear, onClose }: { isTie: boolean; hasExistingScore: boolean; onConfirm: () => void; onClear: () => void; onClose: () => void }) {
  return (
    <div className="px-4 pb-8 pt-2 space-y-2">
      <button onClick={onConfirm} disabled={isTie}
        className={`w-full h-16 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition-all duration-150
          ${isTie ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-padel-blue text-white hover:bg-padel-blue-light active:scale-[0.98] shadow-md shadow-padel-blue/25'}`}>
        {isTie ? 'Égalité non autorisée' : <><CheckIcon />Confirmer le score</>}
      </button>
      {hasExistingScore && <button onClick={onClear} className="w-full h-10 text-sm font-medium text-red-500 hover:text-red-700 transition-colors">Effacer le score</button>}
      <button onClick={onClose} className="w-full h-10 text-sm text-gray-400 hover:text-gray-600 transition-colors">Annuler</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SLICK DARK — teal profond, coins coupés, chartreuse
// ---------------------------------------------------------------------------

const CLIP_MODAL = 'polygon(16px 0%, 100% 0%, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0% 100%, 0% 16px)'
const CLIP_BTN = 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)'
const CLIP_PANEL = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'
const CLIP_CONFIRM = 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)'

function ScoreInputSlickDark({ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }: InnerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto" style={{ clipPath: CLIP_MODAL, background: '#062E38' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(212,232,0,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-[#D4E800] shrink-0" />
            <span className="text-xs font-black text-white/70 uppercase tracking-[0.2em]">{match.nom}</span>
          </div>
          <CloseButton onClick={onClose} className="bg-white/10 text-white/50 hover:bg-white/20 hover:text-white rounded-none" style={{ clipPath: CLIP_BTN }} />
        </div>

        {/* Team panels */}
        <div className="px-4 pt-3 pb-2 space-y-2">
          <SlickTeamPanel name={team1Name} score={s1} isLeading={team1Leads}
            onInc={() => setS1((v) => v + 1)} onDec={() => setS1((v) => Math.max(0, v - 1))} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">vs</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <SlickTeamPanel name={team2Name} score={s2} isLeading={team2Leads}
            onInc={() => setS2((v) => v + 1)} onDec={() => setS2((v) => Math.max(0, v - 1))} />
        </div>

        {/* Actions */}
        <div className="px-4 pb-6 pt-2 space-y-1.5">
          <button onClick={handleConfirm} disabled={isTie}
            style={!isTie ? { clipPath: CLIP_CONFIRM, background: '#D4E800' } : { clipPath: CLIP_CONFIRM }}
            className={`w-full h-12 text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-150
              ${isTie ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'text-[#062E38] hover:brightness-110 active:scale-[0.98]'}`}>
            {isTie ? 'Égalité non autorisée' : <><CheckIcon />Confirmer le score</>}
          </button>
          {hasExistingScore && (
            <button onClick={handleClear}
              className="w-full h-8 text-xs font-bold text-white/30 hover:text-red-400 uppercase tracking-wider transition-colors">
              Effacer le score
            </button>
          )}
          <button onClick={onClose} className="w-full h-8 text-xs text-white/20 hover:text-white/40 uppercase tracking-wider transition-colors">Annuler</button>
        </div>
      </div>
    </div>
  )
}

function SlickTeamPanel({ name, score, isLeading, onInc, onDec }: { name: string | null; score: number; isLeading: boolean; onInc: () => void; onDec: () => void }) {
  const parts = name ? name.split(' & ') : ['Équipe']

  return (
    <div style={{ clipPath: CLIP_PANEL, background: isLeading ? '#0A4E5C' : '#0E6070' }} className="px-4 pt-3 pb-2">
      {/* Noms sur 2 lignes */}
      <div className="flex items-start gap-2 mb-2">
        {isLeading && (
          <span className="w-2 h-2 mt-1.5 shrink-0 bg-[#D4E800]" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
        )}
        <div className="flex flex-col gap-0">
          {parts.map((p, i) => (
            <span key={i} className={`text-xl font-black uppercase tracking-wide leading-snug ${isLeading ? 'text-[#D4E800]' : 'text-white/70'}`}>
              {p}
            </span>
          ))}
        </div>
      </div>
      {/* Score + boutons */}
      <div className="flex items-center justify-between gap-2">
        <button onPointerDown={(e) => { e.preventDefault(); onDec() }}
          style={{ clipPath: CLIP_BTN }}
          className="h-12 w-12 flex items-center justify-center text-2xl font-black select-none transition-all duration-75 active:scale-90 bg-white/10 text-white/60 hover:bg-white/20">
          −
        </button>
        <span key={score} className={`text-6xl font-black tabular-nums select-none leading-none ${isLeading ? 'text-[#D4E800]' : 'text-white/20'}`}>
          {score}
        </span>
        <button onPointerDown={(e) => { e.preventDefault(); onInc() }}
          style={{ clipPath: CLIP_BTN, background: '#D4E800' }}
          className="h-12 w-12 flex items-center justify-center text-2xl font-black select-none transition-all duration-75 active:scale-90 text-[#062E38] hover:brightness-110">
          +
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PALM SPRINGS — crème chaud, terracotta
// ---------------------------------------------------------------------------

function ScoreInputPalmSprings({ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }: InnerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md bg-[#FAF7F2] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">

        {/* Barre terracotta */}
        <div className="h-1.5 bg-gradient-to-r from-[#C84B31] to-[#E8A87C]" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
          <span className="text-xs font-bold text-stone-400 uppercase tracking-[0.2em]">{match.nom}</span>
          <CloseButton onClick={onClose} className="bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600" />
        </div>

        <div className="px-4 py-4 space-y-3">
          <PalmTeamPanel name={team1Name} score={s1} isLeading={team1Leads} label="Équipe A"
            onInc={() => setS1((v) => v + 1)} onDec={() => setS1((v) => Math.max(0, v - 1))} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.3em]">vs</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>
          <PalmTeamPanel name={team2Name} score={s2} isLeading={team2Leads} label="Équipe B"
            onInc={() => setS2((v) => v + 1)} onDec={() => setS2((v) => Math.max(0, v - 1))} />
        </div>

        <div className="px-4 pb-8 pt-1 space-y-2 bg-[#FAF7F2]">
          <button onClick={handleConfirm} disabled={isTie}
            className={`w-full h-14 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150
              ${isTie ? 'bg-stone-100 text-stone-400 cursor-not-allowed' : 'bg-[#C84B31] text-white hover:bg-[#B03828] active:scale-[0.98] shadow-md shadow-[#C84B31]/25'}`}>
            {isTie ? 'Égalité non autorisée' : <><CheckIcon />Confirmer le score</>}
          </button>
          {hasExistingScore && <button onClick={handleClear} className="w-full h-9 text-xs font-medium text-stone-400 hover:text-red-500 transition-colors">Effacer le score</button>}
          <button onClick={onClose} className="w-full h-9 text-xs text-stone-300 hover:text-stone-500 transition-colors">Annuler</button>
        </div>
      </div>
    </div>
  )
}

function PalmTeamPanel({ name, score, isLeading, label, onInc, onDec }: { name: string | null; score: number; isLeading: boolean; label: string; onInc: () => void; onDec: () => void }) {
  return (
    <div className={`rounded-xl p-4 transition-colors duration-200 ${isLeading ? 'bg-white shadow-[0_0_0_2px_#C84B31,0_4px_16px_rgba(200,75,49,0.1)]' : 'bg-white shadow-sm'}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">{label}</div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-base font-bold leading-snug truncate ${isLeading ? 'text-[#C84B31]' : 'text-stone-800'}`}>{name ?? 'Équipe'}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button onPointerDown={(e) => { e.preventDefault(); onDec() }}
          className="h-12 w-12 rounded-lg flex items-center justify-center text-xl font-thin select-none transition-transform duration-75 active:scale-90 bg-stone-100 text-stone-500 hover:bg-stone-200">
          −
        </button>
        <span key={score} className={`text-8xl font-black tabular-nums select-none leading-none ${isLeading ? 'text-[#C84B31]' : 'text-stone-300'}`}>{score}</span>
        <button onPointerDown={(e) => { e.preventDefault(); onInc() }}
          className="h-12 w-12 rounded-lg flex items-center justify-center text-xl font-thin select-none transition-transform duration-75 active:scale-90 bg-[#C84B31] text-white hover:bg-[#B03828]">
          +
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GREEN TURF (Pink Love) — crème FFF1E8, bordeaux/rose
// ---------------------------------------------------------------------------

function ScoreInputGreenTurf({ match, team1Name, team2Name, s1, s2, setS1, setS2, team1Leads, team2Leads, isTie, hasExistingScore, handleConfirm, handleClear, onClose }: InnerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md bg-[#FFF1E8] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">

        {/* Bordure gauche simulée en haut */}
        <div className="flex items-center gap-0">
          <div className="w-1.5 bg-[#B23A54] self-stretch shrink-0" />
          <div className="flex-1 flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#F0DDD0]">
            <span className="text-xs font-bold text-[#B23A54] uppercase tracking-[0.2em]">{match.nom}</span>
            <CloseButton onClick={onClose} className="bg-[#F0DDD0] text-[#B23A54]/60 hover:bg-[#E8C9B8] hover:text-[#B23A54]" />
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          <GreenTeamPanel name={team1Name} score={s1} isLeading={team1Leads}
            onInc={() => setS1((v) => v + 1)} onDec={() => setS1((v) => Math.max(0, v - 1))} />
          <div className="flex items-center gap-3 pl-2">
            <div className="flex-1 h-px bg-[#E8C9B8]" />
            <span className="text-[10px] font-bold text-[#C4A0B0] uppercase tracking-[0.3em]">vs</span>
            <div className="flex-1 h-px bg-[#E8C9B8]" />
          </div>
          <GreenTeamPanel name={team2Name} score={s2} isLeading={team2Leads}
            onInc={() => setS2((v) => v + 1)} onDec={() => setS2((v) => Math.max(0, v - 1))} />
        </div>

        <div className="px-4 pb-8 pt-1 space-y-2">
          <button onClick={handleConfirm} disabled={isTie}
            className={`w-full h-14 rounded-r-2xl rounded-l-none text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150
              ${isTie ? 'bg-[#E8C9B8] text-[#C4A0B0] cursor-not-allowed' : 'bg-[#B23A54] text-[#FFF1E8] hover:bg-[#9A2E44] active:scale-[0.98]'}`}
            style={{ borderLeft: '4px solid rgba(255,241,232,0.3)' }}>
            {isTie ? 'Égalité non autorisée' : <><CheckIcon />Confirmer le score</>}
          </button>
          {hasExistingScore && <button onClick={handleClear} className="w-full h-9 text-xs font-medium text-[#C4A0B0] hover:text-red-500 transition-colors">Effacer le score</button>}
          <button onClick={onClose} className="w-full h-9 text-xs text-[#C4A0B0]/60 hover:text-[#C4A0B0] transition-colors">Annuler</button>
        </div>
      </div>
    </div>
  )
}

function GreenTeamPanel({ name, score, isLeading, onInc, onDec }: { name: string | null; score: number; isLeading: boolean; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-stretch gap-0">
      <div className={`w-1 shrink-0 rounded-l-sm ${isLeading ? 'bg-[#E85D75]' : 'bg-[#B23A54]'}`} />
      <div className={`flex-1 rounded-r-xl p-4 transition-colors duration-200 ${isLeading ? 'bg-white shadow-sm' : 'bg-[#FFF8F3]'}`}>
        <span className={`text-sm font-bold leading-snug truncate block mb-3 ${isLeading ? 'text-[#3A1F2B]' : 'text-[#C4A0B0]'}`}>{name ?? 'Équipe'}</span>
        <div className="flex items-center justify-between gap-2">
          <button onPointerDown={(e) => { e.preventDefault(); onDec() }}
            className="h-12 w-12 rounded-full flex items-center justify-center text-xl select-none transition-transform duration-75 active:scale-90 bg-[#F0DDD0] text-[#B23A54] hover:bg-[#E8C9B8]">
            −
          </button>
          <span key={score} className={`text-8xl font-black tabular-nums select-none leading-none ${isLeading ? 'text-[#E85D75]' : 'text-[#C4A0B0]'}`}>{score}</span>
          <button onPointerDown={(e) => { e.preventDefault(); onInc() }}
            className="h-12 w-12 rounded-full flex items-center justify-center text-xl select-none transition-transform duration-75 active:scale-90 bg-[#B23A54] text-[#FFF1E8] hover:bg-[#9A2E44]">
            +
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utilitaires partagés
// ---------------------------------------------------------------------------

function CloseButton({ onClick, className, style }: { onClick: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={style}
      className={`h-8 w-8 flex items-center justify-center transition-colors ${className}`}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  )
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}
