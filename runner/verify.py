"""Gate de vérification (doc 06, étape VERIFY / doc 04 /verify-app) — agnostique.

Détecte une commande de build/test dans le checkout et la lance. Si elle casse,
le run échoue PROPREMENT (pas de PR). Si rien n'est détecté → `skipped`.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class VerifyResult:
    status: str            # passed | failed | skipped
    command: Optional[str]
    output: str

    @property
    def ok(self) -> bool:
        return self.status in ("passed", "skipped")


def _run_cmd(cmd, cwd: Path, timeout: int) -> tuple[int, str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=isinstance(cmd, str),
    )
    return proc.returncode, (proc.stdout + proc.stderr)[-4000:]


def run_verify_gate(cwd: Path | str, timeout_s: int = 900) -> VerifyResult:
    cwd = Path(cwd)

    # 1) Script de vérif explicite du projet (le plus fiable).
    script = cwd / ".kua" / "verify.sh"
    if script.exists():
        rc, out = _run_cmd(["bash", str(script)], cwd, timeout_s)
        return VerifyResult("passed" if rc == 0 else "failed", ".kua/verify.sh", out)

    # 2) Node : npm run build (+ test si présent).
    pkg = cwd / "package.json"
    if pkg.exists():
        try:
            scripts = json.loads(pkg.read_text(encoding="utf-8")).get("scripts", {})
        except Exception:
            scripts = {}
        cmds = [f"npm run {s}" for s in ("build", "test") if s in scripts]
        if cmds:
            if not (cwd / "node_modules").exists():
                _run_cmd("npm install", cwd, timeout_s)
            outs = []
            for c in cmds:
                rc, out = _run_cmd(c, cwd, timeout_s)
                outs.append(f"$ {c}\n{out}")
                if rc != 0:
                    return VerifyResult("failed", c, "\n".join(outs))
            return VerifyResult("passed", " && ".join(cmds), "\n".join(outs))

    # 3) Python : pytest si configuré.
    if (cwd / "pyproject.toml").exists() or (cwd / "pytest.ini").exists() or any(cwd.glob("test_*.py")):
        rc, out = _run_cmd("python -m pytest -q", cwd, timeout_s)
        return VerifyResult("passed" if rc == 0 else "failed", "pytest", out)

    # 4) Makefile : verify / check / test.
    mk = cwd / "Makefile"
    if mk.exists():
        text = mk.read_text(errors="ignore")
        for target in ("verify", "check", "test"):
            if text.startswith(f"{target}:") or f"\n{target}:" in text:
                rc, out = _run_cmd(f"make {target}", cwd, timeout_s)
                return VerifyResult("passed" if rc == 0 else "failed", f"make {target}", out)

    return VerifyResult("skipped", None, "Aucune gate de vérif détectée dans le repo.")
