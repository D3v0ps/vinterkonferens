import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { onTableChange, type Query } from './db'
import { now } from './time'
import type { Row, TableName } from './types'

/** Hämtar en tabell och laddar om automatiskt när den ändras (eller var `pollMs`). */
export function useList<T extends TableName>(table: T, q?: Query, opts?: { pollMs?: number; enabled?: boolean }) {
  const [data, setData] = useState<Row<T>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(q ?? {})
  // Ny fråga: släpp förra frågans rader direkt (under render, så ingen ruta visar gammal data).
  const id = table + '|' + key
  const [dataFor, setDataFor] = useState(id)
  if (dataFor !== id) {
    setDataFor(id)
    setData([])
    setLoading(true)
    setError(null)
  }
  const enabled = opts?.enabled !== false
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!enabled) return
    const my = ++seq.current
    try {
      const rows = await api.list(table, JSON.parse(key) as Query)
      if (my === seq.current) {
        setData(rows)
        setError(null)
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message)
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [table, key, enabled])

  useEffect(() => {
    reload()
    const off = onTableChange(table, reload)
    const t = opts?.pollMs ? setInterval(reload, opts.pollMs) : undefined
    return () => {
      off()
      if (t) clearInterval(t)
    }
  }, [reload, table, opts?.pollMs])

  return { data, loading, error, reload, setData }
}

/** Nuvarande tid som uppdateras var `ms` (default 20 s) och när tidsmaskinen ändras. */
export function useNow(ms = 20_000): Date {
  const [t, setT] = useState(now())
  useEffect(() => {
    const tick = () => setT(now())
    const i = setInterval(tick, ms)
    window.addEventListener('vk-time', tick)
    return () => {
      clearInterval(i)
      window.removeEventListener('vk-time', tick)
    }
  }, [ms])
  return t
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const save = useCallback(
    (nv: T) => {
      setV(nv)
      try {
        localStorage.setItem(key, JSON.stringify(nv))
      } catch {
        /* privat läge */
      }
    },
    [key],
  )
  return [v, save]
}

/** Ett anonymt id per enhet – används för att ett betyg bara ska lämnas en gång. */
export function deviceId(): string {
  const k = 'vk-device'
  try {
    let id = localStorage.getItem(k)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(k, id)
    }
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2)
  }
}
