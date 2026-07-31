"""Windows launcher for the bundled canonical DOCX renderer.

The bundled renderer builds LibreOffice profile URIs with a POSIX-style
"file://" concatenation. On Windows that can produce a malformed URI and
leave soffice waiting indefinitely. This launcher keeps the canonical
renderer but normalizes only that command argument to Path.as_uri().
"""

import importlib.util
import os
import sys
from pathlib import Path


CANONICAL = Path(
    r"C:\Users\nsf.yusuf\.codex\plugins\cache\openai-primary-runtime"
    r"\documents\26.727.11326\skills\documents\render_docx.py"
)

spec = importlib.util.spec_from_file_location("canonical_render_docx", CANONICAL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

original_run_cmd = module._run_cmd


def run_cmd_with_windows_uri(cmd, env, verbose):
    normalized = []
    prefix = "-env:UserInstallation=file://"
    for arg in cmd:
        if arg.startswith(prefix):
            raw_path = arg[len(prefix):]
            normalized.append("-env:UserInstallation=" + Path(raw_path).resolve().as_uri())
        else:
            normalized.append(arg)
    return original_run_cmd(normalized, env=env, verbose=verbose)


module._run_cmd = run_cmd_with_windows_uri

if __name__ == "__main__":
    module.main()
