"""Logical roof placements and GPU initial state have separate owners.

Design anchors are evaluated at the authored roof pivot, not by downloading an
animation buffer. The GPU runs the original gravity timeline. This module never
claims that design records are captured/settled original GPU evidence.
"""
import copy
import struct
from roof_anchors import build_surface, _anchor, basis
from native_roof_producers import emit as emit_owner


def placements(surface, context, rawplan, *, kernel=None):
    projector = None if kernel else build_surface(surface)
    pivot = context['roof_descriptor']['base_height']
    cells, edges, records, edge_records, provenance, pairs = [], [], [], [], [], []
    ordinals = {}
    for i, emission in enumerate(rawplan['observed_native_emits']):
        initial = bytes.fromhex(emission['initial64_hex'])
        precision = emission.get('source_full_precision')
        if precision is None:
            precision = {'quaternion':list(struct.unpack_from('<4e',initial,32)),
                'scale':list(struct.unpack_from('<3e',initial,24))}
        if len(initial) != 64:
            raise ValueError('Roof initial ABI must be64 bytes')
        role = emit_owner(rawplan['native_entry'], emission['callsite'])['role']
        row = emission.get('row_context')
        key = role + ((('/side' + str(row['side_index']) if 'side_index' in row else '') + '/row' + str(row['row_index'])) if row else '')
        ordinal = ordinals.get(key, 0)
        ordinals[key] = ordinal + 1
        identity = surface['id'] + '/' + key + '/' + str(ordinal)
        x, y, z = struct.unpack_from('<3f', initial)
        center = [x, y + pivot, z]
        axes = basis(precision['quaternion'])
        uv, anchor = (None, {"triangle":None}) if kernel else _anchor(center, projector)
        cell = {'id':identity, 'logical_id':identity, 'surface_id':surface['id'],
                'surface_piece':anchor['triangle'], 'anchor_uv':uv, 'center':center,
                'tangent':axes[0], 'bitangent':axes[1], 'normal':axes[2], 'size':precision['scale']}
        record = {'cell_id':identity, 'initial64_hex':initial.hex(),
                  'quaternion_f32':precision['quaternion'], 'world_height_origin':pivot}
        (cells if role == 'ordinary_slope' else edges).append(cell)
        (records if role == 'ordinary_slope' else edge_records).append(record)
        provenance.append({'cell_id':identity, 'role':role, 'append_index':i,
                           'entry':rawplan['native_entry'], 'emit_callsite':emission['callsite']})
        if role == 'first_row_closure':
            if i == 0 or provenance[-2]['role'] != 'ordinary_slope' or row['row_index'] != 0:
                raise ValueError('First row closure lost its parent')
            pairs.append({'ordinary_cell_id':provenance[-2]['cell_id'], 'connection_cell_id':identity})
    if kernel:
        all_cells=cells+edges
        for cell,(uv,anchor) in zip(all_cells,kernel.anchors(surface,[c['center']for c in all_cells])):
            cell['anchor_uv']=uv;cell['surface_piece']=anchor['triangle']
    timeline = copy.deepcopy(context['gravity_steps'])
    if not timeline or any(s['first_instance'] != 0 or s['roof_pivot_y'] != pivot for s in timeline):
        raise ValueError('New construction timeline must belong to its authored roof pivot')
    parts = {}
    for p in provenance:
        rule = emit_owner(p['entry'], p['emit_callsite'])['connection_rule']
        if rule:
            parts.setdefault(rule, []).append(p['cell_id'])
    return {'status':'generated', 'rule':'overlap_rows', 'cells':cells, 'connection_cells':edges,
            'roof_design':{'schema':'roof-design-v1', 'records':records},
            'connection_roof_design':{'schema':'roof-design-v1', 'records':edge_records},
            'gravity_timeline':timeline, 'first_row_closure_pairs':pairs,
            'cell_provenance':provenance,
            'connection_arrangement':{'rule':{'type':'roof_boundary_assembly'},
                'components':[{'rule':{'type':rule}, 'cell_ids':ids} for rule,ids in parts.items()]},
            'placement_state':'authored-rest-pose',
            'dynamic_state':'GPU feedback; no CPU state download'}


