// Guscio nativo Mac per Posterclub.
//
// Cosa fa, in ordine:
// 1. Cerca la configurazione per-Mac (credenziale database) in
//    ~/Library/Application Support/Posterclub/config.json
// 2. Avvia come processo interno ("sidecar") il server Next.js gia'
//    pronto (src/ - lo stesso identico codice usato in sviluppo),
//    passandogli quella credenziale come variabile d'ambiente.
// 3. Aspetta che il server risponda, poi mostra la finestra puntata su
//    di esso (localhost, non e' internet: il traffico resta sul Mac).
// 4. Alla chiusura dell'app, chiude anche il server interno.
//
// Il controllo/aggiornamento versione (auto-update) e' gestito lato
// interfaccia (vedi src/components/update-checker.tsx) usando il plugin
// registrato qui sotto.
//
// Perche' in questo modo: cosi' tutto il codice applicativo (pagine,
// form, connessione al database, integrazione Shopify) resta scritto
// una volta sola in src/ e usato identico sia in sviluppo (npm run dev)
// sia nell'app installata - il guscio Rust si occupa solo di avviarlo e
// mostrarlo come programma nativo, senza duplicare logica.

use serde::Deserialize;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_PORT: u16 = 17683;

#[derive(Deserialize, Default)]
struct MacConfig {
    /// Stringa di connessione al database di questo Mac (Neon in
    /// produzione). Assente = si usa il fallback di sviluppo (vedi
    /// src/db/index.ts).
    database_url: Option<String>,
}

/// Tiene il riferimento al processo Node interno, per poterlo chiudere
/// quando l'app si chiude.
struct SidecarHandle(Mutex<Option<CommandChild>>);

fn read_mac_config(app: &tauri::AppHandle) -> MacConfig {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return MacConfig::default();
    };
    let config_path: PathBuf = config_dir.join("config.json");
    let Ok(mut file) = std::fs::File::open(&config_path) else {
        return MacConfig::default();
    };
    let mut contents = String::new();
    if file.read_to_string(&mut contents).is_err() {
        return MacConfig::default();
    }
    serde_json::from_str(&contents).unwrap_or_default()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .setup(|app| {
            let config = read_mac_config(&app.handle());

            let sidecar = app
                .shell()
                .sidecar("node")
                .expect("sidecar 'node' non trovato: verifica src-tauri/binaries e tauri.conf.json > bundle.externalBin");

            let mut sidecar = sidecar
                .arg("resources/standalone/server.js")
                .env("PORT", SERVER_PORT.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("NODE_ENV", "production");

            if let Some(database_url) = config.database_url {
                sidecar = sidecar.env("DATABASE_URL", database_url);
            }

            let (mut rx, child) = sidecar.spawn().expect("avvio del server interno fallito");
            *app.state::<SidecarHandle>().0.lock().unwrap() = Some(child);

            // Logga stdout/stderr del server interno nella console di
            // sviluppo (utile in fase di build/debug, invisibile
            // all'utente finale).
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            print!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprint!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            // La finestra principale (definita in tauri.conf.json con
            // visible=false) viene mostrata solo quando il server interno
            // risponde davvero, per evitare la schermata di errore
            // "impossibile raggiungere il sito" nel primo istante.
            let window = app
                .get_webview_window("main")
                .expect("finestra 'main' non trovata in tauri.conf.json");
            tauri::async_runtime::spawn(async move {
                let addr = format!("127.0.0.1:{SERVER_PORT}");
                for _ in 0..150 {
                    if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                        let _ = window.show();
                        return;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
                // Dopo ~30s il server non ha risposto: mostra comunque la
                // finestra, cosi' l'errore (se c'e') e' visibile invece
                // di restare con l'app apparentemente ferma.
                let _ = window.show();
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(child) = window.state::<SidecarHandle>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'app Posterclub");
}
