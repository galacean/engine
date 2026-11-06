"""Offline shared swept-surface fitting. Run with Blender; runtime consumes only curves and poses.

UVs establish correspondence within a family, never become runtime geometry. Controls
are least-squares fits to uniformly sampled fields, independent of source tessellation.
The emitted candidate is deliberately NOT promoted by this script.
"""
import argparse
import json
import math
from pathlib import Path
import runpy
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

DIRECTORY = Path(__file__).resolve().parent
API = runpy.run_path(str(DIRECTORY / 'extract-procedural-tree-geometry-blueprint.py'))


def unit(v):
    return v / np.linalg.norm(v)


def engine(v):
    return np.array([v[0], v[2], -v[1]], dtype=float)


def frames(centers):
    right, previous = np.array([1., 0, 0]), np.array([0., 1, 0])
    result = []
    for a, b in zip(centers[:-1], centers[1:]):
        up = unit(b - a)
        axis = np.cross(previous, up)
        sine, cosine = np.linalg.norm(axis), np.dot(previous, up)
        if sine > 0:
            n = axis / sine
            right = right * cosine + np.cross(n, right) * sine + n * np.dot(n, right) * (1 - cosine)
        right = unit(right - up * np.dot(up, right))
        result.append(np.column_stack([right, up, unit(np.cross(right, up))]))
        previous = up
    return result


def quaternion(rotation):
    q = Matrix(rotation.tolist()).to_quaternion()
    values = np.array([q.x, q.y, q.z, q.w], dtype=float)
    return (values / np.linalg.norm(values)).tolist()


def pose(template, points):
    offset = points.mean(axis=0)
    centered = points - offset
    u, _, vt = np.linalg.svd(template.T @ centered)
    correction = np.eye(3)
    correction[-1, -1] = np.linalg.det(u @ vt)
    rotation = u @ correction @ vt
    scale = np.sum((template @ rotation) * centered) / np.sum(template ** 2)
    return offset, rotation, scale


def family_mean(items):
    points, uv = items[0]['points'], items[0]['uv']
    derivative = np.linalg.lstsq(np.column_stack([uv, np.ones(len(uv))]), points, rcond=None)[0]
    up = unit(derivative[1])
    right = unit(derivative[0] - up * np.dot(derivative[0], up))
    basis = np.column_stack([right, up, np.cross(right, up)])
    template = (points - points.mean(axis=0)) @ basis
    template /= np.sqrt(np.mean(np.sum(template ** 2, axis=1)))
    for _ in range(100):
        aligned = []
        for item in items:
            offset, rotation, scale = pose(template, item['points'])
            aligned.append((item['points'] - offset) @ rotation.T / scale)
        updated = np.mean(aligned, axis=0)
        updated -= updated.mean(axis=0)
        updated /= np.sqrt(np.mean(np.sum(updated ** 2, axis=1)))
        if np.linalg.norm(updated - template) <= np.sqrt(np.finfo(float).eps):
            template = updated
            break
        template = updated
    return template


def source_normal_samples(obj, material, origin):
    """Read authored per-corner normals, with the inverse-transpose world transform."""
    transform = obj.matrix_world.to_3x3().inverted().transposed()
    points, normals = [], []
    for face in API['material_faces'](obj, material):
        for loop in face.loop_indices:
            vertex = obj.data.loops[loop].vertex_index
            points.append(engine(obj.matrix_world @ obj.data.vertices[vertex].co) - origin)
            normals.append(unit(engine(transform @ obj.data.corner_normals[loop].vector)))
    return np.array(points), np.array(normals)


def fit_radial_normal_field(samples):
    """Intersect normal lines in least squares: (I - nn^T)(origin - position) = 0."""
    points, normals = samples
    projection = np.eye(3) - normals[:, :, None] * normals[:, None, :]
    rhs = np.einsum('nij,nj->ni', projection, points)
    center, _, rank, _ = np.linalg.lstsq(projection.reshape(-1, 3), rhs.reshape(-1), rcond=None)
    if rank != 3:
        raise ValueError('Authored normals do not determine a finite radial field origin')
    return dict(origin=center.tolist(), radialBlend=1)


