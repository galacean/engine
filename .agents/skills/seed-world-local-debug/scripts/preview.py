"""Read-only checkout inventory, preview URL generation and optional HTTP probes."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import URLError


def port_number(value):
    number = int(value)
    if not 1 <= number <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return number


def checkout(path, marker):
    root = Path(path).expanduser().resolve()
    if not (root / marker).is_file():
        raise ValueError(f"Not the expected checkout: {root} (missing {marker})")

    def git(*args):
        return subprocess.check_output(
            ["git", "-C", str(root), *args], text=True, stderr=subprocess.PIPE
        ).strip()

    if Path(git("rev-parse", "--show-toplevel")).resolve() != root:
        raise ValueError(f"Specify checkout root, not a subdirectory: {root}")
    return {
        "path": str(root),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": git("rev-parse", "HEAD"),
        "dirty": bool(git("status", "--porcelain")),
    }


def urls(frontend_port, backend_port, revision, uid):
    frontend = f"http://127.0.0.1:{frontend_port}/world/demos/seed-world/index.html"
    demo = frontend + "?" + urlencode({"aiChat": 1, "agentTrace": 1, "debugRev": revision})
    wrapper = f"http://127.0.0.1:{backend_port}/static/mini_app_wrapper_bundle/mini_app_wrapper.html"
    return frontend, wrapper, wrapper + "?" + urlencode({
        "mini_app_url": demo,
        "app_shell_url": demo,
        "alipay_uid": uid,
        "wrapper_rev": revision,
    })


def probe(url):
    try:
        with urlopen(url, timeout=5) as response:
            return {"url": url, "ok": response.status == 200, "status": response.status}
    except (URLError, TimeoutError, OSError) as error:
        return {"url": url, "ok": False, "error": str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-root", required=True)
    parser.add_argument("--asap-root", required=True)
    parser.add_argument("--frontend-port", type=port_number, default=4173)
    parser.add_argument("--backend-port", type=port_number, default=8082)
    parser.add_argument("--uid", default="seed-world-local-debug")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.frontend_port == args.backend_port:
        parser.error("frontend and backend must use different ports")
    try:
        engine = checkout(args.engine_root, "world/vite.config.mjs")
        asap = checkout(args.asap_root, "web/app.py")
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    revision = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    revision += "-" + engine["commit"][:9] + "-" + asap["commit"][:9]
    frontend, wrapper, preview = urls(args.frontend_port, args.backend_port, revision, args.uid)
    checks = [probe(frontend), probe(wrapper)] if args.check else []
    print(json.dumps({
        "engine": engine,
        "asap": asap,
        "requiredAsapRemoteBranch": "codex/seed-world-master-sync",
        "previewUrl": preview,
        "httpChecks": checks,
        "note": "Checkout inventory only; verify process cwd, remote freshness and actual model/Tool trace separately.",
    }, ensure_ascii=False, indent=2))
    return 1 if any(not item["ok"] for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
