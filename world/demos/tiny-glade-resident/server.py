from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--port',type=int,default=8776);a=p.parse_args();demo=Path(__file__).resolve().parent;source=demo.parents[2]/'packages/building/src/tiny-glade'
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  url=path.split('?')[0];root=a.assets if url.startswith('/data/') else source/'runtime' if url.startswith('/runtime/') else source/'offline' if url.startswith('/offline/') else demo
  rel=url.split('/',2)[-1] if url.startswith(('/data/','/runtime/','/offline/')) else url.lstrip('/') or 'index.html'
  target=(root/rel).resolve()
  if not target.is_relative_to(root.resolve()):return str(root/'not-found')
  return str(target)
ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
