# Stolkampanjen – 400 stolar till Stockholms moské

En kampanjsida där besökaren väljer hur många stolar (à 500 kr) den vill ge och betalar med Swish. Meddelandet blir **”stol”**. Sidan visar hur insamlingen går och uppdateras löpande.

**Inget nytt i den tekniska uppsättningen:** sidan är ett block som klistras in i moskéns befintliga WordPress (Avada). Live-siffrorna kommer från ett Google Kalkylark. Ingen Vercel, inget nytt webbhotell, inget plugin.

| Fil | Vad den är |
|---|---|
| `wordpress-block.html` | **Själva kampanjsidan.** Klistras in i WordPress. Inställningarna står överst. |
| `index.html` | Samma sida som fristående webbsida, för förhandsvisning (dubbelklicka) eller om Auroras vill lägga upp den som egen fil. Genereras från blocket. |
| `bildgenerator.html` | Gör dagens bilder: Story, Instagram-inlägg, länkbild och utskrivbar A4-affisch med QR-kod. |
| `marknadsforing/TEXTER.md` | Alla texter för Facebook, Instagram och WhatsApp, plus kampanjplan och checklista. |
| `marknadsforing/bilder/` | Färdiga lanseringsbilder och affisch. |
| `verktyg/bygg-forhandsvisning.mjs` | Bygger om `index.html` när blocket har ändrats. |

---

## Så fungerar det

```
 Givaren                     Moskén                          Kampanjsidan
 ───────                     ──────                          ────────────
 väljer 3 stolar  ──Swish──▶  Swish Företag-appen
 (1 500 kr, "stol")          visar betalningen
                                   │
                    volontär skriver in beloppet
                                   ▼
                          Google Kalkylark  ──(publicerat som CSV)──▶  hämtar siffrorna
                                                                       varannan minut och
                                                                       visar 77 av 400 stolar,
                                                                       "+6 idag", alla stolar
```

**Varför uppdateras inte räknaren helt automatiskt?** Swish skickar ingen signal till en webbsida när någon swishar till ett vanligt Swish-nummer. För det krävs *Swish Handel* (avtal med banken, certifikat och en egen server), och det är just den sortens ändring ni vill undvika. Kalkylarket är en enkel mellanväg: siffran uppdateras så fort någon har skrivit in den, och besökarna ser varje dag hur det går framåt. Se *Senare: helt automatisk räknare* längst ner.

---

## Steg 1 – Kontrollera Swish-numret

Blocket är förinställt på **123 166 95 97**, numret som står på stockholmsmoske.se/donera. Be kassören bekräfta att gåvor till stolarna ska gå dit. Annars ändrar ni `swishNummer` överst i `wordpress-block.html`.

## Steg 2 – Lägg upp sidan i WordPress (Avada)

1. **Sidor → Lägg till ny.** Titel t.ex. *Ge en stol*. Sätt permalänken till t.ex. `/stolar/`.
2. I **Avada Builder**: lägg till en *Container* med en kolumn (100 %), och i den elementet **Code Block**.
   Använder ni blockredigeraren i stället: lägg till blocket **Anpassad HTML**.
3. Öppna `wordpress-block.html`, markera allt, kopiera och klistra in. Spara.
4. **Delningsbild:** ladda upp `marknadsforing/bilder/delningsbild-1200x630.png` och välj den som utvald bild, eller som social bild i Avada/Yoast. Det är den bilden som syns när länken delas på Facebook och WhatsApp.
5. Förhandsgranska på mobilen.

**Bra att veta**
- Ni behöver vara **Administratör** (eller Redaktör). Med lägre behörighet rensar WordPress bort koden.
- Ge gärna containern liten sidmarginal på mobil. Blocket fungerar i smala spalter men blir luftigare med mer bredd.
- Har sajten ett cache- eller optimeringsplugin med ”fördröj JavaScript” kan QR-koden dröja. Undanta i så fall sidan. Cache påverkar inte live-siffrorna, eftersom besökarens webbläsare hämtar dem direkt från kalkylarket.
- Sidan använder moskéns färger (marinblå och guld) och kolliderar inte med Avadas stilar. Det är testat i moskéns riktiga tema, på dator och mobil.

## Steg 3 – Live-räknaren (Google Kalkylark)

### Sätt upp arket (en gång, cirka 10 minuter)
1. Skapa ett nytt kalkylark, helst med moskéns Google-konto. Döp det till *Stolkampanjen – inkommet*.
2. **Arkiv → Inställningar → Region: Sverige**, så att datum skrivs `2026-11-03`.
3. Skriv rubriker i rad 1: **`Datum`** | **`Belopp`** | **`Kommentar`**
4. **Arkiv → Dela → Publicera på webben** → välj bladet → välj **Kommaseparerade värden (.csv)** → **Publicera** → kopiera länken.
5. Klistra in länken i blocket i WordPress (och i `bildgenerator.html`):
   ```js
   dataUrl: "https://docs.google.com/spreadsheets/d/e/....../pub?gid=0&single=true&output=csv",
   ```
6. Testa: skriv en rad, vänta cirka 5 minuter och ladda om kampanjsidan. Siffran ska ha ändrats. Ta sedan bort testraden.

> ⚠️ **Det publicerade arket kan läsas av vem som helst.** Skriv aldrig namn, telefonnummer eller annat om givarna i det, bara datum och belopp.

### Fyll i (varje dag)
Öppna Swish Företag-appen, titta på dagens betalningar med meddelandet **”stol”** och skriv in dem:

