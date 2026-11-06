"""CPU transcription of Tiny Glade roof mathematics; no binary/emulator dependency.

Source build SHA256 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
The addresses in docstrings identify recovered functions, not runtime imports.
Only finite descriptors are supported. Platform libm supplies f32 transcendentals,
as it does in the original executable. This file produces initial layout state;
resident GPU gravity owns its subsequent state. See check_recovered_roof.py for differential coverage. This is not a claim
that all roof producers are ported.
"""
import bisect
import ctypes
import math
import struct

BINARY_SHA256 = '4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a'
_LIB = ctypes.CDLL(None)
for _name, _n in [('powf',2),('atanf',1),('sinf',1),('cosf',1),('fmodf',2)]:
    _fn = getattr(_LIB, _name)
    _fn.argtypes = [ctypes.c_float]*_n
    _fn.restype = ctypes.c_float

def f32(x): return struct.unpack('<f',struct.pack('<f',x))[0]
def add(a,b): return f32(f32(a)+f32(b))
def sub(a,b): return f32(f32(a)-f32(b))
def mul(a,b): return f32(f32(a)*f32(b))
def div(a,b): return f32(f32(a)/f32(b))
def sqrt(a): return f32(math.sqrt(f32(a)))
def lerp(a,b,t): return add(mul(sub(1,t),a),mul(t,b))
def dot(a,b):
    p=[mul(x,y) for x,y in zip(a,b)]
    return add(p[2],add(p[0],p[1])) if len(p)==3 else add(p[0],p[1])
def cross(a,b): return [sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))]
class _SinCos(ctypes.Structure):
    _fields_=[('sin',ctypes.c_float),('cos',ctypes.c_float)]
if hasattr(_LIB,'__sincosf_stret'):
    _LIB.__sincosf_stret.argtypes=[ctypes.c_float]
    _LIB.__sincosf_stret.restype=_SinCos
def sincos(x):
    if hasattr(_LIB,'__sincosf_stret'):
        r=_LIB.__sincosf_stret(f32(x));return r.sin,r.cos
    return _LIB.sinf(f32(x)),_LIB.cosf(f32(x))

class NativeRng:
    """0x102032a10; wyrand, low 32 bits, mantissa float conversion."""
    def __init__(self,seed): self.state=seed
    def next(self):
        self.state=(self.state+0xa0761d6478bd642f)&0xffffffffffffffff
        p=self.state*(self.state^0xe7037ed1a0b428db)
        return (((p^(p>>64))&0xffffffff)>>9)/(1<<23)

def random_splits(n,jitter,rng):
    """0x101ffc97c, consumes n-2 RNG samples even at zero jitter."""
    if n<2: raise ValueError('At least two boundaries required')
    step=div(1,f32(n-1));amp=min(f32(jitter),mul(step,.495))
    return [0.]+[add(mul(f32(j),step),mul(sub(rng.next(),.5),amp)) for j in range(1,n-1)]+[1.]

class Curve:
    """0x1018209xx / get_coord_at_u: piecewise linear arc-length chart."""
    def __init__(self,points):
        self.points=[tuple(map(f32,p)) for p in points];total=0.;lengths=[];last=self.points[0]
        for point in self.points:
            d=[sub(a,b) for a,b in zip(last,point)]
            total=add(total,sqrt(dot(d,d)));lengths.append(total);last=point
        if total<=0: raise ValueError('Degenerate curve')
        self.length=total;self.knots=[div(x,total) for x in lengths]
    def coord(self,u):
        u=f32(u)
        if u<=0:return 0,0.
        if u>=1:return len(self.points)-2,1.
        i=bisect.bisect_right(self.knots,u)-1
        return i,min(1.,max(0.,div(sub(u,self.knots[i]),sub(self.knots[i+1],self.knots[i]))))
    def sample(self,u):
        i,t=self.coord(u)
        return [lerp(a,b,t) for a,b in zip(self.points[i],self.points[i+1])]
    def tangent(self,u):
        i,_=self.coord(u);d=[sub(b,a) for a,b in zip(self.points[i],self.points[i+1])];r=div(1,sqrt(dot(d,d)))
        return [mul(x,r) for x in d]

def normalized_profile(profile):
    """Roof::profile_curve_normalized 0x101594c8c: 20 constant x coordinates."""
    e=add(mul(profile,1.5),mul(sub(1,profile),.5))
    return Curve([(f32(i/19),1. if i==19 else _LIB.powf(f32(i/19),e)) for i in range(20)])

