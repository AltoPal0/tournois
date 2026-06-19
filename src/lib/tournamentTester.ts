import type { Match, TournamentGraph, TournamentConfig, TeamWithJoueurs, PhaseType } from '../types/tournament'
import { computeStandings } from './standings'
import { computeWeightedAmericanoStandings } from './americanaSingleStandings'

export type TestSeverity = 'error' | 'warning' | 'info'

export interface StaticTestResult {
  id: string
  severity: TestSeverity
  category: 'players' | 'schedule' | 'graph'
  message: string
  details?: string
}

export interface PhaseSimResult {
  phaseNodeId: string
  phaseName: string
  phaseType: PhaseType
  matchesPlayed: number
  standingsCorrect: boolean
  advancementsCorrect: boolean
  retroactiveCorrect?: boolean
  errors: string[]
}

export interface DynamicTestResult {
  testTournamentId: string
  testTournamentName: string
  phaseResults: PhaseSimResult[]
  globalSuccess: boolean
  errors: string[]
}

export interface TournamentTestReport {
  static: StaticTestResult[]
  dynamic: DynamicTestResult | null
  ranAt: string
  durationMs: number
}

const INVISIBLE_TYPES = new Set<PhaseType>(['super_americana', 'best_of', 'team_builder', 'team_splitter'])

export function runStaticTests(
  graph: TournamentGraph,
  matches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
  tournamentConfig: TournamentConfig,
): StaticTestResult[] {
  const results: StaticTestResult[] = []

  // A — Unicité des noms
  const allNames: string[] = []
  if (tournamentConfig.joueursInscrits) {
    allNames.push(...tournamentConfig.joueursInscrits)
  }
  for (const node of graph.nodes) {
    const pn = node.data.config.playerNames
    if (pn) allNames.push(...pn.split(',').map((s) => s.trim()).filter(Boolean))
  }
  const seen = new Map<string, number>()
  for (const name of allNames) {
    const key = name.toLowerCase()
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      results.push({
        id: `duplicate-player-${key}`,
        severity: 'error',
        category: 'players',
        message: `Nom en doublon : "${key}" (${count} occurrences)`,
      })
    }
  }

  // B — Conflits de planning
  const scheduled = matches.filter((m) => m.horaire != null && m.piste != null)
  const byHoraire = new Map<string, Match[]>()
  for (const m of scheduled) {
    const key = m.horaire!
    if (!byHoraire.has(key)) byHoraire.set(key, [])
    byHoraire.get(key)!.push(m)
  }
  for (const [horaire, group] of byHoraire) {
    const pistesSeen = new Map<number, string>()
    for (const m of group) {
      const existing = pistesSeen.get(m.piste!)
      if (existing) {
        results.push({
          id: `court-conflict-${horaire}-${m.piste}`,
          severity: 'error',
          category: 'schedule',
          message: `Piste ${m.piste} occupée deux fois à ${formatHoraire(horaire)}`,
          details: `"${existing}" et "${m.nom}"`,
        })
      } else {
        pistesSeen.set(m.piste!, m.nom)
      }
    }

    const playersSeen = new Map<string, string>()
    for (const m of group) {
      const players: string[] = []
      if (m.equipe1_id) {
        const t = teamsMap.get(m.equipe1_id)
        if (t) players.push(t.joueur1.prenom, t.joueur2.prenom)
      } else if (m.equipe1_label) {
        players.push(...m.equipe1_label.split('/').map((s) => s.trim()).filter(Boolean))
      }
      if (m.equipe2_id) {
        const t = teamsMap.get(m.equipe2_id)
        if (t) players.push(t.joueur1.prenom, t.joueur2.prenom)
      } else if (m.equipe2_label) {
        players.push(...m.equipe2_label.split('/').map((s) => s.trim()).filter(Boolean))
      }
      for (const p of players) {
        const key = p.toLowerCase()
        const existing = playersSeen.get(key)
        if (existing) {
          results.push({
            id: `player-conflict-${horaire}-${key}`,
            severity: 'error',
            category: 'schedule',
            message: `"${p}" joue deux matchs simultanément à ${formatHoraire(horaire)}`,
            details: `"${existing}" et "${m.nom}"`,
          })
        } else {
          playersSeen.set(key, m.nom)
        }
      }
    }
  }

  // C — Cohérence du graphe
  for (const node of graph.nodes) {
    if (INVISIBLE_TYPES.has(node.data.config.type)) continue
    const inCount = graph.edges.filter((e) => e.target === node.id).length
    if (inCount === 0) continue
    const expected = node.data.config.inputCount
    if (inCount > expected) {
      results.push({
        id: `graph-overflow-${node.id}`,
        severity: 'error',
        category: 'graph',
        message: `"${node.data.config.name}" : ${inCount} arêtes entrantes pour ${expected} slots`,
      })
    } else if (inCount < expected) {
      results.push({
        id: `graph-incomplete-${node.id}`,
        severity: 'warning',
        category: 'graph',
        message: `"${node.data.config.name}" : ${inCount}/${expected} slots connectés`,
      })
    }
  }

  return results
}

export function verifyStandings(
  phaseNode: TournamentGraph['nodes'][number],
  allMatches: Match[],
): { ok: boolean; error?: string } {
  const config = phaseNode.data.config
  const phaseMatches = allMatches.filter((m) => m.phase_node_id === phaseNode.id)
  const done = phaseMatches.filter((m) => m.statut === 'termine')

  if (config.type === 'americana_weighted') {
    const standings = computeWeightedAmericanoStandings(done)
    const allNames = (config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (standings.length !== allNames.length) {
      return { ok: false, error: `Standings: ${standings.length} joueurs attendus ${allNames.length}` }
    }
    const inconsistent = standings.find((r) => r.wins + r.losses !== r.played)
    if (inconsistent) {
      return { ok: false, error: `Standings incohérents pour "${inconsistent.playerId}"` }
    }
    return { ok: true }
  }

  const standings = computeStandings(done)
  const inconsistent = standings.find((r) => r.wins + r.losses !== r.played || r.points !== r.wins)
  if (inconsistent) {
    return { ok: false, error: `Standings incohérents pour l'équipe ${inconsistent.teamId}` }
  }
  return { ok: true }
}

export function verifyAdvancements(
  phaseNode: TournamentGraph['nodes'][number],
  allMatches: Match[],
  graph: TournamentGraph,
): { ok: boolean; error?: string } {
  const config = phaseNode.data.config
  if (config.type === 'americana_weighted') return { ok: true }

  for (const output of config.outputs) {
    const outEdge = graph.edges.find(
      (e) => e.source === phaseNode.id && e.sourceHandle === `out-${output.rank}`,
    )
    if (!outEdge) continue

    const label = `${output.label} de ${config.name}`
    const targets = allMatches.filter((m) => m.equipe1_label === label || m.equipe2_label === label)
    for (const t of targets) {
      const field = t.equipe1_label === label ? 'equipe1_id' : 'equipe2_id'
      if (!(t as unknown as Record<string, unknown>)[field]) {
        return { ok: false, error: `Slot "${label}" non rempli dans "${t.nom}"` }
      }
    }
  }
  return { ok: true }
}

function formatHoraire(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
