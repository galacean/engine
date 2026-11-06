"""Recovered roof support mesh arithmetic, source build 4b3c8437…589a.

No native execution or captured scene lookup. The support mesh and its UV islands
are distinct from the rendering tile mesh. Float32 operation order follows the
original 0x10055f670..0x100561168 producer.
"""
import hashlib
import math
import struct
from recovered_roof import f32, add, sub, mul, div, sqrt, dot, cross, lerp, sincos, normalized_profile, world_profile, expanded_dimensions, roof_height, _rotation


def noise(x, z):
    """Original integer hash/value noise 0x1016aab4c, not a replacement PRNG."""
    mask = 0xffffffff
    ix, iz = math.floor(x), math.floor(z)
    x, z = sub(x, ix), sub(z, iz)
    # ARM FCVTMS to signed W registers saturates before the wrapping hash.
    ix, iz = [min(0x7fffffff,max(-0x80000000,i)) for i in (ix,iz)]
    sx, sz = mul(mul(x,x), sub(3,add(x,x))), mul(mul(z,z),sub(3,add(z,z)))
    def value(i,j):
        h=(j*1025)&mask
        h=((h^(h>>6))*9)&mask
        h=((h^(h>>11))*32769)&mask
        h=((h+i*1664525)*1664525+0x0ae135d3)&mask
        h^=h>>11
        h^=(h<<7)&0x9d2c5680
        h^=(h<<15)&0xefc60000
        h=(h&0x7fffff)^(h>>18)
        return sub(struct.unpack('<f',struct.pack('<I',h|0x3f800000))[0],1)
    a,b,c,d=value(ix,iz),value(ix+1,iz),value(ix,iz+1),value(ix+1,iz+1)
    p,q=add(a,mul(sub(b,a),sx)),add(c,mul(sub(d,c),sx))
    return add(p,mul(sz,sub(q,p)))


def apply_noise(p, base):
    """0x101470308; source caller passes point.y minus Roof88 base height."""
    t=min(1.,max(0.,sub(p[1],base)))
    factor=mul(mul(t,t),sub(3,add(t,t)))
    return [p[0],add(p[1],mul(factor,mul(noise(mul(p[0],.5),mul(p[2],.5)),.3))),p[2]]


def descriptor(raw):
    if not isinstance(raw,bytes) or len(raw)!=88:raise ValueError('Roof88 requires exactly 88 bytes')
    tag=struct.unpack_from('<I',raw,8)[0]
    if tag not in (0,1):raise ValueError('Circle or rectangle required')
    params=struct.unpack_from('<6f',raw,36)
    surface={'type':'native_circular_roof_profile' if tag==0 else 'native_rectangular_roof_profile',
        'tip_offset':list(params[:2]),**dict(zip(('profile','height_parameter','ridge_parameter','eave_parameter'),params[2:])),
        'axis':raw[60],'edge_mode':raw[84],'base_height':struct.unpack_from('<f',raw,76)[0]}
    shape=struct.unpack_from('<6f',raw,12)
    footprint=({'center':list(shape[:2]),'radius':shape[2],'phase':shape[3]} if tag==0 else
               {'orientation':list(shape[:2]),'center':list(shape[2:4]),'width':shape[4],'depth':shape[5]})
    numeric=list(params)+[surface['base_height']]+list(shape[:4] if tag==0 else shape)
    if not all(math.isfinite(x) for x in numeric):raise ValueError('Roof support requires finite source fields')
    if surface['profile']<0 or surface['axis'] not in (0,1):raise ValueError('Invalid profile or ridge axis')
    dims=[footprint['radius']] if tag==0 else [footprint['width'],footprint['depth']]
    if min(dims)<=0:raise ValueError('Roof footprint dimensions must be positive')
    return tag,surface,footprint


def _normal(a,b,c):
    u=[sub(y,x) for x,y in zip(a,b)];v=[sub(y,x) for x,y in zip(b,c)]
    n=cross(u,v);r=div(1,sqrt(dot(n,n)))
    return [mul(x,r) for x in n]


