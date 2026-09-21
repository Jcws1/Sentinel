"""Check shareable source inputs and local dependencies without touching operator data.

Uses existing tracked files plus unignored additions in a Git checkout. A source-only
export may supply --manifest with the same relative filename list. This is a targeted
hygiene check, not a comprehensive secret scanner or compatibility test suite.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "README.md",
    "docs/README.md",
    "docs/ARCHIVE.md",
    "docs/reports/performance-stability.md",
    "scripts/end_test_demo.py",
    "frontend/tests/fixtures/chrome-before-geometry.json",
    "frontend/tests/fixtures/scenario-20v20.json",
    "frontend/tests/support/isolated-runtime.mjs",
    "frontend/tests/support/run-browser.mjs",
    "frontend/scripts/generate-foundation-contracts.mjs",
    "frontend/public/sentinel-logo.png",
    "frontend/public/popout.html",
    "frontend/public/fonts/InterVariable.woff2",
    "frontend/public/fonts/Inter-LICENSE.txt",
    "frontend/map-data/licenses/Noto-OFL.txt",
    "frontend/map-data/licenses/Protomaps-BSD.txt",
    "frontend/map-data/licenses/Protomaps-data.md",
    "frontend/map-data/licenses/Tangram-icons-MIT.txt",
    "contracts/sentinel/v1.13/openapi.json",
    "contracts/sentinel/v1.14/openapi.json",
    "contracts/sentinel/v1.16/openapi.json",
    "contracts/sentinel/world.schema.json",
    "backend/drafts/domain.py",
)
CURRENT_DOCS = (
    "README.md", "backend/README.md", "frontend/README.md",
    "frontend/tests/README.md", "contracts/sentinel/README.md",
    "docs/README.md", "docs/architecture.md", "docs/demo-runbook.md",
    "docs/MAP_REFINEMENT_SETUP.md", "docs/MAP_SERVICES_SETUP.md",
    "docs/reports/performance-stability.md", "docs/repository-cleanup/REPORT.md",
)
TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".mjs", ".js", ".json", ".md", ".html", ".css", ".txt"}
SECRET_PATTERNS = (
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"\bAIza[0-9A-Za-z_-]{35}\b",
    r"\bghp_[0-9A-Za-z]{36}\b",
    r"\bgithub_pat_[0-9A-Za-z_]{60,}\b",
    r"\bAKIA[0-9A-Z]{16}\b",
)


def candidate_files(root: Path, manifest: Path | None = None) -> list[str]:
    if manifest:
        return json.loads(manifest.read_text(encoding="utf-8"))
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=root, capture_output=True, check=True,
    )
    return sorted({n for n in result.stdout.decode().split("\0") if n and (root / n).is_file()})


def check(root: Path, names: list[str]) -> list[str]:
    problems = []
    listed = set(names)
    for name in REQUIRED:
        if name not in listed or not (root / name).is_file():
            problems.append(f"Missing shareable input: {name}")
    for name in names:
        path = root / name
        if not path.is_file():
            problems.append(f"Missing listed file: {name}")
            continue
        parts = path.relative_to(root).parts
        generated = any(p in {"node_modules", ".venv", ".cache", "__pycache__", "test-results", "playwright-report"} or p == "dist" or p.startswith("dist-") for p in parts)
        local = name.startswith(("output/", "tmp/", "backend/data/", "frontend/public/edge-map/"))
        private_env = path.name.startswith(".env") and not path.name.endswith((".example", ".template"))
        database = re.search(r"\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$", path.name)
        if generated or local or private_env or database:
            problems.append(f"Local/generated file in candidate source: {name}")
        if path.stat().st_size > 5 * 1024 * 1024:
            problems.append(f"Review oversized source file (>5 MiB): {name}")
        if path.suffix not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8-sig")
        if any(re.search(pattern, text) for pattern in SECRET_PATTERNS):
            problems.append(f"Possible credential format (value withheld): {name}")
        if name.startswith(("frontend/src/", "frontend/tests/", "frontend/scripts/")) and path.suffix in {".ts", ".tsx", ".mjs", ".js"}:
            imports = re.findall(r"(?:from\s*|import\s*\(\s*|import\s*)['\"]([^'\"]+)['\"]", text)
            for imported in imports:
                if not imported.startswith("."):
                    continue
                target = path.parent / imported.split("?")[0]
                options = [target, *[Path(str(target) + ext) for ext in (".ts", ".tsx", ".mjs", ".js", ".css")], target / "index.ts", target / "index.tsx"]
                if not any(p.is_file() for p in options):
                    problems.append(f"Missing local import: {name} -> {imported}")
            if "../docs/" in text or "baseline-source/backend" in text:
                problems.append(f"Active helper still depends on historical docs: {name}")
    for name in CURRENT_DOCS:
        if not (root / name).is_file():
            problems.append(f"Missing current documentation: {name}")
            continue
        text = (root / name).read_text(encoding="utf-8")
        for link in re.findall(r"\]\(([^)]+)\)", text):
            link = link.split("#")[0].strip("<>")
            if not link or "://" in link or link.startswith("mailto:"):
                continue
            if not ((root / name).parent / link).exists():
                problems.append(f"Broken current documentation link: {name} -> {link}")
    return problems


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    names = candidate_files(root, args.manifest)
    problems = check(root, names)
    if problems:
        print("\n".join(problems))
        raise SystemExit(1)
    print(f"Repository hygiene passed: {len(names)} candidate source files; required fixtures, notices, imports and current documentation are present.")
