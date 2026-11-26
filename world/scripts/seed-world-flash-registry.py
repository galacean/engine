"""Use the ASAP registry's version allocator before packaging a Seed World release."""

import asyncio
import json
import sys
from pathlib import Path


async def execute(request):
    from framework.dao.artifact_dao import ArtifactDAO
    from framework.dao.artifact_version_dao import ArtifactVersionDAO
    from framework.db.models.artifact_model import ArtifactModel

    artifacts = ArtifactDAO()
    versions = ArtifactVersionDAO()
    artifact_id = request["artifactId"]
    operation = request["operation"]

    if operation == "verify":
        version = await versions.get_by_artifact_and_version(artifact_id, request["version"])
        return {"matches": bool(version and version.status == 0 and version.release_output_url == request["entryUrl"])}

    if operation == "reserve":
        artifact_type = {"game": "1", "miniapp": "2"}[request["type"]]
        artifact = await artifacts.get_by_artifact_id(artifact_id)
        if not artifact:
            if request["reuseExisting"]:
                return {"error": "The existing Artifact is missing from the ASAP registry"}
            try:
                await artifacts.create_artifact(ArtifactModel(
                    artifact_id=artifact_id, artifact_name=request["title"], description="",
                    template_id=None, artifact_type=artifact_type, ext=None,
                ))
            except Exception:
                # Another publisher may have created the Artifact while we were looking it up.
                artifact = await artifacts.get_by_artifact_id(artifact_id)
                if not artifact:
                    raise
        if artifact and artifact.artifact_type != artifact_type:
            return {"error": "Artifact type differs from the ASAP registry"}
        _, version = await versions.create_version_atomic(artifact_id=artifact_id)
        return {"version": version}

    if operation == "publish":
        number = request["version"]
        version = await versions.get_by_artifact_and_version(artifact_id, number)
        if not version or version.status != 1 or version.release_output_url or version.content_snapshot_url:
            return {"error": "The reserved ASAP version is unavailable"}
        updated = await versions.update_version(artifact_id, number, {
            "status": 0,
            "release_output_url": request["entryUrl"],
            "content_snapshot_url": request["backupOss"],
            "ext": json.dumps({"app_name": request["title"]}, ensure_ascii=False),
        })
        return {"version": number} if updated else {"error": "ASAP did not publish the reserved version"}

    raise ValueError("Unknown registry operation")


async def run(request):
    from framework.db.connection import get_db_manager

    manager = await get_db_manager()
    try:
        return await execute(request)
    finally:
        await manager.close()


if __name__ == "__main__":
    sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
    try:
        result = asyncio.run(run(json.load(sys.stdin)))
    except Exception as exc:
        # Drivers may include connection details in their error text.
        result = {"error": f"{type(exc).__name__}: check ASAP registry access and configuration"}
    print("SEED_WORLD_REGISTRY " + json.dumps(result, ensure_ascii=False))
