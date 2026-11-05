// Talarens porträtt som rund bild, som i det tryckta schemat. Utan foto: initialer.
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Bucket } from '../lib/db'
import { cx } from './ui'

// Samma fil hämtas bara en gång per sidvisning (blob-länkar och signerade länkar kostar).
const urls = new Map<string, Promise<string | null>>()

export function cachedFileUrl(bucket: Bucket, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`
  let p = urls.get(key)
  if (!p) {
    p = api.fileUrl(bucket, path).catch(() => null)
    urls.set(key, p)
  }
  return p
}

/** Glöm en fil, t.ex. när ett foto byts ut. */
export function forgetFileUrl(bucket: Bucket, path: string) {
  urls.delete(`${bucket}/${path}`)
}

export function useFileUrl(bucket: Bucket, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    void cachedFileUrl(bucket, path).then((u) => live && setUrl({ path, url: u }))
    return () => {
      live = false
    }
  }, [bucket, path])
  return path && url?.path === path ? url.url : null
}

const TITLES = /^(sh|sheikh|shaykh|dr|ust|imam|prof)\.?$/i

/** "Sh. Khedr Abdelmoati" → "KA". */
export function initials(name: string): string {
  const words = name.split(/[\s&,]+/).filter((w) => w && !TITLES.test(w))
  if (!words.length) return ''
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return (first + last).toLocaleUpperCase()
}

export function SpeakerAvatar({ name, photo, className = 'size-12' }: { name: string; photo?: string | null; className?: string }) {
  const url = useFileUrl('speakers', photo)
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ice text-ink-soft ring-2 ring-white shadow-sm', className)}
      aria-hidden
    >
      {url && !failed ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <span className="font-schedule font-semibold tracking-wide">{initials(name)}</span>
      )}
    </span>
  )
}
