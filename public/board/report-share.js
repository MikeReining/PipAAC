/**
 * Share report (Stats_And_Progress § 4.2): Color — the default, words as
 * their board tiles (board/report-art.js) — or Printer-friendly, ink and
 * grey. Opening the menu starts drawing the color report's pictures, so a
 * tap on Color can usually build and share at once: iPad only opens the
 * share sheet straight from a tap. Both come from shared/report.mjs.
 */
import { dashboard } from "../shared/dashboard.mjs";
import { REPORT_W, reportPdf } from "../shared/report.mjs";
import { reportArt } from "./report-art.js";

const DAY = 86_400_000;
const shortDay = (day) => new Date(day * DAY).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
const fullDay = (day) => new Date(day * DAY).toLocaleDateString([], { timeZone: "UTC" });

export function mountReportShare({ db, me, nameOf, roleOf, artOf, range, mode }) {
  const btn = document.getElementById("prog-share");
  const pop = document.createElement("span");
  pop.className = "prog-share-pop";
  pop.setAttribute("role", "menu");
  pop.hidden = true;
  for (const [style, label] of [["color", "Color"], ["print", "Printer-friendly"]]) {
    const b = document.createElement("button");
    b.dataset.style = style;
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    pop.append(b);
  }
  btn.insertAdjacentElement?.("afterend", pop);

  let colorArt = null;
  const inputs = () => {
    const { fromDay, toDay } = range();
    return {
      fromDay, toDay,
      meta: { userName: me.name || "This person", fromLabel: fullDay(fromDay), toLabel: fullDay(toDay) },
      file: `pip-progress-${fullDay(toDay).replaceAll("/", "-")}`,
    };
  };
  function close() {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
  function prepareColor() {
    const { fromDay, toDay, meta } = inputs();
    const dash = dashboard(db, fromDay, toDay, { nameOf, mode: mode() });
    colorArt = reportArt(dash, {
      userName: meta.userName, rangeLabel: `${shortDay(fromDay)} – ${shortDay(toDay)}`,
      nameOf, roleOf, artOf, width: REPORT_W,
    }).catch(() => null);
    return colorArt;
  }
  btn.addEventListener("click", () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    prepareColor();
  });
  pop.addEventListener("click", async (e) => {
    const style = e.target.closest("button")?.dataset.style;
    if (!style) return;
    close();
    const { fromDay, toDay, meta, file } = inputs();
    const color = style === "color" ? await (colorArt ?? prepareColor()) : null;
    const { pdf } = reportPdf(db, fromDay, toDay, meta, nameOf, mode(), color ?? {});
    await sharePdf(pdf, `${file}${color ? "" : "-print"}.pdf`);
    colorArt = null;
  });
  return { close };
}

async function sharePdf(pdf, name) {
  const file = new File([pdf], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Pip progress" }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
