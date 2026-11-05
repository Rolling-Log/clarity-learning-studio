export class InvalidLesson extends Error {
  constructor() { super('The model returned an incomplete lesson.'); }
}

function requireValue(condition) {
  if (!condition) throw new InvalidLesson();
}

function text(value, limit) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit);
  return value.trim();
}

function list(value, min, max, map) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max);
  return value.map(map);
}

function references(value, allowed) {
  return [...new Set(list(value, 1, 12, id => {
    requireValue(allowed.has(id));
    return id;
  }))];
}

export function normalizeGuide(raw, passages) {
  requireValue(raw && typeof raw === 'object');
  const sourceIds = new Set(passages.map(p => p.id));
  const nodes = list(raw.nodes, 2, 10, node => {
    requireValue(node && typeof node.id === 'string' && /^c\d{1,3}$/.test(node.id) && Number.isInteger(node.chapterIndex));
    return {
      id:node.id, label:text(node.label, 72), explanation:text(node.explanation, 550),
      sourceIds:references(node.sourceIds, sourceIds), chapterIndex:node.chapterIndex
    };
  });
  const ids = new Set(nodes.map(n => n.id));
  requireValue(ids.size === nodes.length);
  const chapters = list(raw.chapters, 1, 6, chapter => {
    requireValue(chapter);
    return {title:text(chapter.title, 100), summary:text(chapter.summary, 400),
      nodeIds:references(chapter.nodeIds, ids), sourceIds:references(chapter.sourceIds, sourceIds)};
  });
  requireValue(nodes.every(node => chapters[node.chapterIndex]?.nodeIds.includes(node.id)));
  requireValue(chapters.every((chapter, index) =>
    chapter.nodeIds.every(id => nodes.some(node => node.id === id && node.chapterIndex === index))));

  const visual = normalizeVisual(raw.visual, nodes, ids, passages);
  let language = 'en';
  if (typeof raw.language === 'string' && raw.language.length < 24) {
    try { language = Intl.getCanonicalLocales(raw.language)[0] || language; } catch {}
  }
  return {
    title:text(raw.title, 120), summary:text(raw.summary, 350), language, nodes, chapters, visual,
    diagramType:({sequence:'flow',comparison:'comparison'})[visual.type] || 'relationship',
    edges:visual.type === 'mechanism' ? visual.links.map(link => ({from:link.from,to:link.to,label:link.verb})) : [],
    takeaways:list(raw.takeaways, 1, 3, value => text(value, 260))
  };
}

function normalizeVisual(raw, nodes, ids, passages) {
  requireValue(raw && typeof raw === 'object');
  const used = new Set();
  const concept = id => {
    requireValue(ids.has(id));
    used.add(id);
    return id;
  };
  let visual;
  if (raw.type === 'threshold') {
    const limit = entry => {
      requireValue(entry && typeof entry.at === 'number' && Number.isFinite(entry.at) && Math.abs(entry.at) < 1e9);
      const id = concept(entry.id);
      const citations = nodes.find(node => node.id === id).sourceIds;
      const literal = String(entry.at).replace('.', '\\.');
      const value = new RegExp('(?<![\\d.−-])' + literal + '(?![\\d.]\\d|\\d)', 'u');
      requireValue(passages.some(p => citations.includes(p.id) && value.test(p.text.replaceAll('−', '-'))));
      return {at:entry.at, id, state:text(entry.state, 90)};
    };
    const low = limit(raw.low), high = limit(raw.high);
    requireValue(raw.hold && high.at - low.at >= 0.000001);
    visual = {type:raw.type, quantity:text(raw.quantity, 65), unit:text(raw.unit, 16), low, high,
      hold:{id:concept(raw.hold.id), state:text(raw.hold.state, 125)}};
    requireValue(used.size === 3);
  } else if (raw.type === 'comparison') {
    const columns = list(raw.columns, 2, 3, concept);
    requireValue(new Set(columns).size === columns.length);
    const rows = list(raw.rows, 2, 6, row => {
      requireValue(row);
      return {criterion:text(row.criterion, 80),
        cells:list(row.cells, columns.length, columns.length, cell => {
          requireValue(cell);
          return {id:concept(cell.id), value:text(cell.value, 220)};
        })};
    });
    visual = {type:raw.type, columns, rows};
  } else if (raw.type === 'sequence') {
    const steps = list(raw.steps, 2, 10, step => {
      requireValue(step);
      return {id:concept(step.id), trigger:text(step.trigger, 130), result:text(step.result, 180)};
    });
    requireValue(new Set(steps.map(step => step.id)).size === steps.length);
    visual = {type:raw.type, steps, outcome:text(raw.outcome, 220)};
  } else {
    requireValue(raw.type === 'mechanism');
    const focus = concept(raw.focus);
    const links = list(raw.links, 1, 9, link => {
      requireValue(link);
      const from = concept(link.from), to = concept(link.to);
      requireValue(from !== to && (from === focus || to === focus));
      return {from, to, verb:text(link.verb, 80), effect:text(link.effect, 200)};
    });
    visual = {type:raw.type, focus, links};
  }
  requireValue(used.size === ids.size);
  return visual;
}

export function normalizeNarration(raw, guide) {
  return list(raw, guide.chapters.length, guide.chapters.length, (chapter, index) => {
    requireValue(chapter && chapter.chapterIndex === index);
    return list(chapter.sentences, 1, 12, sentence => text(sentence, 320));
  });
}
