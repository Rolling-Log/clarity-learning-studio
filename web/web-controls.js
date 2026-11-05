/* The account actions remain the agreed decorative prototype entries. */
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
  items.forEach(item => item.addEventListener("click", () => close(true)));
})();
