import { Fragment } from 'react'

// Stockholms moskés logotyp (Islamiska Förbundet). Färgversionen på ljus botten,
// den vita på navy – som moskén själv gör på sina konferensomslag.
const base = import.meta.env.BASE_URL
const ALT = 'Islamiska Förbundet – Stockholms moské'

export function Logo({ variant = 'color', className = 'h-[50px] w-auto' }: { variant?: 'color' | 'white'; className?: string }) {
  return <img src={`${base}brand/logo-horisontell-${variant === 'white' ? 'vit' : 'farg'}.png`} alt={ALT} className={className} />
}

export function Symbol({ variant = 'gold', className = 'size-8' }: { variant?: 'gold' | 'white'; className?: string }) {
  return <img src={`${base}brand/symbol-${variant === 'white' ? 'vit' : 'guld'}.png`} alt="" className={`${className} object-contain`} aria-hidden />
}

export const brandImage = (file: string) => `${base}brand/${file}`

/**
 * Platsraden från omslaget och schemaaffischerna 2025: "STOCKHOLMS MOSKÉ | MEDBORGARPLATSEN".
 * Open Sans 500, spärrad 0,1 em, versaler satta med CSS (källtexten står kvar som den skrivs, så att
 * skärmläsare inte bokstaverar). Platsen är egennamn och står på svenska i alla språk.
 * Under 640 px en del per rad utan streck, därefter på en rad med " | ". Färgen ärvs.
 */
export function PlaceLine({ venue, className }: { venue: string; className?: string }) {
  const parts = venue.split(/\s*[,|]\s*/).filter(Boolean)
  if (!parts.length) return null
  return (
    <span lang="sv" className={`block font-sans text-base leading-normal font-medium tracking-[0.1em] uppercase ${className ?? ''}`}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <span className="sr-only">, </span>
              <span aria-hidden className="hidden sm:inline">
                {' | '}
              </span>
            </>
          )}
          <span className="block sm:inline">{p}</span>
        </Fragment>
      ))}
    </span>
  )
}
