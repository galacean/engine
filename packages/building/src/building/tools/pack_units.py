"""Batch native ABI encoding with pure recovered arithmetic, without Unicorn.
The provider retains ownership of source metadata validation. Material selection
does not choose an arrangement, and the packed instance ABI is unchanged.
"""
from pathlib import Path
import sys,json,struct,hashlib
from recovered_instance_abi import SOURCE_BINARY_SHA256,brick_default96,wood_default80,brick_encode64,quaternion

def pack(spec,output):
 from unit_metadata import validate_source_metadata,brick_input96,roof_instance64,wood_instance80
 out=Path(output);unit=spec['unit'];slot=spec['slot'];cells=spec['cells'];rows=[]
 if 'roof_design' in spec and 'source_render_metadata' in spec:raise ValueError('roof_design and source_render_metadata are mutually exclusive')
 design=None
 if 'roof_design' in spec:
  from roof_design_state import validate
  design=validate(spec['roof_design'],cells,slot)
 metadata=validate_source_metadata(spec.get('source_render_metadata'),cells,slot,unit)
 if unit not in ('brick','roof_tile','wooden_plank'):raise ValueError('Unsupported material unit')
 default=brick_default96()if unit=='brick'else wood_default80()if unit=='wooden_plank'else None
 for c in cells:
  basis=[c[k]for k in ['tangent','bitangent','normal']];size=c['size'];mat=[x*size[j]for j,col in enumerate(basis)for x in col];pos=c['center'];seed=int.from_bytes(hashlib.sha256(c.get('logical_id',c['id']).encode()).digest()[:4],'little')&0x7fffffff
  if unit=='brick':
   if metadata.get('packing_mode')=='original-domain96-with-plane-wrapper':
    b=bytes.fromhex(metadata['domain_input96_by_cell'][c['id']])
   elif metadata['manifest']['applied']:b=brick_input96(c,metadata['state_by_cell'][c['id']])
   else:
    b=bytearray(default);struct.pack_into('<12f',b,0,*mat,*pos);struct.pack_into('<II',b,76,seed,slot)
   rows.append(brick_encode64(bytes(b)))
  elif unit=='wooden_plank':
   if metadata['manifest']['applied']:
    rows.append(wood_instance80(c,metadata['state_by_cell'][c['id']]));continue
   b=bytearray(default);origin=[pos[i]-.5*size[1]*basis[1][i]for i in range(3)];struct.pack_into('<12f',b,0,*mat,*origin);struct.pack_into('<iiII',b,48,seed,seed,slot,0);rows.append(bytes(b))
  elif design is not None:
   rows.append(design[c['id']])
  elif metadata['manifest']['applied']:
   rows.append(roof_instance64(c,metadata['state_by_cell'][c['id']]))
  else:
   b=bytearray(64);struct.pack_into('<4f',b,0,*pos,0.);struct.pack_into('<4e',b,16,0.,1.,0.,65504.);struct.pack_into('<4e',b,24,*size,1.);struct.pack_into('<4e',b,32,*quaternion(basis));struct.pack_into('<IIfiii',b,40,slot,0,1.,seed,0,1);rows.append(bytes(b))
 out.write_bytes(b''.join(rows));Path(str(out)+'.json').write_text(json.dumps({'source_render_metadata':metadata['manifest'],**({'roof_design':{'schema':'roof-design-v1','count':len(design),'renderer_state':'initial' if unit=='roof_tile' else 'material-default','cell_geometry':'design-endpoint'}} if design is not None else {}),'unit':unit,'count':len(rows),'stride':80 if unit=='wooden_plank'else 64,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'binary_sha256':SOURCE_BINARY_SHA256,'native_defaults':default.hex()if default else None,'encoding_backend':'recovered-python','visited_instruction_count':0,'platform_memcpy_calls':0,'boundary':'New generic cell-to-native-ABI adapter. Recovered field defaults and BrickTransform encoding arithmetic run without native execution. Roof design records preserve initial animation=0/currentHeight=0 for GPU gravity; their cells describe the design endpoint. Roof without design or compatible source metadata uses explicit animation=1/currentHeight=0 editor defaults. Compatible roof metadata preserves the captured original gravity state. Cells are not original TG layout output.'},indent=2))

if __name__=='__main__':
 provider=Path(sys.argv[1]);sys.path.insert(0,str(provider))
 for row in json.loads(Path(sys.argv[2]).read_text()):pack(json.loads(Path(row['input']).read_text()),row['output'])
