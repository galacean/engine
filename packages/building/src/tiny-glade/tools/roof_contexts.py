"""One support mapping per roof, shared by placement and connection consumers."""
import copy
import hashlib
import itertools
import math
import struct
from native_roof_owners import slope_surface
from native_roof_producers import PRODUCERS
from native_pitched_roof_assembly import MECHANISM
from roof_contact_topology import DEPTH_POLICY, CLASSIFIER, FLAT_CLASSIFIER


def descriptor(raw):
    if len(raw)!=88:raise ValueError('Roof descriptor must have88 bytes')
    tag=struct.unpack_from('<I',raw,8)[0]
    if tag not in (0,1):raise ValueError('Unverified roof shape')
    params=struct.unpack_from('<6f',raw,36)
    shape=struct.unpack_from('<4f' if tag==0 else '<6f',raw,12)
    base=struct.unpack_from('<f',raw,76)[0]
    if not all(math.isfinite(x) for x in (*params,*shape,base)):
        raise ValueError('Nonfinite roof descriptor')
    roof={'type':'native_circular_roof_profile' if tag==0 else 'native_rectangular_roof_profile',
        'tip_offset':list(params[:2]),**dict(zip(['profile','height_parameter','ridge_parameter','eave_parameter'],params[2:])),
        'axis':raw[60],'edge_mode':raw[84],'base_height':base}
    building={'center':list(shape[:2]),'radius':shape[2],'phase':shape[3]} if tag==0 else {
        'orientation':list(shape[:2]),'center':list(shape[2:4]),'width':shape[4],'depth':shape[5]}
    return roof,building


def context(bundle, support, directory, *, kernel=None):
    mapping=_slope_surface(support,kernel) if kernel else slope_surface(support)
    roof,building=descriptor(bytes.fromhex(mapping['provenance']['roof88_hex']))
    wid=mapping['wall_id']
    animation=bundle['families']['roofs']['data']['animations']
    return {'schema':'native-shingle-context-v2','wall_id':wid,'slot':mapping['slot'],
        'geometry':mapping['geometry'],'mapping':mapping,'roof_descriptor':roof,
        'building_footprint':building,'gravity_steps':animation.get(str(wid),animation.get(wid))['steps'],
        'directory':str(directory)}


def pitched_topology(bundle, supports):
    """Interpret already-produced contact records; do not replay slot allocation.

    The admitted compiler accepts pitched roofs only. Their original policy
    composes independent roof owners and produces no flat/pitched merlon units.
    The derived support intersection is an editing locator, not an extra mesh.
    """
    from pitched_roof_contacts import derive
    source=bundle['families']['roof_connections']['data']
    if source['count'] or source['candidates56'] or source['holes40']:
        raise ValueError('Pitched-only compilation received flat/pitched contact output')
    owners=[]
    for wid,hex88 in bundle['source']['roofs88'].items():
        raw=bytes.fromhex(hex88);roof,_=descriptor(raw)
        if struct.unpack_from('<Q',raw)[0]!=int(wid):raise ValueError('Roof owner mismatch')
        if roof['height_parameter']<=struct.unpack('<f',struct.pack('<f',.1))[0]:
            raise ValueError('Pitched-only compiler received flat roof')
        owners.append({'wall_id':int(wid),'is_pitched':True,'roof88_sha256':hashlib.sha256(raw).hexdigest(),
            'classification_entry':CLASSIFIER,'classification_function':'Roof::ty','is_flat':False,
            'flat_classification_entry':FLAT_CLASSIFIER})
    if set(supports)!={o['wall_id']for o in owners}:raise ValueError('Incomplete roof support roster')
    rows={r['wall_id']:r for r in bundle['families']['roofs']['data']['instances']}
    mechanisms={}
    for wid,row in rows.items():
        tag=struct.unpack_from('<I',bytes.fromhex(row['roof88_hex']),8)[0]
        mechanisms[wid]={'wall_id':wid,'shape_tag':tag,'constructor':PRODUCERS[tag]['entry'],
                         'instance_count':row['count'],'instances_sha256':row['sha256']}
    pairs=[]
    for a,b in itertools.combinations(sorted(supports),2):
        pairs.append({'wall_pair':[a,b],'geometry':derive(supports[a],supports[b]),
            'mechanism':{**copy.deepcopy(MECHANISM),'owners':[mechanisms[a],mechanisms[b]]},
            'cell_ids':[],'candidates':[],'source_unit_counts':{},'reservation_holes40':[],
            'emission_status':'independent_roof_owners_no_extra_units','emitted_unit_count':0})
    return {'schema':'roof-contact-topology-v1','status':'current_native_capture','owners':owners,'pairs':[],
        'detector_executed':True,'detector_entry':source['entry'],'constructor_entry':source['consumer_entry'],
        'binary_sha256':source['binary_sha256'],'source_script_sha256':source['source_script_sha256'],
        'composition':copy.deepcopy(DEPTH_POLICY),
        'local_edit_scope':'Authored participant UV selects only actual emitted cells; zero-cell intent remains dormant.',
        'identity':'Persistent source-owner pair; candidate indices and emitted cell ordinals are epoch-local.',
        'limits':'No candidate means no output from this detector, not proof of no geometric contact.',
        'pitched_mechanism':copy.deepcopy(MECHANISM),'pitched_pairs':pairs,'unsupported_pitched_owners':[]}


