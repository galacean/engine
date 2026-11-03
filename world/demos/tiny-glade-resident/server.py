"""Serve the historical capture viewer; --assets must contain scene.json."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--assets", type=Path, required=True)
parser.add_argument("--port", type=int, default=8776)
args = parser.parse_args()
demo = Path(__file__).resolve().parent
source = demo.parents[2] / "packages/building/src/tiny-glade"

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, url):
        path = unquote(urlsplit(url).path)
        root, relative = demo, path.lstrip("/") or "index.html"
        for prefix, directory in [("/data/", args.assets), ("/runtime/", source / "runtime"), ("/offline/", source / "offline")]:
            if path.startswith(prefix):
                root, relative = directory, path[len(prefix):]
                break
        root = root.resolve()
        target = (root / relative).resolve()
        return str(target if target.is_relative_to(root) else root / "not-found")

ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