def normal_field_error(samples, field):
    points, normals = samples
    radial = points - np.array(field['origin'])
    distance = np.linalg.norm(radial, axis=1)
    if np.any(distance == 0):
        raise ValueError('Normal field origin coincides with a source vertex')
    predicted = radial / distance[:, None]
    angles = np.degrees(np.arccos(np.clip(np.sum(normals * predicted, axis=1), -1, 1)))
    return dict(corners=len(points), medianAngleDegrees=float(np.median(angles)),
                p90AngleDegrees=float(np.percentile(angles, 90)), maxAngleDegrees=float(angles.max()))


def component_data(obj, material, origin):
    faces = API['material_faces'](obj, material)
    uv_by_vertex = {}
    for face in faces:
        for loop in face.loop_indices:
            uv_by_vertex[obj.data.loops[loop].vertex_index] = np.array(obj.data.uv_layers.active.data[loop].uv)
    results = []
    for component in API['face_components'](faces):
        ids = sorted(component, key=lambda i: tuple(uv_by_vertex[i]))
        lookup = {v: i for i, v in enumerate(ids)}
        triangles = []
        for tri in obj.data.loop_triangles:
            if tri.material_index == material and all(v in lookup for v in tri.vertices):
                triangles.append([lookup[v] for v in tri.vertices])
        uv = np.array([uv_by_vertex[i] for i in ids])
        results.append(dict(points=np.array([engine(obj.matrix_world @ obj.data.vertices[i].co) - origin for i in ids]),
                            uv=uv, triangles=triangles, signature=tuple(uv.flatten())))
    return results


def sample_fields(points, uv, triangles, count):
    """Intersect triangle UV domains with horizontal stations, then sample their 3D field."""
    values = []
    low, high = uv[:, 1].min(), uv[:, 1].max()
    for t in np.linspace(0, 1, count):
        height = low + t * (high - low)
        cuts = []
        for triangle in triangles:
            for a, b in zip(triangle, triangle[1:] + triangle[:1]):
                ya, yb = uv[a, 1], uv[b, 1]
                if ya == yb:
                    if height == ya:
                        cuts.extend([(uv[a, 0], points[a]), (uv[b, 0], points[b])])
                elif min(ya, yb) <= height <= max(ya, yb):
                    alpha = (height - ya) / (yb - ya)
                    cuts.append((uv[a, 0] * (1-alpha) + uv[b, 0] * alpha, points[a]*(1-alpha)+points[b]*alpha))
        cuts.sort(key=lambda x: x[0])
        if not cuts:
            raise ValueError('Disconnected longitudinal UV domain')
        left, right = cuts[0][1], cuts[-1][1]
        # Ridge corresponds to the UV center of the basal cross section. This is
        # derived from the domain, not a species-specific atlas coordinate.
        basal = uv[np.isclose(uv[:, 1], low, rtol=0, atol=np.finfo(np.float32).eps)]
        middle_u = (basal[:, 0].min() + basal[:, 0].max()) / 2
        middle_u = np.clip(middle_u, cuts[0][0], cuts[-1][0])
        center = left
        for (ua, pa), (ub, pb) in zip(cuts[:-1], cuts[1:]):
            if ua <= middle_u <= ub and ub > ua:
                alpha = (middle_u-ua)/(ub-ua)
                center = pa*(1-alpha)+pb*alpha
                break
        values.append(np.concatenate([center, left, right]))
    return np.array(values)


def fit_surface(points, uv, triangles, controls):
    # Oversampling is a quadrature setting, not retained model complexity.
    samples = sample_fields(points, uv, triangles, max(257, controls * 32 + 1))
    stations = np.linspace(0, 1, controls)
    t = np.linspace(0, 1, len(samples))
    basis = np.maximum(0, 1-np.abs(t[:, None]-stations[None, :])*(controls-1))
    curves = np.linalg.lstsq(basis, samples, rcond=None)[0]
    centers = curves[:, :3]
    axes = frames(centers)
    sections = []
    for i, (at, curve) in enumerate(zip(stations, curves)):
        # At a knot runtime uses the preceding span's frame.
        frame = axes[max(0, i-1)]
        section = dict(at=float(at), center=curve[:3].tolist(), leftCurl=0, rightCurl=0, twist=0)
        for side, edge, sign in [('left', curve[3:6], -1), ('right', curve[6:9], 1)]:
            x, y, z = (edge-curve[:3]) @ frame
            section[side+'Width'] = float(np.hypot(x, z))
            section[side+'Fold'] = float(np.arctan2(z, x*sign))
            section[side+'Sweep'] = float(y)
        sections.append(section)
    return dict(kind='surface', shading='flat', sections=sections)


