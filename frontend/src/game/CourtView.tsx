import { Component, Suspense, lazy, useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { Scenario } from '../api/types'
import { Court } from './Court'
import type { Arrow, Snapshot } from './engine'

// O 3D (three.js) só é baixado quando a visão 3D aparece pela primeira vez.
const Court3D = lazy(() => import('./Court3D'))

export type ViewMode = '3d' | '2d'

const VIEW_KEY = 'craque.view'

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d'
  } catch {
    return '3d'
  }
}

/** Visão escolhida neste aparelho. Começa no 3D. */
export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(readView)
  const change = useCallback((v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* vale só nesta aba */
    }
  }, [])
  return [view, change]
}

export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const options: { value: ViewMode; label: string }[] = [
    { value: '3d', label: 'Jogador 3D' },
    { value: '2d', label: 'Prancheta' },
  ]
  return (
    <div role="radiogroup" aria-label="Visão da quadra" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 ${view === o.value ? 'bg-ink text-bg' : 'text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Se o aparelho não tiver WebGL (ou o 3D falhar), mostra a prancheta. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface CourtViewProps {
  view: ViewMode
  scenario: Scenario
  snapshot: Snapshot
  arrows: Arrow[]
  asking: boolean
  onPick: (optionIndex: number) => void
}

export function CourtView({ view, ...props }: CourtViewProps) {
  const flat = <Court {...props} />
  if (view === '2d') return flat

  const fallback = (
    <div className="flex flex-col gap-2">
      <p className="px-2 pt-1 text-xs text-court-line">Este aparelho não abriu o 3D. Mostrando a prancheta.</p>
      {flat}
    </div>
  )
  return (
    <Fallback fallback={fallback}>
      <div className="aspect-[4/5] max-h-[62vh] w-full overflow-hidden rounded-xl sm:aspect-[4/3] lg:aspect-[5/6] lg:max-h-[72vh]">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-sm text-court-line" role="status">
              Montando a quadra 3D…
            </div>
          }
        >
          <Court3D {...props} />
        </Suspense>
      </div>
    </Fallback>
  )
}
