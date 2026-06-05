import { create } from 'zustand'
import type { Match, TeamWithJoueurs, TournamentGraph } from '../types/tournament'
import { supabase } from '../lib/supabase'
import { generateAllMatches, computeInputSlotPairs } from '../lib/matchGeneration'
import { computeAdvancements, computeAdvancementResets } from '../lib/advancement'
import { computeNextRoundPairings } from '../lib/swissPairing'
import { computeNextAmericanaSingleMatch } from '../lib/americanaSinglePairing'
import { useTournamentStore } from './tournamentStore'

interface MatchState {
  matches: Match[]
  isGenerating: boolean
  isGeneratingBatch: boolean
  isLoading: boolean
  isAssigning: boolean

  subscribeToMatches: (tournamentId: string) => () => void
  loadMatches: (tournamentId: string) => Promise<void>
  generateMatches: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignRandomTeams: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  seedRandomAssignments: (tournamentId: string, graph: TournamentGraph) => Promise<void>
  assignTeamToPhaseSlot: (tournamentId: string, phaseNodeId: string, slot: number, teamId: string | null) => Promise<void>
  assignPlayersToSlot: (tournamentId: string, phaseNodeId: string, slot: number, player1Id: string | null, player2Id: string | null) => Promise<string | null>
  updateMatchScore: (matchId: string, score1: number, score2: number) => Promise<void>
  clearMatchScore: (matchId: string) => Promise<void>
  updateMatchPiste: (matchId: string, piste: number | null) => Promise<void>
  updateMatchHoraire: (matchId: string, horaire: string | null) => Promise<void>
  configureTournament: (tournamentId: string) => Promise<void>
  activateTournament: (tournamentId: string) => Promise<void>
  startAmericanaSinglePhase: (tournamentId: string, phaseNodeId: string, playerIds: string[], pistes: number[]) => Promise<void>
  generateAmericanaSingleBatch: (phaseNodeId: string) => Promise<void>
  updateAmericanaSingleRoster: (phaseNodeId: string, restingPlayerIds: string[], newPlayerName?: string) => Promise<void>
  resetScores: (tournamentId: string) => Promise<void>
  clearMatches: (tournamentId: string) => Promise<void>
  clearSlotAssignments: (tournamentId: string) => Promise<void>
  reset: () => void
}

async function resolvePlayerIds(names: string[]): Promise<string[]> {
  const { data: existing } = await supabase.from('tt_joueurs').select('id, prenom')
  const joueurs = (existing ?? []) as { id: string; prenom: string }[]
  const ids: string[] = []
  for (const name of names) {
    const found = joueurs.find((j) => j.prenom.toLowerCase() === name.toLowerCase())
    if (found) {
      ids.push(found.id)
    } else {
      const { data: created } = await supabase
        .from('tt_joueurs')
        .insert({ prenom: name })
        .select('id')
        .single()
      if (created) ids.push(created.id)
    }
  }
  return ids
}

async function upsertTeam(player1Id: string, player2Id: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('tt_teams')
    .select('id')
    .or(`and(joueur1_id.eq.${player1Id},joueur2_id.eq.${player2Id}),and(joueur1_id.eq.${player2Id},joueur2_id.eq.${player1Id})`)
    .limit(1)
  if (existing && existing.length > 0) return existing[0].id
  const { data } = await supabase
    .from('tt_teams')
    .insert({ joueur1_id: player1Id, joueur2_id: player2Id })
    .select('id')
    .single()
  return data?.id ?? null
}

