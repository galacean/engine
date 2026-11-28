"""Serve unchanged historical Demo code with its retired renderer URL mapped to the current captured renderer.
Only HTTP path resolution is adapted. Source files and renderer behavior stay unchanged.
The original 404 is retained in services/raw evidence.
"""
from pathlib import Path
import sys
kind = sys.argv.pop(1)
repo = Path(__file__).resolve().parents[3]
source = repo.parent / 'engine-next/world/gallery/shared/tiny-glade/tools'
script = source / ('serve.py' if kind == 'resident' else 'lab_server.py')
code = script.read_text()
if kind == 'resident':
    before = '  target=(root/rel).resolve()'
    after = "  if rel == 'ResidentRenderer.js' and root == source/'runtime': root,rel=source/'offline','CapturedResidentRenderer.js'\n" + before
else:
    before = '                    target = (root / relative).resolve()'
    after = "                    if relative == 'ResidentRenderer.js' and root == source / 'runtime':\n                        root, relative = source / 'offline', 'CapturedResidentRenderer.js'\n" + before
assert before in code
exec(compile(code.replace(before, after), str(script), 'exec'), {'__file__': str(script), '__name__': '__main__'})
