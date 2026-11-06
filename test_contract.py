"""Contracts for generation, partial recovery, grounded questions and safe rendering.

Provider responses are intercepted. No model API requests or charges are made.
The renderer, FastAPI routes, persistence and audio byte-range responses are real.
"""
import asyncio
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import server
import sample
from guide import validate_guide, assemble

ORIGINAL_CLIENT = httpx.AsyncClient

class GenerationContract(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.calls = []
        self.invalid_guide = False
        self.job_failed = False
        self.quota_exhausted = False
        self.source_text = sample.TEXT + "\n\nA separate learner's annotation."
        self.patches = [
            patch.object(server, "DATA", Path(self.temp.name)),
            patch.object(server, "SESSIONS", {}),
            patch.object(server, "TASKS", {}),
            patch.object(server, "LOCKS", {}),
            patch.object(server, "configuration", return_value={"OPENAI_API_KEY": "contract-placeholder", "CLARITY_ALLOW_PAID_API_CALLS":"true"}),
            patch.object(server, "ensure_models", AsyncMock(return_value={"modelId":"model:text","transformationId":"transformation:guide"})),
        ]
        for item in self.patches:
            item.start()
        self.provider = httpx.MockTransport(self.upstream)
        self.patches.append(patch.object(server.httpx, "AsyncClient", side_effect=lambda **kwargs: ORIGINAL_CLIENT(transport=self.provider, **kwargs)))
        self.patches[-1].start()
        self.client = ORIGINAL_CLIENT(transport=httpx.ASGITransport(app=server.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await asyncio.gather(*server.TASKS.values(), return_exceptions=True)
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def upstream(self, request):
        payload = json.loads(request.content) if request.content else None
        self.calls.append((request.method, request.url.path, payload))
        path = request.url.path
        if path == "/api/sources/json":
            return httpx.Response(200,json={"id":"source:contract"})
        if path == "/api/transformations/execute":
            if self.quota_exhausted:
                return httpx.Response(429, json={"detail":"Provider credits exhausted"})
            value = sample.guide("quick")
            value["visual"] = {"type": "mechanism", "focus": "c3", "links": [
                {"from": "c1", "to": "c3", "verb": "powers", "effect": "Pedaling drives the system."},
                {"from": "c2", "to": "c3", "verb": "transfers", "effect": "The chain transfers force."},
                {"from": "c4", "to": "c3", "verb": "selects", "effect": "The derailleur changes gears."},
                {"from": "c3", "to": "c5", "verb": "turns", "effect": "The drivetrain turns the wheel."},
                {"from": "c6", "to": "c3", "verb": "slows", "effect": "Braking resists wheel rotation."},
            ]}
            if self.invalid_guide:
                value["nodes"][0]["sourceIds"]=["S999"]
            return httpx.Response(200,json={"output":json.dumps(value)})
        if path == "/api/podcasts/generate":
            return httpx.Response(200,json={"job_id":"command:contract","status":"queued"})
        if path == "/api/podcasts/jobs/command:contract":
            return httpx.Response(200,json={"status":"failed" if self.job_failed else "completed","result":{"success":True,"episode_id":"episode:contract"}})
        if path == "/api/podcasts/episodes/episode:contract":
            return httpx.Response(200,json={"id":"episode:contract","transcript":{"transcript":{"transcript":[{"speaker":"Alex","dialogue":"A source-grounded explanation."}]}}})
        if path == "/api/podcasts/episodes/episode:contract/audio":
            return httpx.Response(200,content=(server.WEB/"assets/sample-quick.mp3").read_bytes(),headers={"Content-Type":"audio/mpeg"})
        if path == "/api/sources/source:contract/chat/sessions":
            return httpx.Response(200,json={"id":"chat:contract"})
        if path == "/api/sources/source:contract/chat/sessions/chat:contract/messages":
            data = 'data: ' + json.dumps({"type":"ai_message","content":"The source suggests explaining it in your own words. [S2] Invalid reference [S999] is not exposed as a source button."}) + "\n\n"
            return httpx.Response(200,content=data.encode(),headers={"Content-Type":"text/event-stream"})
        raise AssertionError("Unexpected upstream route: " + path)

    async def new(self):
        response=await self.client.post("/api/clarity/sessions",json={"text":self.source_text,"name":"Independent source","mode":"quick"})
        self.assertEqual(response.status_code,202,response.text)
        sid=response.json()["id"]
        await server.TASKS[sid]
        return sid,(await self.client.get("/api/clarity/sessions/"+sid)).json()

    async def test_uploaded_source_reaches_both_real_service_contracts(self):
        sid,value=await self.new()
        self.assertTrue(all(stage["status"]=="ready" for stage in value["stages"].values()))
        self.assertFalse(value["sample"])
        source=next(p for _,path,p in self.calls if path=="/api/sources/json")
        annotation_id = server.split_passages(self.source_text)[-1]["id"]
        self.assertIn(f"[{annotation_id}] A separate",source["content"])
        generation=next(p for _,path,p in self.calls if path=="/api/podcasts/generate")
        self.assertEqual(generation["content"],self.source_text)
        self.assertEqual(generation["speaker_profile"],"clarity_guide")
        self.assertIn("chapter topics",generation["briefing_suffix"])
        guide=await self.client.get("/api/clarity/sessions/"+sid+"/guide")
        self.assertIn("send-prompt",guide.text)
        self.assertEqual(value["audio"]["transcript"][0]["speaker"],"Alex")
        self.assertTrue(value["audio"]["approximateCues"])
        self.assertNotIn("audioFile",value)
        audio=await self.client.get("/api/clarity/sessions/"+sid+"/audio",headers={"Range":"bytes=10-29"})
        self.assertEqual(audio.status_code,206)
        self.assertEqual(len(audio.content),20)

    async def test_invalid_source_reference_leaves_audio_available_then_selective_retry(self):
        self.invalid_guide=True
        sid,value=await self.new()
        self.assertEqual(value["stages"]["guide"]["status"],"error")
        self.assertEqual(value["stages"]["audio"]["status"],"ready")
        self.assertFalse(value["active"])
        self.invalid_guide=False
        response=await self.client.post("/api/clarity/sessions/"+sid+"/retry",json={"part":"guide"})
        self.assertEqual(response.status_code,202)
        await server.TASKS[sid]
        self.assertEqual(server.get_session(sid)["stages"]["guide"]["status"],"ready")
        self.assertEqual(server.get_session(sid)["audio"]["cueFractions"], [0, 1/3, 2/3])
        self.assertEqual(sum(path=="/api/podcasts/generate" for _,path,_ in self.calls),1)
        self.assertEqual(sum(path=="/api/sources/json" for _,path,_ in self.calls),1)

    async def test_podcast_failure_keeps_guide_and_source(self):
        self.job_failed=True
        sid,value=await self.new()
        self.assertEqual(value["stages"]["guide"]["status"],"ready")
        self.assertEqual(value["stages"]["audio"]["status"],"error")
        self.assertEqual(value["sourceName"],"Independent source")
        self.assertEqual((await self.client.get("/api/clarity/sessions/"+sid+"/guide")).status_code,200)

    async def test_exhausted_provider_does_not_queue_another_audio_job(self):
        self.quota_exhausted=True
        sid,value=await self.new()
        self.assertEqual(value["stages"]["guide"]["error"],"model_limit")
        self.assertEqual(value["stages"]["audio"]["error"],"model_limit")
        self.assertFalse(any(path=="/api/podcasts/generate" for _,path,_ in self.calls))

    async def test_follow_up_uses_source_chat_and_filters_foreign_passages(self):
        sid,value=await self.new()
        answer=await self.client.post("/api/clarity/sessions/"+sid+"/ask",json={"question":"Explain simply","conceptId":"c2","chapterIndex":0})
        self.assertEqual(answer.status_code,200,answer.text)
        self.assertEqual(answer.json()["sourceIds"],["S2"])
        message=next(p for _,path,p in self.calls if path.endswith("/messages"))["message"]
        self.assertIn("About: " + next(n["label"] for n in value["guide"]["nodes"] if n["id"] == "c2"),message)
        self.assertIn("Explain simply",message)
        self.assertEqual(len(server.get_session(sid)["questions"]),1)
        bad=await self.client.post("/api/clarity/sessions/"+sid+"/ask",json={"question":"Explain","conceptId":"foreign-node"})
        self.assertEqual(bad.status_code,422)

    async def test_sample_cannot_replace_an_arbitrary_upload(self):
        response=await self.client.post("/api/clarity/sessions",json={"text":"Different document","sample":True})
        self.assertEqual(response.status_code,422)
        self.assertEqual(self.calls,[])

    async def test_sample_greeting_is_local_and_custom_question_uses_source_chat(self):
        response = await self.client.post("/api/clarity/sessions", json={"text":sample.TEXT})
        sid = response.json()["id"]
        await server.TASKS[sid]
        route = "/api/clarity/sessions/" + sid + "/ask"
        self.calls.clear()
        greeting = await self.client.post(route, json={"question":"嗨！"})
        self.assertEqual(greeting.status_code, 200)
        self.assertTrue(greeting.json()["answer"].startswith("嗨！"))
        self.assertEqual(self.calls, [])
        question = "后飞轮为什么需要不同大小的齿片？"
        result = await self.client.post(route, json={"question":question})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()["sample"])
        message = next(p["message"] for _, path, p in self.calls if path.endswith("/messages"))
        self.assertIn(question, message)

    async def test_missing_api_is_reported_before_a_billable_job(self):
        with patch.object(server,"configuration",return_value={"OPENAI_API_KEY":""}):
            response=await self.client.post("/api/clarity/sessions",json={"text":"Real new text"})
        self.assertEqual(response.status_code,422)
        self.assertEqual(response.json()["detail"]["code"],"model_not_configured")
        self.assertEqual(self.calls,[])

    async def test_iteration_mode_blocks_paid_create_retry_and_follow_up(self):
        sid,value=await self.new()
        self.calls.clear()
        with patch.object(server,"configuration",return_value={"DEEPSEEK_API_KEY":"contract-placeholder","CLARITY_TEXT_PROVIDER":"deepseek","CLARITY_ALLOW_PAID_API_CALLS":"false"}):
            requests = [
                ("/api/clarity/sessions", {"text":"A new source"}),
                ("/api/clarity/sessions/"+sid+"/retry", {"part":"all"}),
                ("/api/clarity/sessions/"+sid+"/ask", {"question":"Explain simply"})]
            for url,body in requests:
                response=await self.client.post(url,json=body)
                self.assertEqual(response.status_code,403)
                self.assertEqual(response.json()["detail"]["code"],"live_generation_paused")
        self.assertEqual(self.calls,[])

    async def test_source_text_is_escaped_in_original_renderer(self):
        value=sample.guide("quick")
        value["nodes"][0]["label"]='<img src=x onerror=alert(1)>'
        document=await assemble(value)
        self.assertIn("&lt;img",document)
        self.assertNotIn("<img src=x",document)

    async def test_local_worker_rejects_all_model_and_external_source_jobs(self):
        from local_worker import local_text_only
        data={"content_state":{"content":"A local sample"},"embed":False,"transformations":[]}
        self.assertTrue(local_text_only("open_notebook.process_source",data))
        self.assertFalse(local_text_only("open_notebook.generate_podcast",data))
        self.assertFalse(local_text_only("open_notebook.run_transformation",data))
        self.assertFalse(local_text_only("open_notebook.process_source",{**data,"embed":True}))
        self.assertFalse(local_text_only("open_notebook.process_source",{**data,"transformations":["model-job"]}))
        self.assertFalse(local_text_only("open_notebook.process_source",{**data,"content_state":{"url":"https://example.com"}}))
        self.assertFalse(local_text_only("open_notebook.process_source",{**data,"content_state":{"content":" "}}))

    async def test_invalid_session_paths_and_empty_content_are_rejected(self):
        response=await self.client.get("/api/clarity/sessions/invalid-path")
        self.assertEqual(response.status_code,404)
        response=await self.client.post("/api/clarity/sessions",json={"text":"   "})
        self.assertEqual(response.status_code,422)

if __name__=="__main__":
    unittest.main(verbosity=2)
