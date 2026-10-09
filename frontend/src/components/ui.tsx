import type { ComponentProps, InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'

import type { Grade, Medal } from '../api/types'
import { GRADES } from '../lib/catalog'
import type { Tone } from '../lib/catalog'

type Variant = 'primary' | 'accent' | 'outline' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-bg border-2 border-ink',
  accent:
    'bg-us text-us-ink border-2 border-us shadow-[0_3px_0_color-mix(in_srgb,var(--us)_55%,#000)] active:translate-y-0.5 active:shadow-none',
  outline: 'bg-transparent text-ink border-2 border-ink',
  danger: 'bg-bad text-white border-2 border-bad',
  ghost: 'bg-surface text-ink border border-line',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function TextField({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <label htmlFor={props.id ?? id} className={`flex flex-col gap-1.5 text-sm font-semibold ${className}`}>
      {label}
      <input
        id={props.id ?? id}
        {...props}
        className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2.5 text-base font-normal text-ink outline-none focus:border-us"
      />
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  )
}

const TONE_CHIP: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
}

export function GradeChip({ grade, children }: { grade: Grade; children?: ReactNode }) {
  const g = GRADES[grade]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${TONE_CHIP[g.tone]}`}>
      {children ?? g.label}
    </span>
  )
}

export function Verdict({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex self-start rounded-full px-3 py-1.5 text-sm font-bold ${TONE_CHIP[tone]}`}>
      {children}
    </span>
  )
}

export function MedalCard({ medal }: { medal: Medal }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
      <div
        className={`grid size-11 flex-none place-items-center rounded-full font-display text-sm ${
          medal.earned
            ? 'bg-you text-you-ink shadow-[inset_0_0_0_3px_color-mix(in_srgb,#ffd23f_60%,#8a5a00)]'
            : 'bg-bg text-muted shadow-[inset_0_0_0_2px_var(--line)]'
        }`}
        aria-hidden
      >
        {medal.abbr}
      </div>
      <div className="min-w-0">
        <div className={`text-sm leading-tight font-semibold ${medal.earned ? '' : 'text-muted'}`}>
          {medal.name}
          <span className="sr-only">{medal.earned ? ' (conquistada)' : ' (ainda não conquistada)'}</span>
        </div>
        <div className="text-xs leading-snug text-muted">{medal.description}</div>
      </div>
    </div>
  )
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-muted" role="status">
      <div className="flex items-center gap-3">
        <span className="size-3 animate-blink rounded-full bg-us motion-reduce:animate-none" />
        {label}
      </div>
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo deu errado.'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-ink" role="alert">
      <span>{message}</span>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="flex-none">
      <rect x="1" y="1" width="26" height="26" rx="7" className="fill-court" />
      <line x1="1" y1="14" x2="27" y2="14" className="stroke-court-line" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="4.2" fill="none" className="stroke-court-line" strokeWidth="1.4" />
      <circle cx="19.5" cy="8" r="3" className="fill-you" />
    </svg>
  )
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-3 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  )
}
