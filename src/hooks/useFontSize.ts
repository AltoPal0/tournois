import { useState, useEffect } from 'react'

const STEPS = [13, 15, 17, 19, 22] // px — taille de la police racine
const DEFAULT_STEP = 1              // index par défaut → 15px
const KEY = 'padel_fontsize_step'

function applyStep(step: number) {
  document.documentElement.style.fontSize = `${STEPS[step]}px`
}

export function useFontSize() {
  const [step, setStep] = useState<number>(() => {
    const saved = localStorage.getItem(KEY)
    const idx = saved !== null ? parseInt(saved, 10) : DEFAULT_STEP
    return isNaN(idx) || idx < 0 || idx >= STEPS.length ? DEFAULT_STEP : idx
  })

  useEffect(() => {
    applyStep(step)
  }, [step])

  const increase = () =>
    setStep((s) => {
      const next = Math.min(s + 1, STEPS.length - 1)
      localStorage.setItem(KEY, String(next))
      return next
    })

  const decrease = () =>
    setStep((s) => {
      const next = Math.max(s - 1, 0)
      localStorage.setItem(KEY, String(next))
      return next
    })

  return { step, maxStep: STEPS.length - 1, increase, decrease }
}
