"""Prepared projection of roof cells, preserving geometry.Surface.project semantics.

Each immutable projector owns one validated surface snapshot. Gram matrices,
normal vectors, polygon edges and world edge endpoints are prepared once. Point
scores retain the original double operation order and stable piece ordering;
there is no spatial approximation, tie threshold change, or anchor clamping.
"""
import math
from geometry import Surface, add, sub, scale, dot, cross, unit, vec


def basis(q):
    """Original cell-frame normalization; packed quaternion remains separate."""
    k=math.sqrt(sum(x*x for x in q));x,y,z,w=[v/k for v in q]
    return [[1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y)],
            [2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x)],
            [2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y)]]


def _dot(a,b):
    # sum() starts at zero, as geometry.dot does, including signed-zero behavior.
    return sum((a[0]*b[0],a[1]*b[1],a[2]*b[2]))


class Projector:
    def __init__(self,data):
        surface=Surface(data)
        self.pieces=[]
        for piece in surface.pieces:
            u,v=piece['u'],piece['v'];uv=dot(u,v);uu,vv=dot(u,u),dot(v,v)
            domain=surface.domain(piece);edges=[]
            for a,b in zip(domain,domain[1:]+domain[:1]):
                wa,wb=surface.point(*a,piece),surface.point(*b,piece)
                edge=sub(wb,wa)
                edges.append((a,sub(b,a),wa,edge,dot(edge,edge)))
            self.pieces.append((piece['origin'],u,v,piece['u0'],uv,uu,vv,uu*vv-uv*uv,unit(cross(u,v)),edges))

    def _choices(self,point,piece_index=None):
        point=vec(point);choices=[]
        indices=range(len(self.pieces)) if piece_index is None else [piece_index]
        for index in indices:
            origin,u,v,u0,uv,uu,vv,det,normal,edges=self.pieces[index]
            d=(point[0]-origin[0],point[1]-origin[1],point[2]-origin[2])
            a,b=_dot(d,u),_dot(d,v)
            localu=(a*vv-uv*b)/det;localv=(b*uu-uv*a)/det
            distance=_dot(d,normal);coordinate=[u0+localu,localv];closest_uv=coordinate
            if all(delta[0]*(coordinate[1]-a[1])-delta[1]*(coordinate[0]-a[0])>=-1e-9 for a,delta,_,_,_ in edges):
                score=distance*distance
            else:
                score=float('inf')
                for a,uv_edge,wa,edge,edge_length in edges:
                    delta=(point[0]-wa[0],point[1]-wa[1],point[2]-wa[2])
                    t=max(0.,min(1.,_dot(delta,edge)/edge_length))
                    delta=(point[0]-(wa[0]+edge[0]*t),point[1]-(wa[1]+edge[1]*t),point[2]-(wa[2]+edge[2]*t))
                    candidate_score=_dot(delta,delta)
                    if candidate_score<score:
                        score=candidate_score;closest_uv=[a[0]+uv_edge[0]*t,a[1]+uv_edge[1]*t]
            choices.append(dict(u=coordinate[0],v=coordinate[1],closest_uv=closest_uv,normal_distance=distance,piece_index=index,_score=score))
        choices.sort(key=lambda row:row['_score'])
        return choices

    @staticmethod
    def _public(row,ties):
        row=dict(row);row.pop('_score');row['ambiguous_piece_indices']=ties
        return row

    def project(self,point,piece_index=None):
        choices=self._choices(point,piece_index);chosen=choices[0]
        ties=[r['piece_index'] for r in choices if abs(r['_score']-chosen['_score'])<1e-12]
        return self._public(chosen,ties if len(ties)>1 else [])

    def anchor(self,point):
        choices=self._choices(point);chosen=choices[0]
        candidates=[r for r in choices if abs(r['_score']-chosen['_score'])<1e-12]
        ties=[r['piece_index'] for r in candidates] if len(candidates)>1 else []
        if not ties:candidates=[chosen]
        selected=min(candidates,key=lambda q:(q['u'],q['v'],q['piece_index']))
        return [selected['u'],selected['v']],{'method':'geometry.Surface.project','triangle':selected['piece_index'],
            'normal_distance':selected['normal_distance'],'ambiguous_piece_indices':ties,
            'tie_policy':'lexicographic (u,v,piece_index) among owner-reported equal-distance patches',
            'candidate_uvs':[[q['u'],q['v'],q['piece_index']] for q in candidates],
            'uv_policy':'Owner returns plane-projected UV of nearest finite patch; boundary overshoot is preserved for editor anchors, not clamped or used to generate placement.'}


def build_surface(data):return Projector(data)
def _anchor(point,surface):return surface.anchor(point)
