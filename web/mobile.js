/* Mobile tabs keep the same source form, learning session, and audio element mounted. */
(() => {
  "use strict";
  const narrow = matchMedia("(max-width: 760px)");
  const body = document.body;
  const nav = document.querySelector("#mobile-nav");
  const links = [...nav.querySelectorAll("a")];
  const positions = new Map();
  const views = new Map([
    ["home", "hero-title"], ["source", "source-title"], ["learning", "learning-title"], ["me", "mobile-account-title"]
  ]);
  const account = document.querySelector(".account-wrap");
  const desktopActions = account.parentElement;
  const menuToggle = document.querySelector("#menu-toggle");
  const accountSection = document.querySelector("#me");
  const viewport = window.visualViewport;
  const embedded = window.parent !== window && new URLSearchParams(location.search).get("phone") === "1";
  const tabFromHash = () => {
    const id = location.hash.slice(1);
    return views.has(id) ? id : "home";
  };
  let current = null;
  let originalScrollRestoration = history.scrollRestoration;

  function show(tab, {reset = false, focus = false} = {}) {
    if (current && current !== tab) positions.set(current, scrollY);
    const changed = current !== tab;
    current = tab;
    body.dataset.mobileTab = tab;
    if (tab === "learning") document.getElementById(tab).hidden = false;
    nav.style.setProperty("--tab-index", [...views.keys()].indexOf(tab));
    for (const link of links) {
      if (link.hash === "#" + tab) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (changed || reset) window.scrollTo({top:reset ? 0 : positions.get(tab) || 0, behavior:"instant"});
    if (focus) document.getElementById(views.get(tab))?.focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent("clarity:tab", {detail:{tab}}));
  }

  function navigate(tab, options) {
    if (!narrow.matches || !views.has(tab)) return false;
    if (location.hash !== "#" + tab) history.pushState(null, "", "#" + tab);
    show(tab, options);
    return true;
  }

  function updateKeyboard() {
    const editing = narrow.matches && document.activeElement?.matches("textarea, input[type=search], input[type=text]");
    const covered = viewport && editing ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
    body.classList.toggle("mobile-keyboard-open", covered > 100);
    body.style.setProperty("--keyboard-inset", covered + "px");
  }

  function layout() {
    if (narrow.matches) {
      originalScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
      document.querySelector("#mobile-account-actions").append(account);
      accountSection.hidden = nav.hidden = false;
      show(tabFromHash());
    } else if (current) {
      const section = document.getElementById(current === "me" ? "home" : current);
      if (current === "me") history.replaceState(null, "", "#home");
      current = null;
      delete body.dataset.mobileTab;
      desktopActions.insertBefore(account, menuToggle);
      accountSection.hidden = nav.hidden = true;
      history.scrollRestoration = originalScrollRestoration;
      window.scrollTo({top:section.offsetTop, behavior:"instant"});
      document.dispatchEvent(new CustomEvent("clarity:tab", {detail:{tab:null}}));
    }
    updateKeyboard();
  }

  if (embedded) body.classList.add("phone-mode");
  window.ClarityMobile = {get active() { return narrow.matches; }, get tab() { return current; }, navigate};
  narrow.addEventListener("change", layout);
  window.addEventListener("hashchange", () => { if (narrow.matches) show(tabFromHash()); });
  viewport?.addEventListener("resize", updateKeyboard);
  viewport?.addEventListener("scroll", updateKeyboard);
  for (const event of ["focusin", "focusout"]) document.addEventListener(event, () => requestAnimationFrame(updateKeyboard));
  layout();
})();
