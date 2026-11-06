"""Offline, reflected GLSL 450 -> ES 300 adapter. Keeps original shader expressions.
Storage buffers are read through integer data textures; no expanded vertex capture.
Only the reflected read-only natural-layout subset is admitted.
"""
import re

def ident(name):
    return re.sub('_+', '_', re.sub(r'[^a-zA-Z0-9_]', '_', name))

def port(source, reflection, stage, varying_locations=None, instance_binding=None):
    types=reflection['types']; readers=[]; resources=[]; uniforms=[]
    structs={n:re.findall(r'(\w+)\s+(\w+)(?:\[(\d+)\])?;',body) for n,body in re.findall(r'struct (\w+)\s*\{(.*?)\};',source,re.S)}
    def replace_buffer(match):
        layout,body,var=match.groups(); slot=tuple(int(re.search(k+r'\s*=\s*(\d+)',layout)[1]) for k in ['set','binding'])
        entry=next(x for x in reflection['ssbos'] if (x['set'],x['binding'])==slot)
        member=types[entry['type']]['members']; assert len(member)==1
        m=member[0]; typ,field=re.search(r'(\w+)\s+(\w+)\[\]',body).groups();stride=m['array_stride']//4
        name=f'storage_{slot[0]}_{slot[1]}';fn=f'read_{var}'
        direct = slot == instance_binding
        if direct and stride != 16:raise ValueError('Direct roof ABI must have 16 words')
        if not direct:resources.append({'name':name,'set':slot[0],'binding':slot[1],'stride':stride*4})
        def value(t,off):
            if t in types:
                info=types[t];actual=next((n for n in structs if ident(n)==ident(info['name'])),None)
                if not actual:raise ValueError('Missing struct '+info['name'])
                fields=structs[actual];values=[]
                if len(fields)!=len(info['members']):raise ValueError('Struct reflection differs: '+actual)
                for sm,(ft,_,arr) in zip(info['members'],fields):
                    o=f'({off}+{sm["offset"]//4})'
                    if arr:
                        vals=[value(sm['type'],f'({o}+{i*sm["array_stride"]//4})') for i in range(int(arr))]
                        values.append(f'{ft}[{arr}]('+','.join(vals)+')')
                    else: values.append(value(sm['type'],o))
                return actual+'('+','.join(values)+')'
            count=int(t[-1]) if t[-1].isdigit() else 1
            def scalar(i):
                w=f'word_{var}({off}+{i})'
                return w if t=='uint' or t.startswith('uvec') else f'int({w})' if t=='int' or t.startswith('ivec') else f'uintBitsToFloat({w})'
            if count==1:return scalar(0)
            return t+'('+','.join(scalar(i) for i in range(count))+')'
        if direct:
            prefix='instanceWords' if stage=='vert' else 'instanceRecord'
            load='int q=p%16;return '+':'.join(f'q<{(i+1)*4}?{prefix}{i}[q%4]' for i in range(3))+f':{prefix}3[q%4];'
            declaration='\n'.join((f'layout(location={8+i}) in uvec4 instanceWords{i};\nflat out uvec4 instanceRecord{i};' if stage=='vert' else f'flat in uvec4 instanceRecord{i};') for i in range(4))
            if stage=='vert':declaration+='\nlayout(location=12) in uint instanceVisible;'
        else:
            load=f'ivec2 sz=textureSize({name},0);return texelFetch({name},ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];'
            declaration=f'uniform highp usampler2D {name};'
        readers.append(f'uint word_{var}(int p){{{load}}}\n{typ} {fn}(int i){{return {value(m["type"],f"(i*{stride})")};}}')
        return declaration
    pattern=r'layout\(([^)]*std430[^)]*)\) readonly buffer \w+\s*\{(.*?)\}\s*(\w+);'
    source=re.sub(pattern,replace_buffer,source,flags=re.S)
    # Balanced index expressions (including nested indirection), not a regex for GLSL expressions.
    for var in re.findall(r'uint word_(\w+)\(', '\n'.join(readers)):
        pattern=re.compile(re.escape(var)+r'\._member0\[')
        while True:
            matches=list(pattern.finditer(source))
            if not matches:break
            m=matches[-1];j=m.end();level=1
            while level:
                level+=(source[j]=='[')-(source[j]==']');j+=1
            source=source[:m.start()]+f'read_{var}(int('+source[m.end():j-1]+'))'+source[j:]
    def ubo(m):
        layout,block,body,var=m.groups();slot=tuple(int(re.search(k+r'\s*=\s*(\d+)',layout)[1]) for k in ['set','binding'])
        entry=next(x for x in reflection['ubos'] if (x['set'],x['binding'])==slot)
        uniforms.append({'name':block,'set':slot[0],'binding':slot[1],'size':entry['block_size']})
        return 'layout(std140) uniform '+block+' {'+body+'} '+var+';'
    source=re.sub(r'layout\(([^)]*(?:std140|scalar)[^)]*)\) uniform (\w+)\s*\{(.*?)\}\s*(\w+);',ubo,source,flags=re.S)
    samplers=[]
    bindless_helpers=''
    if 'texture2D resource_handles[]' in source:
        source=source.replace('layout(set = 1, binding = 0) uniform texture2D resource_handles[];', 'layout(set = 1, binding = 0) uniform texture2D resource0;\nlayout(set = 1, binding = 1) uniform texture2D resource1;\nlayout(set = 1, binding = 2) uniform texture2D resource2;')
        for original,helper,args,call in [('texture','tgTexture','vec2 uv,float bias','uv,bias'),('textureLod','tgTextureLod','vec2 uv,float lod','uv,lod'),('textureGrad','tgTextureGrad','vec2 uv,vec2 dx,vec2 dy','uv,dx,dy')]:
            source=re.sub(original+r'\(nonuniformEXT\(sampler2D\(resource_handles\[(.*?)\], samplers_llr\)\),',helper+r'(int(\1),',source)
            bindless_helpers+=f'vec4 {helper}(int i,{args}){{return i==0?{original}(resource0,{call}):i==1?{original}(resource1,{call}):{original}(resource2,{call});}}\n'

    def tex(m):
        layout,typ,name=m.groups();slot=tuple(int(re.search(k+r'\s*=\s*(\d+)',layout)[1]) for k in ['set','binding'])
        samplers.append({'name':name,'set':slot[0],'binding':slot[1],'type':typ})
        return 'uniform highp '+typ.replace('texture','sampler')+' '+name+';'
    source=re.sub(r'layout\(([^)]*)\) uniform (texture\w+) (\w+);',tex,source)
    source=re.sub(r'layout\([^)]*\) uniform sampler \w+;','',source)
    source=re.sub(r'sampler(2DArray|2D|3D)\((\w+),\s*\w+\)',r'\2',source)
    source=source.replace('#version 450','#version 300 es\nprecision highp float;\nprecision highp int;')
    source=re.sub(r'#extension[^\n]*\n','',source).replace('demote;','discard;').replace('gl_InstanceIndex','gl_InstanceID').replace('gl_VertexIndex','gl_VertexID')
    # Link varyings by reflected location; ES 300 does not support explicit varying locations.
    direction='out' if stage=='vert' else 'in'
    renames={}
    def varying(m):
        loc,flat,t,n=m.groups();renames[n]='v'+loc
        return ((flat or '')+direction+' ' if varying_locations is None or int(loc) in varying_locations else '')+t+' v'+loc+';'
    source=re.sub(r'layout\(location = (\d+)\) (flat )?'+direction+r' (\w+) (\w+);',varying,source)
    for a,b in renames.items(): source=re.sub(r'\b'+a+r'\b',b,source)
    source=re.sub(r'\btexture\b(?!\s*\()', 'texture_value', source)
    derivative_helpers=''
    if stage=='frag':
        source=source.replace('dFdy(', 'tgDdy(')
        derivative_helpers='\n'.join(f'{t} tgDdy({t} x){{return -dFdy(x);}}' for t in ['float','vec2','vec3','vec4'])
    source=source.replace('mix(ivec', 'tgMix(ivec')
    helpers='\n'.join(f'ivec{n} tgMix(ivec{n} a, ivec{n} b, bvec{n} t){{return ivec{n}('+','.join(f't[{i}]?b[{i}]:a[{i}]' for i in range(n))+');}' for n in [2,3,4])
    source=source.replace('void main()', helpers+'\n'+ derivative_helpers+'\n'+bindless_helpers+'\n'.join(readers)+'\nvoid original_main()')
    if stage=='vert':
        extra=(''.join(f'instanceRecord{i}=instanceWords{i};'for i in range(4))+'if(instanceVisible==0u)gl_Position=vec4(2.0,2.0,2.0,1.0);')if instance_binding else ''
        source+='\nvoid main(){original_main();gl_Position.z=gl_Position.z*2.0-gl_Position.w;'+extra+'}\n'
    else:
        output=re.search(r'layout\(location = 0\) out uvec2 (\w+);',source)
        if not output:raise ValueError('Expected original packed gbuffer output')
        name=output[1];source=source[:output.start()]+'uvec2 '+name+';\nout vec4 residentColor;'+source[output.end():]
        source+='\nvoid main(){original_main();uint c='+name+'.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}\n'
    if stage=='frag':source=re.sub(r'layout\(location = [1-9]\) out (\w+) (\w+);',r'\1 \2;',source)
    return {'source':source,'storage':resources,'uniforms':uniforms,'textures':samplers}