def mesh_samples(points, triangles):
    p = np.asarray(points)
    tr = p[np.asarray(triangles)]
    return np.concatenate([p, tr.mean(axis=1), (tr[:, 0]+tr[:, 1])/2,
                           (tr[:, 1]+tr[:, 2])/2, (tr[:, 2]+tr[:, 0])/2])


def compare(source, generated):
    p, tri = source['points'], source['triangles']
    q = np.asarray(generated['positions'])
    qt = np.asarray(generated['indices']).reshape(-1, 3).tolist()
    a = BVHTree.FromPolygons([Vector(v) for v in p], tri, all_triangles=True)
    b = BVHTree.FromPolygons([Vector(v) for v in q], qt, all_triangles=True)
    errors = [b.find_nearest(Vector(v))[3] for v in mesh_samples(p, tri)]
    errors += [a.find_nearest(Vector(v))[3] for v in mesh_samples(q, qt)]
    diagonal = np.linalg.norm(np.ptp(p, axis=0))
    return dict(maxRelativeDistance=float(max(errors)/diagonal),
                rmsRelativeDistance=float(np.sqrt(np.mean(np.square(errors)))/diagonal),
                sourceTriangles=len(tri), generatedTriangles=len(qt))


def projection_errors(sources, generated, resolution=256):
    """Three orthographic silhouette comparisons in a shared source/generated frame."""
    source_triangles = np.concatenate([s['points'][np.asarray(s['triangles'])] for s in sources.values()])
    generated_triangles = np.concatenate([np.asarray(m['positions'])[np.asarray(m['indices']).reshape(-1, 3)] for m in generated])
    errors = {}
    for label, axes in [('front', [0, 1]), ('side', [2, 1]), ('top', [0, 2])]:
        a, b = source_triangles[:, :, axes], generated_triangles[:, :, axes]
        low = np.minimum(a.min(axis=(0,1)), b.min(axis=(0,1)))
        high = np.maximum(a.max(axis=(0,1)), b.max(axis=(0,1)))
        scale = (resolution-2)/max(high-low)
        def raster(triangles):
            mask = np.zeros((resolution, resolution), dtype=bool)
            for triangle in (triangles-low)*scale+1:
                lo = np.maximum(0,np.floor(triangle.min(axis=0)).astype(int))
                hi = np.minimum(resolution-1,np.ceil(triangle.max(axis=0)).astype(int))
                x,y = np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
                edges = []
                for p,q in zip(triangle,np.roll(triangle,-1,axis=0)):
                    edges.append((q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]))
                edge = np.asarray(edges)
                inside = np.all(edge>=0,axis=0) | np.all(edge<=0,axis=0)
                # Zero-area projected triangles have no silhouette area.
                area = np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0])
                if area != 0:
                    mask[lo[1]:hi[1]+1,lo[0]:hi[0]+1] |= inside
            return mask
        original, candidate = raster(a), raster(b)
        errors[label] = float(1-np.count_nonzero(original & candidate)/np.count_nonzero(original | candidate))
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--compiler', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--tree-output', help='Optional common tree structure parameter export')
    parser.add_argument('--controls', type=int, default=5)
    parser.add_argument('--normal-field', choices=['none', 'radial'], default='none',
                        help='Fit a shared foliage shading field from source corner normals')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.controls < 2:
        parser.error('controls must be at least two')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.source, use_custom_normals=True)
    objects = []
    index = 0
    while (obj := API['find_lod_object'](index)) is not None:
        obj.data.calc_loop_triangles()
        objects.append(obj)
        index += 1
    if not objects:
        raise ValueError('Source contains no named LOD meshes')
    roles = [API['material_role_indices'](obj) for obj in objects]
    paths = [API['extract_unoriented_branch_paths'](obj, API['material_faces'](obj, role[0])) for obj, role in zip(objects, roles)]
    if any(len(p) != 1 for p in paths):
        raise ValueError('This initial fitter requires one woody support; branched supports need hierarchy fitting')
    for p in paths:
        if p[0]['centers'][0].z > p[0]['centers'][-1].z:
            p[0]['centers'].reverse()
            p[0]['radii'].reverse()
    origin = engine(paths[0][0]['centers'][0])
    source = [component_data(obj, role[1], origin) for obj, role in zip(objects, roles)]
    structure = dict(version=1, shapes={}, parts=[], lods=[])
    normal_report = None
    if args.normal_field == 'radial':
        samples = [source_normal_samples(obj, role[1], origin) for obj, role in zip(objects, roles)]
        field = fit_radial_normal_field(samples[0])
        structure['normalFields'] = {'foliage': field}
        normal_report = dict(model='radial', fittedFromLod=0, field=field,
            metric='Angular residual evaluated at original source corners; independent of geometry reconstruction error.',
            lods=[dict(lod=lod, **normal_field_error(sample, field)) for lod, sample in enumerate(samples)])
    canonical = source[0]
    families = {}
    for i, item in enumerate(canonical):
        families.setdefault(item['signature'], []).append(i)
    # Reflection is a shape property, not a proper rotation. Keep mirrored
    # families separate instead of averaging away their folds.
    oriented_families = {}
    for signature, ids in families.items():
        reference = canonical[ids[0]]['points']
        reference = reference-reference.mean(axis=0)
        for i in ids:
            cloud = canonical[i]['points']
            parity = int(np.sign(np.linalg.det(reference.T @ (cloud-cloud.mean(axis=0)))))
            canonical[i]['family'] = (signature, parity)
            oriented_families.setdefault((signature, parity), []).append(i)
    poses = {}
    for ids in oriented_families.values():
        mean = family_mean([canonical[i] for i in ids])
        for i in ids:
            poses[i] = pose(mean, canonical[i]['points'])
    # A global assignment, rather than a greedy nearest-neighbor, preserves identity.
    # Hungarian primal-dual assignment is independent of source ordering.
    def assignment(cost):
        n, m = cost.shape
        if n != m:
            raise ValueError('LOD component disappearance requires explicit membership fitting')
        u, v, p, way = np.zeros(n+1), np.zeros(m+1), np.zeros(m+1, dtype=int), np.zeros(m+1, dtype=int)
        for i in range(1, n+1):
            p[0], j0 = i, 0
            minimum, used = np.full(m+1, np.inf), np.zeros(m+1, dtype=bool)
            while True:
                used[j0] = True
                i0, delta, j1 = p[j0], np.inf, 0
                for j in range(1, m+1):
                    if not used[j]:
                        cur = cost[i0-1, j-1]-u[i0]-v[j]
                        if cur < minimum[j]: minimum[j], way[j] = cur, j0
                        if minimum[j] < delta: delta, j1 = minimum[j], j
                for j in range(m+1):
                    if used[j]: u[p[j]] += delta; v[j] -= delta
                    else: minimum[j] -= delta
                j0 = j1
                if p[j0] == 0: break
            while True:
                j1 = way[j0]
                p[j0] = p[j1]
                j0 = j1
                if j0 == 0: break
        result = np.zeros(n, dtype=int)
        for j in range(1, m+1): result[p[j]-1] = j-1
        return result.tolist()
    all_sources = []
    family_reports = []
    for lod, items in enumerate(source):
        ids = list(range(len(items))) if lod == 0 else assignment(np.array([
            [np.linalg.norm(a['points'].mean(axis=0)-b['points'].mean(axis=0))**2 for b in items] for a in canonical]))
        groups = {}
        for i, j in enumerate(ids):
            groups.setdefault((canonical[i]['family'], items[j]['signature']), []).append((i, j))
        mapping, sources = {}, {}
        for family, members in enumerate(groups.values()):
            clouds = []
            for i, j in members:
                offset, rotation, scale = poses[i]
                clouds.append((items[j]['points']-offset) @ rotation.T / scale)
                sources[f'foliage-{i}'] = items[j]
            item = items[members[0][1]]
            shape_id = f'surface-{lod}-{family}'
            mean_cloud = np.mean(clouds, axis=0)
            family_reports.append(dict(shapeId=shape_id, instances=len(members),
                maximumSharedShapeResidual=float(max(np.max(np.linalg.norm(c-mean_cloud,axis=1))/np.linalg.norm(np.ptp(c,axis=0)) for c in clouds))))
            # Lower LOD uses fewer curve spans, chosen from the user-specified fit complexity.
            controls = max(2, args.controls-lod)
            structure['shapes'][shape_id] = fit_surface(np.mean(clouds, axis=0), item['uv'], item['triangles'], controls)
            for i, _ in members: mapping[f'foliage-{i}'] = shape_id
        path = paths[lod][0]
        centers = np.array([engine(c)-origin for c in path['centers']])
        radii = np.array(path['radii'])
        distances = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(centers, axis=0), axis=1))])
        stations = distances/distances[-1]
        # Tube stations are anatomical cross sections, decoupled from radial tessellation.
        trunk_id = f'stem-{lod}'
        structure['shapes'][trunk_id] = dict(kind='tube', capStart=False, capEnd=bool(path['tipCap']),
            sections=[dict(at=float(t), center=c.tolist(), radius=float(r)) for t,c,r in zip(stations,centers,radii)])
        mapping['stem'] = trunk_id
        woody = API['material_faces'](objects[lod], roles[lod][0])
        vertex_ids = sorted({v for f in woody for v in f.vertices})
        lookup = {v:i for i,v in enumerate(vertex_ids)}
        sources['stem'] = dict(points=np.array([engine(objects[lod].matrix_world @ objects[lod].data.vertices[v].co)-origin for v in vertex_ids]),
            triangles=[[lookup[v] for v in tr.vertices] for tr in objects[lod].data.loop_triangles if tr.material_index == roles[lod][0]])
        if lod == 0:
            structure['parts'].append(dict(id='stem',shapeId=trunk_id,materialId='bark',parentId=None,attachment=0,offset=[0,0,0],orientation=[0,0,0,1],scale=1))
            axes = frames(centers)
            for i, (offset, rotation, scale) in poses.items():
                choices = []
                for k, (a,b) in enumerate(zip(centers[:-1],centers[1:])):
                    alpha = np.clip(np.dot(offset-a,b-a)/np.dot(b-a,b-a),0,1)
                    anchor = a+(b-a)*alpha
                    choices.append((np.linalg.norm(offset-anchor),k,float(alpha),anchor))
                _, k, alpha, anchor = min(choices, key=lambda x:x[0])
                at = float(stations[k]*(1-alpha)+stations[k+1]*alpha)
                # The preceding frame owns an exact knot, as in the runtime compiler.
                frame = axes[max(0,k-1)] if alpha == 0 and k > 0 else axes[k]
                structure['parts'].append(dict(id=f'foliage-{i}',shapeId=mapping[f'foliage-{i}'],materialId='foliage',parentId='stem',attachment=at,
                    offset=((offset-anchor)@frame).tolist(),orientation=quaternion(frame.T@rotation.T),scale=float(scale)))
        structure['lods'].append(dict(partIds=[p['id'] for p in structure['parts']],shapeIdsByPart=mapping,
            resolution=dict(subdivisionsPerSpan=1,widthSegments=2,radialSegments=int(path['radialSides']))))
        all_sources.append(sources)
    if args.tree_output:
        # Export the same fitted curves into the shared tree authoring contract.
        # This is an offline schema conversion, not a runtime species branch.
        trunk = structure['shapes']['stem-0']
        centers = np.array([s['center'] for s in trunk['sections']])
        radii = [s['radius'] for s in trunk['sections']]
        height = float(max(np.max(s['points'][:,1]) for s in all_sources[0].values()))
        stem = dict(level=0,id=0,stableId='stem',parentId=None,supportStemId=None,
                    length=float(np.linalg.norm(np.diff(centers,axis=0),axis=1).sum()),attachmentProgress=0,
                    points=centers.tolist(),radii=radii,startRadius=radii[0],endRadius=radii[-1],azimuth=0,
                    radialSegments=structure['lods'][0]['resolution']['radialSegments'],
                    axialSubdivisions=[1]*(len(centers)-1),tipCap=trunk['capEnd'])
        leaves = []
        for i, (offset, rotation, scale) in poses.items():
            part = next(p for p in structure['parts'] if p['id']==f'foliage-{i}')
            at = part['attachment']
            ts = np.array([s['at'] for s in trunk['sections']])
            attach = np.array([np.interp(at,ts,centers[:,axis]) for axis in range(3)])
            outward = rotation[2]
            bindings = [lod['shapeIdsByPart'][part['id']] for lod in structure['lods']]
            while len(bindings)<4: bindings.append(bindings[-1])
            leaves.append(dict(id=part['id'],clusterId=i,stemId=0,progress=at,isTip=False,
                attachment=offset.tolist(),stemAttachment=attach.tolist(),clusterOutward=outward.tolist(),
                right=rotation[0].tolist(),up=rotation[1].tolist(),width=float(scale*2),height=float(scale),
                variantIndex=0,tone=1,surfaceIdsByLod=bindings))
        surfaces = {shape_id: dict(shape=shape,resolution=next(lod['resolution'] for lod in structure['lods']
                    if shape_id in lod['shapeIdsByPart'].values()))
                    for shape_id,shape in structure['shapes'].items() if shape['kind']=='surface'}
        tree = dict(version=1,referenceSize=height,height=height,verticalHeight=height,
                    stems=[stem],selectionStemIds=[0],canonicalStemIds=[0],leafBearingStemIds=[0],
                    leafClusterCount=len(leaves),leaves=leaves,leafSurfaces=surfaces,
                    leafIdsByLod=[[leaf['id'] for leaf in leaves] for _ in range(4)],leafCountTargets=[len(leaves)]*4)
        if 'normalFields' in structure:
            tree['leafNormalField'] = structure['normalFields']['foliage']
        Path(args.tree_output).write_text(json.dumps(tree,indent=2)+'\n')
    process = subprocess.run(['node', args.compiler], input=json.dumps(structure), text=True, capture_output=True)
    if process.returncode:
        raise RuntimeError(process.stderr)
    generated = json.loads(process.stdout)
    reports = []
    for lod, meshes in enumerate(generated):
        parts = {m['partId']: compare(all_sources[lod][m['partId']],m) for m in meshes}
        reports.append(dict(lod=lod,parts=parts,projectionErrors=projection_errors(all_sources[lod], meshes),sourceTriangles=sum(p['sourceTriangles'] for p in parts.values()),
            generatedTriangles=sum(p['generatedTriangles'] for p in parts.values()),
            worstPartRelativeDistance=max(p['maxRelativeDistance'] for p in parts.values())))
    report = dict(source=args.source,status='candidate-unaccepted',controls=args.controls,
        sharedSurfaceCount=sum(s['kind']=='surface' for s in structure['shapes'].values()),
        foliageParts=len(canonical),lods=reports,families=family_reports,
        projectionMetric='1-IoU of orthographic front, side and top silhouettes at 256 pixels, no dilation.',
        metric='Bidirectional sampled surface distance divided by each source part bounding-box diagonal; vertices, triangle centroids and edge midpoints.',
        acceptance=dict(limit=0.05,geometryPassed=all(r['worstPartRelativeDistance'] <= .05 for r in reports),
                        projectionsPassed=all(max(r['projectionErrors'].values()) <= .05 for r in reports),
                        triangleBudgetPassed=all(r['generatedTriangles'] <= r['sourceTriangles'] for r in reports),
                        productionReady=False))
    if normal_report is not None:
        report['normalField'] = normal_report
    Path(args.output).write_text(json.dumps(structure,indent=2)+'\n')
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('lods','families')}))
    print(json.dumps([{k:v for k,v in r.items() if k!='parts'} for r in reports]))

if __name__ == '__main__': main()
