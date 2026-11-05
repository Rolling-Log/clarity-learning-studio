/* Known readings are matched by their content, never by their filename. */
(() => {
  const tr = (...args) => window.ClarityUI.t(...args);
  ClarityUI.extend({
    "Examples":"示例", "Bicycle":"自行车", "Flatland":"平面国",
    "Text · Quick":"粘贴文本 · 快速", "Book · Deep":"书籍 · 深度", "Paper · Deep":"论文 · 深度",
    "Download book":"下载书籍", "Download paper":"下载论文", "Explore sample":"探索示例",
    "Open {title} example":"打开{title}示例", "Opening…":"正在打开…",
    "Couldn't open this example. Try again.":"暂时无法打开示例，请重试。",
    "500,000 characters max":"最多 500,000 字符",
    "Keep your text under 500,000 characters.":"请将文本控制在 500,000 字符以内。",
    "This source is longer than 500,000 characters. Choose a shorter excerpt.":"资料超过 500,000 字符，请选择较短的节选。",
    "Section {number}":"第 {number} 节", "Page {number}":"第 {number} 页"
  });

  const icons = {
    bicycle:'<circle cx="11" cy="30" r="8"/><circle cx="37" cy="30" r="8"/><path d="m11 30 10-16 6 16H11l21-16 5 16M21 14h11m-5 16-8-20h-4m17 4 2-5h5"/>',
    flatland:'<path d="M24 7v33M5 12c8-5 13-5 19-1 6-4 11-4 19 1v27c-8-5-13-5-19-1-6-4-11-4-19 1Z"/><path d="m10 18 8-1m-8 7 8-1m12-6 8 1m-8 5 8 1"/>',
    boids:'<path d="m7 8 11 5-11 5 3-5Zm22 6 11 5-11 5 3-5ZM15 29l11 5-11 5 3-5Z"/>'
  };
  const entries = [["bicycle","Bicycle","Text · Quick"],["flatland","Flatland","Book · Deep"],["boids","Boids","Paper · Deep"]];
  const panel = document.createElement("section");
  panel.className = "example-library";
  panel.innerHTML = entries.map(([id,title,kind]) =>
    '<button type="button" class="example-load" data-example="' + id + '" data-title="' + title + '" data-kind="' + kind +
    '"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    icons[id] + '</svg><span></span></button>').join("");
  document.querySelector("#create-form").after(panel);
  document.querySelector("#try-example").closest(".source-support").hidden = true;

  let opening = null;
  const buttons = [...panel.querySelectorAll("button")];
  function updateLabels() {
    panel.setAttribute("aria-label", tr("Examples"));
    buttons.forEach(button => {
      const title = tr(button.dataset.title);
      const active = opening === button.dataset.example;
      button.title = tr(button.dataset.kind);
      button.setAttribute("aria-label", active ? tr("Opening…") : tr("Open {title} example", {title}));
      button.querySelector("span").textContent = active ? tr("Opening…") : title;
    });
  }
  function setOpening(id) {
    opening = id;
    panel.setAttribute("aria-busy", String(!!id));
    buttons.forEach(button => { button.disabled = !!id; });
    updateLabels();
  }
  updateLabels();
  document.addEventListener("clarity:language", updateLabels);

  let manifest;
  function getManifest() {
    if (!manifest) {
      manifest = fetch("/examples/manifest.json", {signal:AbortSignal.timeout(12000)})
        .then(response => {
          if (!response.ok) throw new Error("Example catalogue unavailable");
          return response.json();
        })
        .then(data => { ClarityUI.extend(data.translations); return data; })
        .catch(error => { manifest = null; throw error; });
    }
    return manifest;
  }
  // A failed prefetch is retried when someone opens an example.
  getManifest().catch(() => {});

  async function identify(text) {
    try {
      const {items} = await getManifest();
      const canonical = text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      return items.find(item => item.textHash === hash)?.id || null;
    } catch { return null; }
  }
  async function load(id) {
    const {items} = await getManifest();
    const sample = items.find(item => item.id === id);
    if (!sample) throw new Error("Example unavailable");
    if (sample.file) {
      const response = await fetch("/examples/" + sample.file, {signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error("Example source unavailable");
      const blob = await response.blob();
      const file = new File([blob], sample.file, {type:blob.type});
      await selectFile(file);
      if (createState.file !== file || createState.input !== "file" || !activeSourceReady()) {
        throw new Error("Example source could not be read");
      }
    } else {
      sourceText.value = exampleText;
      switchSource("text");
    }
    document.querySelector('input[name="mode"][value="' + sample.mode + '"]').click();
    return buildLearningSetup();
  }
  window.ClarityExamples = {identify, load, setOpening};
})();
