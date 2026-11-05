"""Opt-in live provider check. Requires local API configuration and consumes API usage."""
import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:4317"

async def main(mode):
    output = ROOT / "04-outputs/v12/clarity" / ("live-integration-" + mode + ".json")
    text = (ROOT / "01-inputs/test-cases/live-source.txt").read_text("utf-8")
    report = {"mode": mode, "source": "Clarity product specification (authored test document)",
              "sample": False, "startedAt": time.time()}
    async with httpx.AsyncClient(base_url=BASE, timeout=210, trust_env=False) as client:
        response = await client.post("/api/clarity/sessions", json={
            "text": text, "name": "Clarity: a focused learning product", "mode": mode, "sample": False})
        response.raise_for_status()
        sid = response.json()["id"]
        report["id"] = sid
        print(json.dumps({"session": sid, "mode": mode}), flush=True)
        previous = None
        for _ in range(500):
            response = await client.get("/api/clarity/sessions/" + sid)
            response.raise_for_status()
            session = response.json()
            states = {k: v["status"] for k, v in session["stages"].items()}
            if states != previous:
                print(json.dumps({"stages": states}), flush=True)
                previous = states
            if not session["active"]:
                break
            await asyncio.sleep(3)
        else:
            raise TimeoutError("Live integration check exceeded its observation window; session remains available.")
        report["stages"] = session["stages"]
        report["title"] = session["title"]
        report["guide"] = session.get("guide")
        report["audio"] = session.get("audio")
        if all(stage["status"] == "ready" for stage in session["stages"].values()):
            guide = await client.get("/api/clarity/sessions/" + sid + "/guide")
            assert guide.status_code == 200 and "send-prompt" in guide.text
            audio = await client.get("/api/clarity/sessions/" + sid + "/audio", headers={"Range":"bytes=0-255"})
            assert audio.status_code == 206 and len(audio.content) == 256
            question = await client.post("/api/clarity/sessions/" + sid + "/ask", json={
                "question":"Explain simply. What is the difference between generation mode and result layout?",
                "conceptId":session["guide"]["nodes"][0]["id"], "chapterIndex":0})
            question.raise_for_status()
            report["answer"] = question.json()
            report["passed"] = bool(report["answer"]["answer"].strip() and report["answer"]["sourceIds"])
        else:
            report["passed"] = False
        report["finishedAt"] = time.time()
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
        print(json.dumps({"passed":report["passed"], "id":sid, "title":session["title"],
                          "concepts":len((session.get("guide") or {}).get("nodes",[])),
                          "transcriptLines":len((session.get("audio") or {}).get("transcript",[])),
                          "sourceReferences":report.get("answer",{}).get("sourceIds",[])}),flush=True)
        return 0 if report["passed"] else 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["quick","deep"],default="quick")
    parser.add_argument("--allow-paid-api",action="store_true",help="Requires explicit user approval for final acceptance")
    args=parser.parse_args()
    if not args.allow_paid_api:
        parser.error("Paid checks are disabled during iteration. Obtain explicit final-test permission first.")
    raise SystemExit(asyncio.run(main(args.mode)))
