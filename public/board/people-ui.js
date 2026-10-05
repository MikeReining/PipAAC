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
import { listUsers, putUser, removeUser, setHome } from "../shared/users.mjs";
import { appRoot } from "./viewport.js";
import { paintAvatar, setPhotoLoader } from "./avatar.js";
import { mountPersonCard } from "./person-card.js";
import { mountMyName } from "./team-name-ui.js";

const $ = (id) => document.getElementById(id);

export const REOPEN_KEY = "pip_reopen_settings";

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
export function pickPerson(rows, loadPhoto) {
  if (loadPhoto) setPhotoLoader(loadPhoto);
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
      paintAvatar(av, u);
      const t = document.createElement("span");
      t.textContent = nameOf(u);
      b.append(av, t);
      b.onclick = () => { wrap.remove(); resolve(u); };
      list.append(b);
    }
    wrap.append(h, list);
    appRoot().append(wrap);
  });
}

export function mountPeople({
  me, userStore, keyStore, flushDb, settings, saveUser, onHomeChanged = () => {},
  db, savePhoto, syncUploadBlob, loadPhoto,
  storage = sessionStorage, reload = () => location.reload(),
}) {
  if (loadPhoto) setPhotoLoader(loadPhoto);
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
      paintAvatar(av, u);
      const txt = document.createElement("span");
      txt.className = "set-whotext";
      const n = document.createElement("b");
      n.textContent = nameOf(u);
      const sub = document.createElement("small");
      const isLocked = u.id !== me.id && await locked(u);
      const pendingJoin = u.id !== me.id && !!u.sync?.pendingJoin;
      sub.textContent = u.id === me.id ? "Open now"
        : isLocked ? "Needs an Allow or recovery card"
          : pendingJoin ? "On this device — not linked yet"
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

  /** People on this device (015 slice 2, rows 2026-10-03): each person's
   *  avatar, their name edited in place, Switch and Remove. Who opens
   *  first is "When Pip opens" below. The active user's DB flushes before
   *  the tab reloads into the other user. */
  async function renderUsers() {
    const list = $("usr-list");
    const rows = await listUsers(userStore);
    list.innerHTML = "";
    for (const u of rows) {
      // One row per person: their avatar, their name edited in place,
      // and where they stand on this device (2026-10-03).
      const row = document.createElement("div");
      row.className = "usr-row";
      const av = document.createElement("span");
      av.className = "set-avatar";
      paintAvatar(av, u);
      const name = document.createElement("input");
      name.type = "text";
      name.className = "set-name-input";
      name.maxLength = 80;
      name.value = u.name ?? "";
      name.placeholder = "Name";
      name.setAttribute("aria-label", "Name");
      name.onchange = async () => {
        const n = name.value.trim();
        if (!n) { name.value = u.name ?? ""; return; } // a name can't be blank
        if (u.id === me.id) await saveUser({ name: n });
        else await putUser(userStore, { ...u, name: n, nameDirty: true });
        settings.paintNames();
        await renderOpens();
      };
      // Locked (015 slice 4): the account brought this user but not its
      // keys — they arrive by an Allow on another device or a QR card.
      // pendingJoin (audit F12): the keys came but relay registration
      // never succeeded — local-only until a later join clears it.
      const isLocked = await locked(u);
      const pendingJoin = !!u.sync?.pendingJoin;
      const sub = document.createElement("span");
      sub.className = "usr-sub";
      sub.textContent = isLocked ? "🔒 needs an Allow or QR card"
        : pendingJoin ? "on this device — not linked yet"
        : [u.id === me.id && "Open now", u.home && "Opens first"].filter(Boolean).join(" · ");
      row.append(av, name, sub);
      if (u.id !== me.id && !isLocked) {
        const sw = document.createElement("button");
        sw.className = "btn secondary";
        sw.textContent = "Switch";
        sw.onclick = () => switchTo(u.id, "team");
        row.append(sw);
        // Remove from this device only — the user stays on the relay and
        // other devices. Warn when this device may hold the only copy.
        const rm = document.createElement("button");
        rm.className = "btn secondary";
        rm.textContent = "Remove";
        rm.onclick = async () => {
          const label = u.name || "this user";
          const warn = u.sync?.userId
            ? `Remove ${label} from this device? The user stays on the relay and its other devices.`
            : `Remove ${label} from this device? It is not linked anywhere — its words will be gone unless a QR card exists.`;
          if (!confirm(warn)) return;
          await removeUser(userStore, u.id);
          await renderUsers();
        };
        row.append(rm);
      }
      // Which person opens first is Settings → "When Pip opens"
      // (people-ui.js), one control for one fact.
      list.append(row);
    }
    await renderOpens(); // the opens choice reads the same rows
  }


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

  /* Names and photos (2026-10-03): the open person's card on Overview
   * (person-card.js) and the adult's own name (team-name-ui.js). Both
   * follow the synced profile after each sync and on every open. */
  const card = db && mountPersonCard({
    db, me, saveUser, savePhoto, syncUploadBlob,
    onChange: () => { settings.paintNames(); renderUsers(); },
  });
  const myName = db && mountMyName({ db });
  function follow() {
    card?.render();
    settings.paintNames?.();
    myName?.follow();
  }

  return { switchTo, renderPop, renderOpens, renderUsers, closePop, follow };
}
