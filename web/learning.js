/* One learning session, one persistent audio element, two ways to understand. */
(() => {
  "use strict";
  const tr = (...args) => window.ClarityUI.t(...args);
  const icon = name => '<svg class="ui-icon" aria-hidden="true"><use href="#icon-' + name + '"/></svg>';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const area = $("#learning"), audio = $("#learning-audio");
  const mobile = window.ClarityMobile;
  const transcript = $("#transcript-reader"), transcriptHome = transcript.parentElement;
  const apiBase = window.CLARITY_API_BASE || (location.protocol === "file:" ? "http://127.0.0.1:4317" : "");
  const phoneMode = new URLSearchParams(location.search).get("phone") === "1";
  const L = { session: null, view: "podcast", expanded: false, node: null, chapter: 0, zoom: 1,
    audioSid: null, guideSid: null, poll: null, busy: false, asking: false, panel: null,
    returnFocus: null, showTranscript: false, captions: false, pendingQuestion: "", failedQuestion: null,
    savedAt: 0, ended: false, hasPlayed: false, restoreTime: null };
  let transcriptLines = [], activeCaption = -1;
  let openSetting = null, sleepTimer = null;
  const volumeKey = "clarity:volume";
  let volume = readVolume(), audioContext, volumeGain;
  audio.volume = .5;
  const nativeVolume = audio.volume === .5;
  audio.volume = 1;
  const errors = {
    service_unavailable: "The service is busy. Try again.",
    service_timeout: "This is taking longer than expected. You can try again.",
    model_access: "The model connection needs attention. Check the API configuration.",
    model_limit: "The model service has reached a limit. Check your API balance and try again.",
    daily_limit: "Today’s generation limit has been reached. Try again tomorrow.",
    invalid_result: "This part couldn't be prepared correctly. Try again.",
    interrupted: "Preparation was interrupted. Your source is still here.",
    generation_failed: "This part couldn't be prepared. Try again."
  };
  const stages = {
    source: "Reading the source",
    guide: "Creating the guide",
    audio: "Creating the podcast"
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function retrieve(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function readVolume() {
    const saved = retrieve(volumeKey, 1);
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 1;
  }
  function pref() { return retrieve("clarity:learning:" + L.session?.id, {}); }
  function savePref() {
    if (!L.session) return;
    store("clarity:learning:" + L.session.id, {
      view:L.view, node:L.node, zoom:L.zoom, time:L.restoreTime ?? (Number.isFinite(audio.currentTime) ? audio.currentTime : 0),
      speed:audio.playbackRate, chapter:L.chapter, captions:L.captions
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
        const message = detail?.code === "live_generation_paused" && !route.endsWith("/ask") ? "Choose an example to generate a result." :
          detail?.message || (typeof detail === "string" ? detail : "Something couldn't be completed. Please try again.");
        throw new Error(tr(message));
      }
      return value;
    } catch (error) {
      if (error.name === "AbortError") throw new Error(tr("The connection took too long. Please try again."));
      if (error instanceof TypeError) throw new Error(tr("The connection was interrupted. Try again."));
      throw error;
    } finally { clearTimeout(timer); }
  }
  function goToLearning(focus = false) {
    if (mobile.navigate("learning", {reset:focus, focus})) return;
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
  function showGenerationFeedback(message) {
    $("#generation-feedback").textContent = message;
    $("#generation-feedback").hidden = false;
  }
  async function generate(setup, expectedSample = null) {
    if (L.busy) return false;
    L.busy = createState.generating = true;
    const form = $("#create-form"), examples = $(".example-library"), progress = $("#create-preparation");
    $("#generation-feedback").hidden = true;
    $("#preparing-source").textContent = sourceName(setup);
    form.hidden = examples.hidden = true;
    progress.hidden = false;
    $("#source").scrollIntoView({behavior:"instant", block:"start"});
    progress.focus({preventScroll:true});
    // Give the preparation view a readable interval even for prebuilt results.
    const visibleInterval = new Promise(resolve => setTimeout(resolve, 650));
    let session;
    try {
      const sampleId = expectedSample || await window.ClarityExamples.identify(setup.source.text);
      session = await api("/sessions", {
        method:"POST", body:{text:setup.source.text, name:sourceName(setup), mode:setup.mode,
          sample:!!sampleId, sampleId, inputType:setup.source.type}
      });
      await visibleInterval;
    } catch (error) {
      showGenerationFeedback(error.message);
    } finally {
      L.busy = createState.generating = false;
      progress.hidden = true;
      form.hidden = examples.hidden = false;
      updateSetup();
    }
    if (!session) {
      $("#continue-button").focus();
      return false;
    }
    audio.pause(); L.ended = false;
    adoptSession(session, true);
    goToLearning(true);
    beginPolling();
    return true;
  }
  async function openExample(id, directLink = false) {
    if (L.busy || createState.openingExample) return;
    $('[data-action="add-source"]').click();
    createState.openingExample = true;
    const form = $("#create-form");
    const sampleButton = $('[data-action="sample"]');
    form.inert = true;
    sampleButton.disabled = true;
    $("#generation-feedback").hidden = true;
    window.ClarityExamples.setOpening(id);
    updateSetup();
    let setup;
    try {
      setup = await window.ClarityExamples.load(id);
    } catch {
      showGenerationFeedback(tr("Couldn't open this example. Try again."));
    } finally {
      createState.openingExample = false;
      form.inert = false;
      sampleButton.disabled = false;
      window.ClarityExamples.setOpening(null);
      updateSetup();
    }
    if (setup && directLink) await generate(setup, id);
  }
  $$("[data-example]").forEach(button => { button.onclick = () => openExample(button.dataset.example); });
  document.addEventListener("clarity:generate", event => { event.preventDefault(); generate(event.detail); });
  function adoptSession(session, fresh = false) {
    area.hidden = false;
    const changed = L.session?.id !== session.id;
    if (changed) {
      if (L.guideSid) {
        const previousFrame = $("#guide-frame");
        const frame = previousFrame.cloneNode(false);
        frame.removeAttribute("srcdoc");
        frame.removeAttribute("src");
        frame.addEventListener("load", sendGuideState);
        previousFrame.replaceWith(frame);
      }
      L.audioSid = null; L.guideSid = null; L.expanded = false; L.ended = false;
      L.hasPlayed = false;
      $("#guide-content").style.removeProperty("--guide-natural-height");
      $("#learning-recap").hidden = true;
      L.showTranscript = false;
      L.failedQuestion = null;
      closePlaybackSetting();
      setSleepTimer(0);
      $("#transcript-search").value = "";
      audio.pause(); audio.removeAttribute("src"); audio.load();
      L.session = session;
      if(session.sessionStorage === "browser") L.session.questions = retrieve("clarity:questions:" + session.id, []);
      const p = fresh ? {} : pref();
      L.view = p.view || session.initialView; L.node = p.node || null; L.zoom = p.zoom || 1;
      L.chapter = p.chapter || 0;
      L.restoreTime = p.time || 0;
      L.captions = p.captions === true;
      audio.defaultPlaybackRate = p.speed || 1;
      audio.playbackRate = p.speed || 1;
      syncPlaybackRate();
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
    const currentId = L.session?.id;
    try {
      const session = await api("/sessions/" + sid);
      if (L.session?.id !== currentId) return;
      adoptSession(session);
      if (scroll) goToLearning();
      beginPolling();
    } catch (error) {
      if (scroll && L.session?.id === currentId) {
        area.hidden = false;
        $("#learning-empty").hidden = false;
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
      try {
        const session = await api("/sessions/" + sid);
        if (L.session?.id !== sid) return;
        adoptSession(session);
      } catch (error) {
        if (L.session?.id !== sid) return;
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
      '</span><div class="step-copy"><strong>' + tr(stages[name]) + '</strong><p>' +
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
    $("#learning-title").textContent = s.sample ? tr(s.title) : s.title;
    $("#generation-scene").hidden = ready;
    $("#result-scene").hidden = !ready;
    $("#generation-steps").innerHTML = Object.entries(s.stages).map(([name, stage]) => stageHTML(name, stage)).join("");
    $("#generation-scene").classList.toggle("is-error", failed && !s.active);
    $("#generation-title").textContent = tr(failed && !s.active ? "Preparation interrupted" : "Preparing your learning");
    $("#task-strip").replaceChildren();
    if (ready) {
      renderPart("audio");
      renderPart("guide");
      $("#ask-concept").hidden = !s.guide;
      $("#mini-ask").hidden = !s.guide;
      if (s.guide) renderGuideDetails();
      else $("#playing-chapter").textContent = tr("Podcast");
      $("#chapters-toggle").hidden = !s.guide?.chapters.length;
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
      placeholder.innerHTML = (error ? icon("alert") : '<span class="small-spinner" aria-hidden="true"></span>') +
        '<p>' + esc(tr(error ? errors[stage.error] || errors.generation_failed : stages[part])) + '</p>' +
        (error ? '<button class="lesson-action" data-retry="' + part + '" type="button">' + tr("Retry") + '</button>' : "");
    }
    if (part === "audio" && ready && L.audioSid !== L.session.id) {
      L.audioSid = L.session.id;
      audio.src = apiBase + L.session.audio.url;
      $("#audio-error").hidden = true;
      loadTranscript();
    }
    if (part === "guide") {
      if (ready && L.guideSid !== L.session.id) {
        L.guideSid = L.session.id;
        const frame = $("#guide-frame"), sid = L.session.id;
        const sampleId = L.session.sampleId || (L.session.sample && L.session.guideTemplate === "bicycle-v1" ? "bicycle" : "");
        const guideUrl = L.session.guideUrl || (L.session.sample && sampleId ? "/prepared/" + sampleId + ".html" :
          L.session.guideTemplate === "structured-v1" ? "/api/clarity/sessions/" + sid + "/guide" : "");
        if (guideUrl) {
          fetch(apiBase + guideUrl, {cache:"no-cache",signal:AbortSignal.timeout(30000)})
            .then(response => { if (!response.ok) throw new Error("Guide unavailable"); return response.text(); })
            .then(html => { if (L.guideSid === sid) frame.srcdoc = html; })
            .catch(() => {
              if (L.guideSid !== sid) return;
              L.guideSid = null;
              L.session.stages.guide = {status:"error", error:"service_unavailable"};
              renderSession();
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
    const guide = L.session.guide;
    if (L.node && !guide.nodes.some(n => n.id === L.node)) L.node = null;
    const signature = L.session.id + "|" + window.ClarityUI.language + "|" + (L.session.audio?.url || "") + "|" + JSON.stringify(guide.chapters);
    if ($("#chapter-list").dataset.signature !== signature) {
      $("#chapter-list").dataset.signature = signature;
      $("#chapter-list").innerHTML = guide.chapters.map((chapter, i) =>
        '<button class="chapter-button" type="button" data-chapter="' + i + '"><span class="chapter-number">' + String(i+1).padStart(2,"0") +
        '</span><span>' + esc(L.session.sample ? tr(chapter.title) : chapter.title) +
        '</span><span class="chapter-time" id="chapter-time-' + i + '"></span></button>').join("");
      $$(".chapter-button").forEach(button => {
        button.onclick = () => { selectChapter(Number(button.dataset.chapter)); closePanel(); };
      });
      $("#recap-list").innerHTML = guide.takeaways.map(text => '<li>' + esc(L.session.sample ? tr(text) : text) + '</li>').join("");
    }
    updateConcept(); updateChapter(); updateCueLabels();
  }
  function updateConcept() {
    const node = currentNode();
    if (!node) return;
    const sample = L.session.sample;
    const overview = sample && !L.node;
    const label = sample ? tr(node.label) : node.label;
    $("#concept-title").textContent = overview ? tr(L.session.guide.takeaways[0]) : label;
    $("#concept-explanation").hidden = overview;
    $("#concept-explanation").textContent = sample ? tr(node.explanation) : node.explanation;
    if (L.panel === "ask") $("#question-context").textContent = label;
  }
  function selectNode(id) {
    if (!L.session?.guide?.nodes.some(n => n.id === id)) return;
    L.node = id; updateConcept(); sendGuideState(); savePref();
  }
  function cues() {
    const data = L.session?.audio;
    if (data?.cues) return data.cues;
    return (data?.cueFractions || []).map(f => f * audioDuration());
  }
  function updateCueLabels() {
    const positions = cues(), duration = audioDuration();
    positions.forEach((time, i) => {
      const label = $("#chapter-time-" + i);
      if (label) label.textContent = (L.session.audio.approximateCues ? "~" : "") + clock(time);
    });
    $("#chapter-marks").innerHTML = L.session?.audio?.approximateCues ? "" : positions
      .filter(time => time > 0 && time < duration)
      .map(time => '<i style="--at:' + time / duration * 100 + '%"></i>').join("");
  }
  function selectChapter(index) {
    if (!L.session?.guide?.chapters[index]) return;
    L.chapter = index;
    const nodeId = L.session.guide.chapters[index].nodeIds[0];
    if (nodeId) selectNode(nodeId);
    seekTo(cues()[index]);
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
    $("#mini-title").textContent = L.session.sample ? tr(chapterTitle) : chapterTitle;
  }
  function sendGuideState() {
    const frame = $("#guide-frame");
    frame.contentWindow?.postMessage({type:"clarity:select", id:currentNode()?.id}, "*");
    frame.contentWindow?.postMessage({type:"clarity:language", language:window.ClarityUI.language}, "*");
    frame.contentWindow?.postMessage({type:"clarity:theme", theme:document.documentElement.dataset.theme}, "*");
    frame.contentWindow?.postMessage({type:"clarity:zoom", zoom:L.zoom}, "*");
    frame.contentWindow?.postMessage({type:"clarity:layout", active:L.view === "visual-guide" && (!mobile.active || mobile.tab === "learning"), expanded:L.expanded, viewportHeight:innerHeight}, "*");
    $("#zoom-reset").textContent = Math.round(L.zoom * 100) + "%";
    $("#zoom-out").disabled = L.zoom <= .7;
    $("#zoom-in").disabled = L.zoom >= 1.6;
  }
  $("#guide-frame").addEventListener("load", sendGuideState);
  document.addEventListener("clarity:theme", sendGuideState);
  window.addEventListener("message", event => {
    if (event.data?.type === "clarity:escape") {
      if (event.source === $("#guide-frame").contentWindow) handleEscape();
      else if (event.source === $("#phone-frame").contentWindow && event.origin === location.origin && !$("#phone-preview").hidden) closePhone();
      return;
    }
    if (event.source === $("#guide-frame").contentWindow && event.data?.type === "clarity:guide-size") {
      if (["bicycle-v1","explorable-v1","structured-v1"].includes(L.session?.guideTemplate) && Number.isFinite(event.data.height) && event.data.height > 0) {
        $("#guide-content").style.setProperty("--guide-natural-height",Math.min(2200,event.data.height)+"px");
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
    const guideView = L.view === "visual-guide";
    if (guideView) closePlaybackSetting();
    const authoredGuide = ["bicycle-v1","explorable-v1"].includes(L.session?.guideTemplate);
    area.dataset.view = L.view;
    area.classList.toggle("is-expanded", L.expanded);
    area.classList.toggle("has-authored-guide", authoredGuide || L.session?.guideTemplate === "structured-v1");
    $("#guide-card").hidden = !guideView;
    $("#expand-guide").hidden = !guideView || L.session.stages.guide.status !== "ready";
    $("#guide-zoom").hidden = authoredGuide;
    $$("button[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === L.view)));
    $("#expand-guide").setAttribute("aria-expanded", String(L.expanded));
    $("#expand-guide span").textContent = $("#expand-guide").title = tr(L.expanded ? "Restore visual guide" : "Expand visual guide");
    $("#expand-guide use").setAttribute("href", L.expanded ? "#icon-collapse" : "#icon-expand");
    sendGuideState();
    updateMiniPlayer(); savePref();
  }
  $$("button[data-view]").forEach(button => { button.onclick = () => { L.view = button.dataset.view; L.expanded = false; applyView(); }; });
  $("#expand-guide").onclick = () => {
    L.expanded = !L.expanded; applyView();
  };
  async function togglePlay() {
    if (!L.session?.audio || L.session.stages.audio.status !== "ready") return;
    try {
      if (audio.paused) {
        if (audio.ended) { audio.currentTime = 0; L.ended = false; $("#learning-recap").hidden = true; }
        await Promise.all([applyPodcastVolume(true), audio.play()]);
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
    if (playing) L.hasPlayed = true;
    area.classList.toggle("is-playing", playing);
    $("#play-button").setAttribute("aria-label", tr(playing ? "Pause podcast" : "Play podcast"));
    $("#play-button").innerHTML = icon(playing ? "pause" : "play");
    $("#mini-play").innerHTML = icon(playing ? "pause" : "play");
    $("#mini-play").setAttribute("aria-label", tr(playing ? "Pause podcast" : "Play podcast"));
    updateMiniPlayer();
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
  function audioDuration() {
    return Number.isFinite(audio.duration) ? audio.duration : L.session?.audio?.duration || 0;
  }
  function seekTo(time) {
    if (!Number.isFinite(time) || L.session?.stages.audio.status !== "ready") return;
    L.ended = false;
    $("#learning-recap").hidden = true;
    if (audio.readyState && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(audio.duration, Math.max(0, time));
      updateAudioTime();
    } else L.restoreTime = Math.max(0, time);
    savePref();
  }
  function updateAudioTime() {
    const duration = audioDuration();
    const progress = duration ? audio.currentTime / duration * 100 : 0;
    $("#audio-elapsed").textContent = clock(audio.currentTime);
    $("#audio-duration").textContent = clock(duration);
    $("#audio-seek").value = String(progress);
    $("#audio-seek").setAttribute("aria-valuetext", clock(audio.currentTime) + " / " + clock(duration));
    $("#audio-seek").style.setProperty("--progress", progress + "%");
    $("#mini-time").textContent = clock(audio.currentTime) + " / " + clock(duration);
    $("#mini-progress").style.setProperty("--mini-progress", progress + "%");
    const positions = cues();
    if (positions.length) {
      let chapter = 0;
      positions.forEach((time, i) => { if (audio.currentTime + .1 >= time) chapter = i; });
      if (chapter !== L.chapter) {
        L.chapter = chapter;
        const id = L.session.guide?.chapters[chapter]?.nodeIds[0];
        if (id && L.view === "podcast" && !L.panel) selectNode(id);
        updateChapter();
      }
    }
    updateCaption();
    if (sleepTimer) syncSleepTimer();
    if (Date.now() - L.savedAt > 700) { L.savedAt = Date.now(); savePref(); }
  }
  audio.addEventListener("timeupdate", updateAudioTime);
  audio.addEventListener("ended", () => {
    setSleepTimer(0);
    L.ended = true; $("#learning-recap").hidden = false; savePref(); syncPlayback();
  });
  $("#audio-seek").oninput = event => {
    seekTo(Number(event.target.value) / 100 * audioDuration());
  };
  $("#skip-back").onclick = () => seekTo(audio.currentTime - 15);
  $("#skip-forward").onclick = () => seekTo(audio.currentTime + 15);
  function closePlaybackSetting(restoreFocus = false) {
    if (!openSetting) return;
    const button = openSetting;
    openSetting = null;
    $("#" + button.getAttribute("aria-controls")).hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus({preventScroll:true});
  }
  $$(".playback-setting > button").forEach(button => {
    button.onclick = () => {
      const opening = openSetting !== button;
      closePlaybackSetting();
      if (!opening) return;
      openSetting = button;
      $("#" + button.getAttribute("aria-controls")).hidden = false;
      button.setAttribute("aria-expanded", "true");
    };
  });
  function dismissPlaybackSetting(event) {
    if (openSetting && !openSetting.parentElement.contains(event.target)) closePlaybackSetting();
  }
  document.addEventListener("click", dismissPlaybackSetting);
  document.addEventListener("focusin", dismissPlaybackSetting);
  function applyPodcastVolume(activate = false) {
    if (nativeVolume) {
      audio.volume = volume;
      return;
    }
    // Some mobile browsers leave HTMLMediaElement.volume fixed at 1.
    if (!volumeGain && activate && volume !== 1 && window.AudioContext) {
      const context = new AudioContext();
      const gain = context.createGain();
      context.createMediaElementSource(audio).connect(gain).connect(context.destination);
      audioContext = context;
      volumeGain = gain;
    }
    if (!volumeGain) {
      audio.muted = volume === 0;
      return;
    }
    audio.muted = false;
    volumeGain.gain.value = volume;
    if (activate && audioContext.state !== "running") return audioContext.resume();
  }
  const volumeSlider = $("#audio-volume");
  function syncVolume() {
    const percent = Math.round(volume * 100);
    volumeSlider.value = percent;
    volumeSlider.setAttribute("aria-valuetext", percent + "%");
    $("#volume-value").value = percent + "%";
    const button = $("#volume-button");
    button.setAttribute("aria-label", tr("Volume") + " · " + percent + "%");
    button.querySelector("use").setAttribute("href", volume ? "#icon-volume" : "#icon-muted");
  }
  volumeSlider.oninput = () => {
    volume = Number(volumeSlider.value) / 100;
    syncVolume();
    store(volumeKey, volume);
    applyPodcastVolume(true)?.catch(() => {});
  };
  window.addEventListener("storage", event => {
    if (event.key !== volumeKey) return;
    volume = readVolume();
    applyPodcastVolume();
    syncVolume();
  });
  applyPodcastVolume();
  syncVolume();
  function syncPlaybackRate() {
    const rate = audio.playbackRate;
    $("#speed-value").textContent = rate + "×";
    $("#speed-button").setAttribute("aria-label", tr("Playback speed") + " · " + rate + "×");
    $$("[data-speed]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === rate)));
  }
  $$("[data-speed]").forEach(button => { button.onclick = () => {
    audio.playbackRate = Number(button.dataset.speed);
    audio.defaultPlaybackRate = audio.playbackRate;
    syncPlaybackRate();
    closePlaybackSetting(true);
    savePref();
  }; });
  function setSleepTimer(minutes) {
    clearInterval(sleepTimer?.interval);
    sleepTimer = minutes ? {end:Date.now() + minutes * 60000, interval:setInterval(syncSleepTimer, 1000)} : null;
    $$("[data-timer]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.timer) === minutes)));
    $("#timer-button").classList.toggle("is-timed", !!sleepTimer);
    syncSleepTimer();
  }
  function syncSleepTimer() {
    const remaining = sleepTimer ? Math.ceil((sleepTimer.end - Date.now()) / 1000) : 0;
    if (sleepTimer && remaining <= 0) {
      audio.pause();
      setSleepTimer(0);
      savePref();
      return;
    }
    const text = sleepTimer ? clock(remaining) : "";
    const value = $("#timer-value"), button = $("#timer-button");
    const label = sleepTimer ? tr("Pause in {time}", {time:text}) : tr("Sleep timer");
    value.hidden = !sleepTimer;
    if (value.textContent !== text) value.textContent = text;
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  }
  $$("[data-timer]").forEach(button => { button.onclick = () => {
    setSleepTimer(Number(button.dataset.timer));
    closePlaybackSetting(true);
  }; });
  document.addEventListener("visibilitychange", syncSleepTimer);
  function loadTranscript() {
    const data = L.session.audio;
    const timed = (data.captions || []).filter(line => Number.isFinite(line.start) && line.start >= 0 && line.text?.trim())
      .sort((a,b) => a.start - b.start);
    transcriptLines = timed.length ? timed : (data.transcript || []).map(entry => ({
      speaker:entry.speaker, text:entry.dialogue || entry.text || ""
    })).filter(line => line.text.trim());
    activeCaption = -1;
    $("#captions-line").textContent = "";
    $("#captions-line").lang = data.language || (L.session.sample ? "en" : "");
    $("#transcript-list").lang = $("#captions-line").lang;
    renderTranscript();
    updateReadingControls();
    updateCaption();
  }
  function updateReadingControls() {
    const hasTiming = Number.isFinite(transcriptLines[0]?.start);
    $("#captions-toggle").hidden = !hasTiming;
    $("#captions-toggle").setAttribute("aria-pressed", String(L.captions));
    $("#captions-line").hidden = !hasTiming || !L.captions;
    $("#transcript-toggle").hidden = !transcriptLines.length;
    $("#transcript-toggle").setAttribute("aria-expanded", String(L.showTranscript));
    $("#transcript-reader").hidden = !L.showTranscript;
    $("#transcript-current").hidden = !hasTiming;
  }
  function updateCaption() {
    if (!Number.isFinite(transcriptLines[0]?.start)) return;
    const index = transcriptLines.findLastIndex(line => line.start <= audio.currentTime + .005);
    if (index === activeCaption) return;
    const previous = $("#transcript-list [aria-current=true]");
    if (previous) previous.removeAttribute("aria-current");
    activeCaption = index;
    $("#captions-line").textContent = transcriptLines[index]?.text || "";
    $("#transcript-list [data-line='" + index + "']")?.setAttribute("aria-current", "true");
  }
  function renderTranscript() {
    const query = $("#transcript-search").value.trim().toLocaleLowerCase();
    const list = $("#transcript-list");
    list.innerHTML = transcriptLines.map((line, i) => {
      if (query && !line.text.toLocaleLowerCase().includes(query)) return "";
      const time = clock(line.start);
      return '<div class="transcript-entry" data-line="' + i + '"' + (i === activeCaption ? ' aria-current="true"' : '') + '>' +
        (Number.isFinite(line.start) ? '<button class="transcript-time" type="button" aria-label="' + esc(tr("Play from {time}", {time})) + '" data-play-line="' + i + '">' + time + '</button>' : "") +
        '<div>' + (line.speaker ? '<strong>' + esc(line.speaker) + '</strong>' : "") + '<p>' + esc(line.text) + '</p></div></div>';
    }).join("");
    $("#transcript-empty").hidden = !!list.childElementCount;
  }
  function showCurrentLine() {
    const list = $("#transcript-list"), row = list.querySelector("[aria-current=true]");
    if (row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }
  $("#transcript-search").oninput = () => {
    renderTranscript();
    $("#transcript-list").scrollTop = 0;
  };
  $("#transcript-current").onclick = () => {
    if ($("#transcript-search").value) {
      $("#transcript-search").value = "";
      renderTranscript();
    }
    showCurrentLine();
  };
  $("#transcript-list").onclick = event => {
    const button = event.target.closest("[data-play-line]");
    if (!button) return;
    seekTo(transcriptLines[Number(button.dataset.playLine)].start);
    if (audio.paused) togglePlay();
  };
  $("#captions-toggle").onclick = () => {
    L.captions = !L.captions;
    updateReadingControls();
    savePref();
  };
  $("#transcript-toggle").onclick = () => {
    if (mobile.active) showPanel("transcript");
    else {
      L.showTranscript = !L.showTranscript;
      updateReadingControls();
      if (L.showTranscript) showCurrentLine();
    }
  };
  function mountTranscript(inPanel) {
    (inPanel ? $("#learning-panel") : transcriptHome).append(transcript);
    L.showTranscript = inPanel;
    updateReadingControls();
  }
  function panelTitle() {
    if (L.panel === "chapters") return "Chapters";
    if (L.panel === "transcript") return "Transcript";
    return L.panel === "ask" ? "Ask Clarity" : "View source";
  }
  $("#replay-button").onclick = () => { audio.currentTime = 0; L.ended = false; $("#learning-recap").hidden = true; togglePlay(); };
  $("#recap-guide").onclick = () => { L.view = "visual-guide"; L.expanded = false; applyView(); $("#guide-card").scrollIntoView({behavior:"smooth",block:"center"}); };
  function setBackgroundInert(value) {
    $("main").inert = value; $(".site-header").inert = value;
    $(".skip-link").inert = value; $("#mobile-nav").inert = value;
    $("#phone-preview-toggle").inert = value; $("#mobile-player").inert = value;
  }
  function showPanel(type) {
    if (!L.session) return;
    closePlaybackSetting();
    if (!L.panel) L.returnFocus = document.activeElement;
    if (L.panel === "transcript") mountTranscript(false);
    L.panel = type;
    $("#learning-panel").dataset.panel = type;
    $("#learning-panel").hidden = false; $("#panel-backdrop").hidden = false;
    document.body.classList.add("panel-open"); setBackgroundInert(true);
    $("#question-panel").hidden = type !== "ask"; $("#source-panel").hidden = type !== "source";
    $("#chapters-panel").hidden = type !== "chapters";
    $("#back-to-question").hidden = true;
    $("#panel-title").textContent = tr(panelTitle());
    if (type === "transcript") {
      mountTranscript(true);
      showCurrentLine();
    }
    $("#close-panel").focus({preventScroll:true});
  }
  function closePanel() {
    if (L.panel === "transcript") mountTranscript(false);
    $("#learning-panel").hidden = true; $("#panel-backdrop").hidden = true;
    document.body.classList.remove("panel-open"); setBackgroundInert(false); L.panel = null;
    if (L.returnFocus?.isConnected && !L.returnFocus.closest("[hidden]")) L.returnFocus.focus({preventScroll:true});
  }
  function openAsk() {
    if (!currentNode()) return;
    showPanel("ask");
    $("#question-context").textContent = L.session.sample ? tr(currentNode().label) : currentNode().label;
    renderQuestions();
  }
  function openSource(ids = [], fromAsk = false) {
    if (!L.session) return;
    showPanel("source");
    $("#back-to-question").hidden = !fromAsk;
    $("#panel-source-name").textContent = L.session.sourceName;
    $("#source-passages").innerHTML = L.session.passages.map(p => {
      const label = p.section ? tr("Section {number}", {number:p.section}) :
        p.page ? tr("Page {number}", {number:p.page}) : tr("Passage {number}", {number:p.id.slice(1)});
      return '<div class="source-passage ' + (ids.includes(p.id) ? "is-highlighted" : "") + '" id="passage-' + esc(p.id) +
        '"><strong>' + esc(label) + '</strong>' + esc(p.text) + '</div>';
    }).join("");
    requestAnimationFrame(() => {
      const target = ids.length ? $("#passage-" + ids[0]) : null;
      if (target) target.scrollIntoView({block:"center",behavior:"instant"});
      else $("#source-panel").scrollTop = 0;
    });
  }
  $("#ask-concept").onclick = openAsk; $("#mini-ask").onclick = openAsk;
  $("#chapters-toggle").onclick = () => {
    showPanel("chapters");
    $("#chapters-panel").scrollTop = 0;
  };
  $("#view-source").onclick = () => openSource(L.view === "visual-guide" ? currentNode()?.sourceIds : []);
  $("#close-panel").onclick = closePanel; $("#panel-backdrop").onclick = closePanel;
  $("#back-to-question").onclick = () => { showPanel("ask"); renderQuestions(); };
  function renderQuestions() {
    if (!L.session) return;
    let html = L.session.questions.map(item =>
      '<article class="question-item"><p class="question-user">' + esc(tr(item.question)) +
      '</p><p class="question-answer">' + esc(item.sample ? tr(item.answer) : item.answer) + '</p><div class="answer-sources">' +
      item.sourceIds.map(id => '<button type="button" data-source-id="' + esc(id) + '">' + tr("Source {number}", {number:esc(id.slice(1))}) + ' ↗</button>').join("") + '</div></article>').join("");
    if (L.asking) html += '<article class="question-item"><p class="question-user">' + esc(tr(L.pendingQuestion)) + '</p><div class="question-pending" role="status" aria-label="' + tr("Preparing an answer") + '"><i></i><i></i><i></i></div></article>';
    if (L.failedQuestion) html += '<div class="question-failure" role="status">' + esc(tr(L.failedQuestion.message)) + '<button type="button" id="retry-question">' + tr("Try again") + '</button></div>';
    $("#question-history").innerHTML = html;
    $$("[data-source-id]").forEach(button => { button.onclick = () => openSource([button.dataset.sourceId], true); });
    if ($("#retry-question")) $("#retry-question").onclick = () => askQuestion(L.failedQuestion.text);
    $("#send-question").disabled = L.asking;
    $$("[data-question]").forEach(b => b.disabled = L.asking);
    $("#question-form-hint").textContent = L.asking ? tr("Thinking…") : "";
    requestAnimationFrame(() => { $("#question-history").scrollTop = $("#question-history").scrollHeight; });
  }
  async function askQuestion(question) {
    if (L.asking || !question.trim() || !currentNode()) return;
    L.asking = true; L.failedQuestion = null; L.pendingQuestion = question.trim();
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
    } catch (error) {
      if (L.session.id === sid) L.failedQuestion = {text:L.pendingQuestion,message:error.message};
    }
    finally { L.asking = false; L.pendingQuestion = ""; renderQuestions(); }
  }
  $("#question-form").onsubmit = event => { event.preventDefault(); askQuestion($("#question-input").value); };
  $("#question-input").onkeydown = event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); askQuestion(event.target.value); }
  };
  $$("[data-question]").forEach(button => { button.onclick = () => askQuestion(button.dataset.question); });
  function updateMiniPlayer() {
    const controlsAboveScreen = $("#play-button").getBoundingClientRect().bottom < 16;
    const show = mobile.active && L.session?.stages.audio.status === "ready" &&
      (mobile.tab === "learning" ? L.view === "visual-guide" || controlsAboveScreen : L.hasPlayed && !L.ended);
    $("#mobile-player").hidden = !show;
  }
  $("#mini-now").onclick = () => { L.view = "podcast"; L.expanded = false; applyView(); mobile.navigate("learning", {reset:true}); };
  document.addEventListener("clarity:tab", () => {
    if (!mobile.active && L.panel === "transcript") closePanel();
    else if (mobile.active && L.showTranscript && !L.panel) mountTranscript(false);
    closePlaybackSetting();
    sendGuideState();
    updateMiniPlayer();
  });
  window.addEventListener("scroll", updateMiniPlayer, {passive:true});
  window.addEventListener("hashchange", () => { if (mobile.active && L.panel) closePanel(); });
  window.addEventListener("resize", () => { sendGuideState(); updateMiniPlayer(); });
  $$('[data-action="add-source"]').forEach(button => { button.onclick = () => {
    if (L.panel) closePanel();
    if (mobile.navigate("source", {focus:true})) return;
    history.replaceState(null, "", "#source");
    $("#source").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});
    $("#source-title").focus({preventScroll:true});
  }; });
  $('[data-action="sample"]').onclick = () => openExample("bicycle");
  $('.nav-links a[href="#learning"]').addEventListener("click", () => {
    area.hidden = false; updateNavigationLocation();
    if (!L.session) {
      const sid = retrieve("clarity:last-session", null);
      if (sid) loadSession(sid);
    }
  }, true);
  $$('a[href="#home"], a[href="#source"], a[href="#learning"]').forEach(link => {
    link.addEventListener("click", () => {
      if (!mobile.active) history.replaceState(null, "", link.getAttribute("href"));
    }, true);
  });
  $("#audio-wave").innerHTML = Array.from({length:81}, (_, i) => {
    const envelope = Math.sin(Math.PI * i / 80) ** 1.5;
    const height = 5 + envelope * (40 + 32 * Math.cos(i * .23) ** 2 + 18 * Math.sin(i * .89) ** 2);
    const alpha = .44 + envelope * .37;
    return '<i style="--h:' + height + 'px;--alpha:' + alpha + ';--d:' + (-(i*.173)%2) + 's"></i>';
  }).join("");
  function closePhone() {
    $("#phone-preview").hidden = true;
    $("#phone-frame").src = "about:blank";
    setBackgroundInert(false); document.body.classList.remove("panel-open");
    $("#phone-preview-toggle").focus({preventScroll:true});
    if (L.session && Number.isFinite(audio.duration)) audio.currentTime = Math.min(pref().time || 0, audio.duration);
  }
  const phonePreview = $("#phone-preview");
  function fitPhone() {
    if (!phonePreview.hidden) {
      phonePreview.style.setProperty("--phone-scale", Math.min(1, (innerHeight - 40) / 866, (innerWidth - 36) / 407));
    }
  }
  window.addEventListener("resize", () => {
    if (!phonePreview.hidden && mobile.active) closePhone();
    else fitPhone();
  });
  $("#phone-preview-toggle").hidden = false;
  $("#phone-preview-toggle").onclick = () => {
    audio.pause(); savePref();
    const url = new URL(location.href);
    url.searchParams.set("phone", "1");
    url.searchParams.delete("demo");
    url.searchParams.delete("session");
    if (L.session) url.searchParams.set("session", L.session.id);
    url.hash = updateNavigationLocation();
    $("#phone-frame").src = url.href; $("#phone-preview").hidden = false;
    fitPhone();
    setBackgroundInert(true); document.body.classList.add("panel-open"); $("#phone-close").focus();
  };
  $("#phone-close").onclick = closePhone;
  function handleEscape() {
    if (openSetting) closePlaybackSetting(true);
    else if (!$("#phone-preview").hidden) closePhone();
    else if (L.panel) closePanel();
    else if (phoneMode && window.parent !== window) { savePref(); window.parent.postMessage({type:"clarity:escape"},location.origin); }
  }
  document.addEventListener("keydown", event => {
    const dialog = !$("#phone-preview").hidden ? $("#phone-preview") : L.panel ? $("#learning-panel") : null;
    if (event.key === "Escape") handleEscape();
    if (event.key === "Tab" && dialog) {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea, input, a[href], iframe, [tabindex="0"]')].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("pagehide", savePref);
  document.addEventListener("clarity:language", () => {
    if (L.session) renderSession();
    syncPlayback();
    syncPlaybackRate();
    syncVolume();
    syncSleepTimer();
    if (L.showTranscript) renderTranscript();
    if (L.panel) $("#panel-title").textContent = tr(panelTitle());
    if (L.panel === "ask") renderQuestions();
    if (!$("#audio-error").hidden) $("#audio-error").textContent = tr($("#audio-error").textContent);
  });
  const requested = new URLSearchParams(location.search).get("session");
  const resume = requested || retrieve("clarity:last-session", null);
  const demo = new URLSearchParams(location.search).get("demo");
  if (["bicycle","flatland","boids"].includes(demo)) {
    openExample(demo, true);
  } else if (resume) loadSession(resume, location.hash === "#learning");
  else if (location.hash === "#learning") goToLearning();
})();
