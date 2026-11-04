# Vinterkonferensen

Webbplats för Vinterkonferensen med två vyer:

- **Extern (besökare)** – `/`, `/program`, `/barn`, `/koket`. Dagens program på svenska, engelska och arabiska (med höger-till-vänster för arabiska). Språket väljs automatiskt efter dag (t.ex. fredag = arabiska, lördag–söndag = svenska), och besökaren kan alltid byta själv.
- **Intern (volontärer)** – `/intern`. Inloggning med engångskod på e-post. Behörigheten följer kommittéerna.

## Funktioner

| Extern | |
|---|---|
| Program | Avslutade föreläsningar stryks över. Pågående punkt visas med förloppsstapel, och nästa föreläsning med nedräkning. Förprogram (t.ex. poesi) visas före föreläsningen. |
| Betyg | 1–5 stjärnor direkt efter föreläsningen, plus tre kryssfrågor och en valfri kommentar. Varje enhet kan betygsätta en föreläsning en gång. |
| Barn | Barnens aktiviteter. Förregistrering till fritids: vårdnadshavaren får ett nummer (#101, #102 …) och går sedan till expresskassan, där betalningen sker. |
| Köket | Meny med priser och markeringar (vegetariskt, halal, nötter …) och öppettider. "Slut" visas direkt när köket markerar en rätt som slut. |

**De tre kryssfrågorna**

1. *Var innehållet relevant för dig?* – Ja / Delvis / Nej
2. *Hur var längden?* – För kort / Lagom / För lång
3. *När kom du till salen?* – Före start / Precis i tid / Efter start. Den här kopplar till ordningskommitténs räkning: den visar om publiken kommer sent och om ett förprogram behövs.

| Intern | |
|---|---|
| Kommittéer & scheman | Ett schema per kommitté med alla volontärer. Det kan visas *per pass* eller *per person*, har namnsökning och går att skriva ut. Den ansvariga lägger till volontärer, även genom att klistra in en hel lista, och skapar pass. |
| Mitt schema | Alla mina pass i alla kommittéer, och vilka jag jobbar med. |
| Info & anslag | Ansvariga skriver interna eller externa anslag. Externa anslag skrivs på sv/en/ar och visas på vald besökarsida. |
| Anteckningar | Ladda upp skärmdumpar, bilder, Word, PDF och ljud direkt från mobilen. Röstinspelningar transkriberas medan man spelar in (i webbläsaren). Uppladdade ljudfiler kan transkriberas på servern (se nedan). |
| Inköp | Butik, adress, länk, datum, kontaktperson i butiken, vem som betalade och kvitto. Varje vara registreras med märke, antal, pris och rabatt per rad. Det går också att ange en rabatt för hela köpet. |
| Inventarielista | Alla inköpta varor med förvaringsplats och status (i lager, förbrukad, utlånad, returnerad). Kan exporteras till Excel (CSV). |
| Flödesräkning | **Ordning:** räknar publiken tre gånger per föreläsning, 5 min efter start, vid mittpunkten och 5 min före slut, och appen säger när det är dags. **Köket:** stora räkneknappar för gäster, mat, kaffe, te, dryck och fika. |
| Statistik & betyg | Hur fullt det är i salen vid varje räknetillfälle, med förslag om förprogram när publiken kommer sent. Köksflödet per halvtimme (när folk vill äta eller dricka kaffe). Snittbetyg och svar per föreläsning. Allt kan exporteras till CSV. |
| Program, Meny, Fritids | Redigera programmet (inklusive "skjut upp +5 min"). Markera rätter som slut. Expresskassan söker på nummer, namn eller telefon, markerar betalt och checkar in. |
| Inställningar | Konferensnamn, dagar och standardspråk, kommittéer, samt QR-koder att skriva ut. |

### Roller

Roller styrs av tabellen `volunteers` (e-post + kommitté):

- **Volontär**: e-posten finns i en kommitté. Ser alla interna sidor, laddar upp anteckningar och inköp, och räknar.
- **Kommittéansvarig** (`is_lead`): redigerar sin kommittés volontärer, schema och anslag.
- **Admin**: alla i kommittén **Styrgruppen**. Redigerar allt.
- Program redigeras av ansvariga för Föreläsningar, Konferencierer och Fritids. Menyn redigeras av Köket, och expresskassan sköts av Fritids och Gästbemötare.

Reglerna kontrolleras i databasen (Row Level Security i `supabase/migrations/0001_init.sql`), inte bara i gränssnittet.

## Prova direkt (demoläge)

```bash
npm install
```

```bash
npm run dev
```

Utan Supabase-nycklar körs appen i **demoläge**: data sparas bara i webbläsaren, och på `/intern` väljer du ett demokonto (admin, kök, fritids, ordning). Med den gula listen överst kan du "resa i tiden" till en konferensdag för att se hur sidan ser ut under dagen. Det går även med `?tid=2027-01-08T11:20` i adressen (`?tid=nu` återställer).

## Koppla till Supabase (riktig drift)

1. Skapa ett projekt på [supabase.com](https://supabase.com), gärna i region *eu-north-1 (Stockholm)*.
2. Öppna **SQL Editor** och kör `supabase/migrations/0001_init.sql` och sedan `supabase/seed.sql`. Ändra först datumen i seed-filen och lägg in dig själv som första admin (raden längst ner).
3. Under **Authentication → URL Configuration**: sätt *Site URL* till sidans adress och lägg till `https://<din-adress>/intern` som redirect-URL.
4. Valfritt men rekommenderat: under **Authentication → Email Templates → Magic Link**, lägg till `{{ .Token }}` i mejlet. Då får volontärerna en sexsiffrig kod att skriva in, vilket fungerar bättre än en länk på mobilen.
5. Kopiera `.env.example` till `.env.local` och fyll i `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

### Transkribering av uppladdade ljudfiler (valfritt)

Inspelningar i appen transkriberas redan i webbläsaren. Uppladdade ljudfiler, till exempel röstmemon från iPhone, transkriberas på servern av en Edge Function som anropar ett OpenAI-kompatibelt tal-till-text-API (Whisper):

```bash
supabase functions deploy transcribe
```

```bash
supabase secrets set TRANSCRIBE_API_KEY=<nyckel>
```

Valfria inställningar: `TRANSCRIBE_API_URL` och `TRANSCRIBE_MODEL` (standard är `whisper-1`). Utan nyckel fungerar allt annat som vanligt.

## Publicera

```bash
npm run build
```

Mappen `dist/` är en statisk sida som kan läggas på Netlify, Vercel, Cloudflare Pages eller GitHub Pages. Filerna `public/_redirects` (Netlify) och `vercel.json` gör att direktlänkar som `/barn` fungerar. Om sidan ligger i en undermapp: bygg med `BASE_PATH=/undermapp/ npm run build`. Glöm inte att sätta `VITE_SUPABASE_*` som miljövariabler där sidan byggs.

## Teknik

React 19, Vite, TypeScript och Tailwind CSS. Supabase används för databas, inloggning, filer och Edge Functions. Datalagret (`src/lib/db.ts`) har två implementationer: Supabase och lokal demo.