async function fetchTeamsMapForMatches(matches: Match[]): Promise<Map<string, TeamWithJoueurs>> {
  const teamIds = new Set<string>()
  for (const m of matches) {
    if (m.equipe1_id) teamIds.add(m.equipe1_id)
    if (m.equipe2_id) teamIds.add(m.equipe2_id)
  }
  if (teamIds.size === 0) return new Map()
  const { data } = await supabase
    .from('tt_teams')
    .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    .in('id', [...teamIds])
  const map = new Map<string, TeamWithJoueurs>()
  if (data) {
    for (const t of data as unknown as TeamWithJoueurs[]) map.set(t.id, t)
  }
  return map
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matches: [],
  isGenerating: false,
  isGeneratingBatch: false,
  isLoading: false,
  isAssigning: false,

  subscribeToMatches: (tournamentId) => {
    const channel = supabase
      .channel(`matches:${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tt_matches', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Match
            set((state) => ({
              matches: state.matches.map((m) => (m.id === updated.id ? updated : m)),
            }))
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Match
            set((state) => {
              if (state.matches.some((m) => m.id === inserted.id)) return state
              return { matches: [...state.matches, inserted] }
            })
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string }
            set((state) => ({
              matches: state.matches.filter((m) => m.id !== deleted.id),
            }))
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  loadMatches: async (tournamentId) => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: data ?? [], isLoading: false })
  },

  generateMatches: async (tournamentId, graph) => {
    set({ isGenerating: true })

    // Supprimer les matchs existants
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)

    // Générer les nouveaux matchs
    const { tournamentConfig } = useTournamentStore.getState()
    const newMatches = generateAllMatches(graph, tournamentId, {
      pistes: tournamentConfig?.pistes,
      matchDate: tournamentConfig?.matchDate,
      heureDebut: tournamentConfig?.heureDebut,
      dureeMatch: tournamentConfig?.dureeMatch,
    })

    if (newMatches.length > 0) {
      const { data } = await supabase
        .from('tt_matches')
        .insert(newMatches)
        .select()

      set({ matches: data ?? [], isGenerating: false })
    } else {
      set({ matches: [], isGenerating: false })
    }
  },

  assignRandomTeams: async (tournamentId, graph) => {
    set({ isAssigning: true })

    // Identifier les phases racine (pas d'arêtes entrantes)
    const rootNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana' && n.data.config.type !== 'americana_single',
    )

    // Calculer le nombre total d'équipes nécessaires
    const totalNeeded = rootNodes.reduce((sum, n) => sum + n.data.config.inputCount, 0)

    // Résoudre la liste des équipes selon joueurs inscrits ou pool global
    const { tournamentConfig } = useTournamentStore.getState()
    const inscrits = tournamentConfig?.joueursInscrits

    let teams: { id: string }[]

    if (inscrits && inscrits.length > 0) {
      // Récupérer les IDs des joueurs inscrits
      const { data: joueurs } = await supabase.from('tt_joueurs').select('id, prenom')
      if (!joueurs) { set({ isAssigning: false }); return }

      const nameSet = new Set(inscrits.map((n) => n.toLowerCase()))
      const playerIds = shuffle(
        joueurs.filter((j) => nameSet.has(j.prenom.toLowerCase())).map((j) => j.id),
      )

      if (playerIds.length < totalNeeded * 2) { set({ isAssigning: false }); return }

      // Apparier les joueurs deux par deux et trouver/créer les équipes
      const resolvedTeams: { id: string }[] = []
      for (let i = 0; i < totalNeeded * 2; i += 2) {
        const p1 = playerIds[i]
        const p2 = playerIds[i + 1]

        // Chercher équipe existante
        const { data: existing } = await supabase
          .from('tt_teams')
          .select('id')
          .or(`and(joueur1_id.eq.${p1},joueur2_id.eq.${p2}),and(joueur1_id.eq.${p2},joueur2_id.eq.${p1})`)
          .limit(1)

        if (existing && existing.length > 0) {
          resolvedTeams.push({ id: existing[0].id })
        } else {
          const { data: created } = await supabase
            .from('tt_teams')
            .insert({ joueur1_id: p1, joueur2_id: p2 })
            .select('id')
            .single()
          if (created) resolvedTeams.push({ id: created.id })
        }
      }

      if (resolvedTeams.length < totalNeeded) { set({ isAssigning: false }); return }
      teams = resolvedTeams
    } else {
      // Pool global : piocher dans les équipes existantes
      const { data: allTeams } = await supabase.from('tt_teams').select('id').limit(totalNeeded)
      if (!allTeams || allTeams.length < totalNeeded) { set({ isAssigning: false }); return }
      teams = shuffle(allTeams)
    }

    const shuffled = teams
    let teamIndex = 0

    const { matches } = get()

    // Construire toutes les mises à jour pour toutes les phases racine
    const allUpdates: PromiseLike<unknown>[] = []

    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      if (type === 'super_americana') continue

      const phaseTeams = shuffled.slice(teamIndex, teamIndex + inputCount)
      teamIndex += inputCount

      const slotToTeam = new Map<number, string>()
      phaseTeams.forEach((t, i) => slotToTeam.set(i + 1, t.id))

      const slotPairs = computeInputSlotPairs(type, inputCount, node.data.config.roundCount)
      const phaseMatches = matches
        .filter((m) => m.phase_node_id === node.id)
        .sort((a, b) => a.ordre - b.ordre)

      for (const pair of slotPairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue

        allUpdates.push(
          supabase
            .from('tt_matches')
            .update({
              equipe1_id: slotToTeam.get(pair.slot1) ?? null,
              equipe2_id: slotToTeam.get(pair.slot2) ?? null,
            })
            .eq('id', match.id),
        )
      }
    }

    // Envoyer tous les updates en parallèle
    await Promise.all(allUpdates)

    // Recharger les matchs
    const { data: updatedMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: updatedMatches ?? [], isAssigning: false })
  },

  seedRandomAssignments: async (tournamentId, graph) => {
    set({ isAssigning: true })

    const rootNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana' && n.data.config.type !== 'americana_single',
    )

    // Recharger les matchs depuis DB pour avoir les équipes actuellement assignées
    const { data: dbMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    const currentMatches = (dbMatches ?? []) as Match[]

    // Construire le mapping slot → équipe actuelle pour chaque phase
    const slotTeamEntries: { phaseNodeId: string; slot: number; teamId: string | null }[] = []

    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      const pairs = computeInputSlotPairs(type as Exclude<typeof type, 'super_americana' | 'americana_single'>, inputCount, node.data.config.roundCount)
      const phaseMatches = currentMatches.filter((m) => m.phase_node_id === node.id)

      const slotToTeam = new Map<number, string | null>()
      for (const pair of pairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue
        if (!slotToTeam.has(pair.slot1)) slotToTeam.set(pair.slot1, match.equipe1_id)
        if (!slotToTeam.has(pair.slot2)) slotToTeam.set(pair.slot2, match.equipe2_id)
      }

      for (let s = 1; s <= inputCount; s++) {
        slotTeamEntries.push({ phaseNodeId: node.id, slot: s, teamId: slotToTeam.get(s) ?? null })
      }
    }

    // Extraire et mélanger uniquement les équipes assignées (non-nulles)
    const assignedTeamIds = shuffle(
      slotTeamEntries.map((e) => e.teamId).filter(Boolean) as string[],
    )

    // Réaffecter les équipes mélangées aux slots dans l'ordre
    const slotToShuffled = new Map<string, string | null>()
    let idx = 0
    for (const entry of slotTeamEntries) {
      slotToShuffled.set(`${entry.phaseNodeId}-${entry.slot}`, entry.teamId !== null ? (assignedTeamIds[idx++] ?? null) : null)
    }

    // Mettre à jour chaque match en DB
    const allUpdates: PromiseLike<unknown>[] = []
    for (const node of rootNodes) {
      const { type, inputCount } = node.data.config
      const pairs = computeInputSlotPairs(type as Exclude<typeof type, 'super_americana' | 'americana_single'>, inputCount, node.data.config.roundCount)
      const phaseMatches = currentMatches.filter((m) => m.phase_node_id === node.id)

      for (const pair of pairs) {
        const match = phaseMatches.find((m) => m.ordre === pair.ordre)
        if (!match) continue
        allUpdates.push(
          supabase.from('tt_matches').update({
            equipe1_id: slotToShuffled.get(`${node.id}-${pair.slot1}`) ?? null,
            equipe2_id: slotToShuffled.get(`${node.id}-${pair.slot2}`) ?? null,
          }).eq('id', match.id),
        )
      }
    }

    await Promise.all(allUpdates)

    // Recharger le store
    const { data: updatedMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('phase_node_id')
      .order('ordre')

    set({ matches: updatedMatches ?? [], isAssigning: false })
  },

  updateMatchScore: async (matchId, score1, score2) => {
    const finishedAt = new Date().toISOString()

    await supabase
      .from('tt_matches')
      .update({
        score_equipe1: score1,
        score_equipe2: score2,
        statut: 'termine' as const,
        finished_at: finishedAt,
      })
      .eq('id', matchId)

    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: score1, score_equipe2: score2, statut: 'termine' as const, finished_at: finishedAt }
          : m,
      ),
    }))

    // Avancement automatique des équipes vers les phases suivantes
    const { nodes, edges } = useTournamentStore.getState()
    const graph: TournamentGraph = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }

    const advancements = computeAdvancements(matchId, get().matches, graph)

    if (advancements.length > 0) {
      for (const adv of advancements) {
        await supabase
          .from('tt_matches')
          .update({ [adv.field]: adv.teamId })
          .eq('id', adv.matchId)
      }

      // Mise à jour optimiste locale des avancements
      set((state) => ({
        matches: state.matches.map((m) => {
          const matchUpdates = advancements.filter((a) => a.matchId === m.id)
          if (matchUpdates.length === 0) return m
          const patched = { ...m }
          for (const u of matchUpdates) {
            ;(patched as Record<string, unknown>)[u.field] = u.teamId
          }
          return patched
        }),
      }))
    }

    // Appariement suisse pour tournante_libre
    const updatedMatch = get().matches.find((m) => m.id === matchId)
    if (updatedMatch) {
      const { nodes } = useTournamentStore.getState()
      const phaseNode = nodes.find((n) => n.id === updatedMatch.phase_node_id)
      if (phaseNode?.data.config.type === 'tournante_libre') {
        const phaseMatches = get().matches.filter((m) => m.phase_node_id === updatedMatch.phase_node_id)
        const pairUpdates = computeNextRoundPairings(matchId, phaseMatches)
        if (pairUpdates.length > 0) {
          for (const u of pairUpdates) {
            await supabase
              .from('tt_matches')
              .update({ equipe1_id: u.equipe1_id, equipe2_id: u.equipe2_id })
              .eq('id', u.matchId)
          }
          set((state) => ({
            matches: state.matches.map((m) => {
              const u = pairUpdates.find((p) => p.matchId === m.id)
              return u ? { ...m, equipe1_id: u.equipe1_id, equipe2_id: u.equipe2_id } : m
            }),
          }))
        }
      }
    }

  },

  clearMatchScore: async (matchId) => {
    await supabase
      .from('tt_matches')
      .update({ score_equipe1: null, score_equipe2: null, statut: 'a_jouer', finished_at: null })
      .eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId
          ? { ...m, score_equipe1: null, score_equipe2: null, statut: 'a_jouer' as const, finished_at: null }
          : m,
      ),
    }))

    // Nullifier les équipes déjà avancées downstream depuis cette phase
    const { nodes, edges } = useTournamentStore.getState()
    const graph: TournamentGraph = {
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle!,
        target: e.target,
        targetHandle: e.targetHandle!,
      })),
    }
    const resets = computeAdvancementResets(matchId, get().matches, graph)
    if (resets.length > 0) {
      for (const r of resets) {
        await supabase.from('tt_matches').update({ [r.field]: null }).eq('id', r.matchId)
      }
      set((state) => ({
        matches: state.matches.map((m) => {
          const matchResets = resets.filter((r) => r.matchId === m.id)
          if (matchResets.length === 0) return m
          const patched = { ...m }
          for (const r of matchResets) {
            ;(patched as Record<string, unknown>)[r.field] = null
          }
          return patched
        }),
      }))
    }
  },

  assignTeamToPhaseSlot: async (tournamentId, phaseNodeId, slot, teamId) => {
    const { nodes } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || node.data.config.type === 'super_americana' || node.data.config.type === 'americana_single') return

    const { type, inputCount } = node.data.config
    const pairs = computeInputSlotPairs(type, inputCount, node.data.config.roundCount)
    let phaseMatches = get().matches.filter((m) => m.phase_node_id === phaseNodeId)

    // Si le store est vide (pas encore chargé), recharger depuis DB
    if (phaseMatches.length === 0) {
      const { data } = await supabase
        .from('tt_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('phase_node_id', phaseNodeId)
      phaseMatches = (data ?? []) as Match[]
      if (phaseMatches.length > 0) {
        set((state) => {
          const existingIds = new Set(state.matches.map((m) => m.id))
          const newMatches = phaseMatches.filter((m) => !existingIds.has(m.id))
          return newMatches.length > 0 ? { matches: [...state.matches, ...newMatches] } : state
        })
      }
    }

    type MatchUpdate = { matchId: string; field: 'equipe1_id' | 'equipe2_id'; value: string | null }
    const updates: MatchUpdate[] = []

    for (const pair of pairs) {
      const match = phaseMatches.find((m) => m.ordre === pair.ordre)
      if (!match) continue
      if (pair.slot1 === slot) updates.push({ matchId: match.id, field: 'equipe1_id', value: teamId })
      if (pair.slot2 === slot) updates.push({ matchId: match.id, field: 'equipe2_id', value: teamId })
    }

    for (const u of updates) {
      await supabase.from('tt_matches').update({ [u.field]: u.value }).eq('id', u.matchId)
    }

    set((state) => ({
      matches: state.matches.map((m) => {
        const matchUpdates = updates.filter((u) => u.matchId === m.id)
        if (matchUpdates.length === 0) return m
        let patched = { ...m }
        for (const u of matchUpdates) {
          patched = { ...patched, [u.field]: u.value }
        }
        return patched
      }),
    }))

  },

  assignPlayersToSlot: async (tournamentId, phaseNodeId, slot, player1Id, player2Id) => {
    let teamId: string | null = null

    if (player1Id && player2Id) {
      // Chercher une équipe existante avec ces deux joueurs (dans n'importe quel ordre)
      const { data: existing } = await supabase
        .from('tt_teams')
        .select('id')
        .or(
          `and(joueur1_id.eq.${player1Id},joueur2_id.eq.${player2Id}),and(joueur1_id.eq.${player2Id},joueur2_id.eq.${player1Id})`,
        )
        .limit(1)

      if (existing && existing.length > 0) {
        teamId = existing[0].id
      } else {
        // Créer une nouvelle équipe
        const { data: newTeam } = await supabase
          .from('tt_teams')
          .insert({ joueur1_id: player1Id, joueur2_id: player2Id })
          .select('id')
          .single()
        if (newTeam) teamId = newTeam.id
      }
    }

    await get().assignTeamToPhaseSlot(tournamentId, phaseNodeId, slot, teamId)
    return teamId
  },

  updateMatchPiste: async (matchId, piste) => {
    await supabase.from('tt_matches').update({ piste }).eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) => (m.id === matchId ? { ...m, piste } : m)),
    }))
  },

  updateMatchHoraire: async (matchId, horaire) => {
    await supabase.from('tt_matches').update({ horaire }).eq('id', matchId)
    set((state) => ({
      matches: state.matches.map((m) => (m.id === matchId ? { ...m, horaire } : m)),
    }))
  },

  configureTournament: async (tournamentId) => {
    await supabase.from('tt_tournaments').update({ status: 'configured' }).eq('id', tournamentId)
    useTournamentStore.getState().setTournamentStatus('configured')

    // Créer les matchs initiaux des phases americana_single
    const { nodes, tournamentConfig } = useTournamentStore.getState()
    const pistes = tournamentConfig?.pistes ?? []
    for (const node of nodes) {
      if (node.data.config.type === 'americana_single') {
        const names = (node.data.config.playerNames ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (names.length < 4) continue
        // Vérifier si des matchs existent déjà pour cette phase (idempotent)
        const { data: existing } = await supabase
          .from('tt_matches')
          .select('id')
          .eq('phase_node_id', node.id)
          .limit(1)
        if (existing && existing.length > 0) continue
        const playerIds = await resolvePlayerIds(names)
        if (playerIds.length >= 4) {
          await get().startAmericanaSinglePhase(tournamentId, node.id, playerIds, pistes)
        }
      }
    }
  },

  activateTournament: async (tournamentId) => {
    await supabase.from('tt_tournaments').update({ status: 'active' }).eq('id', tournamentId)
    useTournamentStore.getState().setTournamentStatus('active')
  },

  startAmericanaSinglePhase: async (tournamentId, phaseNodeId, playerIds, pistes) => {
    const { nodes } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node) return

    const initialCount = Math.min(3, Math.floor(playerIds.length / 4))

    let currentPhaseMatches: Match[] = get().matches.filter((m) => m.phase_node_id === phaseNodeId)

    for (let i = 0; i < initialCount; i++) {
      const teamsMap = await fetchTeamsMapForMatches(currentPhaseMatches)
      const result = computeNextAmericanaSingleMatch(playerIds, currentPhaseMatches, teamsMap)
      if (!result) break

      const teamId1 = await upsertTeam(result.pair1[0], result.pair1[1])
      const teamId2 = await upsertTeam(result.pair2[0], result.pair2[1])
      if (!teamId1 || !teamId2) break

      const ordre = currentPhaseMatches.length + 1
      const { data: newMatch } = await supabase
        .from('tt_matches')
        .insert({
          tournament_id: tournamentId,
          phase_node_id: phaseNodeId,
          nom: `Match ${ordre} de ${node.data.config.name}`,
          statut: 'a_jouer',
          equipe1_id: teamId1,
          equipe2_id: teamId2,
          piste: pistes[i] ?? null,
          ordre,
          round: null,
          score_equipe1: null,
          score_equipe2: null,
          finished_at: null,
          horaire: null,
          equipe1_label: null,
          equipe2_label: null,
        })
        .select()
        .single()

      if (newMatch) {
        currentPhaseMatches = [...currentPhaseMatches, newMatch as Match]
        set((state) => ({ matches: [...state.matches, newMatch as Match] }))
      }
    }
  },

  generateAmericanaSingleBatch: async (phaseNodeId) => {
    if (get().isGeneratingBatch) return
    set({ isGeneratingBatch: true })

    try {
    const { nodes, tournamentConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || node.data.config.type !== 'americana_single') return

    // Vérifier en mémoire que tous les matchs sont terminés
    const phaseMatchesLocal = get().matches.filter((m) => m.phase_node_id === phaseNodeId)
    if (phaseMatchesLocal.length > 0 && phaseMatchesLocal.some((m) => m.statut === 'a_jouer')) return

    // Anti-conflit : vérifier en DB qu'aucun match actif n'existe déjà
    const { data: activeCheck } = await supabase
      .from('tt_matches')
      .select('id')
      .eq('phase_node_id', phaseNodeId)
      .eq('statut', 'a_jouer')
      .limit(1)
    if (activeCheck && activeCheck.length > 0) return

    const playerIds = await resolvePlayerIds(
      (node.data.config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    )
    if (playerIds.length < 4) return

    // Recharger les matchs depuis la DB pour avoir l'état exact
    const { data: dbMatches } = await supabase
      .from('tt_matches')
      .select('*')
      .eq('phase_node_id', phaseNodeId)
    let currentPhaseMatches: Match[] = (dbMatches ?? []) as Match[]

    const pistes = tournamentConfig?.pistes ?? []
    const restingPlayerIds = node.data.config.restingPlayerIds ?? []
    const activePlayers = restingPlayerIds.length
      ? playerIds.filter((id) => !restingPlayerIds.includes(id))
      : playerIds
    const batchSize = Math.min(3, Math.floor(activePlayers.length / 4))
    if (batchSize === 0) return

    for (let i = 0; i < batchSize; i++) {
      const teamsMap = await fetchTeamsMapForMatches(currentPhaseMatches)
      const result = computeNextAmericanaSingleMatch(playerIds, currentPhaseMatches, teamsMap, restingPlayerIds)
      if (!result) break

      const teamId1 = await upsertTeam(result.pair1[0], result.pair1[1])
      const teamId2 = await upsertTeam(result.pair2[0], result.pair2[1])
      if (!teamId1 || !teamId2) break

      const ordre = currentPhaseMatches.length + 1
      const { data: newMatch } = await supabase
        .from('tt_matches')
        .insert({
          tournament_id: currentPhaseMatches[0]?.tournament_id ?? node.id,
          phase_node_id: phaseNodeId,
          nom: `Match ${ordre} de ${node.data.config.name}`,
          statut: 'a_jouer',
          equipe1_id: teamId1,
          equipe2_id: teamId2,
          piste: pistes[i] ?? null,
          ordre,
          round: null,
          score_equipe1: null,
          score_equipe2: null,
          finished_at: null,
          horaire: null,
          equipe1_label: null,
          equipe2_label: null,
        })
        .select()
        .single()

      if (newMatch) {
        currentPhaseMatches = [...currentPhaseMatches, newMatch as Match]
        set((state) => {
          if (state.matches.some((m) => m.id === (newMatch as Match).id)) return state
          return { matches: [...state.matches, newMatch as Match] }
        })
      }
    }
    } finally {
      set({ isGeneratingBatch: false })
    }
  },

  updateAmericanaSingleRoster: async (phaseNodeId, restingPlayerIds, newPlayerName) => {
    const { nodes, edges, tournamentId, updatePhaseConfig } = useTournamentStore.getState()
    const node = nodes.find((n) => n.id === phaseNodeId)
    if (!node || !tournamentId) return

    const updates: Record<string, unknown> = { restingPlayerIds }

    if (newPlayerName) {
      const trimmed = newPlayerName.trim()
      if (trimmed) {
        await resolvePlayerIds([trimmed])
        const current = (node.data.config.playerNames ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (!current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
          current.push(trimmed)
          updates.playerNames = current.join(', ')
          updates.inputCount = current.length
        }
      }
    }

    updatePhaseConfig(phaseNodeId, updates as Parameters<typeof updatePhaseConfig>[1])

    // Sauvegarder immédiatement sans passer par isDirty
    const updatedNodes = useTournamentStore.getState().nodes
    await supabase.from('tt_tournaments').update({
      graph_config: {
        nodes: updatedNodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      },
    }).eq('id', tournamentId)
  },

  resetScores: async (tournamentId) => {
    await supabase
      .from('tt_matches')
      .update({ score_equipe1: null, score_equipe2: null, statut: 'a_jouer' })
      .eq('tournament_id', tournamentId)
    set((state) => ({
      matches: state.matches.map((m) =>
        m.tournament_id === tournamentId
          ? { ...m, score_equipe1: null, score_equipe2: null, statut: 'a_jouer' as const }
          : m,
      ),
    }))
  },

  clearMatches: async (tournamentId) => {
    await supabase.from('tt_matches').delete().eq('tournament_id', tournamentId)
    set({ matches: [] })
  },

  clearSlotAssignments: async (tournamentId) => {
    await supabase
      .from('tt_matches')
      .update({ equipe1_id: null, equipe2_id: null })
      .eq('tournament_id', tournamentId)

    set((state) => ({
      matches: state.matches.map((m) =>
        m.tournament_id === tournamentId
          ? { ...m, equipe1_id: null, equipe2_id: null }
          : m,
      ),
    }))
  },

  reset: () => set({ matches: [], isGenerating: false, isLoading: false, isAssigning: false }),
}))
