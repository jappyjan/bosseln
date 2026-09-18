# Boßeln Punktezettel

Mobile-first PWA (React + TypeScript + Vite + Tailwind) für eine Geburtstagsrunde
Boßeln. Ersetzt den Papierzettel, ist gleichzeitig Regelwerk und Partyspiel-Begleiter
und funktioniert **komplett offline** nach dem ersten Laden. Kein Backend, kein Konto.

**Live:** https://birthday.apps.janjaap.de (Coolify, statisches nginx-Hosting)

## Schnellstart

```bash
npm install
npm run dev          # Entwicklung (localhost:5173)
npm run build        # Produktionsbuild nach dist/
npm run preview      # gebauten Stand lokal ansehen (Port 4173)
npx tsc -p tsconfig.json --noEmit   # Typecheck
```

## Was drin ist

- **Spiel-Setup:** Name, Strecke, 1–8 Teams (Name, Emoji, Farbe), Spieler je Team,
  Geburtstagskind, Trinkregeln, eigene Strafen mit Punkten/Schluck-Folge, Party-Modus.
- **Score-Screen:** pro Team riesige Ein-Tap-Buttons (`＋ Wurf`, `Strafe`, `Schluck`),
  Zähler für Würfe / Strafpunkte / Schlücke, Werfer-Rotation („Nächster: Jan“),
  globaler Undo, Geburtstags-Joker. 2 Teams werden nebeneinander gezeigt, ab 3 Teams
  vertikal gestapelt.
- **Strafen-Flow:** Grund antippen (Ball im Graben, über die Linie, trotz Pfiff, Ball
  verloren, Hausregel, eigener Grund) → optional Schluck für ein beliebiges Team.
  Das sind 2 Taps für den häufigsten Fall.
- **Verlauf:** jedes Ereignis chronologisch, einzeln löschbar, alles rückgängig machbar.
- **Partykarten:** 18 Karten in 3 Kategorien (harmlos / Spiel-Auflagen / Trinkkarten),
  Kategorien und Trinkkarten unabhängig abschaltbar. Auflagen (schwacher Arm, Stille,
  Kommentator, Vorhersage, Siegerpose, Werferwechsel, beide Füße) hängen als Chip am Team
  und gelten für dessen nächsten Wurf.
- **Regeln:** Ziel, Werfen, Sicherheit (Pfiff = Verkehrswarnung, Verkehr hat Vorrang),
  Wertung, Strafen, Trinken, Joker — bewusst als vereinfachte Spaßrunde ausgewiesen.
- **Endstand:** Platzierung, Würfe/Strafen/Schlücke je Team, Summe, Kuriositäten-Statistiken
  (sauberstes Team, meiste Strafen, Joker genutzt, Geburtstagskind, Kartenzahl),
  screenshot-taugliche Ergebnis-Karte und Teilen-Funktion. Keine Trink-Bewertung.
- **i18n:** vollständig DE/EN, automatisch nach `navigator.language`, manuell
  umschaltbar und persistent. `en.ts` ist gegen `keyof typeof de` typisiert — eine
  fehlende Übersetzung ist ein Compile-Fehler.
- **Persistenz:** localStorage, übersteht Reload/App-Neustart. JSON-Export/Import
  in den Einstellungen, „Spiel zurücksetzen“ mit Rückfrage.
- **Teilen mit Spiel-Code:** Ein Tipp auf 📤 im Punkte-Screen erzeugt einen Code (z. B.
  `MX5D69`). Die anderen öffnen den geteilten Link oder tippen den Code ein — sie sehen
  dann **dasselbe Spiel** auf ihrem eigenen Handy: gleiche Teams, gleiche Würfe, live.
  Am Ende der Strecke braucht niemand einen Zettel.
  Technik: MQTT über WebSocket (freie öffentliche Broker, kein Konto, kein eigener Server).
  Der komplette Spielstand liegt als *retained message* im Raum, deshalb hat ein später
  beitretendes Gerät den Stand sofort. Übertragen werden nur unveränderliche Events →
  konfliktfreier Merge, und ohne Empfang läuft alles lokal weiter, bis wieder Netz da ist.
  Gemessen: Beitritt < 0,5 s, Live-Abgleich ~0,7 s in beide Richtungen, Nachholen nach
  Flugmodus ~0,7 s. Broker-Liste in den Einstellungen (erster erreichbarer gewinnt).

## Architektur

