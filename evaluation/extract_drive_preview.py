"""Extract the first column group from a Google Drive CSV preview PDF.

The Drive viewer paginates a wide CSV into nine PDF pages per row block. The
first page of every block contains elapsed time, UTC, latitude, longitude and
height above takeoff. This fallback is used only when the dataset owner's raw
Drive download is quota-blocked; the source preview PDF and its hash must be
retained in the local manifest.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

import pdfplumber


ROW = re.compile(
    r"^(?P<elapsed>\d+)\s+"
    r"(?P<date>\d{4}-\d{2}-\d{2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s*"
    r"(?P<lat>-?\d+\.\d+)\s+"
    r"(?P<lon>-?\d+\.\d+)\s+"
    r"(?P<height>-?\d+(?:\.\d+)?)"
)
GPS = re.compile(r"^(?P<satellites>\d+)\s+(?P<gps_level>-?\d+(?:\.\d+)?)\b")
FLIGHT_STATE = re.compile(r"^(?P<state_raw>\d+)\s*(?P<state>.*)$")


def extract(input_pdf: Path, output_csv: Path, pages_per_block: int = 9) -> int:
    rows: list[dict[str, str]] = []
    with pdfplumber.open(input_pdf) as document:
        if len(document.pages) % pages_per_block:
            raise ValueError(
                f"Expected page count divisible by {pages_per_block}, got {len(document.pages)}"
            )
        for page_index in range(0, len(document.pages), pages_per_block):
            text = document.pages[page_index].extract_text() or ""
            block_rows: list[dict[str, str]] = []
            for line in text.splitlines()[1:]:
                match = ROW.match(line.strip())
                if not match:
                    continue
                values = match.groupdict()
                block_rows.append(
                    {
                        "elapsed_ms": values["elapsed"],
                        "datetime_utc": f'{values["date"]}T{values["time"]}Z',
                        "latitude_deg": values["lat"],
                        "longitude_deg": values["lon"],
                        "relative_height_ft": values["height"],
                        "preview_page": str(page_index + 1),
                    }
                )
            gps_text = document.pages[page_index + 2].extract_text() or ""
            gps_rows = [
                match.groupdict()
                for line in gps_text.splitlines()[1:]
                if (match := GPS.match(line.strip()))
            ]
            state_text = document.pages[page_index + 8].extract_text() or ""
            state_rows = [
                match.groupdict()
                for line in state_text.splitlines()[1:]
                if (match := FLIGHT_STATE.match(line.strip()))
            ]
            if not (len(block_rows) == len(gps_rows) == len(state_rows)):
                raise ValueError(
                    f"Preview block on page {page_index + 1} has inconsistent row groups: "
                    f"{len(block_rows)}/{len(gps_rows)}/{len(state_rows)}"
                )
            for row, gps, state in zip(block_rows, gps_rows, state_rows):
                row.update(gps)
                row.update(state)
                rows.append(row)
    if not rows:
        raise ValueError("No telemetry rows were extracted")
    elapsed = [int(row["elapsed_ms"]) for row in rows]
    if any(current <= prior for prior, current in zip(elapsed, elapsed[1:])):
        raise ValueError("Extracted elapsed times are not strictly increasing")
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    count = extract(args.input_pdf, args.output_csv)
    print(f"Extracted {count} measured flight-log rows")


if __name__ == "__main__":
    main()
