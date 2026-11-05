import { assembleDocument } from '../../vendor/oiui-renderer.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const label = (en, zh) => '<span data-zh="' + zh + '">' + en + '</span>';
const arrow = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M2 8h19m-6-6 6 6-6 6"/></svg>';
const concept = (id, value) => '<button type="button" class="study-concept" data-node="' + id +
  '" aria-pressed="false">' + escape(value) + '</button>';

function threshold({low, high, hold, quantity, unit}) {
  const gap = high.at - low.at;
  const number = value => Number(value.toPrecision(12));
  const limit = value => escape(value + ' ' + unit);
  return '<section class="threshold" data-low="' + low.at + '" data-high="' + high.at + '">' +
    '<div class="threshold-reading"><div><label for="study-range">' + escape(quantity) + '</label>' +
    '<output id="study-reading" for="study-range">' + low.at + '</output> <span class="unit">' + escape(unit) + '</span></div>' +
    '<div id="study-state" aria-live="polite"><i></i><span>' + escape(low.state) + '</span></div></div>' +
    '<div class="threshold-axis"><div class="axis-track"><i></i><i></i><i></i></div>' +
    '<input type="range" id="study-range" min="' + number(low.at - gap / 2) + '" max="' + number(high.at + gap / 2) +
    '" step="any" value="' + low.at + '" aria-describedby="study-state">' +
    '<div class="axis-labels"><span>' + limit(low.at) + '</span><span>' + limit(high.at) + '</span></div></div>' +
    '<div class="threshold-zones">' + [low, hold, high].map((entry, i) =>
      '<div class="zone" data-zone="' + i + '" data-state="' + escape(entry.state) + '">' +
      '<span class="zone-condition">' + (i === 0 ? '≤ ' + limit(low.at) : i === 2 ? '≥ ' + limit(high.at) :
        limit(low.at) + ' &lt; ' + escape(quantity) + ' &lt; ' + limit(high.at)) + '</span>' +
      concept(entry.id, entry.state) + '</div>').join('') + '</div>' +
    '<div class="threshold-actions"><button type="button" data-jump="' + low.at + '">' + label('Set to', '调至') + ' ' + limit(low.at) + '</button>' +
    '<button type="button" data-jump="' + high.at + '">' + label('Set to', '调至') + ' ' + limit(high.at) + '</button></div></section>';
}

