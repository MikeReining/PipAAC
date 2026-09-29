/**
 * A tiny fake DOM for mount-level UI tests: every id resolves (created on
 * first use), nodes record listeners and children, and `fire` awaits the
 * handler so async UI paths can be asserted after they finish.
 */
export function el(tag = "div") {
  const node = {
    tagName: tag.toUpperCase(),
    id: "",
    value: "",
    textContent: "",
    placeholder: "",
    hidden: false,
    disabled: false,
    className: "",
    type: "",
    src: "",
    files: [],
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    parentElement: null,
    on: {},
    classList: {
      add(name) { if (!node.className.split(" ").includes(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(" ").filter((c) => c !== name).join(" "); },
      toggle(name, on) {
        const has = node.className.split(" ").includes(name);
        const want = on === undefined ? !has : !!on;
        if (want) node.classList.add(name); else node.classList.remove(name);
        return want;
      },
      contains(name) { return node.className.split(" ").includes(name); },
    },
    setAttribute(k, v) { node.attrs[k] = String(v); },
    getAttribute(k) { return node.attrs[k] ?? null; },
    addEventListener(type, fn) { (node.on[type] ??= []).push(fn); },
    async fire(type, ev = {}) {
      for (const fn of node.on[type] ?? []) await fn({ preventDefault() {}, stopPropagation() {}, ...ev });
    },
    async click() { await node.fire("click"); },
    focus() {},
    blur() {},
    remove() {
      const p = node.parentElement;
      if (p) p.children = p.children.filter((k) => k !== node);
    },
    append(...kids) { for (const k of kids) node.appendChild(k); },
    appendChild(kid) { kid.parentElement = node; node.children.push(kid); return kid; },
    prepend(kid) { kid.parentElement = node; node.children.unshift(kid); },
    replaceChildren(...kids) { node.children = []; node.append(...kids); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    set innerHTML(value) { if (value === "") node.children = []; },
    get innerHTML() { return ""; },
  };
  return node;
}

/** Install a document whose getElementById always answers. */
export function installDom() {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) { const n = el(); n.id = id; nodes.set(id, n); }
    return nodes.get(id);
  };
  globalThis.document = {
    getElementById: get,
    createElement: (tag) => el(tag),
    body: el("body"),
  };
  return get;
}

/** Depth-first walk — find rendered rows/buttons by predicate. */
export function findAll(node, pred, out = []) {
  for (const k of node.children ?? []) {
    if (pred(k)) out.push(k);
    findAll(k, pred, out);
  }
  return out;
}
