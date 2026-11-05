import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isDemo } from '../lib/api'
import { useAuth } from '../lib/auth'
import { DEMO_PERSONAS } from '../lib/demoData'
import { Button, Card, ErrorText, Field, Input } from './ui'
import DemoBar from './DemoBar'
import { Logo } from './Brand'

/** Inloggning med engångskod på e-post – inga lösenord att komma ihåg. */
export default function Login() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh">
      <DemoBar />
      <div className="mx-auto max-w-sm px-4 py-14">
        <Logo className="mx-auto mb-8 h-14 w-auto" />
        <h1 className="text-center text-3xl font-semibold text-ink">
          <span className="font-display font-normal">Volontärinloggning</span>
        </h1>
        <p className="mt-2 text-center text-base text-muted">För kommittéer och volontärer på Vinterkonferensen.</p>
        <Card className="mt-6 p-5">
          {auth.managedSignIn ? (
            <p className="text-base text-muted">
              Öppna sidan inloggad på claude.ai med den e-post som din kommittéansvarig har registrerat. Då kommer du in automatiskt.
            </p>
          ) : isDemo ? (
            <div className="space-y-2">
              <p className="text-base text-muted">Demoläge – välj vem du vill testa som:</p>
              {DEMO_PERSONAS.map((p) => (
                <Button key={p.email} variant="secondary" className="w-full justify-start" onClick={() => auth.demoSignIn(p.email)}>
                  {p.label}
                </Button>
              ))}
            </div>
          ) : !sent ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  await auth.sendCode(email)
                  setSent(true)
                })
              }}
            >
              <Field label="Din e-post" hint="Samma adress som din kommittéansvarig har registrerat.">
                <Input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <ErrorText>{err}</ErrorText>
              <Button type="submit" className="w-full" loading={busy}>
                <Mail className="size-4" /> Skicka inloggningskod
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                run(() => auth.verifyCode(email, code))
              }}
            >
              <p className="text-base text-muted">
                Vi har mejlat en kod till <b>{email}</b>. Skriv in den här – eller klicka på länken i mejlet.
              </p>
              <Field label="Kod">
                <Input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="text-center text-xl tracking-[0.4em]" />
              </Field>
              <ErrorText>{err}</ErrorText>
              <Button type="submit" className="w-full" loading={busy}>
                <KeyRound className="size-4" /> Logga in
              </Button>
              <button type="button" className="min-h-11 w-full text-center text-base text-muted underline" onClick={() => setSent(false)}>
                Byt e-postadress
              </button>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center">
          <Link to="/" className="text-base text-muted hover:text-ink">
            ← Till besökarsidan
          </Link>
        </p>
      </div>
    </div>
  )
}
