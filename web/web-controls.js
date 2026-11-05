/* Shared site controls for the web page and phone preview. */
(() => {
  const root = document.documentElement;
  const button = document.querySelector("#theme-toggle");
  const key = "clarity:theme";
  function setTheme(theme) {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(dark));
    button.querySelector("use").setAttribute("href", dark ? "#icon-sun" : "#icon-moon");
    document.dispatchEvent(new Event("clarity:theme"));
  }
  button.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
    try { localStorage.setItem(key, root.dataset.theme); } catch {}
  });
  window.addEventListener("storage", event => {
    if (event.key === key) setTheme(event.newValue);
  });
  setTheme(root.dataset.theme);
})();

(() => {
  let current = null;
  let leaveTimer;
  function close() {
    clearTimeout(leaveTimer);
    if (!current) return;
    current.tooltip.hidden = true;
    current.button.setAttribute("aria-expanded", "false");
    current = null;
  }
  function position() {
    const {button, tooltip} = current;
    const anchor = button.getBoundingClientRect();
    const {width, height} = tooltip.getBoundingClientRect();
    const gap = 5;
    const edge = 12;
    const left = Math.min(innerWidth - width - edge, Math.max(edge, anchor.left + (anchor.width - width) / 2));
    const below = anchor.bottom + gap;
    const top = below + height <= innerHeight - edge ? below : anchor.top - height - gap;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(edge, top) + "px";
  }
  for (const tip of document.querySelectorAll(".info-tip")) {
    const button = tip.querySelector(".info-button");
    const tooltip = tip.querySelector(".tooltip");
    const help = {tip, button, tooltip};
    function open() {
      if (current !== help) {
        close();
        current = help;
        tooltip.hidden = false;
        button.setAttribute("aria-expanded", "true");
      }
      clearTimeout(leaveTimer);
      position();
    }
    let pointerType = "";
    button.addEventListener("pointerdown", event => { pointerType = event.pointerType; });
    button.addEventListener("pointerenter", event => {
      if (event.pointerType !== "touch") open();
    });
    tooltip.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
    tip.addEventListener("pointerleave", event => {
      if (current === help && event.pointerType !== "touch") leaveTimer = setTimeout(close, 110);
    });
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible") && !pointerType) open();
    });
    button.addEventListener("click", () => {
      if (current === help && pointerType === "touch") close();
      else open();
      pointerType = "";
    });
    button.addEventListener("blur", () => { pointerType = ""; });
  }
  document.addEventListener("pointerdown", event => {
    if (current && !current.tip.contains(event.target)) close();
  });
  document.addEventListener("focusin", event => {
    if (current && !current.tip.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !current) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }, true);
  window.addEventListener("scroll", close, {passive:true});
  window.addEventListener("resize", close);
  document.addEventListener("clarity:language", () => { if (current) position(); });
})();

(() => {
  const toggle = document.querySelector("#account-toggle"), menu = document.querySelector("#account-menu");
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  function close(restore = false) {
    menu.hidden = true; toggle.setAttribute("aria-expanded", "false");
    if (restore) toggle.focus({preventScroll:true});
  }
  function open(index = 0) {
    menu.hidden = false; toggle.setAttribute("aria-expanded", "true");
    items[index].focus({preventScroll:true});
  }
  toggle.addEventListener("click", () => menu.hidden ? open() : close(true));
  toggle.addEventListener("keydown", event => {
    if (["ArrowDown","ArrowUp"].includes(event.key)) { event.preventDefault(); open(event.key === "ArrowUp" ? items.length-1 : 0); }
  });
  menu.addEventListener("keydown", event => {
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length-1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  document.addEventListener("click", event => { if (!event.target.closest(".account-wrap")) close(); });
  document.addEventListener("focusin", event => { if (!event.target.closest(".account-wrap")) close(); });
})();