```
src/game/      Domänenlogik, komplett UI-frei (Regeln, Wertung, Partyspiel)
  types.ts     Game, Team, Player, GameEvent, PenaltyRule, PartyCard, GameSettings
  rules.ts     Standard-Strafen, Partykarten, Farben/Emojis
  engine.ts    createGame, derive()  — leitet aus Events alle Summen ab
  stats.ts     Endstand-Statistiken + Textfassung für Teilen
  storage.ts   localStorage, Prefs, JSON-Export/Import, Browser-Sprachwahl
  sync.ts      Gun.js-Anbindung (lazy geladen)
src/i18n/      de.ts (Quelle), en.ts (typgeprüft), Provider + useT()
src/state/     store.tsx — Event-Append, Undo, Toasts, Sync-Verdrahtung
src/components/  ui.tsx (Buttons, Sheets, Dialoge), Nav.tsx, sheets.tsx
src/screens/   Setup, Score, History, Party, Rules, Settings, Finish
```

**Event-Sourcing ist der Kern:** jede Aktion erzeugt ein unveränderliches `GameEvent`
(`throw`, `penalty`, `drink`, `joker`, `card`, `modifier`, `playerSet`, `settings`,
`finish`, `reopen`). Alle Anzeigen werden in `derive()` aus der Event-Liste berechnet.
Dadurch sind Undo, das Löschen einzelner Ereignisse, Neuberechnung bei geänderter
Wertung und der Geräte-Merge trivial — und die Wertungsregeln lassen sich ändern,
ohne UI-Code anzufassen.

Wertungsmodi (Einstellungen, jederzeit umstellbar, als Event protokolliert):
`tiebreak` (Strafen nur bei Gleichstand) · `additive` (jede Strafe zählt einen Wurf) ·
`ignored` (Strafen ohne Wirkung). Getränke zählen nie für die Wertung.

## Datenschutz / Grenzen

- „Schluck“ ist immer ein kleiner Schluck, alkoholfrei zählt gleich; keine Shots,
  kein Exen, keine Steigerung. Trinken beeinflusst nie die Wertung.
- Offline getestet mit **abgeschaltetem Server** (Service Worker liefert aus dem
  Workbox-Precache).
- Geteilt wird über öffentliche MQTT-Broker (Standard: HiveMQ, Fallback: EMQX). Die Räume
  sind offen: nur Namen eintragen, die man teilen will, und den Code nicht öffentlich posten.
- Kein offizielles Boßeln-Regelwerk, keine Verbandswertung — bewusst vereinfacht.

## Deployment

Reines Static-Hosting, kein Backend. Zwei Wege:

**A) Docker (Coolify):** `Dockerfile` (Multi-Stage: node build → nginx) +
`deploy/nginx.conf` (Service Worker & index.html nie cachen, Assets immutable,
SPA-Fallback, korrekter Manifest-MIME). In Coolify als Anwendung mit Buildpack
„Dockerfile“ anlegen, Domain `birthday.apps.janjaap.de`, Port 80, Healthcheck `/index.html`.

**B) Ohne Build:** `dist/` in einen nginx-Container bind-mounten
(`-v /opt/data/bossln/dist:/usr/share/nginx/html:ro`) — schnell, aber dann die
Cache-Header aus `deploy/nginx.conf` mitgeben.

HTTPS ist Pflicht, wenn Offline-Betrieb und Installation aufs Handy gewünscht sind:
Service Worker registrieren sich nur in einem Secure Context.

## QA

Akzeptanz-Suite liegt in `qa/` (Playwright, iPhone-13-Viewport, Screenshots,
Offline-Beweis bei totem Server, Layout-Sweep über 360/390/430 px).

```bash
# einmalig: Browser für Playwright bereitstellen (nicht ins Repo, ~150 MB)
cd qa && npm install
npx playwright install chromium

# App bauen und lokal ausliefern, dann testen
cd .. && npm run build && npm run preview &   # http://127.0.0.1:4173

cd qa
node qa.mjs                   # 48 Funktionstests + Screenshots nach ./shots
node layout.mjs               # horizontaler Überlauf + Touch-Targets ≥ 44px
node offline.mjs              # Server vorher stoppen: beweist Start aus dem SW-Cache
node live-offline.mjs         # Flugmodus gegen die Live-Domain (Service Worker)
node sync-share.mjs           # zwei Geräte: Code teilen, beitreten, live mitzählen,
node sync-debug.mjs           # Broker-Erreichbarkeit + Sync-Panel auf der Live-Domain
node mqtt-broker-probe.mjs    # welcher öffentliche Broker trägt retained + live
```

`sync-share.mjs` startet zwei unabhängige Browser-Kontexte (= zwei Handys) und prüft:
Code erzeugen, per Link beitreten, identische Teams/Stände, Live-Sync in beide
Richtungen, Gerätezahl, Offline-Weiterzählen und automatisches Nachholen.

In dieser Umgebung lagen die Playwright-Browser unter
`/opt/data/pw-browsers` (dann `PLAYWRIGHT_BROWSERS_PATH` setzen) — Standard ist
`~/.cache/ms-playwright`.
