# BATCH_ — app nativa Mac: come funziona e come si pubblica

Questo documento spiega l'architettura del guscio nativo (Tauri) attorno
al codice esistente, e la procedura per pubblicare una nuova versione.
Scritto per essere capito anche riaprendo il progetto dopo mesi.

## Architettura, in breve

Il codice applicativo (pagine, form, Server Actions, connessione al
database, integrazione Shopify) e' tutto in `src/` e **non cambia**
rispetto a prima: e' lo stesso identico Next.js usato in sviluppo.

Quello che cambia e' come viene eseguito quando e' installato sui Mac:

```
src-tauri/            guscio nativo (Rust) - vedi src-tauri/src/main.rs
  ├─ src/main.rs       avvia il server Next.js interno e mostra la finestra
  ├─ tauri.conf.json   configurazione app (icona, finestra, aggiornamenti)
  ├─ binaries/          runtime Node.js bundlato (scaricato in CI, non nel repo)
  └─ resources/         output di build di Next.js (generato in CI, non nel repo)
```

All'avvio, l'app nativa:
1. legge la credenziale del database di *questo* Mac da
   `~/Library/Application Support/BATCH_/config.json` (vedi sotto)
2. avvia come processo interno il server Next.js gia' compilato
3. aspetta che risponda, poi mostra la finestra puntata su di esso
   (`http://127.0.0.1:17683` - resta sul Mac, non e' internet)
4. alla chiusura dell'app, chiude anche il server interno

Nessun server online da mantenere: l'unica parte "cloud" e' il database
(Postgres/Neon) e le foto (Shopify), esattamente come deciso.

## Sviluppo quotidiano (nessun cambiamento)

```
npm run dev
```

Usa PGlite (database di prova su file) se `DATABASE_URL` non e'
definita in `.env.local` — invariato rispetto a prima.

## Pubblicare una nuova versione

Le versioni vengono compilate e pubblicate da GitHub Actions (runner
macOS Apple Silicon), non a mano: basta creare un tag e spingerlo.

```
npm version patch   # oppure minor / major, a seconda del cambiamento
git push --follow-tags
```

Da qui in poi e' automatico: GitHub Actions compila l'app, la firma con
la chiave di aggiornamento, e pubblica la release su GitHub. I Mac gia'
installati la trovano da soli entro poco e mostrano il banner
"Aggiorna e riavvia" (vedi `src/components/update-checker.tsx`).

Si puo' seguire l'avanzamento nella scheda "Actions" del repository su
github.com.

## Primo setup di un nuovo Mac

1. Scaricare l'ultima release da GitHub (link nella scheda "Releases"
   del repository, github.com/fcei-tech/001-app) e trascinare l'app
   nella cartella Applicazioni.
2. Primo avvio: tasto destro sull'icona → "Apri" → "Apri" (una volta
   sola: macOS non conosce l'app perche' non e' firmata con un
   abbonamento Apple Developer a pagamento — scelta presa
   consapevolmente, vedi indice progetto Claude).
3. L'app stessa porta alla schermata "Collega il database" (nessun
   Finder, nessun file da creare a mano — vedi
   `src/app/configura-database/page.tsx` e `src/proxy.ts`, che
   reindirizza li' automaticamente finche' non e' stata inserita una
   credenziale valida): si incolla la stringa di connessione Postgres
   di *questo* Mac (una per persona, per tracciabilita') e si riavvia
   quando richiesto. Per cambiarla in seguito: Impostazioni → Database.

Gli aggiornamenti successivi sono automatici, non serve ripetere questi
passi. Il file di configurazione resta comunque su disco per uso
interno (`~/Library/Application Support/it.posterclub.batch/config.json`,
permessi 600) ma non va piu' toccato a mano.

## Configurazione per-Mac: perche' una credenziale a testa

Ogni installazione si collega a Neon con il proprio utente Postgres
(uno per Federico, uno per il socio). Cosi' resta tracciabile chi ha
fatto cosa, e revocare l'accesso a una persona significa disattivare la
sua credenziale lato Neon — non serve un login dentro l'app. Se la
credenziale smette di funzionare (revocata, o il database irraggiungibile),
le pagine che leggono dal database mostrano un messaggio dedicato invece
di un errore generico e rimandano a Impostazioni (`src/app/error.tsx`).

## Cose ancora da fare (non ancora costruite)

- Provisioning vero del database Neon in cloud + le due credenziali
  per-Mac: e' l'unico vero blocco operativo rimasto. Finche' non esiste,
  ogni installazione mostra la schermata "Collega il database" (o va
  usata con un database di prova) — vedi indice progetto per lo stato
  preciso.
- Repository GitHub: creato e pubblico (github.com/fcei-tech/001-app),
  release pubblicate via tag `v*` come descritto sopra.
