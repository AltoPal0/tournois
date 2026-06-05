import type { Match } from '../types/tournament'

function toLocalISOString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function recalculateHoraires(
  matches: Match[],
  finishedMatchId: string,
  dureeMatchMin: number,
): { matchId: string; newHoraire: string }[] {
  const now = new Date()

  const planned = matches
    .filter((m) => m.piste != null && m.horaire != null)
    .sort((a, b) => new Date(a.horaire!).getTime() - new Date(b.horaire!).getTime())

  const finishTime = new Map<string, Date>()
  const pisteLastFinish = new Map<number, Date>()
  const pisteHasTerminated = new Set<number>()

  // Quand une équipe est libre, en ne regardant que les matchs planifiés AVANT beforeMs.
  // Cela évite que des matchs du soir bloquent des matchs de l'après-midi.
  function teamFreeAt(teamId: string, excludeId: string, beforeMs: number): Date {
    let max = new Date(0)
    for (const mx of planned) {
      if (mx.id === excludeId) continue
      const involved = mx.equipe1_id === teamId || mx.equipe2_id === teamId
      if (!involved) continue

      if (mx.statut === 'termine') {
        const t = finishTime.get(mx.id)
        if (t && t > max) max = t
      } else if (new Date(mx.horaire!).getTime() < beforeMs) {
        // Seulement les matchs non terminés dont l'horaire est avant le match courant
        const t = finishTime.has(mx.id)
          ? finishTime.get(mx.id)!
          : new Date(new Date(mx.horaire!).getTime() + dureeMatchMin * 60_000)
        if (t > max) max = t
      }
    }
    return max
  }

  for (const m of planned) {
    const piste = m.piste!

    if (m.statut === 'termine') {
      let finish: Date
      if (m.id === finishedMatchId) {
        finish = now
      } else {
        // L'heure de fin réelle d'un match terminé = début du match suivant sur la même piste
        // (déjà avancé par le recalcul précédent). Fallback : horaire + durée.
        const nextOnPiste = planned.find(
          (x) => x.piste === piste && new Date(x.horaire!).getTime() > new Date(m.horaire!).getTime(),
        )
        finish = nextOnPiste
          ? new Date(nextOnPiste.horaire!)
          : new Date(new Date(m.horaire!).getTime() + dureeMatchMin * 60_000)
      }
      finishTime.set(m.id, finish)
      pisteHasTerminated.add(piste)
      const prev = pisteLastFinish.get(piste) ?? new Date(0)
      if (finish > prev) pisteLastFinish.set(piste, finish)
    } else {
      // Contrainte piste : seulement si la piste a déjà un match terminé
      const pisteFree = pisteHasTerminated.has(piste)
        ? (pisteLastFinish.get(piste) ?? new Date(0))
        : new Date(0)

      // Contrainte équipes : matchs terminés + matchs actifs dont l'horaire précède celui-ci
      const mHoraireMs = new Date(m.horaire!).getTime()
      const t1Free = m.equipe1_id ? teamFreeAt(m.equipe1_id, m.id, mHoraireMs) : new Date(0)
      const t2Free = m.equipe2_id ? teamFreeAt(m.equipe2_id, m.id, mHoraireMs) : new Date(0)

      const constraintMs = Math.max(pisteFree.getTime(), t1Free.getTime(), t2Free.getTime())

      // Si aucune contrainte réelle → conserver l'horaire d'origine
      const newStart = constraintMs > 0 ? new Date(constraintMs) : new Date(m.horaire!)
      const newFinish = new Date(newStart.getTime() + dureeMatchMin * 60_000)
      finishTime.set(m.id, newFinish)

      if (pisteHasTerminated.has(piste)) {
        const prev = pisteLastFinish.get(piste) ?? new Date(0)
        if (newFinish > prev) pisteLastFinish.set(piste, newFinish)
      }
    }
  }

  const updates: { matchId: string; newHoraire: string }[] = []
  for (const m of planned) {
    if (m.statut !== 'a_jouer') continue
    const finish = finishTime.get(m.id)
    if (!finish) continue
    const newStart = new Date(finish.getTime() - dureeMatchMin * 60_000)
    const currentStart = new Date(m.horaire!)
    if (Math.abs(newStart.getTime() - currentStart.getTime()) > 60_000) {
      updates.push({ matchId: m.id, newHoraire: toLocalISOString(newStart) })
    }
  }
  return updates
}