def generate(surface, context, footprint, seed, *, kernel=None):
    if kernel:
        raw=kernel.roof_layout(context['roof_descriptor'],context['building_footprint'],seed,footprint,context['slot'])
        return placements(surface,context,raw,kernel=kernel)
    import recovered_roof
    descriptor = context['roof_descriptor']
    kind = descriptor['type']
    if kind == 'native_circular_roof_profile':
        producer = recovered_roof.generate_circular
    else:
        producer = recovered_roof.generate_rectangular
    raw = producer(descriptor, context['building_footprint'], seed,
                 unit_metrics=footprint, render_slot=context['slot'])
    return placements(surface, context, raw, kernel=kernel)


def boundaries(surface, context, footprint, seed, layout_cells, *, kernel=None):
    """Native edge ownership plus closures selected from the current surface rule."""
    import recovered_roof
    import roof_eave_placements
    plan = generate(surface, context, footprint, seed, kernel=kernel)
    old_closures = {p['connection_cell_id'] for p in plan['first_row_closure_pairs']}
    cells = [c for c in plan['connection_cells'] if c['id'] not in old_closures]
    records = [r for r in plan['connection_roof_design']['records'] if r['cell_id'] not in old_closures]
    selection = roof_eave_placements.select(surface, layout_cells,
        base_height=context['roof_descriptor']['base_height'], slot=context['slot'])
    pairs = []
    for item in selection['placements']:
        result = kernel.roof_closure(item['placement']) if kernel else recovered_roof.generate_closure(item['placement'], capture_full_precision=True)
        if not result['count']:
            continue
        initial = bytes.fromhex(result['instances64_hex'][0])
        precision = result['source_full_precision'][0]
        x,y,z = struct.unpack_from('<3f', initial)
        pivot = context['roof_descriptor']['base_height']
        center = [x,y+pivot,z]
        axes = basis(precision['quaternion'])
        identity = item['ordinary_cell_id'] + '/first-row-closure'
        cell = {'id':identity,'logical_id':identity,'surface_id':surface['id'],'center':center,
                'tangent':axes[0],'bitangent':axes[1],'normal':axes[2],'size':precision['scale']}
        for key in ('anchor_uv','surface_piece'):
            if key in item:cell[key]=copy.deepcopy(item[key])
        if 'clip_polygons_world' in item:
            projected=[]
            for polygon in item['clip_polygons_world']:
                area=sum(p[0]*q[2]-p[2]*q[0] for p,q in zip(polygon,polygon[1:]+polygon[:1]))
                if abs(area)>1e-12:projected.append([[p[0],center[1],p[2]] for p in polygon])
            if not projected:continue
            cell.update(clip_polygons_world=projected, requires_surface_clip=True)
        cells.append(cell)
        records.append({'cell_id':identity,'initial64_hex':initial.hex(),
            'quaternion_f32':precision['quaternion'],'world_height_origin':pivot})
        pairs.append({'ordinary_cell_id':item['ordinary_cell_id'],'connection_cell_id':identity})
    components=[]
    for component in plan['connection_arrangement']['components']:
        ids=[identity for identity in component['cell_ids'] if identity not in old_closures]
        if ids:components.append({**component,'cell_ids':ids})
    if pairs:components.append({'rule':{'type':'roof_eave_closure'},'cell_ids':[p['connection_cell_id'] for p in pairs]})
    return {'cells':cells,'roof_design':{'schema':'roof-design-v1','records':records},
            'first_row_closure_pairs':pairs,'gravity_timeline':plan['gravity_timeline'],
            'arrangement':{'rule':{'type':'roof_boundary_assembly'},'components':components}}
