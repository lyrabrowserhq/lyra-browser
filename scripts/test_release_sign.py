#!/usr/bin/env python3
# Sign a dummy artifact with the test key and reject a tampered payload.

"""Local check for scripts/sign-release.py. Does not use the shipping key."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIGN = ROOT / "scripts" / "sign-release.py"
TEST_KEY = ROOT / "scripts" / "testdata" / "test-release.pem"
TEST_PUB = (ROOT / "scripts" / "testdata" / "test-release.pub.hex").read_text().strip()
SHIPPED = (ROOT / "scripts" / "release-pubkey.hex").read_text().strip()


def version() -> str:
    for line in (ROOT / "VERSION").read_text().splitlines():
        if line.startswith("LYRA_VERSION="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("VERSION missing LYRA_VERSION")


def load_sign_module():
    spec = importlib.util.spec_from_file_location("sign_release", SIGN)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load sign-release.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not TEST_KEY.is_file():
        print("missing test-release.pem", file=sys.stderr)
        return 1
    if len(TEST_PUB) != 64 or len(SHIPPED) != 64:
        print("pubkey hex length", file=sys.stderr)
        return 1
    if TEST_PUB == SHIPPED:
        print("test key must not be the shipping key", file=sys.stderr)
        return 1
    mjs = (ROOT / "overlay" / "browser" / "modules" / "LyraUpdateCheck.sys.mjs").read_text()
    if SHIPPED not in mjs:
        print("LyraUpdateCheck.sys.mjs missing shipping pubkey", file=sys.stderr)
        return 1

    ver = version()
    sr = load_sign_module()
    with tempfile.TemporaryDirectory() as tmp:
        dist = Path(tmp)
        blob = dist / f"lyra-{ver}-linux-x86_64.tar.xz"
        blob.write_bytes(b"lyra-test-artifact\n")
        proc = subprocess.run(
            [
                sys.executable,
                str(SIGN),
                "--root",
                str(ROOT),
                "--dist",
                str(dist),
                "--key",
                str(TEST_KEY),
                "--require-key",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        if TEST_PUB not in proc.stdout:
            print("sign-release did not print the test pubkey", file=sys.stderr)
            print(proc.stdout, proc.stderr, file=sys.stderr)
            return 1
        payload = (dist / "release.json").read_bytes()
        sig = (dist / "release.json.sig").read_bytes()
        if len(sig) != 64:
            print(f"sig length {len(sig)}", file=sys.stderr)
            return 1
        doc = json.loads(payload)
        if doc.get("version") != ver or doc.get("tag") != "v" + ver:
            print("manifest version", file=sys.stderr)
            return 1
        if doc.get("channel") != "stable":
            print("channel", file=sys.stderr)
            return 1
        art = doc["artifacts"][0]
        want = hashlib.sha256(blob.read_bytes()).hexdigest()
        if art["sha256"] != want:
            print("artifact sha256", file=sys.stderr)
            return 1
        sums = (dist / "SHA256SUMS").read_text()
        if want not in sums:
            print("SHA256SUMS missing digest", file=sys.stderr)
            return 1
        canonical = (json.dumps(doc, separators=(",", ":"), sort_keys=True) + "\n").encode()
        if canonical != payload:
            print("release.json is not canonical", file=sys.stderr)
            return 1
        sr.verify(TEST_PUB, payload, sig)
        bad = payload.replace(ver.encode(), b"9.9.9", 1)
        try:
            sr.verify(TEST_PUB, bad, sig)
        except subprocess.CalledProcessError:
            pass
        else:
            print("tampered payload verified", file=sys.stderr)
            return 1

        env = os.environ.copy()
        env["LYRA_RELEASE_KEY"] = TEST_KEY.read_text()
        env_proc = subprocess.run(
            [
                sys.executable,
                str(SIGN),
                "--root",
                str(ROOT),
                "--dist",
                str(dist),
                "--out",
                str(dist / "from-env"),
                "--require-key",
            ],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        if TEST_PUB not in env_proc.stdout:
            print("env PEM sign failed", file=sys.stderr)
            return 1
        if not (dist / "from-env" / "release.json.sig").is_file():
            print("env PEM missing sig", file=sys.stderr)
            return 1

    print("OK release sign/verify")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
