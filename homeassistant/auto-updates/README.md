# Automatische Updates für Home Assistant

Zwei Automationen, die auf einem **Testsystem** alle Updates nachts automatisch
installieren und das Ergebnis als Benachrichtigung in Home Assistant anzeigen.
Erstellt und getestet mit Home Assistant **2026.11.3** (Home Assistant OS).

> ⚠️ **Nur für Testsysteme gedacht.** Core- und OS-Updates werden ohne Rückfrage
> installiert. Ein Update kann Integrationen oder Custom Components beschädigen.
> Auf einem Produktivsystem besser nur benachrichtigen und manuell installieren.

| Datei | Automation | Aufgabe |
|---|---|---|
| [`naechtliche-updates.yaml`](naechtliche-updates.yaml) | Nächtliche automatische Updates (Testsystem) | Installiert jede Nacht alle anstehenden Updates |
| [`update-ergebnis-nach-neustart.yaml`](update-ergebnis-nach-neustart.yaml) | Update-Ergebnis nach Neustart melden (Testsystem) | Meldet nach dem Neustart die laufenden Versionen und offene Updates |

---

## 1. Nächtliche automatische Updates

**Auslöser:** täglich um **03:30 Uhr** (Zeitzone der HA-Instanz).

**Ablauf:**

1. Alle `update.*`-Entitäten mit Zustand `on` werden gesammelt. Neu hinzukommende
   Apps oder Integrationen werden also automatisch berücksichtigt; übersprungene
   Versionen (`update.skip`) nicht.
2. Steht kein Update an, endet die Automation ohne Benachrichtigung.
3. Benachrichtigung **„Update-Lauf“** mit der Liste aller Updates und Versionen
   (z. B. `• Tailscale: 0.30.7 → 0.31.0`).
4. **Apps, Marketplace-Integrationen und Geräte-Firmware** werden nacheinander
   installiert. Schlägt eines fehl, laufen die übrigen weiter (`continue_on_error`).
5. **Supervisor**-Update, falls vorhanden.
6. Zum Schluss genau **einer** dieser Schritte:

   | Bedingung | Aktion |
   |---|---|
   | Core-Update vorhanden | Meldung, dann Core-Update **mit Backup**. HA startet neu. |
   | sonst OS-Update vorhanden | Meldung, dann OS-Update. Das System startet neu. |
   | sonst Marketplace-Integration aktualisiert | Meldung, dann `homeassistant.restart`, damit die neuen Versionen geladen werden |
   | sonst | Abschlussmeldung: „Alle Updates wurden installiert“ oder Liste der fehlgeschlagenen Updates |

**Warum höchstens Core *oder* OS pro Nacht?** Beide Updates starten das System
neu und beenden damit die laufende Automation. Stehen beide an, wird zuerst
Core installiert und das OS in der folgenden Nacht.

## 2. Update-Ergebnis nach Neustart melden

**Auslöser:** Start von Home Assistant.

**Bedingung:** Die nächtliche Update-Automation ist in den **letzten 2 Stunden**
gelaufen. Normale Neustarts tagsüber erzeugen keine Meldung.

**Ablauf:** 2 Minuten warten, bis Supervisor und Update-Entitäten ihre Versionen
kennen, dann eine Benachrichtigung, zum Beispiel:

```
🔁 Testsystem wieder online
Core: 2026.11.3 ✅ aktuell
OS: 18.4 ✅ aktuell
Keine weiteren Updates offen.
```

Ist ein Update fehlgeschlagen, steht dort `⚠️ Update fehlgeschlagen/offen → <Version>`.

---

## Benachrichtigungen

Alle Meldungen sind **persistente Benachrichtigungen** in Home Assistant
(Seitenleiste → **Benachrichtigungen**). Es wird nichts aufs Handy geschickt.
Damit sich keine Meldungen ansammeln, gibt es nur zwei Einträge, die jeweils
überschrieben werden:

| `notification_id` | Inhalt |
|---|---|
| `testsystem_update_lauf` | Liste der Updates, die in dieser Nacht installiert werden |
| `testsystem_update_ergebnis` | Vorab-Meldung zu Core/OS, Abschlussmeldung und Meldung „wieder online“ |

Wer stattdessen Push-Nachrichten in der Companion-App möchte, ersetzt
`persistent_notification.create` durch `notify.mobile_app_<gerätename>` und
entfernt die Zeile `notification_id`.

## Installation

1. **Einstellungen → Automationen & Szenen → Automation erstellen → Neue Automation.**
2. Oben rechts **⋮ → In YAML bearbeiten**, den Inhalt von
   `naechtliche-updates.yaml` einfügen, **speichern**.
3. Prüfen, dass die Entity-ID `automation.nachtliche_automatische_updates_testsystem`
   lautet (Automation öffnen → ⋮ → Einstellungen). Die zweite Automation verweist
   auf genau diese ID. Bei einer anderen ID die Bedingung in
   `update-ergebnis-nach-neustart.yaml` anpassen.
4. Schritte 1–2 mit `update-ergebnis-nach-neustart.yaml` wiederholen.

## Voraussetzungen und Anpassungen

- **Home Assistant OS oder Supervised.** Die Entitäten
  `update.home_assistant_core_update`, `…_operating_system_update` und
  `…_supervisor_update` gibt es nur mit Supervisor. Auf Container- oder
  Core-Installationen werden nur die übrigen Updates installiert.
- **Marketplace-Integrationen** werden über `integration_entities('marketplace')`
  erkannt.
- **Uhrzeit** ändern: `at: "03:30:00"` im Auslöser der ersten Automation.
- **Zeitfenster** der zweiten Automation ändern: `7200` (Sekunden) in der Bedingung.
- **Bestimmte Updates ausschließen:** die Version in Home Assistant überspringen
  (Update öffnen → **Überspringen**) oder die Entity-ID in die Liste
  `system_updates` aufnehmen und aus der Logik herausnehmen.

## Backups

- Vor dem **Core-Update** erstellt die Automation ein Backup (`backup: true`).
- Vor App-, Marketplace-, Firmware- und OS-Updates wird **kein** Backup erstellt.
- Zusätzlich empfohlen: automatische Backups unter
  **Einstellungen → System → Backups**, mit einem zweiten Speicherort außerhalb
  des Geräts. Das **Notfall-Kit mit dem Schlüssel** sicher aufbewahren: Ohne den
  lässt sich ein verschlüsseltes Backup nicht wiederherstellen.

## Fehlersuche

- **Automation öffnen → ⋮ → Ablaufverfolgung (Traces)** zeigt jeden Lauf mit den
  Variablen `pending`, `normal_updates` und `marketplace_updated`.
- Manueller Test: Automation öffnen → ⋮ → **Ausführen**. Achtung: Stehen Updates
  an, werden sie dabei sofort installiert.
