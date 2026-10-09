import { useCallback, useEffect, useRef, useState } from 'react'

import type { Frame } from '../api/types'
import { applyFrame, interpolate, snapshotOf } from './engine'
import type { BoardState, Snapshot } from './engine'

/**
 * Toca trechos de animação na quadra.
 *
 * `play` e `wait` devolvem `true` quando terminam e `false` quando foram
 * interrompidos (outra animação começou, a tela fechou), para quem chamou
 * saber se deve seguir para o próximo passo.
 */
export function useBoardAnimation(speed: number) {
  const stateRef = useRef<BoardState | null>(null)
  const tokenRef = useRef(0)
  const speedRef = useRef(speed)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const cancel = useCallback(() => {
    tokenRef.current++
  }, [])

  useEffect(() => cancel, [cancel])

  const reset = useCallback((state: BoardState) => {
    tokenRef.current++
    stateRef.current = state
    setSnapshot(snapshotOf(state))
  }, [])

  const play = useCallback(
    (frames: Frame[]) =>
      new Promise<boolean>((resolve) => {
        const token = ++tokenRef.current
        let i = 0
        const step = () => {
          if (token !== tokenRef.current) return resolve(false)
          const frame = frames[i++]
          const from = stateRef.current
          if (!frame || !from) return resolve(true)
          const to = applyFrame(from, frame)
          const duration = frame.ms * speedRef.current
          const t0 = performance.now()
          const tick = (now: number) => {
            if (token !== tokenRef.current) return resolve(false)
            const t = Math.min(1, (now - t0) / duration)
            setSnapshot(interpolate(from, to, t))
            if (t < 1) requestAnimationFrame(tick)
            else {
              stateRef.current = to
              step()
            }
          }
          requestAnimationFrame(tick)
        }
        step()
      }),
    [],
  )

  const wait = useCallback(
    (ms: number) =>
      new Promise<boolean>((resolve) => {
        const token = tokenRef.current
        setTimeout(() => resolve(token === tokenRef.current), ms)
      }),
    [],
  )

  const current = useCallback(() => stateRef.current, [])

  return { snapshot, reset, play, wait, cancel, current }
}
