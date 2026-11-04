import type { Lang, Localized } from './types'

/** Plockar rätt språk ur ett flerspråkigt fält, med svenska som reserv. */
export function tr(v: Localized | null | undefined, lang: Lang): string {
  if (!v) return ''
  return v[lang]?.trim() || v.sv?.trim() || v.en?.trim() || v.ar?.trim() || ''
}

export function kr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 }).format(n)
}

export function num(n: number, digits = 0): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: digits }).format(n)
}

export function fileSize(b: number | null | undefined): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} kB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}

/** CSV som Excel (svensk) öppnar direkt: semikolon + BOM. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
