"""Rectangular roof CPU recovery, original 0x10058c0d4; no runtime oracle."""
import math,struct
from recovered_roof import *
from recovered_roof import _quat_axes,_rotation,_LIB

def unit(v):
    inv=div(1,sqrt(dot(v,v)));return [mul(x,inv) for x in v]
def vecsub(a,b):return [sub(x,y) for x,y in zip(a,b)]
def vecadd(a,b):return [add(x,y) for x,y in zip(a,b)]
def pack(position,quat,scale,t,slot,ordinal,flag,clip=(0.,1.,0.,65504.)):
    b=bytearray(64);struct.pack_into('<3ff4e3ee4e',b,0,*position,0.,*clip,*scale,t,*quat);struct.pack_into('<II f III',b,40,slot,0,0.,ordinal,0,flag);return b.hex()

def generate_rectangular(surface,footprint,seed=0,*,unit_metrics=None,render_slot=0):
    keys={'type','tip_offset','profile','height_parameter','ridge_parameter','eave_parameter','axis','edge_mode','base_height'}
    if not isinstance(surface,dict) or set(surface)!=keys or surface['type']!='native_rectangular_roof_profile':raise ValueError('Explicit rectangular profile required')
    if not isinstance(footprint,dict) or set(footprint)!={'orientation','center','width','depth'}:raise ValueError('Rectangular footprint required')
    if len(footprint['orientation'])!=2 or len(footprint['center'])!=2 or len(surface['tip_offset'])!=2:raise ValueError('Two-dimensional orientation/center/tip required')
    values=surface['tip_offset']+footprint['center']+footprint['orientation']+[surface[k] for k in ('profile','height_parameter','ridge_parameter','eave_parameter','base_height')]+[footprint['width'],footprint['depth']]
    if any(type(v)not in (float,int) or not math.isfinite(v) for v in values):raise ValueError('Finite numeric descriptors required')
    if type(seed)is not int or not 0<=seed<2**64 or type(render_slot)is not int or not 0<=render_slot<2**32:raise ValueError('uint64 seed and uint32 slot required')
    if min(footprint['width'],footprint['depth'])<=0 or abs(sum(x*x for x in footprint['orientation'])-1)>1e-4:raise ValueError('Positive size and normalized orientation required')
    if tuple(f32(surface[k]) for k in ('profile','ridge_parameter','eave_parameter')) not in ((1.,1.,f32(.2)),(0.,f32(.6),f32(.3))) or not f32(.1)<f32(surface['height_parameter'])<=1:raise ValueError('This rectangular port preserves the originally admitted gable/hip profile domain')
    if unit_metrics is not None and (set(unit_metrics)!={'width','height','depth'} or any(type(v)not in(float,int) or not math.isfinite(v) or v<=0 for v in unit_metrics.values())):raise ValueError('Positive finite unit metrics required')
    if surface['tip_offset']!=[0,0] or surface['axis']!=0 or surface['edge_mode']!=0:raise ValueError('Only originally admitted zero tip/axis/edge mode recovered')
    normalized=normalized_profile(surface['profile']);H=roof_height(surface,footprint);bottom,top=expanded_dimensions(surface,footprint);ridge_dims=top.copy();gable=f32(surface['ridge_parameter'])==1.
    if gable:
        q=f32(surface['profile']);e=f32(surface['eave_parameter']);flare=mul(add(mul(e,1.5),mul(sub(1,e),0)),add(sqrt(q),mul(sub(1,sqrt(q)),.5)))
        bottom[0]=add(bottom[0],-add(.81,flare));top[0]=bottom[0]
    def corners(d):
        x,z=mul(d[0],.5),mul(d[1],.5)
        return [[-x,-z],[-x,z],[x,z],[x,-z]]
    bp,tp=corners(bottom),corners(top);ox,oz=map(f32,footprint['orientation']);cx,cz=map(f32,footprint['center'])
    def world(p):return [add(cx,add(mul(ox,p[0]),mul(-oz,p[1]))),add(cz,add(mul(oz,p[0]),mul(ox,p[1])))]
    metrics={k:f32(v) for k,v in (unit_metrics or {'width':.5,'height':.4375,'depth':.1}).items()}
    rng=NativeRng(seed);emits=[];ordinal=0
    # Four curved hip / gable edge strips, before ridge and slope RNG consumers.
    for corner in range(4):
        wa,wb=world(bp[corner]),world(tp[corner]);delta=vecsub(wb,wa);horizontal=sqrt(dot(delta,delta));curve=world_profile(surface,footprint,0.,horizontal)
        count=max(2,math.floor(add(div(curve.length,.625),.5)));splits=random_splits(count,div(.125,curve.length),rng)
        d3=[delta[0],0.,delta[1]];up=[mul(H,0),H,mul(H,0)];normal=unit(cross(up,d3))
        def along(u):
            x,y=normalized.sample(u)
            return [add(v,add(mul(d,x),add(mul(n,0),mul(h,y)))) for v,d,n,h in zip([wa[0],0.,wa[1]],d3,normal,up)]
        for a,b in zip(splits,splits[1:]):
            pa,pb=along(a),along(b);tangent=unit(vecsub(pb,pa));width=cross(tangent,normal);other=cross(tangent,width);eps=f32(8.742278e-8)
            ax=[add(mul(w,0),sub(mul(t,-eps),o)) for w,t,o in zip(width,tangent,other)]
            ay=[add(mul(w,0),sub(mul(o,eps),t)) for w,t,o in zip(width,tangent,other)]
            az=[add(add(w,mul(t,0)),mul(o,0)) for w,t,o in zip(width,tangent,other)]
            quat=_quat_axes(ax,ay,az);d=vecsub(pa,pb);length=add(sqrt(dot(d,d)),.05)
            pos=[sub(add(p,mul(mul(length,t),.3)),mul(w,.05)) for p,t,w in zip(pa,tangent,width)]
            emits.append({'role':'ridge_or_end_strip','callsite':'0x10058c960','initial64_hex':pack(pos,quat,[.25,length,.18],a,render_slot,ordinal,2)})
            ordinal+=1
    # Ridge segments share the same RNG stream as edge strips.
    if max(top)>f32(.1):
        a,b=world([-mul(ridge_dims[0],.5),0.]),world([mul(ridge_dims[0],.5),0.]);pa=[a[0],H,a[1]];pb=[b[0],H,b[1]]
        direction=unit(vecsub(pb,pa))
        if gable:
            expansion=[mul(mul(v,-1.),.28) for v in direction]
            pa=vecsub(pa,expansion);pb=vecadd(pb,expansion)
        delta=vecsub(pb,pa);length=sqrt(dot(delta,delta));direction=unit(delta)
        splits=random_splits(max(2,math.floor(add(div(length,.625),.5))),div(.125,length),rng)
        hp=f32(surface['height_parameter']);product=mul(hp,surface['profile']);inverse=sub(1,product)
        t=min(1.,max(0.,div(sub(inverse,.8),f32(.19999999))));t=mul(mul(t,t),sub(3,add(t,t)))
        width=add(add(mul(t,.15),mul(sub(1,t),0)),.4)
        drop=add(add(mul(hp,.08),mul(sub(1,hp),.02)),add(mul(product,.15),mul(inverse,.1)))
        x=unit(cross(direction,[0.,1.,0.]));quat=_quat_axes(x,direction,[0.,1.,0.])
        for i,(a,b) in enumerate(zip(splits,splits[1:])):
            span=mul(length,sub(b,a));scale=[width,mul(span,1.4),f32(.15)]
            pos=[sub(add(lerp(x,y,a),mul(v,mul(span,.5))),mul(drop,u)) for x,y,v,u in zip(pa,pb,direction,[0.,1.,0.])]
            emits.append({'role':'side_initial' if i==0 else 'side_strip','callsite':'0x10058cf38' if i==0 else '0x10058d0a4','initial64_hex':pack(pos,quat,scale,add(a,mul(sub(1,a),.9)),render_slot,ordinal,2 if i==0 or i==len(splits)-2 else 1)})
            ordinal+=1
    row_events=[];row_closures=[]
    for side in range(4):
        if gable and side in (0,2):continue
        nxt=(side+1)%4;side_index=len(row_closures)
        mid0=[mul(add(x,y),.5) for x,y in zip(bp[side],bp[nxt])];mid1=[mul(add(x,y),.5) for x,y in zip(tp[side],tp[nxt])]
        curve=world_profile(surface,footprint,sqrt(dot(mid0,mid0)),sqrt(dot(mid1,mid1)));n=max(2,math.ceil(div(curve.length,metrics['height'])))
        row_closures.append({'row_count_f32':float(n),'range_i32':[0,n-1],'endpoint_pairs':[bp[side],tp[side],bp[nxt],tp[nxt]],'profile_points':[list(p) for p in normalized.points],'profile_knots':normalized.knots})
        # Two owner clipping planes at the side's corner strips.
        planes=[]
        for corner,sign in [(side,1),(nxt,-1)]:
            delta=vecsub(tp[corner],bp[corner]) if sign==1 else vecsub(bp[corner],tp[corner]);dx=add(mul(ox,delta[0]),mul(-oz,delta[1]));dz=add(mul(oz,delta[0]),mul(ox,delta[1]));v=unit([-dz,dx])
            normal=[v[0],0.,v[1]];wp=world(bp[corner]);point=[wp[0],0.,wp[1]];planes.append([*normal,sub(-.075,dot(normal,point))])
        lines=[]
        for ri in range(n-1):
            u=div(ri,n-1);x,y=normalized.sample(u)
            left=[lerp(a,b,x) for a,b in zip(bp[side],tp[side])];right=[lerp(a,b,x) for a,b in zip(bp[nxt],tp[nxt])]
            lines.append((left,right,add(mul(H,y),mul(sub(1,y),0)),u))
        for ri,(left,right,height,u) in enumerate(lines):
            d=vecsub(left,right);rowwidth=sqrt(dot(d,d));cols=max(3,math.ceil(div(rowwidth,metrics['width'])));splits=random_splits(cols+1,0.,rng)
            row_events.append({'side_index':side_index,'row_index':ri,'row_u':u,'split_count':cols+1})
            adjacent=lines[ri+1] if ri<len(lines)-1 else lines[ri-1]
            mid=[mul(add(a,b),.5) for a,b in zip(left,right)];other=[mul(add(a,b),.5) for a,b in zip(adjacent[0],adjacent[1])]
            d=[sub(mid[0],other[0]),sub(height,adjacent[2]),sub(mid[1],other[1])];rowlength=mul(sqrt(dot(d,d)),f32(1.4285715))
            tan=curve.tangent(u);angle=_LIB.atanf(div(tan[1],tan[0]))
            for ci,(a,b) in enumerate(zip(splits,splits[1:])):
                l=world([lerp(x,y,a) for x,y in zip(left,right)]);r=world([lerp(x,y,b) for x,y in zip(left,right)])
                dv=vecsub(l,r);width=sqrt(dot(dv,dv));inv=div(1,width);rd=[mul(dv[0],inv),0.,mul(dv[1],inv)]
                outward=[-rd[2],0.,rd[0]];slope=_rotation(outward,rd,angle);bitangent=[-v for v in slope];quat=_quat_axes(rd,bitangent,cross(rd,bitangent))
                pos=[mul(add(l[0],r[0]),.5),height,mul(add(l[1],r[1]),.5)]
                rand=rng.next();length=mul(rowlength,add(mul(rand,1.2),mul(sub(1,rand),.8)));scale=[width,length,metrics['depth']]
                clip=planes[0 if a<=.5 else 1];tile=min(1.,max(0.,add(u,mul(rng.next(),.2))))
                row={'side_index':side_index,'row_index':ri,'row_u':u,'split_count':cols+1}
                record={'role':'ordinary_slope','callsite':'0x10058def8','initial64_hex':pack(pos,quat,scale,tile,render_slot,ordinal,2 if ri==0 else 1,clip),'source_full_precision':{'quaternion':quat,'clip_plane':clip,'scale':scale,'tile_t':[tile]},'row_context':row}
                emits.append(record)
                p={'center':pos,'row_direction':rd,'slope_direction':slope,'scale_width':width,'scale_length':length,'clip_plane':clip,'seed':ordinal,'slot':render_slot,'row_index':ri}
                closure=generate_closure(p,capture_full_precision=True)
                if closure['count']:
                    full=closure['source_full_precision'][0];full['scale'][2]=metrics['depth'];raw=bytearray.fromhex(closure['instances64_hex'][0]);struct.pack_into('<e',raw,28,metrics['depth'])
                    emits.append({'role':'slope_end_cap','callsite':'0x10058e104','initial64_hex':raw.hex(),'source_full_precision':full,'row_context':row.copy()})
                ordinal+=1
    return {'schema':'native-roof-rule-result-v1','status':'generated','surface':surface,'footprint':footprint,'seed':seed,'unit_metrics':metrics,'observed_native_emits':emits,'row_closures':row_closures,'row_events':row_events,'operand_adaptations':[],'native_entry':'0x10058c0d4','original_binary_sha256':BINARY_SHA256,'implementation':'Recovered pure CPU math, no emulator, original binary or GPU round trip'}
