export function seconds(ms: number | null | undefined): string {
  if (ms == null) return '–'
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

export function percent(part: number, total: number): number {
  return total ? Math.round((100 * part) / total) : 0
}

export function dateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