function comparison(visual, node) {
  return '<table class="comparison"><thead><tr><th scope="col">' + label('Criteria','对比维度') + '</th>' +
    visual.columns.map(id => '<th scope="col">' + concept(id, node(id).label) + '</th>').join('') +
    '</tr></thead><tbody>' + visual.rows.map(row =>
      '<tr><th scope="row">' + escape(row.criterion) + '</th>' + row.cells.map(cell =>
        '<td>' + concept(cell.id, cell.value) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}

function sequence(visual, node) {
  return '<ol class="sequence">' + visual.steps.map((step, index) =>
    '<li><span class="sequence-index">' + String(index + 1).padStart(2, '0') + '</span><div class="sequence-body">' +
    concept(step.id, node(step.id).label) + '<div class="sequence-change"><span>' + escape(step.trigger) +
    '</span>' + arrow + '<span>' + escape(step.result) + '</span></div></div></li>').join('') +
    '</ol><div class="study-outcome">' + arrow + '<span>' + escape(visual.outcome) + '</span></div>';
}

function mechanism(visual, node) {
  const focus = node(visual.focus);
  return '<div class="mechanism"><div class="mechanism-focus">' + concept(focus.id, focus.label) +
    '<p>' + escape(focus.explanation) + '</p></div><div class="mechanism-links">' + visual.links.map(link => {
      const outward = link.from === focus.id;
      const other = node(outward ? link.to : link.from);
      return '<div class="mechanism-link' + (outward ? '' : ' points-in') + '"><span class="link-verb">' +
        arrow + escape(link.verb) + '</span><div>' + concept(other.id, other.label) +
        '<p>' + escape(link.effect) + '</p></div></div>';
    }).join('') + '</div></div>';
}

const style = `<style>
html,body{margin:0!important;padding:0!important;max-width:none!important;background:transparent!important;color:inherit}
body{font-family:system-ui,sans-serif!important}
.study{--ink:#26233a;--muted:#635b77;--accent:#584697;--paper:#f7f5fa;--tone:#ede8f6;--line:#dcd4ea;--focus:#ded3f2;box-sizing:border-box;padding:clamp(20px,4.1vw,50px);background:radial-gradient(ellipse at 78% 4%,var(--tone),transparent 65%),var(--paper);color:var(--ink);min-height:330px;font-size:14px;text-align:left;overflow-wrap:anywhere}
:root[data-theme=dark] .study{--ink:#f2eefb;--muted:#beb3d3;--accent:#cbb7ff;--paper:#252033;--tone:#322943;--line:#4b3d62;--focus:#483661}
.study *, .study *::before, .study *::after{box-sizing:border-box}
.study h1,.study p,.study ol{margin:0}
.study h1{font:650 clamp(22px,3.8vw,40px)/1.13 system-ui,sans-serif;letter-spacing:-.035em;max-width:29ch;text-wrap:balance;margin-top:8px}
.study-kicker{font-size:11px;color:var(--accent);font-weight:680;letter-spacing:.06em}
.study-header{margin-bottom:clamp(20px,4vw,38px)}
.study button{color:inherit;background:transparent;border:0;box-shadow:none;font:inherit;text-align:left;cursor:pointer}
.study button:focus-visible,.study input:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.study .study-concept{border-radius:7px;padding:4px 7px;margin:-4px -7px;font-weight:650}
.study .study-concept[aria-pressed=true],.study .study-concept:hover{background:var(--focus);color:var(--accent)}
.study svg{width:24px;height:16px;fill:none;stroke:var(--accent);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.threshold{border-top:1px solid var(--line);padding-top:20px}
.threshold-reading{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}
.threshold-reading label{display:block;color:var(--muted);font-size:12px;font-weight:650}
.threshold-reading output{font:650 clamp(34px,7vw,62px)/1.06 system-ui,sans-serif;letter-spacing:-.045em;font-variant-numeric:tabular-nums}
.threshold-reading .unit{color:var(--muted);font-size:18px}
#study-state{font-weight:650;color:var(--accent);border-bottom:1px solid var(--line);padding:5px 0;display:flex;align-items:center;gap:8px}
#study-state i{width:7px;height:7px;background:currentColor;border-radius:50%}
.threshold-axis{position:relative;margin:18px 0 20px;padding:0 7px}
.axis-track{height:14px;display:grid;grid-template-columns:1fr 2fr 1fr;border-radius:8px;overflow:hidden}
.axis-track i{background:var(--line)}
.axis-track i:nth-child(2){background:var(--focus)}
.axis-track i:nth-child(3){background:var(--accent);opacity:.62}
#study-range{position:absolute;inset:-13px 0 auto;appearance:none;width:100%;height:40px;background:transparent;cursor:ew-resize;margin:0}
#study-range::-webkit-slider-thumb{appearance:none;width:16px;height:27px;border-radius:6px;background:var(--paper);border:2px solid var(--accent);box-shadow:0 2px 6px #21143833}
#study-range::-moz-range-thumb{width:13px;height:24px;border-radius:6px;background:var(--paper);border:2px solid var(--accent)}
.axis-labels{display:grid;grid-template-columns:1fr 2fr 1fr;margin-top:7px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.axis-labels span{grid-row:1;width:max-content;justify-self:start;transform:translateX(-50%)}
.axis-labels span:first-child{grid-column:2}
.axis-labels span:last-child{grid-column:3}
.threshold-zones{display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:10px}
.zone{border-top:2px solid var(--line);padding:10px 0 0}
.zone[data-active=true]{border-color:var(--accent)}
.zone-condition{display:block;color:var(--muted);font-size:11px;margin-bottom:6px}
.threshold-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:22px}
.threshold-actions button{border:1px solid var(--line);padding:8px 11px;border-radius:8px;font-size:12px}
.threshold-actions button:hover{border-color:var(--accent)}
.comparison{border-collapse:collapse;width:100%;table-layout:fixed}
.comparison th,.comparison td{padding:13px clamp(5px,1.6vw,17px);vertical-align:top;text-align:left;border-bottom:1px solid var(--line)}
.comparison thead th{border-bottom:2px solid var(--accent);color:var(--accent)}
.comparison th:first-child{width:24%;padding-left:0}
.comparison tbody td .study-concept{font-weight:480}
.comparison tbody td:nth-child(even){background:var(--tone)}
.sequence{list-style:none;padding:0}
.sequence li{display:grid;grid-template-columns:40px 1fr;gap:clamp(7px,2vw,22px);position:relative}
.sequence li:not(:last-child)::before{content:'';position:absolute;left:18px;top:35px;bottom:-1px;border-left:1px solid var(--line)}
.sequence-index{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--tone);color:var(--accent);font-size:12px;font-variant-numeric:tabular-nums}
.sequence-body{border-bottom:1px solid var(--line);padding:7px 0 15px;margin-bottom:11px}
.sequence-change{display:grid;grid-template-columns:1fr 24px 1fr;gap:clamp(5px,1.5vw,16px);margin-top:7px;color:var(--muted);align-items:start}
.sequence-change span:last-child{color:var(--ink)}
.study-outcome{display:flex;gap:12px;align-items:center;color:var(--accent);font-weight:650;padding:10px 0 0 55px}
.mechanism{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.2fr);gap:clamp(14px,3vw,36px);align-items:center}
.mechanism-focus{padding:clamp(13px,2.8vw,28px);background:var(--tone);border:1px solid var(--line);border-radius:15px}
.mechanism-focus .study-concept{font-size:clamp(16px,2.2vw,25px);color:var(--accent)}
.mechanism p{color:var(--muted);font-size:13px;margin-top:7px;line-height:1.48}
.mechanism-link{display:grid;grid-template-columns:minmax(56px,.6fr) minmax(0,1fr);gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.mechanism-link:last-child{border-bottom:1px solid var(--line)}
.link-verb{display:grid;gap:3px;font-size:11px;color:var(--accent);font-weight:650}
.points-in svg{transform:rotate(180deg)}
@media(max-width:520px){.study{padding:19px 15px;font-size:13px}.mechanism{grid-template-columns:1fr}.sequence li{grid-template-columns:31px 1fr}.sequence-index{width:27px;height:27px}.sequence li:not(:last-child)::before{left:13px;top:27px}.study-outcome{padding-left:39px}.threshold-zones{gap:7px}.axis-labels{font-size:11px}.comparison th,.comparison td{font-size:12px}}
</style>`;

const script = `<script>
const study = document.querySelector('.study');
const concepts = [...study.querySelectorAll('[data-node]')];
const localized = [...study.querySelectorAll('[data-zh]')];
localized.forEach(node => { node.dataset.en = node.textContent; });
function select(id) {
  concepts.forEach(el => el.setAttribute('aria-pressed', String(el.dataset.node === id)));
}
study.addEventListener('click', event => {
  const concept = event.target.closest('[data-node]');
  if (!concept) return;
  select(concept.dataset.node);
  window.sendPrompt(JSON.stringify({action:'concept',id:concept.dataset.node}));
});
const range = document.querySelector('#study-range');
if (range) {
  const threshold = range.closest('.threshold');
  const low = Number(threshold.dataset.low), high = Number(threshold.dataset.high);
  const zones = [...threshold.querySelectorAll('[data-zone]')];
  const state = threshold.querySelector('#study-state');
  const format = new Intl.NumberFormat(study.lang,{maximumFractionDigits:Math.min(12,Math.max(0,2-Math.floor(Math.log10(high-low))))});
  let lastLimit = 0;
  function update() {
    const reading = range.valueAsNumber;
    const zone = reading <= low ? 0 : reading >= high ? 2 : 1;
    if (zone !== 1) lastLimit = zone;
    const name = zones[lastLimit].dataset.state;
    state.querySelector('span').textContent = name;
    document.querySelector('#study-reading').textContent = format.format(reading);
    range.setAttribute('aria-valuetext', format.format(reading) + ' ' + name);
    zones.forEach((el, index) => { el.dataset.active = String(index === zone); });
  }
  range.addEventListener('input', update);
  threshold.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
    range.value = button.dataset.jump;
    update();
    range.focus();
  }));
  update();
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') parent.postMessage({type:'clarity:escape'},'*');
});
window.addEventListener('message', event => {
  if (event.source !== parent || !event.data) return;
  const {type,id,theme,language,zoom} = event.data;
  if (type === 'clarity:select') select(id);
  if (type === 'clarity:theme') document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  if (type === 'clarity:language') localized.forEach(node => { node.textContent = node.dataset[language === 'zh' ? 'zh' : 'en']; });
  if (type === 'clarity:zoom' && Number.isFinite(zoom)) study.style.zoom = Math.max(.7,Math.min(1.6,zoom));
});
new ResizeObserver(() => parent.postMessage({type:'clarity:guide-size',height:study.getBoundingClientRect().height},'*')).observe(study);
</script>`;

export function renderGuide(guide) {
  const nodes = new Map(guide.nodes.map(node => [node.id, node]));
  const visual = guide.visual;
  const layouts = {
    threshold: ['Thresholds', '阈值变化', threshold],
    comparison: ['Compare', '对比', comparison],
    sequence: ['Process', '过程', sequence],
    mechanism: ['Mechanism', '机制', mechanism]
  };
  const [en, zh, draw] = layouts[visual.type];
  return assembleDocument(style + '<article class="study" lang="' + escape(guide.language) + '">' +
    '<header class="study-header"><span class="study-kicker">' + label(en, zh) + '</span><h1>' +
    escape(guide.summary) + '</h1></header>' + draw(visual, id => nodes.get(id)) + '</article>' + script);
}
