# Age of Acquisition — the child-word spine

`aoa.csv` is `word,age`: the age in years at which native English speakers
report having learned each word. 41,900 words.

**Why it is here.** Our selection rule is *"is it common for CHILDREN to
encounter this word"*, and until now that was my guess. This measures it.

**It is not word frequency, and frequency cannot substitute for it.** Measured
2026-08-26 against an adult subtitle corpus:

| word | age learned | adult frequency rank |
| --- | --- | --- |
| `marshmallow` | **3.8** | 17,380 |
| `milkshake` | **4.9** | 17,532 |
| `mushroom` | **6.4** | 10,166 |
| `situation` | 9.3 | 831 |
| `mission` | 10.0 | 1,164 |

Adult frequency ranks `situation` twenty times commoner than `marshmallow`. For
a five-year-old that is exactly backwards, which is why frequency is only a
floor check here and age is the filter.

**How to read it.** Lower is earlier. Rough bands: under 5 is preschool, 5-6.5
is Kindergarten, 6.5-8 is Grade 1-2. A unit declares its ceiling.

**What it does NOT tell you** is how easily a word can be drawn — and that is a
spectrum, not a yes/no. `special` (5.0), `permission` (6.1) and `imagination`
(6.3) all sit inside the K band, and all three are drawable: imagination is a
child with a thought bubble holding a lightbulb. But each needs a composed
*scene* rather than an object, so it costs more and reads less reliably on a
card. Prefer the shorter, commoner, easier word; reach for a scene word only
when the pool is thin. Age filters the candidates; a person looks at what
survives. See `golden_phonics_checklist.md` § P3.

Source: Kuperman, Stadthagen-Gonzalez & Brysbaert (2012), *Age-of-acquisition
ratings for 30,000 English words*, Behavior Research Methods 44, 978-990;
expanded to inflected forms (51,715 entries) by the authors. Extracted here to
two columns. Do not edit; corrections belong upstream.

Owner of the reading code: `scripts/curriculum/childWords.mjs`.