def expanded_dimensions(surface,footprint):
    """get_roof_expanded_top_and_bottom 0x10139a3e4."""
    q=f32(surface['profile']);e=f32(surface['eave_parameter']);ridge=f32(surface['ridge_parameter'])
    flare=mul(add(mul(e,1.5),mul(sub(1,e),0)),add(sqrt(q),mul(sub(1,sqrt(q)),.5)))
    if surface['type']=='native_circular_roof_profile':
        return add(footprint['radius'],mul(add(mul(flare,1.2),.28),.5)),f32(.2)
    w,d=map(f32,(footprint['width'],footprint['depth']))
    top=add(mul(sub(1,ridge),.1),mul(ridge,d if surface['axis'] else w))
    return [add(add(w,.28),flare),add(add(d,.28),flare)],([f32(.1),top] if surface['axis'] else [top,f32(.1)])

def roof_height(surface,footprint):
    """Roof::height 0x101595294, roof type predicate tests height_parameter."""
    h=f32(surface['height_parameter'])
    if h<=f32(.1):return 0.
    if surface['type']=='native_circular_roof_profile': t=div(sub(footprint['radius'],f32(.90000004)),7.1);lo=8.
    else:t=div(sub(max(f32(footprint['width']),f32(footprint['depth'])),2.25),12.75);lo=9.
    t=min(1.,max(0.,div(t,.4)));t=mul(mul(t,t),sub(3,add(t,t)))
    cap=add(mul(t,12),mul(lo,sub(1,t)))
    return min(cap,max(0.,add(mul(h,12),mul(sub(1,h),.4))))

def world_profile(surface,footprint,bottom=None,top=None):
    """profile_curve_ws 0x101594420, explicit f32 weighted interpolation."""
    if bottom is None:bottom,top=expanded_dimensions(surface,footprint)
    if isinstance(bottom,list):raise ValueError('Rectangle needs an explicit side profile')
    height=roof_height(surface,footprint)
    return Curve([(lerp(bottom,top,x),mul(y,height)) for x,y in normalized_profile(surface['profile']).points])

def _quat_axes(x,y,z):
    """glam Quat::from_rotation_axes branch/order used inline in constructor."""
    # Matrix columns, branch-selected diagonal; scalar f32 operation order.
    m00,m01,m02=x[0],y[0],z[0];m10,m11,m12=x[1],y[1],z[1];m20,m21,m22=x[2],y[2],z[2]
    if m22<=0:
        dif=sub(m11,m00);om=sub(1,m22)
        if dif<=0:
            t=sub(om,dif);r=div(.5,sqrt(t));v=[t,add(m01,m10),add(m02,m20),sub(m21,m12)]
        else:
            t=add(om,dif);r=div(.5,sqrt(t));v=[add(m01,m10),t,add(m12,m21),sub(m02,m20)]
    else:
        plus=add(m00,m11);op=add(m22,1)
        if plus<=0:
            t=sub(op,plus);r=div(.5,sqrt(t));v=[add(m02,m20),add(m12,m21),t,sub(m10,m01)]
        else:
            t=add(plus,op);r=div(.5,sqrt(t));v=[sub(m21,m12),sub(m02,m20),sub(m10,m01),t]
    return [mul(c,r) for c in v]

def _rotation(v,axis,angle):
    s,c=sincos(mul(angle,.5));q=[mul(x,s) for x in axis]
    t=sub(mul(c,c),dot(q,q));d=mul(dot(v,q),2);cr=cross(q,v);c2=add(c,c)
    return [add(mul(cr[i],c2),add(mul(v[i],t),mul(q[i],d))) for i in range(3)]

def _emit(role,position,quat,scale,tile_t,slot,ordinal,row):
    clip=[0.,1.,0.,65504.];raw=bytearray(64)
    struct.pack_into('<3ff4e3ee4e',raw,0,*position,0.,*clip,*scale,tile_t,*quat)
    struct.pack_into('<II f III',raw,40,slot,0,0.,ordinal,1,2 if role=='first_row_closure' or row['row_index']==0 else 1)
    return {'role':role,'callsite':'0x10055bcd0' if role=='ordinary_slope' else '0x10055bea0','initial64_hex':raw.hex(),
            'source_full_precision':{'quaternion':quat,'scale':scale,'tile_t':[tile_t],'clip_plane':clip},'row_context':row.copy()}

