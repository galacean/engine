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


def checkout(path, marker, base=None):
    root = Path(path).expanduser().resolve()
    if not (root / marker).is_file():
        raise ValueError(f"Not the expected checkout: {root} (missing {marker})")

    def git(*args):
        return subprocess.check_output(
            ["git", "-C", str(root), *args], text=True, stderr=subprocess.PIPE
        ).strip()

    if Path(git("rev-parse", "--show-toplevel")).resolve() != root:
        raise ValueError(f"Specify checkout root, not a subdirectory: {root}")
    result = {
        "path": str(root),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": git("rev-parse", "HEAD"),
        "dirty": bool(git("status", "--porcelain")),
    }
    # Compare with the last fetched source ref; this script never fetches.
    try:
        source = base or git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
        ahead, behind = git("rev-list", "--left-right", "--count", f"HEAD...{source}").split()
        result.update(source=source, behindSource=int(behind), aheadSource=int(ahead))
    except subprocess.CalledProcessError:
        result.update(source=base, behindSource=None, aheadSource=None)
    return result


def urls(frontend_port, backend_port, revision, uid, shell_url):
    frontend = "http://localhost:5173/app.html" if shell_url else f"http://127.0.0.1:{frontend_port}/world/demos/seed-world/index.html"
    demo = frontend + "?" + urlencode({"aiChat": 1, "agentTrace": 1, "debugRev": revision})
    wrapper = f"http://127.0.0.1:{backend_port}/static/mini_app_wrapper_bundle/mini_app_wrapper.html"
    return frontend, wrapper, wrapper + "?" + urlencode({
        "mini_app_url": demo,
        "app_shell_url": shell_url or demo,
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
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--shell-root", help="flash-app checkout used by serve-shell.mjs")
    mode.add_argument("--direct", action="store_true", help="preview Engine and ASAP through CandyJar without the shell SDK")
    parser.add_argument("--frontend-port", type=port_number, help="direct preview port (default 4173); shell development uses 5173")
    parser.add_argument("--backend-port", type=port_number, default=8082)
    parser.add_argument("--uid", default="seed-world-local-debug")
    parser.add_argument("--engine-source", default="origin/experimental/engine-next",
                        help="ref the Engine checkout is compared with")
    parser.add_argument("--asap-source", help="ref the ASAP checkout is compared with (default: its upstream)")
    parser.add_argument("--shell-source", help="ref the flash-app checkout is compared with (default: its upstream)")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    shell_url = "http://localhost:5173/__seed_world_shell/index.html" if args.shell_root else None
    if shell_url and args.frontend_port not in (None, 5173):
        parser.error("flash-app development requires port 5173 for the game")
    args.frontend_port = args.frontend_port or (5173 if shell_url else 4173)
    if args.frontend_port == args.backend_port:
        parser.error("frontend and backend must use different ports")
    try:
        shell = checkout(args.shell_root, "src/lib/AppLoader.ts", args.shell_source) if args.shell_root else None
        engine = checkout(args.engine_root, "world/vite.config.mjs", args.engine_source)
        asap = checkout(args.asap_root, "web/app.py", args.asap_source)
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    revision = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    revision += "-" + engine["commit"][:9] + "-" + asap["commit"][:9]
    if shell:
        revision += "-" + shell["commit"][:9]
    frontend, wrapper, preview = urls(args.frontend_port, args.backend_port, revision, args.uid, shell_url)
    checks = [probe(frontend), probe(wrapper)] if args.check else []
    if args.check and shell_url:
        checks.append(probe(shell_url))
    print(json.dumps({
        "engine": engine,
        "asap": asap,
        "mode": "shell" if shell else "direct",
        "shell": shell,
        "previewUrl": preview,
        "httpChecks": checks,
        "note": "Checkout inventory only; behindSource uses the last fetched refs. Verify process cwd, a fresh fetch and the actual model/Tool trace separately.",
    }, ensure_ascii=False, indent=2))
    return 1 if any(not item["ok"] for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
