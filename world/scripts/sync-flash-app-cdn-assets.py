#!/usr/bin/env python3
"""Incremental content-addressed uploader for Seed World Flash App static assets to mdn.alipayobjects.com (AFTS).

Default mode is read-only (--dry-run). Pass --apply with AFTS_BIZSECRET in the environment to upload
and update world/demos/seed-world/flash-app-cdn-manifest.json.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import threading
import time
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIST_DIR = REPO_ROOT / "world/dist/seed-world-flash-app"
DEFAULT_MANIFEST_PATH = REPO_ROOT / "world/demos/seed-world/flash-app-cdn-manifest.json"
DEFAULT_SECRET_FILE = Path.home() / ".config/galacean-flash-app/afts.env"
DEFAULT_ORIGIN = "https://render.lingguangcontent.com"
DEFAULT_NAMESPACE = "seed-world-flash"
CHUNK = 1024 * 1024


def load_local_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value

LEAF_EXTENSIONS = {
    ".ktx2",
    ".mesh",
    ".glb",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".wav",
    ".mp3",
    ".ogg",
    ".shaderc",
    ".shader",
    ".animctrl",
    ".wasm",
    ".bin",
    ".r8",
    ".r16",
    ".rgb8",
    ".f32le",
    ".treewind",
    ".asset",
    ".br",
}

PUGC_RENAMED_WASM_RE = re.compile(r"\.(asset|br|f32le|r8|r16|rgb8|treewind)\.wasm$", re.IGNORECASE)
PHYSX_WASM_RE = re.compile(r"(?:^|/)physx\.release(?:\.simd)?(?:\.[a-f0-9]+)?\.wasm$", re.IGNORECASE)
TEXT_BUNDLE_RE = re.compile(r"^assets/seed-world-project-text-bundle-[a-f0-9]+\.json$", re.IGNORECASE)
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sha256_file(path: Path) -> tuple[str, int]:
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(CHUNK), b""):
            size += len(chunk)
            h.update(chunk)
    return h.hexdigest(), size


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        Path(tmp).unlink(missing_ok=True)


def safe_alias(namespace: str, sha: str, rel_path: str) -> str:
    name = Path(rel_path).name
    if PUGC_RENAMED_WASM_RE.search(name):
        name = re.sub(r"\.wasm$", ".bin", name, flags=re.IGNORECASE)
    base_name = SAFE_NAME_RE.sub("-", name).strip("-") or "asset.bin"
    if len(base_name) > 80:
        ext = Path(base_name).suffix[:16]
        base_name = base_name[: 80 - len(ext)] + ext
    return f"{namespace}/{sha[:16]}-{base_name}"


class AftsClient:
    def __init__(self, origin: str):
        import httpx

        self.client = httpx.Client(timeout=httpx.Timeout(120, connect=20), follow_redirects=True)
        self.appid = os.environ.get("AFTS_APPID", "apwallet")
        self.bizkey = os.environ.get("AFTS_BIZKEY", "asap_serivce")
        secret = os.environ.get("AFTS_BIZSECRET")
        if not secret:
            raise RuntimeError("Missing AFTS_BIZSECRET environment variable (required for --apply).")
        self.secret = secret
        self.origin = origin
        self.base = os.environ.get("AFTS_PUBLIC_URL_BASE", "https://mdn.alipayobjects.com").rstrip("/")
        self._lock = threading.Lock()
        self._token: str | None = None
        self._expires = 0.0

    def close(self) -> None:
        self.client.close()

    def public_url(self, alias: str) -> str:
        return f"{self.base}/{self.bizkey}/uri/file/as/{quote(alias, safe='/')}"

    def get_token(self, force_refresh: bool = False) -> str:
        with self._lock:
            if not force_refresh and self._token and time.monotonic() < self._expires:
                return self._token
            ts = str(int(time.time() * 1000))
            sign = hashlib.md5(f"{self.appid}{self.bizkey}{ts}{self.secret}".encode()).hexdigest()

            def fetch_token(endpoint: str, params: dict) -> str:
                try:
                    r = self.client.get(endpoint, params=params)
                    r.raise_for_status()
                    body = r.json()
                except Exception:
                    raise RuntimeError("AFTS token request failed (credentials and URL redacted)") from None
                if str(body.get("code")) != "0":
                    raise RuntimeError("AFTS token service rejected the request")
                val = body.get("data")
                val = val.get("token") if isinstance(val, dict) else val
                if not isinstance(val, str) or not val:
                    raise RuntimeError("AFTS token response missing token")
                return val

            op = fetch_token(
                os.environ.get("AFTS_OP_TOKEN_URL", "https://mmtcapi.alipay.com/token/1.0/op"),
                dict(appId=self.appid, bizKey=self.bizkey, timestamp=ts, sign=sign),
            )
            self._token = fetch_token(
                os.environ.get("AFTS_MASS_TOKEN_URL", "https://mmtcapi.alipay.com/token/1.0/mass"),
                dict(appId=self.appid, bizKey=self.bizkey, opToken=op, massType=1, expireTime=3600),
            )
            self._expires = time.monotonic() + 3300
            return self._token

    def verify(self, url: str, sha: str, size: int) -> tuple[bool, str | None]:
        try:
            with self.client.stream("GET", url, headers={"Origin": self.origin}) as response:
                if response.status_code != 200:
                    return False, f"CDN HTTP {response.status_code}"
                acao = response.headers.get("access-control-allow-origin")
                if acao not in ("*", self.origin):
                    return False, f"CORS mismatch: access-control-allow-origin={acao!r}"
                h = hashlib.sha256()
                received = 0
                for chunk in response.iter_bytes(CHUNK):
                    received += len(chunk)
                    if received > size:
                        return False, "CDN byte length exceeds source"
                    h.update(chunk)
                if received != size or h.hexdigest() != sha:
                    return False, f"SHA/size mismatch (got {received} vs {size})"
                return True, None
        except Exception as exc:
            return False, f"transport {type(exc).__name__}"

    def upload_and_verify(self, path: Path, alias: str, sha: str, size: int) -> str:
        url = self.public_url(alias)
        # Skip upload if the exact immutable content-addressed object is already live on CDN.
        ok, _ = self.verify(url, sha, size)
        if ok:
            return url

        upload_alias = quote(alias, safe="/")
        upload_url = os.environ.get("AFTS_UPLOAD_URL", "http://mass.alipay.com/file/auth/upload")
        ext_name = Path(alias).suffix.lstrip(".").lower() or "bin"
        failure = "unknown"
        for attempt in range(3):
            mt = self.get_token(force_refresh=attempt > 0)
            upload_status = "no response"
            try:
                with open(path, "rb") as f:
                    r = self.client.post(
                        upload_url,
                        params=dict(mt=mt, bizType=self.bizkey, setpublic="true", alias=upload_alias),
                        headers={
                            "x-mass-token": mt,
                            "x-mass-biztype": self.bizkey,
                            "x-mass-public": "true",
                            "x-mass-ext-name": ext_name,
                        },
                        files={upload_alias: (path.name, f, "application/octet-stream")},
                    )
                    upload_status = f"HTTP {r.status_code}"
                    if r.status_code in (401, 403):
                        self.get_token(force_refresh=True)
            except Exception as exc:
                upload_status = type(exc).__name__

            ok, err = self.verify(url, sha, size)
            if ok:
                return url
            failure = f"upload {upload_status}; {err}"
            if attempt < 2:
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Failed to upload/verify {alias}: {failure}")


def scan_candidates(dist_dir: Path, include_text_bundle: bool) -> dict[str, tuple[Path, str, int]]:
    by_sha: dict[str, tuple[Path, str, int]] = {}
    for file_path in sorted(dist_dir.rglob("*")):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(dist_dir).as_posix()
        ext = file_path.suffix.lower()
        is_bundle = include_text_bundle and bool(TEXT_BUNDLE_RE.match(rel))
        if not is_bundle:
            if ext not in LEAF_EXTENSIONS:
                continue
            # Keep real WebAssembly binaries (esbuild, physx) local for application/wasm streaming.
            if ext == ".wasm" and not PUGC_RENAMED_WASM_RE.search(rel):
                continue
            if PHYSX_WASM_RE.search(rel):
                continue
        sha, size = sha256_file(file_path)
        if size == 0:
            continue
        if sha not in by_sha:
            by_sha[sha] = (file_path, rel, size)
    return by_sha


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload Seed World Flash App static assets to mdn.alipayobjects.com")
    parser.add_argument("--dist-dir", type=Path, default=DEFAULT_DIST_DIR)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--namespace", default=DEFAULT_NAMESPACE)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--no-text-bundle", action="store_true")
    parser.add_argument("--apply", action="store_true", help="Upload missing assets to AFTS and update manifest")
    args = parser.parse_args()

    if not args.dist_dir.is_dir():
        print(f"Dist directory not found: {args.dist_dir}. Run `pnpm --dir world build:seed-world-flash-app` first.", file=sys.stderr)
        return 1

    manifest = {"version": 1, "bySha256": {}}
    if args.manifest.is_file():
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        manifest.setdefault("version", 1)
        manifest.setdefault("bySha256", {})

    existing: dict = manifest["bySha256"]
    candidates = scan_candidates(args.dist_dir, include_text_bundle=not args.no_text_bundle)
    pending = {
        sha: info
        for sha, info in candidates.items()
        if sha not in existing or existing[sha].get("size") != info[2]
    }
    total_bytes = sum(info[2] for info in candidates.values())
    pending_bytes = sum(info[2] for info in pending.values())

    print(
        f"Scanned {args.dist_dir}: {len(candidates)} unique assets ({total_bytes / (1024 * 1024):.2f} MiB), "
        f"already in manifest: {len(candidates) - len(pending)}, pending upload: {len(pending)} ({pending_bytes / (1024 * 1024):.2f} MiB)"
    )

    if not args.apply:
        print("Dry run complete. Re-run with AFTS_BIZSECRET=... --apply to upload pending assets.")
        return 0

    load_local_env_file(DEFAULT_SECRET_FILE)
    if not pending:
        print("All assets are already present in manifest.")
        return 0

    afts = AftsClient(args.origin)
    lock = threading.Lock()
    completed = 0
    errors: list[str] = []

    def worker(sha: str, file_path: Path, rel: str, size: int) -> None:
        nonlocal completed
        alias = safe_alias(args.namespace, sha, rel)
        url = afts.upload_and_verify(file_path, alias, sha, size)
        with lock:
            existing[sha] = {
                "url": url,
                "size": size,
                "ext": file_path.suffix.lower(),
                "examplePath": rel,
            }
            completed += 1
            if completed % 20 == 0 or completed == len(pending):
                atomic_write_json(args.manifest, manifest)
                print(f"Uploaded & verified {completed}/{len(pending)} assets...")

    try:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
            futures = {
                pool.submit(worker, sha, path, rel, size): rel
                for sha, (path, rel, size) in pending.items()
            }
            for future in as_completed(futures):
                rel = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    errors.append(f"{rel}: {exc}")
    finally:
        atomic_write_json(args.manifest, manifest)
        afts.close()

    if errors:
        print(f"Completed with {len(errors)} error(s):", file=sys.stderr)
        for line in errors[:20]:
            print("  -", line, file=sys.stderr)
        return 1

    print(f"Done! Updated {args.manifest} ({len(existing)} total CDN entries).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
