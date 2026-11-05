"""Reviewed, source-linked exhibits. Never a fallback for unrelated uploaded content."""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import sample

APP = Path(__file__).resolve().parent
FILES = APP / 'web/examples'
TRANSLATIONS = {}
def tr(en, zh):
    TRANSLATIONS[en] = zh
    return en

BOOK_TITLE = tr('Flatland: beyond the visible', '平面国：越过可见的边界')
PAPER_TITLE = tr('Boids: order without a leader', 'Boids：没有领袖的秩序')
BOOK_SECTIONS = [
 ('The nature of Flatland','平面国的本质'),('Climate and houses','气候与房屋'),('The inhabitants','居民'),('Women','女性'),('Recognizing one another','如何辨认彼此'),('Recognition by sight','通过视觉辨认'),('Irregular figures','不规则图形'),('The practice of painting','涂色的习俗'),('The Universal Colour Bill','普遍色彩法案'),('The Chromatic Sedition','色彩叛乱'),('The priests','祭司'),('The doctrine of the priests','祭司的教义'),('A vision of Lineland','线国之梦'),('Explaining Flatland','解释平面国'),('A stranger from Spaceland','来自空间国的陌生人'),('Words fail','语言的失败'),('The Sphere demonstrates','球体的演示'),('Entering Spaceland','进入空间国'),('Asking for more dimensions','追问更高维度'),('A vision of Pointland','点国之梦'),('Teaching the grandson','教导孙子'),('Returning with a new truth','带着新知归来')]
for en,zh in BOOK_SECTIONS: tr(en,zh)

def chunks(text, **metadata):
    result=[]
    for paragraph in re.split(r'\n\s*\n',text.strip()):
        paragraph=paragraph.strip()
        if not paragraph: continue
        while len(paragraph)>1500:
            cut=paragraph.rfind(' ',0,1500)
            if cut<800: cut=1500
            result.append({'text':paragraph[:cut],**metadata});paragraph=paragraph[cut:].strip()
        if paragraph: result.append({'text':paragraph,**metadata})
    return result

@lru_cache
def reading(key):
    if key=='bicycle': return sample.TEXT
    if key=='flatland': return (FILES/'flatland.txt').read_text('utf-8-sig').strip()
    if key=='boids': return json.loads((FILES/'boids-text.json').read_text('utf-8'))['text']
    raise KeyError(key)

def normalized(text):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',text)).casefold()
def text_hash(text): return hashlib.sha256(normalized(text).encode()).hexdigest()

@lru_cache
def passages(key):
    if key=='flatland':
        text=reading(key)
        headings=list(re.finditer(r'§\s+(\d+)\.',text))
        end=text.find('*** END OF THE PROJECT GUTENBERG')
        result=[]
        for i,m in enumerate(headings):
            number=int(m.group(1));stop=headings[i+1].start() if i+1<len(headings) else end
            result.extend(chunks(text[m.start():stop],section=number,heading=BOOK_SECTIONS[number-1][0]))
    elif key=='boids':
        result=[]
        for i,page in enumerate(json.loads((FILES/'boids-text.json').read_text('utf-8'))['pages']):
            result.extend(chunks(page,page=i+1))
    else: result=chunks(reading(key))
    return [dict(id=f'S{i+1}',**p) for i,p in enumerate(result)]

def refs(key, *, sections=(), pages=(), phrase=None):
    matches=[p for p in passages(key) if (not sections or p.get('section') in sections) and (not pages or p.get('page') in pages)]
    if phrase:
        picked=[p for p in matches if phrase.casefold() in p['text'].casefold()]
        if picked: matches=picked
    return [p['id'] for p in matches[:5]]

def node(id,label,zh,explain,explain_zh,example,example_zh,source,chapter):
    return dict(id=id,label=tr(label,zh),explanation=tr(explain,explain_zh),example=tr(example,example_zh),sourceIds=source,chapterIndex=chapter)

