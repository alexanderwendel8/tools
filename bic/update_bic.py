#!/usr/bin/env python3
"""Lädt das SEPA-Zahlungsverkehrs-Verzeichnis der OeNB und protokolliert Änderungen.

Ablauf:
  1. CSV von der OeNB herunterladen (Latin-1, Semikolon, mit Hinweiszeilen davor).
  2. Mit dem zuletzt abgelegten Stand (data/sepa-zv-vz_gesamt.csv) vergleichen.
     Schlüssel ist die Bankleitzahl (im Verzeichnis eindeutig).
  3. Neue, geänderte und entfernte Einträge nach changes/JJJJ-MM-TT.csv schreiben
     (nur wenn es Änderungen gibt).
  4. Aktuellen Stand nach data/sepa-zv-vz_gesamt.csv schreiben.

Nur Python-Standardbibliothek, damit es ohne Installation auf GitHub Actions läuft.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://www.oenb.at/docroot/downloads_observ/sepa-zv-vz_gesamt.csv"
KEY = "Bankleitzahl"
HEADER_START = "Kennzeichen;"
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "sepa-zv-vz_gesamt.csv"
CHANGES_DIR = BASE_DIR / "changes"
# Schutz gegen kaputte/abgeschnittene Downloads: Fällt die Anzahl der Einträge
# unter diesen Anteil des vorherigen Stands, wird abgebrochen statt hunderte
# Banken als "entfernt" zu melden.
MIN_ROW_RATIO = 0.8
# Ablageformat: UTF-8 mit BOM, damit Excel die Umlaute korrekt anzeigt.
OUT_ENCODING = "utf-8-sig"


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "bic-update-script"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def parse_oenb(raw: bytes) -> tuple[list[str], list[dict[str, str]], dt.date | None]:
    """Gibt (Spalten, Zeilen, Stichtag) zurück."""
    text = raw.decode("latin-1")
    lines = text.splitlines()

    stand = None
    for line in lines:
        m = re.search(r"Abfrage vom (\d{2})\.(\d{2})\.(\d{4})", line)
        if m:
            stand = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            break

    try:
        start = next(i for i, l in enumerate(lines) if l.startswith(HEADER_START))
    except StopIteration:
        raise SystemExit("Fehler: Kopfzeile im OeNB-CSV nicht gefunden – Format geändert?")

    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])), delimiter=";")
    columns = [c.strip() for c in reader.fieldnames or []]
    if KEY not in columns:
        raise SystemExit(f"Fehler: Spalte '{KEY}' fehlt im OeNB-CSV.")
    rows = []
    for r in reader:
        row = {c: (r.get(c) or "").strip() for c in columns}
        if row[KEY]:
            rows.append(row)
    return columns, rows, stand


def read_stored(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return [], []
    with path.open(encoding=OUT_ENCODING, newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding=OUT_ENCODING, newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, delimiter=";", lineterminator="\n",
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_changes_index() -> None:
    """Schreibt changes/index.json (Liste der Tage mit Zählern) für die Weboberfläche."""
    days = []
    for f in sorted(CHANGES_DIR.glob("????-??-??.csv"), reverse=True):
        with f.open(encoding=OUT_ENCODING, newline="") as fh:
            kinds = [r.get("Änderung", "") for r in csv.DictReader(fh, delimiter=";")]
        days.append({"datum": f.stem, "neu": kinds.count("neu"),
                     "geaendert": kinds.count("geändert"), "entfernt": kinds.count("entfernt")})
    CHANGES_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(days, ensure_ascii=False, indent=1) + "\n"
    index = CHANGES_DIR / "index.json"
    if not index.exists() or index.read_text(encoding="utf-8") != text:
        index.write_text(text, encoding="utf-8")


def diff(old: list[dict[str, str]], new: list[dict[str, str]], columns: list[str]):
    old_by_key = {r[KEY]: r for r in old}
    new_by_key = {r[KEY]: r for r in new}
    changes = []
    for key, row in new_by_key.items():
        if key not in old_by_key:
            changes.append(("neu", "", row))
        else:
            before = old_by_key[key]
            fields = [f"{c}: {before.get(c, '')} -> {row.get(c, '')}"
                      for c in columns if before.get(c, "") != row.get(c, "")]
            if fields:
                changes.append(("geändert", " | ".join(fields), row))
    for key, row in old_by_key.items():
        if key not in new_by_key:
            changes.append(("entfernt", "", row))
    order = {"neu": 0, "geändert": 1, "entfernt": 2}
    changes.sort(key=lambda c: (order[c[0]], c[2][KEY].zfill(10)))
    return changes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, help="Lokale OeNB-CSV statt Download verwenden")
    ap.add_argument("--force", action="store_true",
                    help="Auch bei starkem Rückgang der Einträge übernehmen")
    args = ap.parse_args()

    raw = args.input.read_bytes() if args.input else download(URL)
    columns, rows, stand = parse_oenb(raw)
    stand = stand or dt.date.today()
    print(f"OeNB-Verzeichnis vom {stand:%d.%m.%Y}: {len(rows)} Einträge")

    old_columns, old_rows = read_stored(DATA_FILE)
    if not old_rows:
        write_csv(DATA_FILE, columns, rows)
        write_changes_index()
        print(f"Kein vorheriger Stand vorhanden – Ausgangsstand angelegt: {DATA_FILE}")
        return 0

    if len(rows) < MIN_ROW_RATIO * len(old_rows) and not args.force:
        print(f"Fehler: nur {len(rows)} statt bisher {len(old_rows)} Einträge – "
              "Download vermutlich unvollständig. Abbruch (mit --force übernehmen).",
              file=sys.stderr)
        return 1

    all_columns = columns + [c for c in old_columns if c not in columns]
    changes = diff(old_rows, rows, all_columns)
    if changes:
        out = CHANGES_DIR / f"{stand:%Y-%m-%d}.csv"
        change_rows = [{"Änderung": kind, "Geänderte Felder": fields, **row}
                       for kind, fields, row in changes]
        write_csv(out, ["Änderung", "Geänderte Felder"] + all_columns, change_rows)
        counts = {k: sum(1 for c in changes if c[0] == k) for k in ("neu", "geändert", "entfernt")}
        print(f"Änderungen: {counts['neu']} neu, {counts['geändert']} geändert, "
              f"{counts['entfernt']} entfernt -> {out}")
    else:
        print("Keine Änderungen.")

    write_csv(DATA_FILE, columns, rows)
    write_changes_index()
    return 0


if __name__ == "__main__":
    sys.exit(main())
