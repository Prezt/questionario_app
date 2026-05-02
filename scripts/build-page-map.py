#!/usr/bin/env python3
"""
Generate public/question-pages.json: maps each ENEM question number to its
PDF page filename stem.

Usage (from enem-parser directory with its venv):
  .venv/bin/python ../questionario_app/scripts/build-page-map.py \
      --data-dir data \
      --output ../questionario_app/public/question-pages.json
"""
import argparse
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF


_QUESTION_RE = re.compile(r'QUEST[ÃA]O\s+(\d+)', re.IGNORECASE)

YEARS = list(range(2018, 2026))
DAYS = ['d1', 'd2']
DAY_NUMBER = {'d1': 1, 'd2': 2}


def find_pdf(data_dir: Path, year: int, day: str) -> Path | None:
    """Find the prova PDF for a given year and day (d1 or d2)."""
    day_num = DAY_NUMBER[day]
    pattern = f'{year}_PV_impresso_D{day_num}_*.pdf'
    matches = list(data_dir.glob(pattern))
    return matches[0] if matches else None


def extract_page_map(pdf_path: Path, year: int, day: str) -> dict[str, str]:
    """Return {pageMapKey: pageFileStem} for all questions found in the PDF."""
    result = {}
    with fitz.open(str(pdf_path)) as doc:
        for page_idx, page in enumerate(doc):
            text = page.get_text()
            for m in _QUESTION_RE.finditer(text):
                q_num = int(m.group(1))
                # Zero-pad page number to 2 digits
                page_stem = f'page-{day}-{year}-{page_idx + 1:02d}'
                key = f'{year}_{day}_{q_num}'
                # First occurrence wins (question header is on the first page it appears)
                if key not in result:
                    result[key] = page_stem
    return result


def main():
    parser = argparse.ArgumentParser(description='Build question→page map')
    parser.add_argument('--data-dir', default='data', help='Path to enem-parser data/ directory')
    parser.add_argument('--output', default='../questionario_app/public/question-pages.json')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_path = Path(args.output)

    page_map: dict[str, str] = {}
    found = 0
    missing = 0

    for year in YEARS:
        for day in DAYS:
            pdf = find_pdf(data_dir, year, day)
            if pdf is None:
                print(f'WARNING: no PDF found for {year} {day} — skipping', file=sys.stderr)
                missing += 1
                continue
            entries = extract_page_map(pdf, year, day)
            page_map.update(entries)
            found += 1
            print(f'  {year} {day}: {len(entries)} questions mapped from {pdf.name}')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(page_map, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\nDone. {len(page_map)} entries written to {output_path}')
    print(f'PDFs processed: {found}, skipped: {missing}')


if __name__ == '__main__':
    main()
