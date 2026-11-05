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
