"""Source-grounded templates rendered by the original Open Intelligent UI assembler."""
import asyncio
import html
import json
from pathlib import Path
from pydantic import BaseModel, Field

APP = Path(__file__).resolve().parent

class Concept(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,30}$")
    label: str = Field(min_length=1, max_length=64)
    explanation: str = Field(min_length=1, max_length=1500)
    example: str = Field(default="", max_length=1500)
    sourceIds: list[str] = Field(min_length=1, max_length=12)
    chapterIndex: int = Field(ge=0, le=12)

class Chapter(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(max_length=1000)
    nodeIds: list[str]
    sourceIds: list[str] = Field(min_length=1)

class Guide(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1500)
    diagramType: str = Field(pattern=r"^(flow|relationship|comparison)$")
    nodes: list[Concept] = Field(min_length=2, max_length=6)
    edges: list[dict[str, str]] = Field(max_length=12)
    chapters: list[Chapter] = Field(min_length=1, max_length=6)
    takeaways: list[str] = Field(min_length=1, max_length=5)

def validate_guide(value: dict, passages: list[dict]) -> dict:
    guide = Guide.model_validate(value)
    node_ids = {n.id for n in guide.nodes}
    source_ids = {p["id"] for p in passages}
    if len(node_ids) != len(guide.nodes):
        raise ValueError("Duplicate concept identifiers")
    for node in guide.nodes:
        if not set(node.sourceIds) <= source_ids or node.chapterIndex >= len(guide.chapters):
            raise ValueError("The guide contains an invalid source reference")
    for chapter in guide.chapters:
        if not set(chapter.sourceIds) <= source_ids or not set(chapter.nodeIds) <= node_ids:
            raise ValueError("The guide contains an invalid chapter reference")
    for edge in guide.edges:
        if edge.get("from") not in node_ids or edge.get("to") not in node_ids:
            raise ValueError("The guide contains an invalid connection")
    return guide.model_dump()

def fragment(guide: dict) -> str:
    esc = html.escape
    count = len(guide["nodes"])
    positions = [(17, 29), (50, 29), (83, 29), (83, 74), (50, 74), (17, 74)]
    if guide["diagramType"] == "relationship":
        positions = [(50, 49), (20, 24), (80, 24), (80, 76), (20, 76), (50, 12)]
    elif guide["diagramType"] == "comparison":
        positions = [(28, 20), (72, 20), (28, 48), (72, 48), (28, 76), (72, 76)]
    elif count <= 3:
        positions = [(18, 50), (50, 50), (82, 50)]
    coords = {node["id"]: positions[i] for i, node in enumerate(guide["nodes"])}
    lines = []
    for edge in guide["edges"]:
        x1, y1 = coords[edge["from"]]; x2, y2 = coords[edge["to"]]
        lines.append(f'<path d="M{x1*6.8} {y1*4.2} C{(x1+x2)*3.4} {y1*4.2} {(x1+x2)*3.4} {y2*4.2} {x2*6.8} {y2*4.2}" marker-end="url(#arr)"/>')
        label = edge.get("label", "").strip()[:36]
        if label:
            lines.append(f'<text x="{(x1+x2)*3.4}" y="{(y1+y2)*2.1-9}" text-anchor="middle" fill="#6354a5" font-size="9">{esc(label)}</text>')
    nodes = "".join(
        f'<button class="concept" data-id="{esc(node["id"])}" style="left:{positions[i][0]}%;top:{positions[i][1]}%" aria-pressed="false">'
        f'<span class="orb"><span>{i+1:02}</span></span><strong>{esc(node["label"])}</strong></button>'
        for i, node in enumerate(guide["nodes"])
    )
    return """<style>
:root{--color-text-primary:#292630;--color-text-secondary:#716b7b;--color-background-primary:transparent;--color-background-secondary:#edeaf5;--color-border-tertiary:#dedbe5}
html,body{margin:0;padding:0;background:transparent!important;font-family:Inter,Arial,sans-serif;color:#292630}
#content{padding:0!important;overflow:hidden}*{box-sizing:border-box}
.canvas{position:relative;height:100dvh;min-height:260px;overflow:hidden;background:radial-gradient(#9e90b928 .8px,transparent .8px) 0 0/19px 19px;border-radius:14px}
.stage{position:relative;width:100%;height:100%;transform-origin:50% 50%;transition:transform .2s}
.connections{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.connections path{fill:none;stroke:#b1a5cf;stroke-width:1.2}
.concept{position:absolute;transform:translate(-50%,-34px);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;width:28%;max-width:172px;min-height:98px;padding:8px 3px;border:0;background:transparent;cursor:pointer;color:#4a3f6b;font:inherit}
.concept:hover{background:transparent}.concept:active{transform:translate(-50%,-34px) scale(.97)}
.orb{display:grid;place-items:center;width:52px;height:52px;border:1px solid #bcb2d2;border-radius:50%;background:#edeaf5;box-shadow:0 0 0 9px #edeaf573;transition:box-shadow .2s,background .2s}
.orb span{font:11px ui-monospace,monospace;letter-spacing:.03em}.concept strong{font-size:13px;font-weight:500;line-height:1.4;max-width:165px}
.concept[aria-pressed=true] .orb{color:white;background:#6354a5;border-color:#6354a5;box-shadow:0 0 0 9px #6354a510,0 0 0 10px #6354a525}
.concept[aria-pressed=true] strong{color:#514087}.concept:focus-visible{outline:2px solid #6354a5;outline-offset:3px;border-radius:16px}
@media(max-width:460px){.concept{width:31%;gap:13px;transform:translate(-50%,-29px)}.concept:active{transform:translate(-50%,-29px) scale(.97)}.orb{width:42px;height:42px;box-shadow:0 0 0 6px #edeaf573}.concept strong{font-size:12px;line-height:1.5}.connections path{stroke-width:1.5}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style><div class="canvas"><div class="stage" id="diagram-stage"><svg class="connections" viewBox="0 0 680 420" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="arr" markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto"><path d="M1 1 5 3.5 1 6" style="stroke:#a699c5;fill:none"/></marker></defs>""" + "".join(lines) + "</svg>" + nodes + """</div></div><script>
function selectConcept(id){document.querySelectorAll('.concept').forEach(function(el){el.setAttribute('aria-pressed',String(el.dataset.id===id))})}
document.querySelectorAll('.concept').forEach(function(el){el.addEventListener('click',function(){selectConcept(el.dataset.id);window.sendPrompt(JSON.stringify({action:'concept',id:el.dataset.id}))})});
document.addEventListener('keydown',function(event){if(event.key==='Escape')window.parent.postMessage({type:'clarity:escape'},'*')});
window.addEventListener('message',function(event){if(event.source!==window.parent)return;var d=event.data;if(!d||typeof d!=='object')return;if(d.type==='clarity:select')selectConcept(d.id);if(d.type==='clarity:zoom'&&Number.isFinite(d.zoom)){document.getElementById('diagram-stage').style.transform='scale('+Math.max(.7,Math.min(1.6,d.zoom))+')'}});
</script>"""

async def assemble(guide: dict, *, authored_fragment: str | None = None) -> str:
    process = await asyncio.create_subprocess_exec(
        "node", str(APP / "assemble-guide.mjs"),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=str(APP),
    )
    try:
        output, error = await asyncio.wait_for(process.communicate(json.dumps({"html": authored_fragment if authored_fragment is not None else fragment(guide)}).encode()), 25)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise RuntimeError("The visual renderer timed out") from None
    if process.returncode:
        raise RuntimeError("The visual renderer could not prepare the guide")
    return output.decode("utf-8")
