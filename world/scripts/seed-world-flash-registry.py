"""Reserve and complete Seed World releases in the existing ASAP registry."""

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path


@asynccontextmanager
async def transaction(versions):
    from framework.db.connection import get_transaction_context

    async with get_transaction_context() as connection, await versions._get_cursor(connection) as cursor:
        if versions._use_sqlite:
            await versions._execute_query(cursor, "BEGIN IMMEDIATE")
        yield cursor


async def reserve(artifacts, versions, request):
    from framework.db.models.artifact_model import ArtifactModel

    artifact_id = request["artifactId"]
    artifact_type = {"game": "1", "miniapp": "2"}[request["type"]]
    title = request["title"]
    release_id = request["releaseId"]
    if not await artifacts.get_by_artifact_id(artifact_id):
        if request["reuseExisting"]:
            return {"error": "The existing Artifact is missing from the ASAP registry"}
        try:
            await artifacts.create_artifact(ArtifactModel(
                artifact_id=artifact_id, artifact_name=title, description="",
                template_id=None, artifact_type=artifact_type,
            ))
        except Exception:
            if not await artifacts.get_by_artifact_id(artifact_id):
                raise

    lock = "" if versions._use_sqlite else " FOR UPDATE"
    async with transaction(versions) as cursor:
        await versions._execute_query(cursor,
            "SELECT artifact_type FROM artifacts WHERE artifact_id = %s AND is_deleted = 0" + lock,
            (artifact_id,),
        )
        artifact = await cursor.fetchone()
        if not artifact or artifact["artifact_type"] != artifact_type:
            return {"error": "Artifact type differs from the ASAP registry"}

        release_key = "JSON_EXTRACT(CASE WHEN JSON_VALID(ext) THEN ext END, '$.seed_world_release_id')"
        if not versions._use_sqlite:
            release_key = f"JSON_UNQUOTE({release_key})"
        await versions._execute_query(cursor,
            "SELECT version_number, is_deleted, ext FROM artifact_versions WHERE artifact_id = %s AND "
            + release_key + " = %s" + lock, (artifact_id, release_id),
        )
        existing = await cursor.fetchone()
        if existing:
            if existing["is_deleted"] or json.loads(existing["ext"]).get("app_name") != title:
                return {"error": "Release ID already belongs to a different or deleted release"}
            return {"version": str(existing["version_number"])}

        number_type, text_type = ("INTEGER", "TEXT") if versions._use_sqlite else ("UNSIGNED", "CHAR")
        metadata = json.dumps({"seed_world_release_id": release_id, "app_name": title}, ensure_ascii=False)
        # Count pending and deleted versions because their numbers can already own OSS keys.
        await versions._execute_query(cursor, f"""
            INSERT INTO artifact_versions
                (artifact_id, version_number, gmt_create, gmt_modified, is_deleted, status, ext)
            SELECT %s, CAST(COALESCE(MAX(CAST(version_number AS {number_type})), 0) + 1 AS {text_type}),
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 1, %s
            FROM artifact_versions WHERE artifact_id = %s
        """, (artifact_id, metadata, artifact_id))
        await versions._execute_query(cursor,
            "SELECT version_number FROM artifact_versions WHERE id = %s", (cursor.lastrowid,),
        )
        return {"version": str((await cursor.fetchone())["version_number"])}


async def publish(versions, request):
    artifact_id = request["artifactId"]
    number = request["version"]
    backup = request["backupOss"]
    entry = request["entryUrl"]
    expected_backup = f"leopard/sandbox/workspace/{artifact_id}-{number}/backup_{number}.tar.gz"
    if backup != expected_backup or not entry:
        return {"error": "Release URLs do not match the reserved version"}

    lock = "" if versions._use_sqlite else " FOR UPDATE"
    async with transaction(versions) as cursor:
        await versions._execute_query(cursor, """
            SELECT id, status, ext, content_snapshot_url, release_output_url
            FROM artifact_versions WHERE artifact_id = %s AND version_number = %s AND is_deleted = 0
        """ + lock, (artifact_id, number))
        row = await cursor.fetchone()
        if not row or json.loads(row["ext"] or "{}").get("seed_world_release_id") != request["releaseId"]:
            return {"error": "Release ID does not match the reserved version"}
        if row["status"] == 0 and row["content_snapshot_url"] == backup and row["release_output_url"] == entry:
            return {"version": number}
        if row["status"] != 1 or row["content_snapshot_url"] or row["release_output_url"]:
            return {"error": "The reserved version already has a different outcome"}
        await versions._execute_query(cursor, """
            UPDATE artifact_versions SET status = 0, content_snapshot_url = %s,
                release_output_url = %s, gmt_modified = CURRENT_TIMESTAMP WHERE id = %s
        """, (backup, entry, row["id"]))
        return {"version": number}


async def execute(request):
    from framework.dao.artifact_dao import ArtifactDAO
    from framework.dao.artifact_version_dao import ArtifactVersionDAO

    versions = ArtifactVersionDAO()
    operation = request["operation"]
    if operation == "verify":
        version = await versions.get_by_artifact_and_version(request["artifactId"], request["version"])
        return {"matches": bool(version and version.status == 0 and version.release_output_url == request["entryUrl"])}
    if operation == "reserve":
        return await reserve(ArtifactDAO(), versions, request)
    if operation == "publish":
        return await publish(versions, request)
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
        # Drivers can include connection details in raw error text.
        result = {"error": f"{type(exc).__name__}: check ASAP registry access and configuration", "retryable": True}
    print("SEED_WORLD_REGISTRY " + json.dumps(result, ensure_ascii=False))
