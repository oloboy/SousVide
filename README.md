# SousVide (PWA)

Questo repository contiene la web app "Sous-Vide Time & Safety Calculator" configurata come PWA.

## URL GitHub Pages
Se pubblichi il repo come GitHub Pages (project site), l'URL sarà:

https://oloboy.github.io/SousVide/

## Passaggi per pubblicare su GitHub Pages (PowerShell)
Esegui questi comandi nella cartella del progetto (`sousvide`):

```powershell
cd "C:\Users\Davide\Documents\Progetti python\sousvide"
# Inizializza git (solo se non è già inizializzato)
git init
git add .
git commit -m "Initial PWA site"
# Aggiungi remote (se non l'hai già fatto)
git remote add origin https://github.com/oloboy/SousVide.git
# Push su main (assicurati che branch principale si chiami 'main')
git branch -M main
git push -u origin main
```

Poi su GitHub: vai su `Settings` > `Pages` e seleziona `main` branch e `root` come cartella. Salva e attendi l'assegnazione dell'URL.

## Verifiche post-deploy
- Apri l'URL: `https://oloboy.github.io/SousVide/`
- Apri Chrome DevTools -> Application:
  - Controlla che il `Manifest` mostri `start_url` e icone
  - Controlla che il `Service Worker` sia registrato
- Esegui Lighthouse (Audits) per valutare PWA score

## Note tecniche
- `manifest.json` è stato aggiornato per usare `start_url` e `scope` su `/SousVide/` (obbligatorio per project site).
- `service-worker.js` usa percorsi relativi; registrazione avviene da `index.html` e verrà attiva alla stessa `scope` del sito.
- iOS ha limitazioni PWA: il service worker su iOS funziona dal Safari 11.3 in avanti ma ci sono limitazioni su storage e background.

## Prossimi passi suggeriti
- Eseguire Lighthouse e correggere eventuali problemi.
- Se vuoi pubblicare su Google Play, posso generare un progetto TWA con `bubblewrap`.
- Posso anche aggiungere un workflow GitHub Action per deploy automatico se preferisci.

---