def generate_circular(surface,footprint,seed=0,*,unit_metrics=None,render_slot=0):
    """0x10055b490, full ring loop including dependent first-row closures."""
    keys={'type','tip_offset','profile','height_parameter','ridge_parameter','eave_parameter','axis','edge_mode','base_height'}
    if not isinstance(surface,dict) or set(surface)!=keys or surface['type']!='native_circular_roof_profile':raise ValueError('Explicit circular profile required')
    if not isinstance(footprint,dict) or set(footprint)!={'center','radius','phase'}:raise ValueError('Circular footprint required')
    def finite(x):
        if type(x) not in (int,float) or not math.isfinite(x):raise ValueError('Finite numeric descriptor required')
        return f32(x)
    if len(surface['tip_offset'])!=2 or len(footprint['center'])!=2:raise ValueError('Two-dimensional center/tip required')
    for v in surface['tip_offset']+footprint['center']+[surface[k] for k in ('profile','height_parameter','ridge_parameter','eave_parameter','base_height')]+[footprint['radius'],footprint['phase']]:finite(v)
    if footprint['radius']<=0 or surface['profile']<0:raise ValueError('Positive radius and nonnegative profile required')
    if any(type(surface[k])is not int or surface[k]not in (0,1) for k in ('axis','edge_mode')):raise ValueError('Original enum/flag must be zero or one')
    if type(seed)is not int or not 0<=seed<2**64:raise ValueError('uint64 seed required')
    if type(render_slot)is not int or not 0<=render_slot<2**32:raise ValueError('uint32 slot required')
    metrics={k:f32(v) for k,v in (unit_metrics or {'width':.5,'height':.4375,'depth':.1}).items()}
    if set(metrics)!={'width','height','depth'} or min(metrics.values())<=0:raise ValueError('Positive width/height/depth required')
    if roof_height(surface,footprint)==0:raise ValueError('Pitched roof required')
    c=world_profile(surface,footprint);n=max(2,math.ceil(div(c.length,metrics['height'])));length=mul(div(c.length,n),f32(1.4285715))
    rng=NativeRng(seed);emits=[];rows=[];ordinal=0;tau=f32(math.tau)
    phase=_LIB.fmodf(f32(footprint['phase']),tau)
    if phase<0:phase=add(phase,tau)
    tip=[mul(mul(t,mul(footprint['radius'],2)),.5) for t in surface['tip_offset']]
    def local(u,radius):
        si,co=sincos(add(mul(sub(1,u),tau),phase));return [add(0.,mul(radius,co)),add(0.,mul(radius,si))]
    for ri in range(n-1):
        u=div(ri,n-1);radius,height=c.sample(u);ctr=[add(v,mul(t,u)) for v,t in zip(footprint['center'],tip)]
        taper=min(1.,max(0.,div(sub(radius,.9),sub(.3,.9))))
        factor=add(mul(taper,.5),sub(1,taper));perimeter=mul(radius,tau)
        rotation=rng.next();cols=max(5,math.ceil(div(perimeter,mul(mul(factor,.5),div(metrics['width'],.5)))))
        si,co=sincos(mul(rotation,tau));matrix=[co,si,-si,co]
        splits=random_splits(cols+1,div(mul(factor,0.),perimeter),rng)
        tangent=c.tangent(u);slope=_LIB.atanf(div(tangent[1],tangent[0]));angle=sub(f32(-.17453292),slope)
        def rotate(p):return [add(mul(co,p[0]),mul(-si,p[1])),add(mul(si,p[0]),mul(co,p[1]))]
        for ci,(a,b) in enumerate(zip(splits,splits[1:])):
            row={'side_index':0,'row_index':ri,'column_index':ci,'row_u':u,'row_count':n,'column_count':cols,'split_interval':[a,b]}
            if ci==0:rows.append({**row,'circle4':[0.,0.,radius,f32(footprint['phase'])],'random_rotation_matrix4':matrix})
            pa,pb=rotate(local(a,radius)),rotate(local(b,radius));mid=[mul(add(x,y),.5) for x,y in zip(pa,pb)]
            pos=[add(ctr[0],mid[0]),height,add(ctr[1],mid[1])];rand=rng.next()
            normal=rotate(local(mul(add(a,b),.5),1.));normal=[normal[0],0.,normal[1]]
            axis=cross(normal,[0.,1.,0.]);along=_rotation(normal,axis,-angle);z=cross(axis,along)
            quat=_quat_axes(axis,along,z)
            dx,dz=[sub(x,y) for x,y in zip(pa,pb)];width=sqrt(add(mul(dx,dx),mul(dz,dz)))
            h=mul(length,add(mul(rand,1.2),mul(sub(1,rand),.8)));scale=[width,h,metrics['depth']]
            tile_t=min(1.,max(0.,add(u,mul(rng.next(),.2))))
            emits.append(_emit('ordinary_slope',pos,quat,scale,tile_t,render_slot,ordinal,row))
            if ri==0:
                half=[mul(mul(v,h),.5) for v in along]
                # Original skirt shares the lower endpoint's y for both xz ends.
                ap=[sub(pos[0],half[0]),add(pos[1],half[1]),sub(pos[2],half[2])]
                bp=[add(pos[0],half[0]),add(pos[1],half[1]),add(pos[2],half[2])]
                delta=[sub(x,y) for x,y in zip(ap,bp)];dist=sqrt(dot(delta,delta))
                if dist>f32(.1):
                    cq=_quat_axes(axis,normal,[0.,1.,0.])
                    center=[add(mul(x,.5),mul(y,.5)) for x,y in zip(ap,bp)]
                    rec=_emit('first_row_closure',center,cq,[width,dist,metrics['depth']],0.,render_slot,ordinal,row)
                    rec['original_endpoints']={'a':ap,'b':bp};emits.append(rec)
            ordinal+=1
    return {'schema':'native-roof-rule-result-v1','status':'generated','native_entry':'0x10055b490',
        'original_binary_sha256':BINARY_SHA256,'surface':surface,'footprint':footprint,'unit_metrics':metrics,'seed':seed,
        'observed_native_emits':emits,'row_events':rows,'operand_adaptations':[],
        'implementation':'recovered CPU mathematics; no original binary, Unicorn, Metal process or baked layouts'}