def book_guide():
    nodes=[
      node('f1','A view is not the whole','视角并非全貌',
        'Flatlanders live in a plane. Our overhead diagram shows shapes, but a resident at eye level sees edges as lines. A limited observation can hide a larger structure.',
        '居民生活在平面内。我们俯视能看到图形，但居民在平面内只能看到呈线状的边缘。有限的观察，可能隐藏着更大的结构。',
        'Compare the overhead section with the eye-level line. These are different views of the same world.','对照俯视截面与平视线段：同一个世界，视角不同，所见也不同。',refs('flatland',sections=[1],phrase='straight Lines'),0),
      node('f2','Shape becomes social rank','形状成为社会等级',
        'The fictional society ranks inhabitants by shape and regulates irregularity. Geometry becomes a language for class, gender and authority. This is a satire of social hierarchy, not a rule we endorse.',
        '书中的虚构社会按形状划分等级，并管制不规则图形。几何成为阶级、性别与权威的隐喻。这是对等级制度的讽刺，而非值得认同的规则。',
        'Read sections 3–4 alongside sections 7 and 11–12: who gets to define what is normal?','结合第 3–4、7、11–12 节思考：谁有权定义什么是“正常”？',refs('flatland',sections=[3,7,11]),1),
      node('f3','The same blind spot','相同的盲区',
        'In Lineland, the Square struggles to explain a second dimension to a one-dimensional king. Later the Square repeats that resistance when a Sphere describes a third dimension.',
        '在一维的线国，正方形难以向国王解释第二个维度。后来，球体描述第三个维度时，正方形却表现出同样的抗拒。',
        'Select the 1D view, then 2D. What would be impossible to infer from the line alone?','切换一维与二维视图：只靠一条线，哪些信息无从得知？',refs('flatland',sections=[13,14]),2),
      node('f4','A sphere appears as a circle','球体显现为圆',
        'As a sphere crosses the plane, its intersection changes from nothing to a point, a growing circle, a shrinking circle, then nothing. The sphere itself never changes size.',
        '球体穿过平面时，交集从无到一点，再到逐渐变大、变小的圆，最后消失。球体本身的大小始终没有改变。',
        'For a unit sphere, section radius r = √(1 − h²) when |h| ≤ 1. Move the height slider.','单位球在 |h| ≤ 1 时，截面半径 r = √(1 − h²)。拖动高度滑块观察。',refs('flatland',sections=[17]),3),
      node('f5','Step outside the frame','跳出原有框架',
        'The Sphere lifts the Square out of the plane. The new viewpoint reveals interiors and relationships that were hidden. The Square then wonders whether a fourth dimension could exist.',
        '球体将正方形带离平面。新的视角揭示了过去隐藏的内部与关系。正方形因此进一步追问：是否还存在第四个维度？',
        'Orbit the 3D scene. Seeing a higher-dimensional analogy is not a mathematical proof of a fourth spatial dimension.','旋转三维场景。高维的类比能启发想象，但不构成第四个空间维度的数学证明。',refs('flatland',sections=[18,19]),4),
      node('f6','New knowledge meets power','新知遭遇权力',
        'Back in Flatland, the Square cannot convince his society. The ending ties the limits of perception to the institutions that police acceptable knowledge.',
        '回到平面国后，正方形无法说服社会。结尾把感知的局限与管制知识的制度联系在一起。',
        'Return to the beginning: is the central obstacle a missing viewpoint, a missing language, or a refusal to listen?','回看开篇：真正的障碍是缺少视角、缺少语言，还是拒绝倾听？',refs('flatland',sections=[21,22]),5)]
    summaries=[('Perception & the plane','感知与平面'),('Geometry & power','几何与权力'),('The mirror of Lineland','线国的镜像'),('The crossing sphere','穿越平面的球体'),('A larger perspective','更大的视角'),('The cost of knowing','知晓的代价')]
    chapters=[dict(title=tr(en,zh),summary=n['label'],nodeIds=[n['id']],sourceIds=n['sourceIds']) for n,(en,zh) in zip(nodes,summaries)]
    return dict(title=BOOK_TITLE,summary=tr('One book. Two worlds. A change of perspective.','一本书，两个世界，一次视角的转变。'),diagramType='relationship',nodes=nodes,edges=[{'from':nodes[i]['id'],'to':nodes[i+1]['id'],'label':'leads to'} for i in range(5)],chapters=chapters,takeaways=[tr('A section is evidence of an object, not the whole object.','截面提供物体的证据，却不是物体的全貌。'),tr('The book connects limited perception with social authority.','这本书将有限感知与社会权威联系起来。'),tr('A new viewpoint can reveal what more detail within the old one cannot.','新的视角，能揭示旧视角里再多细节也无法呈现的东西。')])

