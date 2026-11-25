# BIC-Verzeichnis Österreich (OeNB)

Lädt täglich das [SEPA-Zahlungsverkehrs-Verzeichnis](https://www.oenb.at/Statistik/Klassifikationen/SEPA-Zahlungsverkehrs-Verzeichnis.html)
der Oesterreichischen Nationalbank (Bankleitzahl, BIC/SWIFT-Code, LEI, Adresse …) und protokolliert Änderungen.

| Pfad | Inhalt |
|---|---|
| `update_bic.py` | Skript: Download, Vergleich, Ablage (nur Python-Standardbibliothek) |
| `data/sepa-zv-vz_gesamt.csv` | Aktueller Stand des Verzeichnisses |
| `changes/JJJJ-MM-TT.csv` | Änderungen eines Tages (nur an Tagen mit Änderungen) |
| `changes/index.json` | Liste der Tage mit Änderungen (für die Weboberfläche) |
| `web/` | Weboberfläche (statisch, ohne Build-Schritt) |

Ältere Gesamtstände sind über die Git-Historie von `data/sepa-zv-vz_gesamt.csv` abrufbar.

## Format

Alle Dateien: Semikolon als Trennzeichen, UTF-8 mit BOM (öffnet sich in Excel mit korrekten Umlauten).

Die Änderungsdateien haben zwei zusätzliche Spalten vorne:

- `Änderung`: `neu`, `geändert` oder `entfernt`
- `Geänderte Felder`: bei `geändert` z. B. `SWIFT-Code: ALT -> NEU | Ort: ALT -> NEU`

Danach folgt der Eintrag (bei `entfernt` der letzte bekannte Stand). Schlüssel für den Vergleich ist die Bankleitzahl.

## Weboberfläche (GitHub Pages)

`web/` enthält eine statische Seite mit Suche (Bankleitzahl, BIC, Name, Ort, LEI), Filtern nach
Bundesland und Sektor, Detailansicht mit Link zu GLEIF und einer Übersicht aller Änderungen.

Der Workflow `.github/workflows/bic-pages.yml` stellt Seite und Daten zusammen und veröffentlicht sie
auf GitHub Pages – nach jedem täglichen Update und bei jeder Änderung unter `bic/` auf `main`.

**Einmalig einrichten:** Repository → Settings → Pages → „Build and deployment“ → Source: **GitHub Actions**.

Lokal ansehen:

```sh
mkdir -p /tmp/site && cp bic/web/* /tmp/site/ && cp -r bic/data bic/changes /tmp/site/
python3 -m http.server -d /tmp/site 8000   # dann http://localhost:8000
```

## Ausführung

Automatisch täglich über GitHub Actions (`.github/workflows/bic-update.yml`), manuell über
„Actions → BIC-Verzeichnis aktualisieren → Run workflow“ oder lokal:

```sh
python3 bic/update_bic.py              # herunterladen und vergleichen
python3 bic/update_bic.py --input x.csv  # lokale OeNB-Datei verwenden
```

Liefert die OeNB deutlich weniger Einträge als bisher (unter 80 %), bricht das Skript ab, statt
massenhaft Banken als „entfernt“ zu melden. Mit `--force` wird der Stand trotzdem übernommen.

Daten: © Oesterreichische Nationalbank, es gelten deren [Nutzungsbedingungen](https://www.oenb.at/Service/Impressum-und-Haftung.html).
