"""Source-owned native trigger resources from exact recovered CPU support geometry.

The original decorator cache, subtype and blueprint systems remain unchanged.
Three Rust Vec ABI records contain triangle36/normal36/uv24 streams. Data is
owned by this replay arena; an exact Roof88 change invalidates the cached roster.
No renderer vertices, resident GPU state or user local-edit records are cached.
"""
import hashlib
import struct
from recovered_roof_surface import capture_trigger

_NATIVE_TRIGGER_BLOCK_SHA256 = '046a76822fc19a01b29ef663dd0a150f310923f9ba026570f036db3012ead729'


def make(r, live, cols):
    """Return trigger_geometry() -> (native pointer, counts_by_wall).

    cols is the live-cache query's source-owned component column table. The
    cache lifetime is this returned closure, never a global emulator pointer.
    """
    last_key = None
    last_result = None
    stats = {'generated_rosters': 0, 'cache_hits': 0, 'generated_roofs': 0}
    def trigger_geometry():
        nonlocal last_key, last_result
        rows = [(wid, bytes(r.mu.mem_read(live['roofptrs'][wid], 88))) for wid in live['ids']]
        key = tuple(rows)
        if key == last_key:
            stats['cache_hits'] += 1
            r.put(cols+64, '<Q', last_result[0])
            return last_result[0], {wid:list(v) for wid,v in last_result[1].items()}
        # Compute all streams before mutating the query, rejecting unsupported
        # descriptors before exposing a partially replaced component column.
        captured = [(wid, capture_trigger(raw, wid)) for wid, raw in rows]
        triggers = r.alloc(72*len(rows));counts = {}
        for i,(wid,result) in enumerate(captured):
            lengths=[]
            for offset,name in enumerate(('triangles','normals','uvs')):
                stream=result['streams'][name];data=bytes.fromhex(stream['hex']);n=stream['count']
                ptr=r.blob(data,4) if data else 4
                r.put(triggers+i*72+offset*24,'<3Q',n,ptr,n)
                lengths.append(n)
            counts[wid]=lengths
        r.put(cols+64,'<Q',triggers)
        last_key=key;last_result=(triggers,counts)
        stats['generated_rosters']+=1;stats['generated_roofs']+=len(rows)
        return triggers, {wid:list(v) for wid,v in counts.items()}
    trigger_geometry.stats=stats
    return trigger_geometry


def adapt_source(source):
    """Replace only the verified live-cache trigger producer, retaining consumers.

    Apply to live-cache.py source before its existing author-ID substitutions.
    This guard deliberately fails if the native ABI/source block changes.
    """
    start=' def trigger_geometry():\n';end=' def regenerate():\n'
    if source.count(start)!=1 or source.count(end)!=1:
        raise ValueError('Original live-cache trigger boundary changed')
    a,b=source.index(start),source.index(end)
    block=source[a:b]
    if hashlib.sha256(block.encode()).hexdigest()!=_NATIVE_TRIGGER_BLOCK_SHA256:
        raise ValueError('Original live-cache trigger ABI changed; revalidate binding')
    return source[:a]+" trigger_geometry=__import__('recovered_trigger_binding').make(r,live,cols)\n"+source[b:]