def _phase(phase):
    phase=f32(phase);tau=f32(math.tau)
    # Circle2d phase is a CircularF32; normalize as the native wrapper does.
    from recovered_roof import _LIB
    phase=_LIB.fmodf(phase,tau)
    if phase<0:phase=add(phase,tau)
    return phase


def _circle(footprint, radius, u, center=None):
    phase=_phase(footprint['phase']);tau=f32(math.tau)
    s,c=sincos(add(mul(sub(1,u),tau),phase))
    center=footprint['center'] if center is None else center
    return [add(center[0],mul(radius,c)),add(center[1],mul(radius,s))]


def _circular(surface,footprint):
    bottom,top=expanded_dimensions(surface,footprint)
    flat=surface['height_parameter']<=f32(.1)
    if not flat:bottom,top=add(bottom,.13),add(top,.13)
    curve=world_profile(surface,footprint,bottom,top)
    n=4 if flat else 9
    tip=[mul(mul(t,mul(footprint['radius'],2)),.5) for t in surface['tip_offset']]
    triangles=[];normals=[];uvs=[]
    for row in range(n):
        v0,v1=div(row,n),div(row+1,n)
        def band(v):
            radius,height=curve.sample(v)
            if flat:height=f32(-.74)
            center=[add(x,mul(t,v)) for x,t in zip(footprint['center'],tip)]
            tangent=curve.tangent(v)
            return radius,height,center,[tangent[1],-tangent[0],-0.]
        r0,h0,c0,t0=band(v0);r1,h1,c1,t1=band(v1)
        for col in range(15):
            u0,u1=div(col,15),div(col+1,15)
            def point(radius,height,center,u):
                p=_circle(footprint,radius,u,[0.,0.])
                return [add(center[0],p[0]),add(height,0.),add(center[1],p[1])]
            p00,p10=point(r0,h0,c0,u0),point(r0,h0,c0,u1)
            p01,p11=point(r1,h1,c1,u0),point(r1,h1,c1,u1)
            def normal(t,u):return _rotation(t,[0.,1.,0.],sub(mul(u,f32(math.tau)),_phase(footprint['phase'])))
            n00,n10,n01,n11=normal(t0,u0),normal(t0,u1),normal(t1,u0),normal(t1,u1)
            triangles.extend([[p00,p10,p01],[p10,p11,p01]])
            normals.extend([[n00,n10,n01],[n10,n11,n01]])
            uvs.extend([[[u0,v0],[u1,v0],[u0,v1]],[[u1,v0],[u1,v1],[u0,v1]]])
    h=roof_height(surface,footprint) if not flat else f32(-.74)
    # Original tip island remains centered on the footprint, independent of tilt.
    for col in range(15):
        a,b=div(col,15),div(col+1,15)
        p,q=_circle(footprint,top,a),_circle(footprint,top,b)
        triangles.append([[p[0],h,p[1]],[q[0],h,q[1]],[footprint['center'][0],h,footprint['center'][1]]])
        normals.append([[0.,1.,0.]]*3)
        uvs.append([_circle(footprint,f32(.05),a,[f32(.05),f32(2.05)]),_circle(footprint,f32(.05),b,[f32(.05),f32(2.05)]),[f32(.05),f32(2.05)]])
    return triangles,normals,uvs


