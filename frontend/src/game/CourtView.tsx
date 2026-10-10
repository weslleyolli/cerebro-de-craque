import { Component, Suspense, lazy } from 'react'
import type { ReactNode } from 'react'

import type { ScanViewProps } from './ScanView'

// O 3D (three.js) só é baixado quando a visão do jogador aparece pela primeira vez.
const ScanView = lazy(() => import('./ScanView'))

/** Se o aparelho não tiver WebGL (ou o 3D falhar), avisa a tela do treino, que mostra a prancheta. */
class Guard extends Component<{ onUnavailable: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onUnavailable()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Visão do jogador em 3D, com carregamento sob demanda e saída para a prancheta. */
export function PlayerView({ onUnavailable, ...props }: ScanViewProps & { onUnavailable: () => void }) {
  return (
    <Guard onUnavailable={onUnavailable}>
      <Suspense
        fallback={
          <div className="grid h-full place-items-center text-sm text-court-line" role="status">
            Montando a quadra 3D…
          </div>
        }
      >
        <ScanView {...props} />
      </Suspense>
    </Guard>
  )
}
