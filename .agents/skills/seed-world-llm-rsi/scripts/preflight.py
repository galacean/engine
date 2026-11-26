#!/usr/bin/env python3
"""Pre-flight checker for Seed World headless LLM benchmark & RSI runs."""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def run_git(cwd: Path, *args: str) -> str:
    try:
        res = subprocess.run(
            ["git", "-C", str(cwd), *args],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return res.stdout.strip() if res.returncode == 0 else f"<git error: {res.stderr.strip()}>"
    except Exception as exc:
        return f"<error: {exc}>"


def check_http(url: str, timeout: float = 5.0) -> tuple[bool, str]:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return True, f"HTTP {resp.status}"
    except urllib.error.HTTPError as err:
        # 404/405 still proves the local HTTP server is alive and listening
        return True, f"HTTP {err.code} (server alive)"
    except Exception as exc:
        return False, str(exc)


def check_tcp(host: str, port: int, timeout: float = 5.0) -> tuple[bool, str]:
    try:
        addrs = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        ip = addrs[0][4][0] if addrs else "?"
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"resolved {ip}, TCP :{port} reachable"
    except Exception as exc:
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Pre-flight check for Seed World LLM RSI benchmark")
    parser.add_argument("--worktree", default=".", help="Path to target Engine repo/worktree")
    parser.add_argument("--asap-url", default=os.environ.get("BENCH_ASAP_URL", "http://127.0.0.1:8082"))
    parser.add_argument("--upstream-host", default="antchat.alipay.com", help="Upstream LLM gateway host for DNS/TCP check")
    parser.add_argument("--upstream-port", type=int, default=443)
    parser.add_argument("--offline", action="store_true", help="Skip local ASAP and upstream network checks (for static-audit only)")
    args = parser.parse_args()

    wt = Path(args.worktree).resolve()
    ok = True

    print(f"Worktree : {wt}")
    print(f"Branch   : {run_git(wt, 'branch', '--show-current') or '(detached)'}")
    print(f"HEAD     : {run_git(wt, 'rev-parse', '--short', 'HEAD')}")
    dirty = run_git(wt, "status", "-s")
    dirty_lines = [line for line in dirty.splitlines() if line.strip()]
    print(f"Dirty    : {len(dirty_lines)} item(s)")

    checks = [
        ("node_modules", (wt / "node_modules").exists()),
        ("packages/shader/compiledShaders/index.ts", (wt / "packages/shader/compiledShaders/index.ts").exists()),
        ("packages/shader/compiledWebGPUShaders/index.ts", (wt / "packages/shader/compiledWebGPUShaders/index.ts").exists()),
        ("world/tests/seed-world/vitest.config.mjs", (wt / "world/tests/seed-world/vitest.config.mjs").exists()),
    ]
    for label, present in checks:
        status = "OK" if present else "MISSING"
        print(f"[build]  {label}: {status}")
        if not present:
            ok = False

    if not args.offline:
        asap_ok, asap_msg = check_http(args.asap_url)
        print(f"[asap]   {args.asap_url}: {'OK' if asap_ok else 'FAIL'} ({asap_msg})")
        if not asap_ok:
            ok = False

        if args.upstream_host:
            up_ok, up_msg = check_tcp(args.upstream_host, args.upstream_port)
            print(f"[net]    {args.upstream_host}:{args.upstream_port}: {'OK' if up_ok else 'FAIL'} ({up_msg})")
            if not up_ok:
                ok = False

    print(f"\nPreflight Result: {'READY' if ok else 'BLOCKED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