def capture_trigger(raw, wall_id):
    if type(wall_id) is not int or not 0<=wall_id<2**64:raise ValueError('wall_id must be uint64')
    tag,surface,footprint=descriptor(raw)
    triangles,normals,uvs=(_circular if tag==0 else _rectangular)(surface,footprint)
    triangles=[[apply_noise(p,surface['base_height']) for p in tri] for tri in triangles]
    streams={}
    for name,rows,stride in [('triangles',triangles,36),('normals',normals,36),('uvs',uvs,24)]:
        data=b''.join(struct.pack('<'+str(stride//4)+'f',*[x for p in row for x in p])for row in rows)
        streams[name]={'count':len(rows),'stride':stride,'hex':data.hex(),'sha256':hashlib.sha256(data).hexdigest()}
    return {'roof_sha256':hashlib.sha256(raw).hexdigest(),'shape_tag':tag,'base_y':surface['base_height'],'streams':streams,
            'execution':{'implementation':'recovered CPU arithmetic; no native execution','source_range':['0x10055f670','0x100561168']},
            'boundary':'Recovered original support mesh arithmetic; initial renderer state is separate.'}


def _rectangular(surface,footprint):
    bottom,top=expanded_dimensions(surface,footprint)
    flat=surface['height_parameter']<=f32(.1)
    gable=not flat and surface['ridge_parameter']==1
    if not flat:bottom=[add(x,.4) for x in bottom];top=[add(x,.4) for x in top]
    if gable:
        e=surface['eave_parameter'];q=surface['profile']
        flare=mul(add(mul(e,1.5),mul(sub(1,e),0)),add(sqrt(q),mul(sub(1,sqrt(q)),.5)))
        axis=surface['axis']
        bottom[axis]=sub(bottom[axis],add(flare,.56));top[axis]=add(top[axis],f32(-.56))
    def corners(size):
        w,d=[mul(x,.5)for x in size]
        # Original clockwise rectangle perimeter begins at the lower left.
        return [[-w,-d],[-w,d],[w,d],[w,-d]]
    lower,upper=corners(bottom),corners(top)
    c,s=footprint['orientation'];cx,cz=footprint['center']
    def world(p,h):return [add(cx,add(mul(c,p[0]),mul(-s,p[1]))),h,add(cz,add(mul(s,p[0]),mul(c,p[1])))]
    profile=normalized_profile(surface['profile']);height=roof_height(surface,footprint)
    triangles=[];normals=[];uvs=[];n=4 if flat else 9
    def emit(a,b,c,d,uv):
        normal=_normal(a,b,c)
        triangles.extend([[a,b,c],[b,d,c]]);normals.extend([[normal]*3,[normal]*3]);uvs.extend(uv)
    for side in range(4):
        if gable and side in (surface['axis'],surface['axis']+2):continue
        for row in range(n):
            v0,v1=div(row,n),div(row+1,n)
            x0,y0=profile.sample(v0);x1,y1=profile.sample(v1)
            h0,h1=(f32(-.74),f32(-.74)) if flat else (mul(y0,height),mul(y1,height))
            def endpoint(corner,x):return [lerp(a,b,x)for a,b in zip(lower[corner%4],upper[corner%4])]
            a,b=endpoint(side,x0),endpoint(side+1,x0)
            c1,d=endpoint(side,x1),endpoint(side+1,x1)
            for col in range(4):
                t0,t1=div(col,4),mul(col+1,.25)
                def along(a,b,t,h):return world([lerp(x,y,t)for x,y in zip(a,b)],h)
                p00,p10=along(a,b,t0,h0),along(a,b,t1,h0)
                p01,p11=along(c1,d,t0,h1),along(c1,d,t1,h1)
                u0,u1=lerp(div(side,4),mul(side+1,.25),t0),lerp(div(side,4),mul(side+1,.25),t1)
                emit(p00,p10,p01,p11,[[[u0,v0],[u1,v0],[u0,v1]],[[u1,v0],[u1,v1],[u0,v1]]])
        # Native producer appends the same ridge island after every admitted side.
        corners_world=[world(p,height if not flat else f32(-.74))for p in upper]
        order=(3,2,0,1) if surface['axis']==1 else (0,3,1,2)
        a,b,c1,d=[corners_world[i]for i in order]
        for col in range(4):
            t0,t1=mul(add(col,-0.),.25),mul(col+1,.25)
            def interp(a,b,t):return [lerp(x,y,t)for x,y in zip(a,b)]
            p00,p10,p01,p11=interp(a,b,t0),interp(a,b,t1),interp(c1,d,t0),interp(c1,d,t1)
            triangles.extend([[p00,p10,p01],[p10,p11,p01]])
            normals.extend([[[0.,1.,0.]]*3]*2)
            uvs.extend([[[t0,2.],[t1,2.],[t0,f32(2.1)]],[[t1,2.],[t1,f32(2.1)],[t0,f32(2.1)]]])
    return triangles,normals,uvs
