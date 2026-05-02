import { useState, useCallback } from 'react'
import type { TeamWithJoueurs } from '../types/tournament'

export interface PlayerIdentity {
  joueurId: string
  prenom: string
}

function storageKey(tournamentId: string) {
  return `padel_identity_${tournamentId}`
}

function readFromStorage(tournamentId: string): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(storageKey(tournamentId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.joueurId && parsed?.prenom) return parsed as PlayerIdentity
    return null
  } catch {
    return null
  }
}

export function usePlayerIdentity(tournamentId: string) {
  const [identity, setIdentityState] = useState<PlayerIdentity | null>(
    () => readFromStorage(tournamentId),
  )

  const setIdentity = useCallback(
    (joueur: { id: string; prenom: string }) => {
      const next: PlayerIdentity = { joueurId: joueur.id, prenom: joueur.prenom }
      localStorage.setItem(storageKey(tournamentId), JSON.stringify(next))
      setIdentityState(next)
    },
    [tournamentId],
  )

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(storageKey(tournamentId))
    setIdentityState(null)
  }, [tournamentId])

  const findMyTeam = useCallback(
    (teams: TeamWithJoueurs[]): TeamWithJoueurs | null => {
      if (!identity) return null
      return (
        teams.find(
          (t) => t.joueur1.id === identity.joueurId || t.joueur2.id === identity.joueurId,
        ) ?? null
      )
    },
    [identity],
  )

  return { identity, setIdentity, clearIdentity, findMyTeam }
}