| Datum | Belopp | Kommentar |
|---|---|---|
| 2026-11-07 | 1500 | |
| 2026-11-07 14:05 | 500 | |
| 2026-11-07 | 3500 | kontant fredag |
| 2026-11-08 | 24000 | hela dagens swish |

- **En rad per betalning eller en rad per dag**, båda fungerar. Sidan summerar.
- Med **klockslag** (`2026-11-07 14:05`) står det ”Senast registrerat idag kl. 14:05” på sidan.
- **Kontanter och bankgiro** till stolarna läggs in på samma sätt, så att räknaren stämmer.
- **Skrev du fel?** Rätta raden eller lägg till en rad med minusbelopp (`-500`).
- Vill ni hellre skriva **antal stolar** än kronor? Döp om kolumnen `Belopp` till `Stolar`.
- Ändringar syns på sidan inom cirka 5 minuter, eftersom Google uppdaterar publicerade ark med en liten fördröjning.

**Tips – Google Formulär på mobilen:** gör ett formulär med en enda fråga, *Belopp*, och koppla svaren till ett kalkylark. Publicera svarsbladet som CSV enligt ovan. Kolumnen *Tidstämpel* fylls i automatiskt och sidan förstår den. Den som har Swish Företag-appen kan då registrera en gåva på fem sekunder.

**Utan kalkylark:** lämna `dataUrl: ""` och ändra `insamlatKr` i blocket för hand i WordPress.

## Steg 4 – Dagens bild (bildgenerator.html)
1. Dubbelklicka på `bildgenerator.html` så öppnas den i webbläsaren.
2. Välj **Story 9:16** och **Dagens läge**. Står `dataUrl` ifylld trycker du på *Hämta senaste siffrorna*, annars skriver du in dem.
3. Tryck på **Ladda ner bild** och posta i Instagram Story (med länk-klistermärke) och i WhatsApp-status.

Mallen *Lansering* gör startbilder och *Målet nått* gör tackbilden. Formatet **Affisch A4** ger en utskrivbar affisch med QR-kod till moskén. Texterna går att ändra, och `{stolar}`, `{idag}`, `{kvar}` och `{mal}` byts ut mot siffror.

---

## Betalningen – hur Swish-delen fungerar

| | Innehåll | Kommentar |
|---|---|---|
| **QR-koden på sidan** | `C1231669597;1500;stol;0` | Samma format som Swish officiella QR-generator skapar (kontrollerat genom att skapa en kod hos Swish och avkoda den). Nummer, belopp och meddelande är låsta. |
| **QR-koden på affischen** | `C1231669597;500;stol;2` | 500 kr är förifyllt men går att ändra (för fler stolar). Meddelandet är låst. |
| **Knappen ”Öppna Swish” (mobil)** | `swish://payment?data=…` | Öppnar Swish-appen med allt ifyllt. Formatet används brett men är inte officiellt dokumenterat av Swish, så **testa på iPhone och Android före lansering**. |

- På **datorn** visas QR-koden. På **mobilen** visas knappen, och QR-koden finns bakom ”Visa QR-kod” (för att betala från en annan telefon).
- Öppnas sidan **inifrån Instagram eller Facebook** visas ett tips om att öppna den i webbläsaren, eftersom de appar ibland blockerar att Swish öppnas.
- Händer inget när man trycker på knappen visas en ruta som hänvisar till de manuella uppgifterna (nummer, belopp, ”stol”, med kopiera-knappar).
- När givaren kommer tillbaka från Swish visas ett tack och en knapp för att tipsa familjen på WhatsApp.

### Testa före lansering
- [ ] **iPhone (Safari):** knappen öppnar Swish med rätt mottagare, belopp och ”stol”. Avbryt, betala inte.
- [ ] **Android (Chrome):** samma sak.
- [ ] **Dator:** skanna QR-koden med mobilen. Rätt belopp för 1, 2 och 5 stolar?
- [ ] **Från Instagram och Facebook:** öppna länken inifrån apparna och prova.
- [ ] **Affischen:** skanna den utskrivna affischen.
- [ ] **Kalkylarket:** en testrad syns på sidan inom cirka 5 minuter.
- [ ] **Mottagarnamnet** i Swish är moskén.

### Felsökning
| Problem | Lösning |
|---|---|
| Räknaren står still | Är arket publicerat som **CSV** (inte webbsida)? Stämmer länken i `dataUrl`? Vänta 5 minuter. |
| QR-koden syns inte | Ett optimeringsplugin fördröjer JavaScript: undanta sidan. Uppgifterna för manuell Swish syns alltid. |
| Koden försvann när jag sparade | Du saknar behörighet att spara skript. Be en administratör, eller Auroras, klistra in blocket. |
| Fel siffror | Kolla att kolumnerna heter `Datum` och `Belopp`, och att arket har region Sverige. |

---

## Ändra sidan
- Siffror, Swish-nummer och länkar ändrar ni under **INSTÄLLNINGAR** överst i `wordpress-block.html` (eller direkt i Code Block i WordPress).
- Texterna står i klartext i samma fil.
- Har ni ändrat i blocket: kör `node stolkampanj/verktyg/bygg-forhandsvisning.mjs` för att uppdatera `index.html`.

## Senare: helt automatisk räknare
Vill ni att räknaren ska gå upp automatiskt i samma sekund som någon swishar behövs **Swish Handel** (Swish för företag med API): ett avtal med banken, ett certifikat, en liten server eller ett WordPress-plugin som tar emot Swish betalningsbesked, och en avgift per betalning. Det kan Auroras bygga i ett senare skede. Kampanjsidan är byggd så att bara datakällan (`dataUrl`) behöver bytas.