def paper_guide():
    nodes=[
      node('b1','Separation','分离','Steer away from nearby agents to avoid crowding. The request depends on local positions; it does not require a leader.','根据邻近个体的位置转向，避免过度拥挤。这项行为不需要领袖。','Turn separation off and compare close encounters with the same initial seed.','关闭分离，使用同一个初始种子，对比近距离相遇的情况。',refs('boids',pages=[6,7],phrase='collision'),0),
      node('b2','Alignment','对齐','Steer toward the average velocity of perceived neighbors. Nearby agents gradually coordinate their direction of travel.','朝感知范围内邻居的平均速度调整方向，邻近个体由此逐渐协调前进方向。','Turn alignment off. Agents may stay near one another without sharing a heading.','关闭对齐：个体可能彼此接近，却不朝同一个方向。',refs('boids',pages=[6,8],phrase='velocity matching'),1),
      node('b3','Cohesion','聚合','Steer toward the center of nearby agents. This keeps a local group together; it does not pull everyone toward one global center.','朝邻近个体的局部中心调整方向，维持群体联系；并非将所有个体拉向全局中心。','Turn cohesion off and compare how the flock spreads out over time.','关闭聚合，对比群体随时间扩散的方式。',refs('boids',pages=[6,8],phrase='flock centering'),2),
      node('b4','Local perception','局部感知','An agent responds only to nearby agents within its perception volume. The original paper also discusses a forward-biased field of view.','每个个体只响应自身感知范围内的邻居。原论文还讨论了偏向前方的视野。','Inspect an agent. The halo marks its distance radius; highlighted links show neighbors inside its 270° field of view.','观察一个个体：光环表示感知距离，高亮连线表示其 270° 视野内的邻居。',refs('boids',pages=[8]),3),
      node('b5','Emergent flocking','涌现的群集','Repeated local steering decisions produce group-level patterns. No agent has access to the whole flock or a scripted path.','反复的局部转向决策形成群体模式。没有任何个体掌握全局，也没有预先编排的轨迹。','Reset the same seed and change one rule. Compare behavior over time, not a single frame.','重置同一初始种子，只改一条规则。比较一段时间内的行为，而非单帧截图。',refs('boids',pages=[1,3]),4),
      node('b6','What this model leaves out','模型省略了什么','This teaching model uses weighted steering, fixed timesteps and a wrapping volume. The paper includes richer flight dynamics, prioritized behavior and obstacle avoidance that are not reproduced here.','教学模型采用加权转向、固定时间步长和循环边界。论文包含更丰富的飞行动力学、行为优先级与避障，这里没有完整复现。','The order score is mean heading agreement from 0 to 1. It is a live model measure, not a reported result from the paper.','方向一致度为 0–1 的平均朝向指标，是当前模型的实时测量，并非论文报告的实验结果。',refs('boids',pages=[5,7,9,10]),5)]
    return dict(title=PAPER_TITLE,summary=tr('Three local rules. One collective pattern.','三条局部规则，一种群体模式。'),diagramType='relationship',nodes=nodes,edges=[{'from':f'b{i}','to':'b5','label':'contributes'} for i in [1,2,3,4]],chapters=[dict(title=n['label'],summary=tr(en,zh),nodeIds=[n['id']],sourceIds=n['sourceIds']) for n,(en,zh) in zip(nodes,[('Avoid crowding','避免拥挤'),('Match local headings','协调局部方向'),('Stay with neighbors','保持邻近联系'),('See from one agent','从一个个体出发'),('Local decisions → group patterns','局部决策 → 群体模式'),('A model, with limits','模型与边界')])],takeaways=[tr('Simple local interactions can create complex collective motion.','简单的局部互动，可以产生复杂的群体运动。'),tr('Separation, alignment and cohesion solve different problems.','分离、对齐与聚合解决的是不同问题。'),tr('This is an interactive interpretation, not a replication of the 1987 experiments.','这是交互式讲解模型，并非对 1987 年实验的复现。')])

