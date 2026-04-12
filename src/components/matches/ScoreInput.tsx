import { useState } from 'react'
import { GiTennisBall } from 'react-icons/gi'
import { useMatchStore } from '../../store/matchStore'
import type { Match } from '../../types/tournament'

// ---------------------------------------------------------------------------
// Balle de tennis (export pour PhaseSection)
// ---------------------------------------------------------------------------

export function TennisBall({ className }: { className?: string }) {
  return <GiTennisBall className={className} style={{ color: '#fbbf24' }} />
}

// ---------------------------------------------------------------------------
// Affichage compact des scores dans les cartes match (export pour PhaseSection)
// ---------------------------------------------------------------------------

export function ScoreDisplay({ v1, v2 }: { v1: number; v2: number }) {
  const team1Won = v1 > v2
  const team2Won = v2 > v1
  return (
    <div className="flex flex-col items-end gap-0">
      <span className={`text-xl font-black font-mono leading-tight tabular-nums
        ${team1Won ? 'text-blue-600' : 'text-gray-300'}`}>
        {v1}
      </span>
      <span className={`text-xl font-black font-mono leading-tight tabular-nums
        ${team2Won ? 'text-blue-600' : 'text-gray-300'}`}>
        {v2}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bouton +/−  avec feedback visuel
// ---------------------------------------------------------------------------

function ScoreButton({ label, onClick }: { label: '+' | '−'; onClick: () => void }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick() }}
      className={`h-16 w-16 rounded-2xl flex items-center justify-center text-3xl font-thin
        select-none transition-transform duration-75 active:scale-90
        ${label === '+'
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Panneau d'une équipe
// ---------------------------------------------------------------------------

function TeamPanel({
  name,
  score,
  isLeading,
  onInc,
  onDec,
}: {
  name: string | null
  score: number
  isLeading: boolean
  onInc: () => void
  onDec: () => void
}) {
  return (
    <div className={`rounded-2xl p-4 transition-colors duration-200
      ${isLeading ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-gray-50'}`}>

      {/* Nom + balle */}
      <div className="flex items-center gap-2 mb-4 min-h-[1.75rem]">
        <span className="text-base font-semibold leading-tight text-gray-700">
          {name ?? 'Équipe'}
        </span>
        {isLeading && <TennisBall className="w-5 h-5 shrink-0" />}
      </div>

      {/* Score + boutons */}
      <div className="flex items-center justify-between gap-2">
        <ScoreButton label="−" onClick={onDec} />
        <span
          key={score}
          className={`text-7xl font-black tabular-nums select-none
            ${isLeading ? 'text-amber-700' : 'text-gray-800'}`}
        >
          {score}
        </span>
        <ScoreButton label="+" onClick={onInc} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlay principal (composant contrôlé)
// ---------------------------------------------------------------------------

interface ScoreInputProps {
  match: Match
  team1Name: string | null
  team2Name: string | null
  isOpen: boolean
  onClose: () => void
}

export default function ScoreInput({ match, team1Name, team2Name, isOpen, onClose }: ScoreInputProps) {
  const updateMatchScore = useMatchStore((s) => s.updateMatchScore)
  const clearMatchScore = useMatchStore((s) => s.clearMatchScore)
  const [s1, setS1] = useState(() => match.score_equipe1 ?? 0)
  const [s2, setS2] = useState(() => match.score_equipe2 ?? 0)

  const team1Leads = s1 > s2
  const team2Leads = s2 > s1
  const hasExistingScore = match.score_equipe1 != null && match.score_equipe2 != null

  const handleConfirm = () => {
    updateMatchScore(match.id, s1, s2)
    onClose()
  }

  const handleClear = () => {
    clearMatchScore(match.id)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {match.nom}
          </span>
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

        {/* Panneaux équipes */}
        <div className="px-4 space-y-2.5 pb-3">
          <TeamPanel
            name={team1Name}
            score={s1}
            isLeading={team1Leads}
            onInc={() => setS1((v) => v + 1)}
            onDec={() => setS1((v) => Math.max(0, v - 1))}
          />

          {/* Séparateur VS */}
          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <TeamPanel
            name={team2Name}
            score={s2}
            isLeading={team2Leads}
            onInc={() => setS2((v) => v + 1)}
            onDec={() => setS2((v) => Math.max(0, v - 1))}
          />
        </div>

        {/* Actions */}
        <div className="px-4 pb-8 pt-2 space-y-2">
          <button
            onClick={handleConfirm}
            className="w-full h-14 rounded-2xl bg-blue-600 text-white text-base font-semibold
              flex items-center justify-center gap-2
              hover:bg-blue-700 active:scale-[0.98] transition-all duration-150 shadow-md shadow-blue-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Confirmer le score
          </button>
          {hasExistingScore && (
            <button
              onClick={handleClear}
              className="w-full h-10 text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
            >
              Effacer le score
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full h-10 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