def _slope_surface(mapping,kernel):
 """Select original trigger main-slope UV charts; do not trim a guessed edge band."""
 from roof_support import shared_geometry
 result=copy.deepcopy(mapping);slopes=[];ridges=[]
 shape=struct.unpack_from('<I',bytes.fromhex(result['provenance']['roof88_hex']),8)[0]
 if shape==0:
  # Circular root has only ring tiles and first-row closures. Its top support
  # disk is not a separately emitted trim owner, so keep its original UV island
  # in the ordinary support domain rather than applying rectangle ridge rules.
  result['provenance']['slope_selection']={
   'source':'Circular original constructor 0x10055b490 has only ordinary emit 0x10055bcd0 and dependent first-row closure 0x10055bea0.',
   'excluded_original_triangle_indices':[],
   'occupancy':'Entire original circular support, including the tip UV island. No inferred trim band or separately invented tip assembly.'}
  return result
 if shape!=1:raise ValueError('Unverified native roof support ownership')
 for p in result['patches']:
  vs=[q[1] for q in p['native_mesh_uv']]
  if all(-1e-7<=v<=1+1e-7 for v in vs):slopes.append(p)
  elif all(abs(v-2.)<1e-6 or abs(v-struct.unpack('<f',struct.pack('<f',2.1))[0])<1e-6 for v in vs):ridges.append(p)
  else:raise ValueError('Unrecognized original roof trigger UV chart; cannot classify slope')
 if not slopes:raise ValueError('No original slope chart')
 result['patches']=slopes;result['area']=sum(p['uncut_area'] for p in slopes);result['hole_area']=sum(p['uncut_area']-p['retained_area'] for p in slopes)
 result['geometry'],result['uv_mapping']=shared_geometry(result,validator=kernel.validate)
 result['uv_mapping']['chart_policy']='Only original producer main-slope UV v0..1. Original ridge v2..float32(2.1) removed; no guessed spatial margin.'
 result['native_ridge_patches_excluded']=[p['triangle_index'] for p in ridges]
 result['provenance']['slope_selection']={'source':'Original trigger producer065 writes ridge UV constants2/2.1 at lines1001-1018; slopes retain profile-fraction UV0..1. Unknown charts rejected.',
   'excluded_original_triangle_indices':result['native_ridge_patches_excluded'],
   'occupancy':'No native edge occupancy-hole producer was found in rectangular tile root. Body tiles are already clipped by their native side planes and coexist with trim. This adapter does not remove a fixed-width band or infer clip footprints from model bounds.'}
 return result
