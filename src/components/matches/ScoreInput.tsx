import { useState, useRef, useEffect } from 'react'
import { useMatchStore } from '../../store/matchStore'
import type { Match } from '../../types/tournament'

interface ScoreInputProps {
  match: Match
}

export default function ScoreInput({ match }: ScoreInputProps) {
  const updateMatchScore = useMatchStore((s) => s.updateMatchScore)
  const [editing, setEditing] = useState(false)
  const [score1, setScore1] = useState(match.score_equipe1 ?? 0)
  const [score2, setScore2] = useState(match.score_equipe2 ?? 0)
  const input1Ref = useRef<HTMLInputElement>(null)

  const canEdit = match.equipe1_id != null && match.equipe2_id != null
  const hasScore = match.score_equipe1 != null && match.score_equipe2 != null

  useEffect(() => {
    if (editing) input1Ref.current?.focus()
  }, [editing])

  function handleConfirm() {
    updateMatchScore(match.id, score1, score2)
    setEditing(false)
  }

  function handleCancel() {
    setScore1(match.score_equipe1 ?? 0)
    setScore2(match.score_equipe2 ?? 0)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') handleCancel()
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <input
          ref={input1Ref}
          type="number"
          min={0}
          value={score1}
          onChange={(e) => setScore1(parseInt(e.target.value) || 0)}
          onKeyDown={handleKeyDown}
          className="w-10 h-7 text-center text-sm font-medium rounded border border-gray-300
            focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <span className="text-gray-400 text-xs">-</span>
        <input
          type="number"
          min={0}
          value={score2}
          onChange={(e) => setScore2(parseInt(e.target.value) || 0)}
          onKeyDown={handleKeyDown}
          className="w-10 h-7 text-center text-sm font-medium rounded border border-gray-300
            focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={handleConfirm}
          className="h-7 w-7 inline-flex items-center justify-center rounded
            text-green-600 hover:bg-green-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={handleCancel}
          className="h-7 w-7 inline-flex items-center justify-center rounded
            text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    )
  }

  if (hasScore) {
    return (
      <button
        onClick={() => canEdit && setEditing(true)}
        disabled={!canEdit}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700
          hover:bg-green-50 rounded px-2 py-1 transition-colors disabled:cursor-default"
      >
        {match.score_equipe1} - {match.score_equipe2}
      </button>
    )
  }

  if (!canEdit) {
    return <span className="text-xs text-gray-300">—</span>
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border
        bg-amber-50 text-amber-700 border-amber-200
        hover:bg-amber-100 transition-colors cursor-pointer"
    >
      À jouer
    </button>
  )
}
