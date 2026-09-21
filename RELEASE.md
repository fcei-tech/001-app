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
   del repository) e trascinare l'app nella cartella Applicazioni.
2. Primo avvio: tasto destro sull'icona → "Apri" → "Apri" (una volta
   sola: macOS non conosce l'app perche' non e' firmata con un
   abbonamento Apple Developer a pagamento — scelta presa
   consapevolmente, vedi indice progetto Claude).
3. Creare il file di configurazione con la credenziale database di
   *questo* Mac (una per persona, per tracciabilita'):

   `~/Library/Application Support/BATCH_/config.json`
   ```json
   { "database_url": "postgresql://<utente-di-questo-mac>:<password>@<host-neon>/<db>?sslmode=require" }
   ```

   Nota: oggi questo file va creato a mano (Finder → Vai → Vai alla
   cartella…). Una schermata di configurazione dentro l'app stessa
   (cosi' non serve toccare Finder) e' il prossimo passo pianificato,
   vedi indice progetto.

Gli aggiornamenti successivi sono automatici, non serve ripetere questi
passi.

## Configurazione per-Mac: perche' una credenziale a testa

Ogni installazione si collega a Neon con il proprio utente Postgres
(uno per Federico, uno per il socio). Cosi' resta tracciabile chi ha
fatto cosa, e revocare l'accesso a una persona significa disattivare la
sua credenziale lato Neon — non serve un login dentro l'app.

## Cose ancora da fare (non ancora costruite)

- Provisioning vero del database Neon in cloud + le due credenziali
  (oggi il database "vero" e' solo il PGlite locale sul Mac di
  Federico — vedi indice progetto per lo stato preciso).
- Schermata di primo avvio dentro l'app per inserire la credenziale
  database senza toccare Finder/file di configurazione a mano.
- Repository GitHub non ancora creato: questo scaffolding e' pronto ma
  non ancora pubblicato/pushato.
