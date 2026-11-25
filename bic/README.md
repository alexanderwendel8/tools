# BIC-Verzeichnis Österreich (OeNB)

Lädt täglich das [SEPA-Zahlungsverkehrs-Verzeichnis](https://www.oenb.at/Statistik/Klassifikationen/SEPA-Zahlungsverkehrs-Verzeichnis.html)
der Oesterreichischen Nationalbank (Bankleitzahl, BIC/SWIFT-Code, LEI, Adresse …) und protokolliert Änderungen.

| Pfad | Inhalt |
|---|---|
| `update_bic.py` | Skript: Download, Vergleich, Ablage (nur Python-Standardbibliothek) |
| `data/sepa-zv-vz_gesamt.csv` | Aktueller Stand des Verzeichnisses |
| `changes/JJJJ-MM-TT.csv` | Änderungen eines Tages (nur an Tagen mit Änderungen) |

Ältere Gesamtstände sind über die Git-Historie von `data/sepa-zv-vz_gesamt.csv` abrufbar.

## Format

Alle Dateien: Semikolon als Trennzeichen, UTF-8 mit BOM (öffnet sich in Excel mit korrekten Umlauten).

Die Änderungsdateien haben zwei zusätzliche Spalten vorne:

- `Änderung`: `neu`, `geändert` oder `entfernt`
- `Geänderte Felder`: bei `geändert` z. B. `SWIFT-Code: ALT -> NEU | Ort: ALT -> NEU`

Danach folgt der Eintrag (bei `entfernt` der letzte bekannte Stand). Schlüssel für den Vergleich ist die Bankleitzahl.

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
