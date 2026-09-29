/**
 * People on this device — the Settings header switcher, the "When Pip
 * opens" choice, and the launch list (Sync_And_Web_Editing § 12.2).
 *
 * Truth stays in the registry (shared/users.mjs): `home` is which
 * person opens first; no home and many people means Pip opens on the
 * list. A switch is the same tab-level override Parent corner used
 * (sessionStorage `pip_active_user`), so the child's own device still
 * opens the child on the next launch.
 *
 * Switching from Settings reloads into the chosen person and reopens
 * Settings on the same page (`pip_reopen_settings`). Only this module
 * writes that flag, and only from inside the PIN-gated Settings, so it
 * never lets a child past the gate.
 */
import { listUsers, setHome } from "../shared/users.mjs";

const $ = (id) => document.getElementById(id);

export const REOPEN_KEY = "pip_reopen_settings";

const initial = (u) => (u.name?.trim()?.[0] ?? "").toUpperCase();
const nameOf = (u) => u.name?.trim() || "Unnamed";

/** Boot: which Settings page to reopen after a switch, once. */
export function takeReopen(storage = sessionStorage) {
  const v = storage.getItem(REOPEN_KEY);
  if (v) storage.removeItem(REOPEN_KEY);
  return v;
}

/** The launch list: many people on a device where nobody opens first.
 *  Last opened first — the registry already sorts that way. Shown
 *  before the board boots, so it carries no Settings chrome. */
export function pickPerson(rows) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "launch-list";
    const h = document.createElement("h1");
    h.textContent = "Who's talking?";
    const list = document.createElement("div");
    list.className = "launch-people";
    for (const u of rows) {
      const b = document.createElement("button");
      b.className = "launch-person";
      const av = document.createElement("span");
      av.className = "set-avatar";
      av.textContent = initial(u);
      const t = document.createElement("span");
      t.textContent = nameOf(u);
      b.append(av, t);
      b.onclick = () => { wrap.remove(); resolve(u); };
      list.append(b);
    }
    wrap.append(h, list);
    document.body.append(wrap);
  });
}

export function mountPeople({
  me, userStore, keyStore, flushDb, settings, onHomeChanged = () => {},
  storage = sessionStorage, reload = () => location.reload(),
}) {
  const who = $("set-who");
  const pop = $("set-pop");

  const locked = async (u) =>
    !!(u.sync?.userId && !(await keyStore.get(`user/${u.id}/key_e${u.sync.epoch ?? 1}`)));

  async function switchTo(id, section) {
    storage.setItem("pip_active_user", id);
    if (section) storage.setItem(REOPEN_KEY, section);
    await flushDb();
    reload();
  }

  async function renderPop() {
    pop.replaceChildren();
    for (const u of await listUsers(userStore)) {
      const b = document.createElement("button");
      b.className = "set-pop-person" + (u.id === me.id ? " on" : "");
      const av = document.createElement("span");
      av.className = "set-avatar";
      av.textContent = initial(u);
      const txt = document.createElement("span");
      txt.className = "set-whotext";
      const n = document.createElement("b");
      n.textContent = nameOf(u);
      const sub = document.createElement("small");
      const isLocked = u.id !== me.id && await locked(u);
      sub.textContent = u.id === me.id ? "Open now"
        : isLocked ? "Needs an Allow or recovery card"
          : u.home ? "Opens first" : "Tap to switch";
      txt.append(n, sub);
      b.append(av, txt);
      b.disabled = isLocked;
      if (u.id === me.id) b.onclick = () => closePop();
      else b.onclick = () => switchTo(u.id, settings.current());
      pop.append(b);
    }
    const add = document.createElement("button");
    add.className = "set-pop-act";
    add.textContent = "＋ Add a person";
    add.onclick = () => { closePop(); $("usr-add").click(); };
    const manage = document.createElement("button");
    manage.className = "set-pop-act";
    manage.textContent = "Manage people…";
    manage.onclick = () => { closePop(); settings.show("team"); };
    pop.append(add, manage);
  }

  function closePop() {
    pop.hidden = true;
    who.setAttribute("aria-expanded", "false");
  }
  who.addEventListener("click", async () => {
    if (!pop.hidden) return closePop();
    await renderPop();
    pop.hidden = false;
    who.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !e.target.closest("#set-pop, #set-who")) closePop();
  });

  /* "When Pip opens on this device": a person, or the list. */
  async function renderOpens() {
    const row = $("opens-row");
    const seg = $("opens-seg");
    const rows = await listUsers(userStore);
    row.hidden = rows.length < 2;
    seg.replaceChildren();
    const opts = [...rows.map((u) => [u.id, nameOf(u)]), ["", "Show the list"]];
    const homeId = rows.find((u) => u.home)?.id ?? "";
    for (const [id, label] of opts) {
      const b = document.createElement("button");
      b.textContent = label;
      b.dataset.v = id;
      b.classList.toggle("on", id === homeId);
      b.onclick = async () => {
        await setHome(userStore, id || null);
        me.home = id === me.id;
        onHomeChanged();
        await renderOpens();
      };
      seg.append(b);
    }
  }

  return { switchTo, renderPop, renderOpens, closePop };
}
