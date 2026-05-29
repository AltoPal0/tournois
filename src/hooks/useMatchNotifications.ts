import { useEffect, useRef } from 'react'
import type { Match } from '../types/tournament'

function formatHeure(horaire: string | null): string {
  if (!horaire) return ''
  const m = horaire.match(/T(\d{2}:\d{2})/) ?? horaire.match(/^(\d{2}:\d{2})/)
  return m ? ` · ~${m[1]}` : ''
}

export function useMatchNotifications(myTeamId: string | null, matches: Match[]) {
  const prevPistesRef = useRef<Map<string, number | null>>(new Map())

  useEffect(() => {
    if (!myTeamId || !('Notification' in window)) return

    const myMatches = matches.filter(
      (m) => m.equipe1_id === myTeamId || m.equipe2_id === myTeamId,
    )

    for (const m of myMatches) {
      const prevPiste = prevPistesRef.current.get(m.id) ?? null
      if (prevPiste == null && m.piste != null && m.statut === 'a_jouer') {
        if (Notification.permission === 'granted') {
          new Notification('Votre match est convoqué 🎾', {
            body: `Piste ${m.piste}${formatHeure(m.horaire)}`,
            icon: '/icons/icon-192.png',
          })
        }
      }
    }

    const next = new Map<string, number | null>()
    for (const m of matches) next.set(m.id, m.piste)
    prevPistesRef.current = next
  }, [myTeamId, matches])
}
