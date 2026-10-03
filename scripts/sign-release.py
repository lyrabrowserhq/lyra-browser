#!/usr/bin/env python3
# Copyright Lyra. Sign a Lyra release.json with Ed25519.

"""Build and sign release.json for GitHub Releases.

Reads VERSION and artifact files. Private key from LYRA_RELEASE_KEY or
--key. Never prints the key. Fails if the key is missing on --require-key.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = "lyrabrowserhq/lyra"
VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_version(root: Path) -> str:
    for line in (root / "VERSION").read_text().splitlines():
        if line.startswith("LYRA_VERSION="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("VERSION missing LYRA_VERSION")


def classify(name: str) -> tuple[str, str]:
    lower = name.lower()
    if "windows" in lower or lower.endswith(".zip"):
        return "windows", "x86_64"
    if "darwin" in lower or "macos" in lower:
        return "macos", "x86_64"
    return "linux", "x86_64"


def sign(pem: Path, payload: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        msg = Path(tmp) / "msg"
        msg.write_bytes(payload)
        proc = subprocess.run(
            [
                "openssl",
                "pkeyutl",
                "-sign",
                "-inkey",
                str(pem),
                "-rawin",
                "-in",
                str(msg),
            ],
            check=True,
            capture_output=True,
        )
    sig = proc.stdout
    if len(sig) != 64:
        raise SystemExit(f"openssl signature length {len(sig)} want 64")
    return sig


def verify(pub_hex: str, payload: bytes, sig: bytes) -> None:
    import tempfile

    der_prefix = bytes.fromhex("302a300506032b6570032100")
    pub = bytes.fromhex(pub_hex)
    if len(pub) != 32:
        raise SystemExit("public key must be 32 bytes hex")
    with tempfile.TemporaryDirectory() as tmp:
        pem = Path(tmp) / "pub.pem"
        der = Path(tmp) / "pub.der"
        sigp = Path(tmp) / "sig"
        msg = Path(tmp) / "msg"
        der.write_bytes(der_prefix + pub)
        sigp.write_bytes(sig)
        msg.write_bytes(payload)
        subprocess.run(
            ["openssl", "pkey", "-pubin", "-inform", "DER", "-in", str(der), "-out", str(pem)],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "openssl",
                "pkeyutl",
                "-verify",
                "-pubin",
                "-inkey",
                str(pem),
                "-rawin",
                "-in",
                str(msg),
                "-sigfile",
                str(sigp),
            ],
            check=True,
            capture_output=True,
        )


def pubkey_hex_from_pem(pem: Path) -> str:
    der = subprocess.run(
        ["openssl", "pkey", "-in", str(pem), "-pubout", "-outform", "DER"],
        check=True,
        capture_output=True,
    ).stdout
    return der[-32:].hex()


def resolve_key(args: argparse.Namespace) -> tuple[Path | None, Path | None]:
    """Return (key path, temp dir to wipe). PEM in LYRA_RELEASE_KEY is written to a 0600 temp file."""
    if args.key is not None:
        return args.key, None
    raw = os.environ.get("LYRA_RELEASE_KEY", "")
    if raw.startswith("-----BEGIN"):
        tmp = Path(tempfile.mkdtemp(prefix="lyra-key-"))
        pem = tmp / "lyra-release.pem"
        pem.write_text(raw if raw.endswith("\n") else raw + "\n")
        os.chmod(pem, 0o600)
        return pem, tmp
    if raw:
        path = Path(raw)
        if path.is_file():
            return path, None
    default = args.root / "secrets" / "lyra-release.pem"
    if default.is_file():
        return default, None
    return None, None


def main() -> int:
    ap = argparse.ArgumentParser(description="Sign Lyra release.json")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--dist", type=Path, required=True)
    ap.add_argument("--key", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--require-key", action="store_true")
    args = ap.parse_args()

    key, tmpdir = resolve_key(args)
    try:
        if key is None or not key.is_file():
            if args.require_key:
                print("missing Ed25519 key", file=sys.stderr)
                return 1
            print("skip sign: no key", file=sys.stderr)
            return 0

        version = load_version(args.root)
        if not VERSION_RE.match(version):
            print(f"bad version {version}", file=sys.stderr)
            return 1
        tag = "v" + version
        dist = args.dist
        files = sorted(
            p
            for p in dist.iterdir()
            if p.is_file() and p.name.endswith((".tar.xz", ".zip")) and p.name.startswith("lyra-")
        )
        if not files:
            print(f"no lyra artifacts in {dist}", file=sys.stderr)
            return 1

        artifacts = []
        sums = []
        for path in files:
            digest = sha256_file(path)
            os_name, arch = classify(path.name)
            artifacts.append(
                {
                    "name": path.name,
                    "url": f"https://github.com/{REPO}/releases/download/{tag}/{path.name}",
                    "sha256": digest,
                    "size": path.stat().st_size,
                    "os": os_name,
                    "arch": arch,
                }
            )
            sums.append(f"{digest}  {path.name}")

        doc = {
            "version": version,
            "tag": tag,
            "channel": "stable",
            "artifacts": artifacts,
            "notes_url": f"https://github.com/{REPO}/releases/tag/{tag}",
        }
        payload = (json.dumps(doc, separators=(",", ":"), sort_keys=True) + "\n").encode()
        sig = sign(key, payload)
        pub = pubkey_hex_from_pem(key)
        verify(pub, payload, sig)

        out = args.out or dist
        out.mkdir(parents=True, exist_ok=True)
        (out / "release.json").write_bytes(payload)
        (out / "release.json.sig").write_bytes(sig)
        (out / "SHA256SUMS").write_text("\n".join(sums) + "\n")
        print("signed", out / "release.json", "pubkey", pub)
        return 0
    finally:
        if tmpdir is not None:
            try:
                (tmpdir / "lyra-release.pem").unlink(missing_ok=True)
                tmpdir.rmdir()
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
