/**
 * A group's face, one owner for every surface that names a group — the
 * board's doors, the add sheet's group picker, and the word card's group
 * chips. Our ink icon when the group has one; else the group's photo; else,
 * for a family's own group, the picture of its first word (derived at
 * paint time, so it follows that word's picture), else its initial; a
 * seed group without an icon keeps its seed emoji.
 */
import { groupPage } from "../shared/groups.mjs";

/* 026 D7: door icons are ink glyphs from the chrome icon family. A
 * group with no entry keeps its seed emoji, so a new group shows its gap
 * until it gets a glyph. `places` serves Going out, `actions` (a pointing
 * hand) serves Touch & sound, the palette serves Colors, `food` (fork
 * and knife) serves Dinner, and Who & which borrows the chrome question
 * mark. */
export const GROUP_ICONS = {
  grp_people: "/icons/groups/people.svg",
  grp_my_words: "/icons/groups/my_words.svg",
  grp_social: "/icons/groups/social.svg",
  grp_numbers: "/icons/groups/numbers.svg",
  grp_time: "/icons/groups/time.svg",
  grp_home: "/icons/groups/home.svg",
  grp_animals: "/icons/groups/animals.svg",
  grp_body: "/icons/groups/body.svg",
  grp_feelings: "/icons/groups/feelings.svg",
  grp_clothes: "/icons/groups/clothes.svg",
  grp_play: "/icons/groups/play.svg",
  grp_drinks: "/icons/groups/drinks.svg",
  grp_little_words: "/icons/groups/little_words.svg",
  grp_more_people: "/icons/groups/more_people.svg",
  grp_more_doing: "/icons/groups/more_doing.svg",
  grp_more_where: "/icons/groups/more_where.svg",
  grp_more_describing: "/icons/groups/more_describing.svg",
  grp_more_people_thirty: "/icons/groups/more_people.svg",
  grp_more_doing_thirty: "/icons/groups/more_doing.svg",
  grp_more_where_thirty: "/icons/groups/more_where.svg",
  grp_more_describing_thirty: "/icons/groups/more_describing.svg",
  grp_going_out: "/icons/groups/places.svg",
  grp_senses: "/icons/groups/actions.svg",
  grp_colors: "/icons/groups/describing.svg",
  grp_who_which: "/icons/question.svg",
  grp_breakfast: "/icons/groups/breakfast.svg",
  grp_lunch: "/icons/groups/lunch.svg",
  grp_dinner: "/icons/groups/food.svg",
  grp_snack: "/icons/groups/snack.svg",
  grp_treats: "/icons/groups/treats.svg",
  grp_fruit: "/icons/groups/fruit.svg",
  grp_things: "/icons/groups/things.svg",
  grp_describing: "/icons/groups/shapes.svg",
  grp_outside: "/icons/groups/outside.svg",
  grp_school: "/icons/groups/school.svg",
  grp_art_music: "/icons/groups/art_music.svg",
  grp_bathroom: "/icons/groups/bathroom.svg",
  grp_screens: "/icons/groups/screens.svg",
  grp_weather: "/icons/groups/weather.svg",
};


/** Stable asset URLs resolve saved choices without loading the picker library. */
export const iconUrl = (name) => name.startsWith("extra_")
  ? `/group-icons/${name}.svg` : `/icons/groups/${name}.svg`;

function groupIconUrl(row) {
  if (row.glyph?.startsWith("picture:")) return null;
  if (row.glyph?.startsWith("icon:")) return iconUrl(row.glyph.slice(5));
  return GROUP_ICONS[row.id] ?? null;
}

/** The effective ink icon, including built-in defaults, for picker usage. */
export function groupIconName(row) {
  return groupIconUrl(row)?.split("/").at(-1).replace(".svg", "") ?? null;
}

/** The face's first-word fallback: slot order on page 1. */
function firstPicture(db, groupId, locale) {
  try {
    return groupPage(db, groupId, 0, locale).find((r) => r.photo_key || r.art) ?? null;
  } catch {
    return null; // no layout yet (tests, a bare profile)
  }
}

/** `span.glyph` holding the group's face. */
export function groupGlyph(row, { db, locale, loadPhotoURL }) {
  const g = document.createElement("span");
  g.className = "glyph";
  const icon = groupIconUrl(row);
  const img = (src, cls = "") => {
    const i = document.createElement("img");
    if (cls) i.className = cls;
    i.src = src;
    i.alt = "";
    i.addEventListener("error", () => {
      g.replaceChildren();
      g.textContent = row.name?.trim()[0]?.toUpperCase() ?? "•";
      g.title = "Picture unavailable. Connect to the internet to load it.";
    });
    return i;
  };
  const photo = (key) => loadPhotoURL(key).then((url) => {
    if (url) g.replaceChildren(img(url));
  }).catch(() => { g.title = "Picture unavailable"; });
  const pinned = row.glyph?.startsWith("picture:") ? row.glyph.slice(8) : null;
  if (pinned) {
    g.textContent = row.name?.trim()[0]?.toUpperCase() ?? "•";
    if (pinned.startsWith("blob:")) photo(pinned);
    else g.replaceChildren(img(pinned.startsWith("/") ? pinned : `/${pinned}`));
    return g;
  }
  if (icon) {
    g.appendChild(img(icon, "gicon"));
    return g;
  }
  // A family's own group with no picture yet shows its initial — ink, like
  // our icons; a seed group without an icon keeps its seed emoji.
  g.textContent = row.glyph
    ?? (row.kind === "custom" ? (row.name?.trim()[0]?.toUpperCase() ?? "•") : "🗂️");
  const first = !row.photo_key && row.kind === "custom" ? firstPicture(db, row.id, locale) : null;
  const blobKey = row.photo_key ?? first?.photo_key
    ?? (first?.art?.startsWith("blob:") ? first.art : null);
  if (blobKey) {
    photo(blobKey);
  } else if (first?.art) {
    g.replaceChildren(img(`/${first.art}`)); // our art: a static symbol
  }
  return g;
}
