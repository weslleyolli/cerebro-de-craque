import type { KeyboardEvent } from 'react'

import type { Scenario } from '../api/types'
import { LETTERS } from '../lib/catalog'
import { COURT, teamOf } from './engine'
import type { Arrow, Snapshot } from './engine'

const MARGIN = 1.6
const LINE = 0.1

/** Linhas oficiais do futsal em escala: área de 6 m, marcas de 6 e 10 m, círculo de 3 m. */
export function CourtMarkings() {
  const { width: W, length: L, goalLeft: G1, goalRight: G2 } = COURT
  const line = { className: 'stroke-court-line', strokeWidth: LINE, fill: 'none' }
  const spot = 'fill-court-line'
  const netXs = Array.from({ length: 6 }, (_, i) => G1 + 0.3 + i * 0.5)
  return (
    <g>
      <rect
        x={-MARGIN}
        y={-MARGIN}
        width={W + 2 * MARGIN}
        height={L + 2 * MARGIN}
        className="fill-court-out"
      />
      <rect x={0} y={0} width={W} height={L} className="fill-court" />
      <rect x={0} y={0} width={W} height={L} {...line} />
      <line x1={0} y1={L / 2} x2={W} y2={L / 2} {...line} />
      <circle cx={W / 2} cy={L / 2} r={3} {...line} />
      <circle cx={W / 2} cy={L / 2} r={0.15} className={spot} />
      <path d={`M${G1 - 6} 0A6 6 0 0 0 ${G1} 6L${G2} 6A6 6 0 0 0 ${G2 + 6} 0`} {...line} />
      <path
        d={`M${G1 - 6} ${L}A6 6 0 0 1 ${G1} ${L - 6}L${G2} ${L - 6}A6 6 0 0 1 ${G2 + 6} ${L}`}
        {...line}
      />
      {[6, 10, L - 6, L - 10].map((y) => (
        <circle key={y} cx={W / 2} cy={y} r={0.14} className={spot} />
      ))}
      {[-1, L].map((y) => (
        <g key={y}>
          <rect
            x={G1}
            y={y}
            width={G2 - G1}
            height={1}
            className="stroke-court-line"
            strokeWidth={0.14}
            fill="none"
          />
          {netXs.map((x) => (
            <line
              key={x}
              x1={x}
              y1={y}
              x2={x}
              y2={y + 1}
              className="stroke-court-line"
              strokeWidth={0.04}
              opacity={0.6}
            />
          ))}
        </g>
      ))}
    </g>
  )
}

export function ArrowHeadDefs() {
  return (
    <defs>
      <marker
        id="arrow-head"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="3.6"
        markerHeight="3.6"
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10z" className="fill-you" />
      </marker>
    </defs>
  )
}

interface CourtProps {
  scenario: Scenario
  snapshot: Snapshot
  arrows?: Arrow[]
  /** Pausa tática: destaca a criança e deixa tocar nos companheiros das opções. */
  asking?: boolean
  onPick?: (optionIndex: number) => void
}

const ORDER = { them: 0, us: 1, you: 2 } as const

export function Court({ scenario, snapshot, arrows = [], asking = false, onPick }: CourtProps) {
  const { top, bottom } = scenario.view
  const pickable = new Map(
    arrows.filter((a) => a.target).map((a) => [a.target as string, a.index] as const),
  )
  const ids = Object.keys(snapshot.positions).sort((a, b) => ORDER[teamOf(a)] - ORDER[teamOf(b)])
  const youFacesDown = scenario.face.v === 'down'

  return (
    <svg
      viewBox={`${-MARGIN} ${top} ${COURT.width + 2 * MARGIN} ${bottom - top}`}
      className="mx-auto block h-auto max-h-[58vh] w-full lg:max-h-[70vh]"
      role="img"
      aria-label={`Quadra de futsal vista de cima: ${scenario.title}`}
    >
      <ArrowHeadDefs />
      <CourtMarkings />

      {asking &&
        arrows.map((a) => (
          <g key={a.index}>
            <line
              x1={a.from[0]}
              y1={a.from[1]}
              x2={a.end[0]}
              y2={a.end[1]}
              className="stroke-you"
              strokeWidth={0.17}
              strokeDasharray="0.45 0.3"
              strokeLinecap="round"
              markerEnd="url(#arrow-head)"
            />
            <g transform={`translate(${a.label[0]} ${a.label[1]})`}>
              <circle r={0.5} className="fill-you" />
              <text y={0.22} textAnchor="middle" fontSize={0.62} fontWeight={700} className="fill-you-ink">
                {LETTERS[a.index]}
              </text>
            </g>
          </g>
        ))}

      {ids.map((id) => {
        const p = snapshot.positions[id]!
        const team = teamOf(id)
        const tag = team === 'them' ? '' : id === 'gk' ? 'G' : (scenario.tags[id] ?? '')
        const pick = asking && onPick ? pickable.get(id) : undefined
        const interactive = pick !== undefined
        const choose = () => interactive && onPick?.(pick)
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            choose()
          }
        }
        return (
          <g
            key={id}
            transform={`translate(${p[0]} ${p[1]})`}
            {...(interactive && {
              role: 'button',
              tabIndex: 0,
              'aria-label': `Opção ${LETTERS[pick]}: ${scenario.options[pick]!.label}`,
              onClick: choose,
              onKeyDown,
              className: 'cursor-pointer outline-none focus-visible:[&>.body]:stroke-[0.3]',
            })}
          >
            {team === 'you' && asking && (
              <circle
                r={1.3}
                fill="none"
                strokeWidth={0.16}
                className="stroke-you origin-center animate-halo [transform-box:fill-box] motion-reduce:animate-none"
              />
            )}
            <circle
              r={0.8}
              strokeWidth={team === 'you' ? 0.14 : interactive ? 0.2 : 0.11}
              className={[
                'body',
                team === 'you' ? 'fill-you stroke-you-ink' : team === 'us' ? 'fill-us' : 'fill-them',
                team !== 'you' && (interactive ? 'stroke-you' : 'stroke-court-line'),
              ]
                .filter(Boolean)
                .join(' ')}
            />
            {tag && (
              <text
                y={0.2}
                textAnchor="middle"
                fontSize={0.56}
                fontWeight={700}
                className={team === 'you' ? 'fill-you-ink' : 'fill-us-ink'}
              >
                {tag}
              </text>
            )}
            {team === 'you' && (
              <g transform={`translate(0 ${youFacesDown ? -1.6 : 1.6})`}>
                <rect x={-1.15} y={-0.42} width={2.3} height={0.78} rx={0.39} className="fill-you" />
                <text y={0.2} textAnchor="middle" fontSize={0.6} fontWeight={700} className="fill-you-ink">
                  VOCÊ
                </text>
              </g>
            )}
          </g>
        )
      })}

      <circle
        cx={snapshot.ball[0]}
        cy={snapshot.ball[1]}
        r={0.36}
        fill="#fff"
        stroke="#111"
        strokeWidth={0.09}
      />
    </svg>
  )
}
