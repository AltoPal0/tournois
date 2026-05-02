import { useState, useRef, useCallback } from 'react'

export const PULL_THRESHOLD = 72

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const startYRef = useRef<number | null>(null)
  const pullRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const setDist = (d: number) => {
    pullRef.current = d
    setPullDistance(d)
  }

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    if (el.scrollTop > 0) return
    startYRef.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (startYRef.current === null || isRefreshing) return
      const el = e.currentTarget as HTMLElement
      if (el.scrollTop > 0) {
        startYRef.current = null
        setDist(0)
        return
      }
      const delta = e.touches[0].clientY - startYRef.current
      if (delta > 0) {
        setDist(Math.min(delta * 0.5, PULL_THRESHOLD * 1.5))
      }
    },
    [isRefreshing],
  )

  const onTouchEnd = useCallback(async () => {
    if (startYRef.current === null) return
    startYRef.current = null
    const dist = pullRef.current
    setDist(0)
    if (dist >= PULL_THRESHOLD) {
      setIsRefreshing(true)
      await onRefresh()
      setIsRefreshing(false)
    }
  }, [onRefresh])

  return {
    pullDistance,
    isRefreshing,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd } as const,
  }
}
