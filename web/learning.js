/* One learning session, one persistent audio element, two ways to understand. */
(() => {
  "use strict";
  const tr = (...args) => window.ClarityUI.t(...args);
  const icon = name => '<svg class="ui-icon" aria-hidden="true"><use href="#icon-' + name + '"/></svg>';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const area = $("#learning"), audio = $("#learning-audio");
  const apiBase = window.CLARITY_API_BASE || (location.protocol === "file:" ? "http://127.0.0.1:4317" : "");
  const phoneMode = new URLSearchParams(location.search).get("phone") === "1";
  const L = { session: null, view: "podcast", expanded: false, node: null, chapter: 0, zoom: 1,
    audioSid: null, guideSid: null, poll: null, busy: false, asking: false, panel: null,
    sourceFromAsk: false, returnFocus: null, pendingQuestion: "", failedQuestion: "",
    savedAt: 0, ended: false, inView: false, restoreTime: null };
  const errors = {
    service_unavailable: "The local service is unavailable. Start Clarity and try again.",
    service_timeout: "This is taking longer than expected. You can try again.",
    model_access: "The model connection needs attention. Check the API configuration.",
    model_limit: "The model service has reached a limit. Check your API balance and try again.",
    invalid_result: "This part couldn't be prepared correctly. Try again.",
    interrupted: "Preparation was interrupted. Your source is still here.",
    generation_failed: "This part couldn't be prepared. Try again."
  };
  const stages = {
    source: ["Reading the source", ""],
    guide: ["Creating the guide", ""],
    audio: ["Creating the podcast", ""]
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function retrieve(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function pref() { return retrieve("clarity:learning:" + L.session?.id, {}); }
  function savePref() {
    if (!L.session) return;
    store("clarity:learning:" + L.session.id, {
      view:L.view, node:L.node, zoom:L.zoom, time:L.restoreTime ?? (Number.isFinite(audio.currentTime) ? audio.currentTime : 0),
      speed:audio.playbackRate, chapter:L.chapter
    });
  }
  function clock(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    return Math.floor(value / 60) + ":" + String(Math.floor(value % 60)).padStart(2,"0");
  }
  async function api(route, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
    try {
      const result = await fetch(apiBase + "/api/clarity" + route, {
        method:options.method || "GET", headers:{"Content-Type":"application/json"},
        body:options.body ? JSON.stringify(options.body) : undefined, signal:controller.signal
      });
      const value = await result.json();
      if (!result.ok) {
        const detail = value.detail;
          throw new Error(tr(typeof detail === "object" && !Array.isArray(detail) ? detail.message : typeof detail === "string" ? detail : "Something couldn't be completed. Please try again."));
      }
      return value;
    } catch (error) {
      if (error.name === "AbortError") throw new Error(tr("The connection took too long. Please try again."));
      if (error instanceof TypeError) throw new Error(tr("Clarity's local service isn't available. Start Clarity and try again."));
      throw error;
    } finally { clearTimeout(timer); }
  }
  function goToLearning(focus = false) {
    area.hidden = false;
    history.replaceState(null, "", "#learning");
    area.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block:"start"});
    if (focus) $("#learning-title").focus({preventScroll:true});
  }
  function sourceName(setup) {
    if (setup.source.file) return setup.source.file.name;
    const text = setup.source.text.split(/\n/).find(line => line.trim()) || "Your text";
    return text.length > 72 ? text.slice(0,69) + "…" : text;
  }
  async function generate(setup) {
    if (L.busy) return;
    L.busy = true;
    $("#continue-button").disabled = true;
    $("#continue-button").firstChild.nodeValue = tr("Preparing") + " ";
    $("#generation-feedback").hidden = true;
    try {
      const sampleId = await window.ClarityExamples.identify(setup.source.text);
      const session = await api("/sessions", {
        method:"POST", body:{text:setup.source.text, name:sourceName(setup), mode:setup.mode,
          sample:!!sampleId, sampleId, inputType:setup.source.type}
      });
      audio.pause(); L.ended = false;
      adoptSession(session, true);
      goToLearning(true);
      beginPolling();
    } catch (error) {
      $("#generation-feedback").textContent = error.message;
      $("#generation-feedback").hidden = false;
    } finally { L.busy = false; updateSetup(); }
  }
  document.addEventListener("clarity:generate", event => { event.preventDefault(); generate(event.detail); });
  function adoptSession(session, fresh = false) {
    area.hidden = false;
    const changed = L.session?.id !== session.id;
    if (changed) {
      L.audioSid = null; L.guideSid = null; L.expanded = false; L.ended = false;
      audio.pause(); audio.removeAttribute("src"); audio.load();
      L.session = session;
      if(session.sessionStorage === "browser") L.session.questions = retrieve("clarity:questions:" + session.id, []);
      const p = fresh ? {} : pref();
      L.view = p.view || session.initialView; L.node = p.node || null; L.zoom = p.zoom || 1;
      L.chapter = p.chapter || 0;
      L.restoreTime = p.time || 0;
      audio.defaultPlaybackRate = p.speed || 1;
      audio.playbackRate = p.speed || 1;
      $("#speed-button").textContent = audio.playbackRate + "×";
      $$("[data-speed]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === audio.playbackRate)));
      if (fresh) store("clarity:learning:" + session.id, {view:L.view, time:0, zoom:1, speed:1});
      store("clarity:last-session", session.id);
      if (session.inputType !== "file" && !sourceText.value.trim() && !createState.file) {
        sourceText.value = session.passages.map(p => p.text).join("\n\n");
        createState.mode = session.mode;
        $$('input[name="mode"]').forEach(radio => { radio.checked = radio.value === session.mode; });
        $$(".mode-option").forEach(option => option.classList.toggle("is-selected",option.querySelector("input").checked));
        switchSource("text");
      }
    } else L.session = session;
    renderSession();
  }
  async function loadSession(sid, scroll = false) {
    try {
      const session = await api("/sessions/" + sid);
      adoptSession(session);
      if (scroll) goToLearning();
      beginPolling();
    } catch (error) {
      if (scroll) {
        area.hidden = false;
        $("#learning-empty").hidden = false;
        $("#empty-title").textContent = "Let's pick up your next idea.";
        $("#empty-title").textContent = error.message;
        goToLearning();
      }
    }
  }
  function beginPolling() {
    clearTimeout(L.poll);
    if (!L.session?.active) return;
    const sid = L.session.id;
    L.poll = setTimeout(async () => {
      if (L.session?.id !== sid) return;
      try { adoptSession(await api("/sessions/" + sid)); }
      catch (error) {
        $("#task-strip").classList.add("is-error");
        $("#task-strip").innerHTML = '<span class="status-dot"></span><p>' + esc(error.message) + '</p><button class="text-link" data-reconnect type="button">' + tr("Reconnect") + '</button>';
        $("#task-strip [data-reconnect]").onclick = () => loadSession(sid);
        return;
      }
      beginPolling();
    }, 1100);
  }
  function stageHTML(name, stage) {
    const working = stage.status === "working", ready = stage.status === "ready", error = stage.status === "error";
    return '<div class="generation-step" data-status="' + stage.status + '"><span class="step-indicator">' +
      (ready ? "✓" : error ? "!" : String(Object.keys(stages).indexOf(name) + 1).padStart(2,"0")) +
      '</span><div class="step-copy"><strong>' + tr(stages[name][0]) + '</strong><p>' +
      esc(error ? tr(errors[stage.error] || errors.generation_failed) : tr(ready ? "Finished" : working ? "Working" : "Waiting")) +
      '</p></div>' + (error ? '<button class="text-link" data-retry="' + name + '" type="button">' + tr("Retry") + '</button>' : "") + '</div>';
  }
  function renderSession() {
    const s = L.session;
    if (!s) return;
    area.dataset.guideTemplate = s.guideTemplate || "";
    $("#learning-empty").hidden = true;
    $("#learning-workspace").hidden = false;
    const ready = s.stages.guide.status === "ready" || s.stages.audio.status === "ready";
    const failed = Object.values(s.stages).some(part => part.status === "error");
    $("#result-eyebrow").textContent = "";
    $("#learning-title").textContent = ready ? (s.sample ? tr(s.title) : s.title) : tr("Preparing your learning");
    $("#learning-summary").textContent = ready ? (s.sample ? tr(s.guide?.summary || "") : s.guide?.summary || tr("Start listening while we prepare the visual guide.")) : "";
    $("#result-source-name").textContent = s.sourceName;
    $("#result-source-name").title = s.sourceName;
    $("#result-mode").textContent = tr(s.mode === "quick" ? "Quick Overview" : "Deep Dive");
    $("#sample-label").hidden = !s.sample;
    $("#generation-scene").hidden = ready;
    $("#result-scene").hidden = !ready;
    $("#generation-steps").innerHTML = Object.entries(s.stages).map(([name, stage]) => stageHTML(name, stage)).join("");
    $("#generation-source").textContent = s.sourceName;
    $("#generation-scene").classList.toggle("is-error", failed && !s.active);
    $("#generation-title").textContent = tr(failed && !s.active ? "Preparation interrupted" : "Preparing your learning");
    $("#generation-description").textContent = failed && !s.active ? tr("Your source is saved. Retry the unfinished step.") : "";
    $("#task-strip").classList.toggle("is-error", failed);
    const failedPart = Object.keys(s.stages).find(name => s.stages[name].status === "error");
    if (ready && (s.active || failed)) {
      const preparing = tr(s.stages.audio.status === "ready" ? "Your podcast is ready. The visual guide is still being prepared." : "Your guide is ready. The podcast is still being prepared.");
      const text = failed ? tr(s.stages.audio.status === "ready" ? "Your podcast is ready. " : "Your guide is ready. ") + tr(errors[s.stages[failedPart].error] || errors.generation_failed) : preparing;
      $("#task-strip").innerHTML = '<span class="status-dot ' + (s.active ? "working" : "") + '"></span><p>' + esc(text) + '</p>' +
        (failed && !s.active ? '<button class="text-link" type="button" data-retry="' + failedPart + '">' + tr("Retry") + '</button>' : "");
    } else $("#task-strip").replaceChildren();
    if (ready) {
      renderPart("audio");
      renderPart("guide");
      if (s.guide) renderGuideDetails();
      else {
        $("#concept-card").hidden = true; $("#chapters-card").hidden = true;
      }
      $("#result-footnote").textContent = tr(s.sample ? "Prepared sample · system narration · source-linked visual guide" : s.audio?.narrationProvider === "local" ? "AI-written podcast · local system voice · grounded in your source" : "AI-generated audio · grounded in your source");
      $("#audio-label").textContent = tr(s.sample ? "Sample narration" : s.audio?.narrationProvider === "local" ? "System voice" : "AI voice");
      applyView();
    }
    $$("[data-retry]").forEach(button => { button.onclick = () => retry(button.dataset.retry, button); });
    if (L.panel === "ask" && !L.asking) renderQuestions();
  }
  function renderPart(part) {
    const stage = L.session.stages[part];
    const ready = stage.status === "ready";
    $("#" + (part === "audio" ? "audio-content" : "guide-content")).hidden = !ready;
    const placeholder = $("#" + part + "-placeholder");
    placeholder.hidden = ready;
    if (!ready) {
      const error = stage.status === "error";
      placeholder.innerHTML = (error ? '<span class="empty-symbol">' + icon("alert") + '</span>' : '<span class="small-spinner" aria-hidden="true"></span>') +
        '<p>' + esc(tr(error ? errors[stage.error] || errors.generation_failed : part === "audio" ? "Your podcast is taking shape." : "Your visual guide is taking shape.")) + '</p>' +
        (error ? '<button class="outline-button" data-retry="' + part + '" type="button">' + tr("Try again") + '</button>' : "");
    }
    if (part === "audio" && ready && L.audioSid !== L.session.id) {
      L.audioSid = L.session.id;
      audio.src = apiBase + L.session.audio.url;
      $("#audio-error").hidden = true;
      $("#audio-label").textContent = tr(L.session.sample ? "Sample narration" : L.session.audio.narrationProvider === "local" ? "System voice" : "AI voice");
      renderTranscript();
    }
    if (part === "guide") {
      $("#expand-guide").disabled = !ready;
      if (ready && L.guideSid !== L.session.id) {
        L.guideSid = L.session.id;
        const frame = $("#guide-frame"), sid = L.session.id;
        if (L.session.guideUrl) {
          // Keep reviewed HTML in the existing isolated frame, without a cross-document redirect.
          frame.removeAttribute("src"); frame.srcdoc = "";
          fetch(apiBase + L.session.guideUrl, {signal:AbortSignal.timeout(30000)})
            .then(response => { if (!response.ok) throw new Error("Guide unavailable"); return response.text(); })
            .then(html => { if (L.guideSid === sid) frame.srcdoc = html; })
            .catch(() => {
              if (L.guideSid !== sid) return;
              L.guideSid = null;
              L.session.stages.guide = {status:"error", error:"service_unavailable"};
              renderPart("guide");
            });
        } else {
          frame.removeAttribute("srcdoc");
          frame.src = apiBase + "/api/clarity/sessions/" + sid + "/guide";
        }
      }
    }
  }
  async function retry(part, button) {
    if (button) { button.disabled = true; button.textContent = tr("Retrying…"); }
    try {
      const session = await api("/sessions/" + L.session.id + "/retry", {method:"POST", body:{part}});
      adoptSession(session); beginPolling();
    } catch (error) {
      if (button) { button.textContent = tr("Retry"); button.disabled = false; }
      $("#task-strip").classList.add("is-error");
      $("#task-strip").innerHTML = '<span class="status-dot"></span><p>' + esc(error.message) + '</p>';
    }
  }
  function currentNode() { return L.session?.guide?.nodes.find(n => n.id === L.node) || L.session?.guide?.nodes[0]; }
  function renderGuideDetails() {
    $("#concept-card").hidden = false; $("#chapters-card").hidden = false;
    const guide = L.session.guide;
    if (!guide.nodes.some(n => n.id === L.node)) L.node = guide.nodes[0].id;
    const signature = L.session.id + "|" + window.ClarityUI.language + "|" + (L.session.audio?.url || "") + "|" + JSON.stringify(guide.chapters);
    if ($("#chapter-list").dataset.signature !== signature) {
      $("#chapter-list").dataset.signature = signature;
      $("#chapter-list").innerHTML = guide.chapters.map((chapter, i) =>
        '<button class="chapter-button" type="button" data-chapter="' + i + '"><span class="chapter-number">' + String(i+1).padStart(2,"0") +
        '</span><span class="chapter-description"><strong>' + esc(L.session.sample ? tr(chapter.title) : chapter.title) + '</strong><small>' + esc(L.session.sample ? tr(chapter.summary) : chapter.summary) +
        '</small></span><span class="chapter-time" id="chapter-time-' + i + '"></span></button>').join("");
      $$(".chapter-button").forEach(button => { button.onclick = () => selectChapter(Number(button.dataset.chapter)); });
      $("#recap-list").innerHTML = guide.takeaways.map(text => '<li>' + esc(L.session.sample ? tr(text) : text) + '</li>').join("");
    }
    $("#cue-note").hidden = !L.session.audio?.approximateCues;
    $("#guide-type").textContent = "";
    updateConcept(); updateChapter(); updateCueLabels(); sendGuideState();
  }
  function updateConcept() {
    const node = currentNode();
    if (!node) return;
    const index = L.session.guide.nodes.indexOf(node);
    $("#concept-index").textContent = tr("CONCEPT") + " · " + String(index+1).padStart(2,"0");
    $("#concept-title").textContent = L.session.sample ? tr(node.label) : node.label;
    $("#concept-explanation").textContent = L.session.sample ? tr(node.explanation) : node.explanation;
    $("#concept-example").textContent = L.session.sample ? tr(node.example) : node.example;
    $("#concept-example").hidden = !node.example;
    if (L.panel === "ask") $("#question-context").textContent = L.session.sample ? tr(node.label) : node.label;
  }
  function selectNode(id) {
    if (!L.session?.guide?.nodes.some(n => n.id === id)) return;
    L.node = id; updateConcept(); sendGuideState(); savePref();
  }
  function cues() {
    const data = L.session?.audio;
    if (data?.cues) return data.cues;
    const duration = audio.duration || data?.duration || 0;
    return (data?.cueFractions || []).map(f => f * duration);
  }
  function updateCueLabels() {
    cues().forEach((time, i) => {
      const label = $("#chapter-time-" + i);
      if (label) label.textContent = (L.session.audio.approximateCues ? "~" : "") + clock(time);
    });
  }
  function selectChapter(index) {
    if (!L.session?.guide?.chapters[index]) return;
    L.chapter = index;
    const nodeId = L.session.guide.chapters[index].nodeIds[0];
    if (nodeId) selectNode(nodeId);
    if (audio.readyState && cues()[index] !== undefined) audio.currentTime = cues()[index];
    L.ended = false; $("#learning-recap").hidden = true;
    updateChapter(); savePref();
  }
  function updateChapter() {
    const guide = L.session?.guide;
    if (!guide) return;
    L.chapter = Math.min(L.chapter, guide.chapters.length-1);
    $$(".chapter-button").forEach((b, i) => { b.classList.toggle("active", i === L.chapter); b.setAttribute("aria-current", i === L.chapter ? "step" : "false"); });
    const chapterTitle = guide.chapters[L.chapter]?.title || L.session.title;
    $("#playing-chapter").textContent = L.session.sample ? tr(chapterTitle) : chapterTitle;
    $("#chapter-count").textContent = String(L.chapter+1).padStart(2,"0") + " / " + String(guide.chapters.length).padStart(2,"0");
    $("#mini-title").textContent = L.session.sample ? tr(chapterTitle) : chapterTitle;
  }
  function sendGuideState() {
    const frame = $("#guide-frame");
    frame.contentWindow?.postMessage({type:"clarity:select", id:L.node}, "*");
    frame.contentWindow?.postMessage({type:"clarity:language", language:window.ClarityUI.language}, "*");
    frame.contentWindow?.postMessage({type:"clarity:zoom", zoom:L.zoom}, "*");
    $("#zoom-reset").textContent = Math.round(L.zoom * 100) + "%";
    $("#zoom-out").disabled = L.zoom <= .7;
    $("#zoom-in").disabled = L.zoom >= 1.6;
  }
  $("#guide-frame").addEventListener("load", sendGuideState);
  window.addEventListener("message", event => {
    if (event.data?.type === "clarity:escape") {
      if (event.source === $("#guide-frame").contentWindow) handleEscape();
      else if (event.source === $("#phone-frame").contentWindow && event.origin === location.origin && !$("#phone-preview").hidden) closePhone();
      return;
    }
    if (event.source === $("#guide-frame").contentWindow && event.data?.type === "clarity:guide-size") {
      if (["bicycle-v1","explorable-v1"].includes(L.session?.guideTemplate) && Number.isFinite(event.data.height)) {
        $("#guide-content").style.setProperty("--guide-natural-height",Math.max(450,Math.min(1600,event.data.height))+"px");
      }
      return;
    }
    if (event.source !== $("#guide-frame").contentWindow || !event.data || event.data.type !== "send-prompt" || typeof event.data.text !== "string" || event.data.text.length > 300) return;
    try {
      const payload = JSON.parse(event.data.text);
      if (payload.action === "concept" && typeof payload.id === "string") selectNode(payload.id);
      if (payload.action === "source" && typeof payload.id === "string") { selectNode(payload.id); openSource(currentNode().sourceIds); }
      if (payload.action === "section" && Number.isInteger(payload.section)) { openSource(L.session.passages.filter(p=>p.section===payload.section).map(p=>p.id)); }
      if (payload.action === "chapter" && Number.isInteger(payload.index) && L.session.guide.chapters[payload.index]) selectChapter(payload.index);
    } catch {}
  });
  $("#zoom-in").onclick = () => { L.zoom = Math.min(1.6, Math.round((L.zoom+.1)*10)/10); sendGuideState(); savePref(); };
  $("#zoom-out").onclick = () => { L.zoom = Math.max(.7, Math.round((L.zoom-.1)*10)/10); sendGuideState(); savePref(); };
  $("#zoom-reset").onclick = () => { L.zoom = 1; sendGuideState(); savePref(); };
  function applyView() {
    area.dataset.view = L.view; area.classList.toggle("is-expanded", L.expanded);
    $$("button[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === L.view)));
    $("#expand-guide").setAttribute("aria-expanded", String(L.expanded));
    $("#expand-guide").setAttribute("aria-label", tr(L.expanded ? "Restore visual guide" : "Expand visual guide"));
    $("#expand-guide span").textContent = tr(L.expanded ? "Restore" : "Expand");
    $("#learning-hint").textContent = "";
    updateMiniPlayer(); savePref();
  }
  $$("button[data-view]").forEach(button => { button.onclick = () => { L.view = button.dataset.view; L.expanded = false; applyView(); }; });
  $("#expand-guide").onclick = () => {
    L.expanded = !L.expanded; applyView();
    if (L.expanded) $("#guide-card").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});
  };
  async function togglePlay() {
    if (!L.session?.audio || L.session.stages.audio.status !== "ready") return;
    try {
      if (audio.paused) {
        if (audio.ended) { audio.currentTime = 0; L.ended = false; $("#learning-recap").hidden = true; }
        await audio.play();
      } else audio.pause();
      $("#audio-error").hidden = true;
    } catch {
      $("#audio-error").textContent = tr("The audio couldn't play. Try again.");
      $("#audio-error").hidden = false;
    }
  }
  $("#play-button").onclick = togglePlay; $("#mini-play").onclick = togglePlay;
  function syncPlayback() {
    const playing = !audio.paused;
    area.classList.toggle("is-playing", playing);
    $("#play-button").setAttribute("aria-label", tr(playing ? "Pause podcast" : "Play podcast"));
    $("#play-button").innerHTML = icon(playing ? "pause" : "play");
    $("#mini-play").textContent = playing ? "Ⅱ" : "▶";
    $("#mini-play").setAttribute("aria-label", tr(playing ? "Pause podcast" : "Play podcast"));
  }
  audio.addEventListener("play", syncPlayback); audio.addEventListener("pause", syncPlayback);
  audio.addEventListener("loadedmetadata", () => {
    const time = L.restoreTime ?? pref().time ?? 0;
    if (Number.isFinite(audio.duration) && time > 0 && time < audio.duration - .5) audio.currentTime = time;
    L.restoreTime = null;
    updateAudioTime(); updateCueLabels();
  });
  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    $("#audio-error").textContent = tr("The audio couldn't load. Check the connection and try again.");
    $("#audio-error").hidden = false;
  });
  function updateAudioTime() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : L.session?.audio?.duration || 0;
    const progress = duration ? audio.currentTime / duration * 100 : 0;
    $("#audio-elapsed").textContent = clock(audio.currentTime);
    $("#audio-duration").textContent = clock(duration);
    $("#audio-seek").value = String(progress);
    $("#audio-seek").style.setProperty("--progress", progress + "%");
    $("#mini-time").textContent = clock(audio.currentTime) + " / " + clock(duration);
    $("#mini-progress").style.setProperty("--mini-progress", progress + "%");
    const positions = cues();
    if (positions.length) {
      let chapter = 0;
      positions.forEach((time, i) => { if (audio.currentTime + .1 >= time) chapter = i; });
      if (chapter !== L.chapter) { L.chapter = chapter; const id=L.session.guide?.chapters[chapter]?.nodeIds[0];if(id)selectNode(id);updateChapter(); }
    }
    if (Date.now() - L.savedAt > 700) { L.savedAt = Date.now(); savePref(); }
  }
  audio.addEventListener("timeupdate", updateAudioTime);
  audio.addEventListener("ended", () => {
    L.ended = true; $("#learning-recap").hidden = false; savePref(); syncPlayback();
  });
  $("#audio-seek").oninput = event => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Number(event.target.value) / 100 * audio.duration;
    L.ended = false; $("#learning-recap").hidden = true; updateAudioTime();
  };
  $("#skip-back").onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); };
  $("#skip-forward").onclick = () => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 15); };
  $("#speed-button").onclick = () => {
    $("#speed-menu").hidden = !$("#speed-menu").hidden;
    $("#speed-button").setAttribute("aria-expanded", String(!$("#speed-menu").hidden));
  };
  $$("[data-speed]").forEach(button => { button.onclick = () => {
    audio.playbackRate = Number(button.dataset.speed);
    audio.defaultPlaybackRate = audio.playbackRate;
    $("#speed-button").textContent = button.textContent;
    $$("[data-speed]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    $("#speed-menu").hidden = true; $("#speed-button").setAttribute("aria-expanded", "false"); savePref();
  }; });
  document.addEventListener("click", event => { if (!event.target.closest(".speed-wrap")) { $("#speed-menu").hidden = true; $("#speed-button").setAttribute("aria-expanded","false"); } });
  function renderTranscript() {
    $("#transcript-list").innerHTML = (L.session.audio?.transcript || []).map(entry =>
      '<div class="transcript-entry"><strong>' + esc(entry.speaker || tr("Speaker")) + '</strong>' + esc(entry.dialogue || entry.text || "") + '</div>').join("");
    $("#transcript-toggle").hidden = !L.session.audio?.transcript?.length;
  }
  $("#transcript-toggle").onclick = () => {
    const show = $("#transcript-list").hidden;
    $("#transcript-list").hidden = !show; $("#chapter-list").hidden = show;
    $("#transcript-toggle").setAttribute("aria-expanded", String(show));
    $("#transcript-toggle").textContent = tr(show ? "Chapters" : "Transcript");
  };
  $("#replay-button").onclick = () => { audio.currentTime = 0; L.ended = false; $("#learning-recap").hidden = true; togglePlay(); };
  $("#recap-guide").onclick = () => { L.view = "visual-guide"; L.expanded = false; applyView(); $("#guide-card").scrollIntoView({behavior:"smooth",block:"center"}); };
  function setBackgroundInert(value) {
    $("main").inert = value; $(".site-header").inert = value;
    $("#phone-preview-toggle").inert = value; $("#mobile-player").inert = value;
  }
  function showPanel(type) {
    if (!L.session) return;
    if (!L.panel) L.returnFocus = document.activeElement;
    L.panel = type;
    $("#learning-panel").hidden = false; $("#panel-backdrop").hidden = false;
    document.body.classList.add("panel-open"); setBackgroundInert(true);
    $("#question-panel").hidden = type !== "ask"; $("#source-panel").hidden = type !== "source";
    $("#panel-title").textContent = tr(type === "ask" ? "Ask Clarity" : "View source");
    $("#panel-kicker").textContent = "";
    $("#close-panel").focus({preventScroll:true});
  }
  function closePanel() {
    $("#learning-panel").hidden = true; $("#panel-backdrop").hidden = true;
    document.body.classList.remove("panel-open"); setBackgroundInert(false); L.panel = null;
    if (L.returnFocus?.isConnected && !L.returnFocus.closest("[hidden]")) L.returnFocus.focus({preventScroll:true});
  }
  function openAsk() {
    if (!currentNode()) return;
    showPanel("ask"); L.sourceFromAsk = false;
    $("#question-context").textContent = L.session.sample ? tr(currentNode().label) : currentNode().label;
    $("#sample-question-note").hidden = !L.session.sample;
    renderQuestions();
  }
  function openSource(ids = [], fromAsk = false) {
    if (!L.session) return;
    L.sourceFromAsk = fromAsk;
    showPanel("source");
    $("#back-to-question").hidden = !fromAsk;
    $("#panel-source-name").textContent = L.session.sourceName;
    $("#source-passages").innerHTML = L.session.passages.map(p =>
      '<div class="source-passage ' + (ids.includes(p.id) ? "is-highlighted" : "") + '" id="passage-' + esc(p.id) + '"><strong>' + (p.section ? tr("Section {number}",{number:esc(p.section)}) : p.page ? tr("Page {number}",{number:esc(p.page)}) : tr("PASSAGE {number}", {number:esc(p.id.slice(1))})) + ' · ' + esc(p.id) + '</strong>' + esc(p.text) + '</div>').join("");
    requestAnimationFrame(() => {
      const target = ids.length ? $("#passage-" + ids[0]) : null;
      if (target) target.scrollIntoView({block:"center",behavior:"instant"});
      else $("#source-panel").scrollTop = 0;
    });
  }
  $("#ask-concept").onclick = openAsk; $("#mini-ask").onclick = openAsk; $("#guide-ask").onclick = openAsk;
  $("#view-source").onclick = () => openSource();
  $("#concept-source").onclick = () => openSource(currentNode()?.sourceIds || []);
  $("#close-panel").onclick = closePanel; $("#panel-backdrop").onclick = closePanel;
  $("#back-to-question").onclick = () => { showPanel("ask"); renderQuestions(); };
  function renderQuestions() {
    if (!L.session) return;
    let html = L.session.questions.map(item =>
      '<article class="question-item"><p class="question-user">' + esc(item.question) + '</p><div class="answer-label">CLARITY · ' +
      esc(item.sample ? tr(item.contextLabel) : item.contextLabel) + '</div><p class="question-answer">' + esc(item.sample ? tr(item.answer) : item.answer) + '</p><div class="answer-sources">' +
      item.sourceIds.map(id => '<button type="button" data-source-id="' + esc(id) + '">' + tr("Source {number}", {number:esc(id.slice(1))}) + ' ↗</button>').join("") + '</div></article>').join("");
    if (L.asking) html += '<article class="question-item"><p class="question-user">' + esc(L.pendingQuestion) + '</p><div class="answer-label">CLARITY</div><div class="question-pending" role="status" aria-label="' + tr("Preparing an answer") + '"><i></i><i></i><i></i></div></article>';
    if (L.failedQuestion) html += '<div class="question-failure" role="status">' + tr("Couldn’t answer. Try again.") + '<button type="button" id="retry-question">' + tr("Try again") + '</button></div>';
    $("#question-history").innerHTML = html;
    $$("[data-source-id]").forEach(button => { button.onclick = () => openSource([button.dataset.sourceId], true); });
    if ($("#retry-question")) $("#retry-question").onclick = () => askQuestion(L.failedQuestion);
    $("#send-question").disabled = L.asking;
    $$("[data-question]").forEach(b => b.disabled = L.asking);
    $("#question-form-hint").textContent = L.asking ? tr("Thinking…") : "";
    requestAnimationFrame(() => { $("#question-history").scrollTop = $("#question-history").scrollHeight; });
  }
  async function askQuestion(question) {
    if (L.asking || !question.trim() || !currentNode()) return;
    L.asking = true; L.failedQuestion = ""; L.pendingQuestion = question.trim();
    $("#question-input").value = "";
    renderQuestions();
    const sid = L.session.id;
    try {
      const answer = await api("/sessions/" + sid + "/ask", {method:"POST",timeout:200000,
        body:{question:L.pendingQuestion, conceptId:currentNode().id, chapterIndex:L.chapter}});
      if (L.session.id === sid && !L.session.questions.some(q => q.id === answer.id)) {
        L.session.questions.push(answer);
        if(L.session.sessionStorage === "browser") store("clarity:questions:" + sid, L.session.questions.slice(-50));
      }
    } catch { L.failedQuestion = L.pendingQuestion; }
    finally { L.asking = false; L.pendingQuestion = ""; renderQuestions(); }
  }
  $("#question-form").onsubmit = event => { event.preventDefault(); askQuestion($("#question-input").value); };
  $("#question-input").onkeydown = event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); askQuestion(event.target.value); }
  };
  $$("[data-question]").forEach(button => { button.onclick = () => askQuestion(button.dataset.question); });
  function updateMiniPlayer() {
    const mobile = matchMedia("(max-width:760px)").matches;
    const cardOffscreen = $("#podcast-card").getBoundingClientRect().bottom < 100;
    const show = mobile && L.inView && L.session?.stages.audio.status === "ready" && (L.view === "visual-guide" || L.expanded || cardOffscreen);
    $("#mobile-player").hidden = !show; area.classList.toggle("has-mini-player", show);
  }
  $("#mini-now").onclick = () => { L.view = "podcast"; L.expanded = false; applyView(); $("#podcast-card").scrollIntoView({behavior:"smooth",block:"center"}); };
  new IntersectionObserver(([entry]) => { L.inView = entry.isIntersecting; updateMiniPlayer(); },{threshold:0}).observe(area);
  window.addEventListener("scroll", updateMiniPlayer, {passive:true}); window.addEventListener("resize", updateMiniPlayer);
  $$('[data-action="add-source"]').forEach(button => { button.onclick = () => {
    if (L.panel) closePanel();
    history.replaceState(null, "", "#source");
    $("#source").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});
    $("#source-title").focus({preventScroll:true});
  }; });
  $$('[data-action="sample"]').forEach(button => { button.onclick = () => {
    $("#try-example").click();
    generate(buildLearningSetup());
  }; });
  $('.nav-links a[href="#learning"]').addEventListener("click", () => {
    area.hidden = false; updateNavigationLocation();
    if (!L.session) {
      const sid = retrieve("clarity:last-session", null);
      if (sid) loadSession(sid);
    }
  }, true);
  $$('a[href="#home"], a[href="#source"], a[href="#learning"]').forEach(link => {
    link.addEventListener("click", () => history.replaceState(null, "", link.getAttribute("href")), true);
  });
  $("#audio-wave").innerHTML = Array.from({length:69}, (_, i) => {
    const distance = Math.abs(i-34) / 34, envelope = Math.pow(1-distance,1.3);
    const height = 6 + envelope * (45 + 23*Math.pow(Math.cos((i-34)*.82),2));
    return '<i style="--h:' + height + 'px;--d:' + (-(i*.173)%2) + 's"></i>';
  }).join("");
  function closePhone() {
    $("#phone-preview").hidden = true;
    $("#phone-frame").src = "about:blank";
    setBackgroundInert(false); document.body.classList.remove("panel-open");
    $("#phone-preview-toggle").focus({preventScroll:true});
    if (L.session && Number.isFinite(audio.duration)) audio.currentTime = Math.min(pref().time || 0, audio.duration);
  }
  $("#phone-preview-toggle").onclick = () => {
    audio.pause(); savePref();
    const url = new URL(location.href);
    url.searchParams.set("phone", "1");
    if (L.session) url.searchParams.set("session", L.session.id);
    url.hash = L.inView ? "learning" : $("#source").getBoundingClientRect().top < innerHeight/2 ? "source" : "home";
    $("#phone-frame").src = url.href; $("#phone-preview").hidden = false;
    setBackgroundInert(true); document.body.classList.add("panel-open"); $("#phone-close").focus();
  };
  $("#phone-close").onclick = closePhone;
  function handleEscape() {
    if (!$("#speed-menu").hidden) { $("#speed-menu").hidden = true; $("#speed-button").setAttribute("aria-expanded","false"); $("#speed-button").focus(); }
    else if (!$("#phone-preview").hidden) closePhone();
    else if (L.panel) closePanel();
    else if (phoneMode && window.parent !== window) { savePref(); window.parent.postMessage({type:"clarity:escape"},location.origin); }
  }
  document.addEventListener("keydown", event => {
    const dialog = !$("#phone-preview").hidden ? $("#phone-preview") : L.panel ? $("#learning-panel") : null;
    if (event.key === "Escape") handleEscape();
    if (event.key === "Tab" && dialog) {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea, input, a[href], iframe')].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("pagehide", savePref);
  document.addEventListener("clarity:language", () => {
    if (L.session) renderSession();
    syncPlayback();
    $("#transcript-toggle").textContent = tr($("#transcript-list").hidden ? "Transcript" : "Chapters");
    if (L.panel) $("#panel-title").textContent = tr(L.panel === "ask" ? "Ask Clarity" : "View source");
    if (L.panel === "ask") renderQuestions();
    if (!$("#audio-error").hidden) $("#audio-error").textContent = tr($("#audio-error").textContent);
  });
  if (phoneMode) document.body.classList.add("phone-mode");
  const requested = new URLSearchParams(location.search).get("session");
  const resume = requested || retrieve("clarity:last-session", null);
  const demo = new URLSearchParams(location.search).get("demo");
  if (["bicycle","flatland","boids"].includes(demo)) {
    window.ClarityExamples.load(demo).then(()=>generate(buildLearningSetup())).catch(()=>{});
  } else if (resume) loadSession(resume, location.hash === "#learning");
  else if (location.hash === "#learning") goToLearning();
})();
