"""Export reviewed examples through the real OIUI assembler; no model requests."""
import asyncio
import hashlib
import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import catalog
from guide import assemble, validate_guide

async def main():
    target = APP / 'prepared'
    guides = APP / 'web/prepared'
    target.mkdir(exist_ok=True)
    guides.mkdir(exist_ok=True)
    values = {'sessions': {}, 'sourceHashes': {}}
    for item in catalog.items():
        key = item['id']
        passages = catalog.passages(key)
        # The HTML contains only reviewed content and locally bundled Three.js.
        visual = validate_guide(catalog.guide(key, 'deep'), passages)
        (guides / f'{key}.html').write_text(await assemble(visual, authored_fragment=catalog.fragment(key)), encoding='utf-8')
        for mode in ('quick', 'deep'):
            sid = hashlib.sha256(f'clarity-reviewed:{key}:{mode}'.encode()).hexdigest()[:32]
            guide = validate_guide(catalog.guide(key, mode), passages)
            audio = json.loads((APP / f'web/assets/sample-{key}-{mode}.json').read_text(encoding='utf-8-sig'))
            audio['url'] = f'/assets/sample-{key}-{mode}.mp3'
            values['sessions'][sid] = {
                'id': sid, 'title': guide['title'], 'sourceName': catalog.source_name(key),
                'passages': passages, 'mode': mode,
                'initialView': 'podcast' if mode == 'quick' else 'visual-guide',
                'sample': True, 'sampleId': key, 'inputType': 'text' if key == 'bicycle' else 'file',
                'createdAt': 1793836800, 'updatedAt': 1793836800,
                'stages': {part: {'status': 'ready', 'error': None} for part in ('source', 'guide', 'audio')},
                'guide': guide, 'guideTemplate': 'explorable-v1', 'guideUrl': f'/prepared/{key}.html', 'audio': audio,
                'questions': [], 'active': False, 'sessionStorage': 'browser',
                'deploymentMode': 'reviewed-examples',
            }
            values['sourceHashes'].setdefault(catalog.text_hash(catalog.reading(key)), {})[mode] = sid
        print(f'Exported {key}: {len(passages)} cited passages')
    (target / 'catalogue.json').write_text(json.dumps(values, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')

if __name__ == '__main__':
    asyncio.run(main())