BOOK_NARRATION=[
 'Flatland, by Edwin Abbott Abbott, begins with a world confined to a plane. From above, we can see triangles and squares. But the residents cannot leave the plane to look down on themselves. At eye level, edges appear as lines. Compare the overhead section and the eye-level strip in the guide. A limited view can be accurate and still incomplete.',
 'The first half of the book is also a social satire. Shapes mark status. Women, irregular figures, workers and priests are treated according to a rigid hierarchy. These are the fictional society\'s prejudices, not rules to endorse. The guide keeps that social story alongside the geometry. Open the book index to see how recognition, colour and priestly authority develop across the first twelve sections.',
 'In a dream, the Square visits Lineland. Its king knows only one dimension and cannot understand a second. The Square is frustrated by this refusal. Later, when a Sphere describes a third dimension, the Square makes a remarkably similar mistake. Switch between the one-dimensional and two-dimensional views. The repetition asks us to notice our own blind spots.',
 'Now move the sphere through the plane. Before contact, there is no intersection. At first contact, there is a single point. The circle grows as the sphere approaches its equator, then shrinks and disappears. The sphere never changes size. For the unit sphere in this model, the section radius is the square root of one minus the height squared. The overhead section is a teaching view, not what a Flatlander literally sees.',
 'The Sphere eventually lifts the Square outside his world. A new viewpoint makes previously hidden interiors visible. Rotate the scene to compare the whole sphere with its section. The Square then asks about still higher dimensions. This is a powerful analogy about the limits of experience. It is not, by itself, a proof of an extra spatial dimension.',
 'The return to Flatland brings resistance, not celebration. The Square struggles to explain his discovery and is punished for it. The ending brings perception and power together. What counts as knowledge, and who is allowed to change it? The guide covers the whole book in six themes, while the index preserves all twenty-two original sections. Use the source control to read the passages behind each theme.'
]
PAPER_NARRATION=[
 'Craig Reynolds\'s 1987 paper asks how a flock can move together without giving every bird a scripted path. Begin with separation. Each simulated agent steers away from close neighbors. Turn this rule off, reset the same seed, and compare the next few seconds. A steering preference reduces crowding, but it is not a guarantee that agents can never overlap.',
 'Alignment matches the average velocity of nearby agents. It gradually coordinates their headings. Turn alignment off while leaving the other two rules on. The agents can still gather and avoid crowding, yet travel in less coordinated directions. The order score measures mean heading agreement. It is a measurement of this teaching model, not an experimental value copied from the paper.',
 'Cohesion steers an agent toward the local center of its neighbors. It is different from alignment: location and heading are different information. It is also different from attraction toward one global center. Turn cohesion off and watch how the flock spreads. Resetting keeps the same initial conditions, making the comparison more useful.',
 'Select follow one agent. Its halo marks the distance limit, while the links identify neighbors within the forward-biased field of view. In this model that field spans two hundred and seventy degrees. Agents outside the neighborhood do not contribute to its three steering rules. Change the perception radius and observe how the local information changes.',
 'The group pattern emerges from repeated local decisions. No agent sees the whole flock and no leader assigns its route. Compare all three rules with a one-rule condition over several seconds. A global order score can be low even when several smaller groups are locally well organized. The score is useful evidence, but it is not a complete description of flocking.',
 'Finally, keep the limits visible. This example uses a small three-dimensional flock, weighted steering, a fixed time step and wrapping boundaries. Reynolds\'s paper describes richer flight dynamics, prioritized behavior, obstacle avoidance and animation control. Our controls explain the central idea; they do not recreate every detail of the original implementation or validate a model of real birds. The source links lead back to the original paper.'
]

def guide(key, mode):
    if key=='bicycle': return sample.guide(mode)
    return book_guide() if key=='flatland' else paper_guide()
def narration():
    return {'bicycle':sample.NARRATION, 'flatland':{'deep':BOOK_NARRATION,'quick':[' '.join(s.split('.')[:2])+'.' for s in BOOK_NARRATION]},'boids':{'deep':PAPER_NARRATION,'quick':[' '.join(s.split('.')[:2])+'.' for s in PAPER_NARRATION]}}

def items():
    return [dict(id='bicycle',title='Inside a bicycle',kind='Pasted text',mode='quick',file=None),dict(id='flatland',title='Flatland',kind='Book · TXT',mode='deep',file='flatland.txt'),dict(id='boids',title='Boids',kind='Paper · PDF',mode='deep',file='boids.pdf')]
def match(text):
    hashed=text_hash(text)
    return next((i['id'] for i in items() if text_hash(reading(i['id']))==hashed),None)
def title(key): return {'bicycle':sample.TITLE,'flatland':BOOK_TITLE,'boids':PAPER_TITLE}[key]
def source_name(key): return {'bicycle':sample.SOURCE_NAME,'flatland':'Flatland · Edwin A. Abbott · 1884 · full book','boids':'Flocks, Herds, and Schools · Craig Reynolds · 1987 · original PDF'}[key]
def fragment(key):
    # Classic-script bundle is local and can run in the opaque-origin OIUI sandbox.
    value=guide(key,'deep')
    translations=dict(TRANSLATIONS)
    for en,zh in re.findall(r'("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")',(APP/'web/i18n.js').read_text('utf-8')):
        translations[json.loads(en)]=json.loads(zh)
    payload={'id':key,'guide':value,'translations':translations,'sections':[dict(number=i+1,title=en,zh=zh) for i,(en,zh) in enumerate(BOOK_SECTIONS)] if key=='flatland' else []}
    safe=json.dumps(payload,ensure_ascii=False).replace('<','\\u003c')
    template=(APP/'templates/explorable-guide.html').read_text('utf-8')
    return template.replace('__EXHIBIT_DATA__',safe).replace('__RUNTIME__',(APP/'web/assets/explorables.js').read_text('utf-8'))

def write_manifest():
    book_guide();paper_guide()
    values={'items':[dict(i,textHash=text_hash(reading(i['id']))) for i in items()], 'translations':TRANSLATIONS}
    (FILES/'manifest.json').write_text(json.dumps(values,ensure_ascii=False,indent=2),'utf-8')

if __name__=='__main__':
    write_manifest()
    for item in items():
        print(item['id'],len(reading(item['id'])),len(passages(item['id'])))
