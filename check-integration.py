"""Local no-charge smoke check using the installed projects (no model invocation)."""
import asyncio
import json
from server import (CreateRequest, create_session, get_session, health, ensure_models,
                    TASKS, read_guide, ask, QuestionRequest, notebook)

async def main():
    report = {"health": await health()}
    models = await ensure_models()
    report["modelProfiles"] = bool(models.get("modelId") and models.get("transformationId"))
    from sample import TEXT
    for mode in ("quick", "deep"):
        created = await create_session(CreateRequest(text=TEXT, mode=mode, sample=True))
        await TASKS[created["id"]]
        value = get_session(created["id"])
        source = await notebook("GET", "/sources/" + value["notebookSourceId"])
        assert "[S2]" in source["full_text"]
        assert all(s["status"] == "ready" for s in value["stages"].values()), value["stages"]
        document = await read_guide(value["id"])
        assert b"send-prompt" in document.body and b"diagram-stage" in document.body
        answer = await ask(value["id"], QuestionRequest(question="Explain simply", conceptId=value["guide"]["nodes"][0]["id"]))
        assert answer["sourceIds"]
        report[mode] = {"id": value["id"], "sourceStoredInOpenNotebook": True,
                        "originalOIUIBridge": True, "audioDuration": value["audio"]["duration"],
                        "conceptCount": len(value["guide"]["nodes"]), "sampleAnswer": True}
    print(json.dumps(report, ensure_ascii=False, indent=2))

asyncio.run(main())