def generate_closure(placement,*,capture_full_precision=False):
    """0x10058defc..0x10058e104, rectangular first-row dependent skirt."""
    p=placement;keys={'center','slope_direction','row_direction','scale_width','scale_length','clip_plane','seed','slot','row_index'}
    if set(p)!=keys:raise ValueError('Unexpected/missing placement fields')
    for k,n in [('center',3),('slope_direction',3),('row_direction',3),('clip_plane',4)]:
        if len(p[k])!=n or not all(math.isfinite(v) for v in p[k]):raise ValueError('Invalid '+k)
    for k in ('scale_width','scale_length'):
        if not math.isfinite(p[k]) or p[k]<0:raise ValueError('Invalid '+k)
    for k,n in [('seed',32),('slot',32),('row_index',64)]:
        if type(p[k])is not int or not 0<=p[k]<(1<<n):raise ValueError('Invalid '+k)
    if p['row_direction'][1]!=0:raise ValueError('Horizontal row axis required')
    result={'count':0,'instances64_hex':[],'endpoints':[],'entry':'0x10058defc','exit':'0x10058d9a8','state':'before-original-gravity','scope':'Recovered f32 CPU closure mathematics'}
    if capture_full_precision:result['source_full_precision']=[]
    if p['row_index']!=0:return result
    center=list(map(f32,p['center']));half=[mul(mul(p['scale_length'],v),.5) for v in p['slope_direction']]
    a=[sub(c,d) for c,d in zip(center,half)];b=[add(center[0],half[0]),a[1],add(center[2],half[2])]
    result['endpoints']=[{'a':a,'b':b}];delta=[sub(x,y) for x,y in zip(b,a)];length=sqrt(dot(delta,delta))
    if length<=f32(.1):return result
    row=list(map(f32,p['row_direction']));outward=[row[2],0.,-row[0]];quat=_quat_axes(row,outward,[0.,1.,0.])
    pos=[add(mul(x,.5),mul(y,.5)) for x,y in zip(a,b)];scale=[f32(p['scale_width']),length,f32(.1)];clip=list(map(f32,p['clip_plane']))
    raw=bytearray(64);struct.pack_into('<3ff4e3ee4e',raw,0,*pos,0.,*clip,*scale,0.,*quat)
    struct.pack_into('<II f III',raw,40,p['slot'],0,0.,p['seed'],0,2)
    result.update(count=1,instances64_hex=[raw.hex()])
    if capture_full_precision:result['source_full_precision']=[{'quaternion':quat,'clip_plane':clip,'scale':scale,'tile_t':[0.]}]
    return result

def generate_rectangular(surface,footprint,seed=0,*,unit_metrics=None,render_slot=0):
    """Public entry for the separately maintained original rectangular kernel."""
    from recovered_rectangular_roof import generate_rectangular as generate
    return generate(surface,footprint,seed,unit_metrics=unit_metrics,render_slot=render_slot)
