import { useState, useRef } from 'react'
import type { Match, TournamentGraph, TournamentConfig, TeamWithJoueurs } from '../../types/tournament'
import { runStaticTests } from '../../lib/tournamentTester'
import { runDynamicTest } from '../../lib/tournamentTestRunner'
import type { TournamentTestReport, StaticTestResult, PhaseSimResult } from '../../lib/tournamentTester'

interface Props {
  tournamentId: string
  tournamentName: string
  graph: TournamentGraph
  matches: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
  tournamentConfig: TournamentConfig
  onClose: () => void
}

type RunState = 'idle' | 'runningStatic' | 'runningDynamic' | 'done' | 'error'

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-red-600 bg-red-50 border-red-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  info: 'text-blue-600 bg-blue-50 border-blue-200',
}

const SEVERITY_ICON: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
}

export default function TournamentTestPanel({
  tournamentId,
  tournamentName,
  graph,
  matches,
  teamsMap,
  tournamentConfig,
  onClose,
}: Props) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [report, setReport] = useState<TournamentTestReport | null>(null)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const startTime = useRef<number>(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  function addLog(msg: string) {
    setProgressLog((prev) => {
      const next = [...prev, msg]
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return next
    })
  }

  async function handleStaticOnly() {
    setRunState('runningStatic')
    startTime.current = Date.now()
    const staticResults = runStaticTests(graph, matches, teamsMap, tournamentConfig)
    setReport({
      static: staticResults,
      dynamic: null,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startTime.current,
    })
    setRunState('done')
  }

  async function handleFull() {
    setRunState('runningDynamic')
    setProgressLog([])
    startTime.current = Date.now()

    const staticResults = runStaticTests(graph, matches, teamsMap, tournamentConfig)
    addLog('Tests statiques terminés')

    try {
      const dynamic = await runDynamicTest(tournamentId, tournamentName, addLog)
      setReport({
        static: staticResults,
        dynamic,
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - startTime.current,
      })
      setRunState('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setReport({
        static: staticResults,
        dynamic: { testTournamentId: '', testTournamentName: `${tournamentName} - tested`, phaseResults: [], globalSuccess: false, errors: [msg] },
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - startTime.current,
      })
      setRunState('error')
    }
  }

  const canClose = runState === 'idle' || runState === 'done' || runState === 'error'
  const isRunning = runState === 'runningStatic' || runState === 'runningDynamic'

  const staticErrors = report?.static.filter((r) => r.severity === 'error').length ?? 0
  const staticWarnings = report?.static.filter((r) => r.severity === 'warning').length ?? 0
  const staticOk = report && staticErrors === 0

  const dynamicOk = report?.dynamic?.globalSuccess ?? false
  const overallOk = report ? staticOk && (report.dynamic == null || dynamicOk) : false

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end">
      <div className="w-full max-w-xl bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 flex items-center px-5 gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">Test du tournoi</p>
            <p className="text-xs text-gray-500 truncate">{tournamentName}</p>
          </div>
          {report && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${overallOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {overallOk ? 'PASS' : 'FAIL'}
            </span>
          )}
          <button
            onClick={onClose}
            disabled={!canClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Boutons */}
          {runState === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Choisissez le type de test à effectuer.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleStaticOnly}
                  className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">Vérification rapide</span>
                  <span className="text-xs text-gray-500">Noms, planning, graphe</span>
                </button>
                <button
                  onClick={handleFull}
                  className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-all text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">Simulation complète</span>
                  <span className="text-xs text-gray-500">Crée une copie + simule</span>
                </button>
              </div>
            </div>
          )}

          {/* Spinner pendant l'exécution */}
          {isRunning && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin shrink-0" />
                <span className="text-sm text-gray-700">Simulation en cours...</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto text-xs text-gray-500 space-y-0.5 font-mono">
                {progressLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Résultats */}
          {report && (
            <>
              <div className="text-xs text-gray-400">
                Durée : {(report.durationMs / 1000).toFixed(1)}s
                {report.dynamic?.testTournamentId && (
                  <> · <a href={`/tournament/${report.dynamic.testTournamentId}/matches`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Ouvrir le tournoi test</a></>
                )}
              </div>

              {/* Tests statiques */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Tests statiques</h3>
                  <StatusBadge ok={staticOk ?? false} />
                  {staticErrors > 0 && <span className="text-xs text-red-600">{staticErrors} erreur{staticErrors > 1 ? 's' : ''}</span>}
                  {staticErrors === 0 && staticWarnings > 0 && <span className="text-xs text-amber-600">{staticWarnings} avertissement{staticWarnings > 1 ? 's' : ''}</span>}
                </div>
                {report.static.length === 0 ? (
                  <p className="text-xs text-green-600 flex items-center gap-1.5"><span>✓</span>Aucun problème détecté</p>
                ) : (
                  <div className="space-y-1.5">
                    {groupBy(report.static, 'category').map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{CATEGORY_LABEL[cat] ?? cat}</p>
                        {items.map((r: StaticTestResult) => (
                          <div key={r.id} className={`flex gap-2 items-start p-2 rounded-lg border text-xs mb-1 ${SEVERITY_COLORS[r.severity]}`}>
                            <span className="font-bold shrink-0">{SEVERITY_ICON[r.severity]}</span>
                            <div className="min-w-0">
                              <p>{r.message}</p>
                              {r.details && <p className="opacity-70 mt-0.5">{r.details}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Tests dynamiques */}
              {report.dynamic && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Simulation</h3>
                    <StatusBadge ok={report.dynamic.globalSuccess} />
                  </div>

                  {report.dynamic.errors.length > 0 && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 space-y-0.5">
                      {report.dynamic.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}

                  <div className="space-y-2">
                    {report.dynamic.phaseResults.map((r) => (
                      <PhaseResultRow key={r.phaseNodeId} result={r} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer — bouton rejouer */}
        {(runState === 'done' || runState === 'error') && (
          <div className="border-t border-gray-200 px-5 py-3 flex justify-between items-center shrink-0">
            <button
              onClick={() => { setRunState('idle'); setReport(null); setProgressLog([]) }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Nouveau test
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      {ok ? 'OK' : 'FAIL'}
    </span>
  )
}

function PhaseResultRow({ result }: { result: PhaseSimResult }) {
  const [expanded, setExpanded] = useState(false)
  const allOk = result.standingsCorrect && result.advancementsCorrect && result.errors.length === 0 && (result.retroactiveCorrect === undefined || result.retroactiveCorrect)

  return (
    <div className={`rounded-lg border ${allOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <span className={`text-base ${allOk ? 'text-green-600' : 'text-red-500'}`}>{allOk ? '✓' : '✗'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate">{result.phaseName}</p>
          <p className="text-xs text-gray-500">{result.phaseType} · {result.matchesPlayed} matchs</p>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs space-y-1">
          <CheckItem label="Standings" ok={result.standingsCorrect} />
          <CheckItem label="Avancements" ok={result.advancementsCorrect} />
          {result.retroactiveCorrect !== undefined && (
            <CheckItem label="Test rétroactif" ok={result.retroactiveCorrect} />
          )}
          {result.errors.map((e, i) => (
            <p key={i} className="text-red-600 pl-4">{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? 'text-green-600' : 'text-red-500'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-gray-600' : 'text-red-600'}>{label}</span>
    </div>
  )
}

const CATEGORY_LABEL: Record<string, string> = {
  players: 'Joueurs',
  schedule: 'Planning',
  graph: 'Graphe',
}

function groupBy<T>(arr: T[], key: keyof T): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = String(item[key])
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries())
}
