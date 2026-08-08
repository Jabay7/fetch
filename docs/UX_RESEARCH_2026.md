# Consumer retail UX research — August 2026

Research behind the visual system in `src/constants/theme.ts` and the
components built on it. Findings only; the reasoning for each decision lives
in the code it produced.

## The strategic finding

Across the competitive set — Aisle Finder, EurKart, InstaAisle, AisleSeeker,
Pointr — every product is a crowdsourced-or-scraped data play. **The data, not
the UI, is the moat.** Lowe's ships an explicit accuracy-feedback loop, and
Instacart bet on pick-to-light hardware *instead of* aisle numbers.

The consistent signal is that **aisle data is chronically stale industry-wide**,
so freshness is the defensible axis rather than presentation. This is the one
place FetchNFind's provenance model is already ahead: every location carries
its source and the time it was verified.

## Colour — why not green

A multi-retailer app puts its own chrome directly beside retailer logos, and
the category is spoken for:

| Hue | Owned by |
| --- | --- |
| Red | Target, Walgreens, CVS, Meijer, H-E-B |
| Blue | Walmart, Kroger, Lowe's, Best Buy, Rite Aid |
| Orange | Home Depot |
| Green | Instacart, Whole Foods, Publix, Sprouts |
| Yellow | Best Buy accent, Dollar General |

Indigo is the distinctive hue no major US retailer owns. Adopted as
`tint: #4338CA` (light) / `#A5B4FC` (dark).

Dark mode with white-background product photography needs the surface lifted
rather than pushed to pure black, or packaging shots glow. Material 3's tonal
elevation is the applicable pattern: raised surfaces lighten instead of
casting shadows, which are invisible on near-black.

## Where the aisle goes

Only Lowe's gives an in-list aisle a real visual treatment: a two-column card
with `Aisle 65` in **blue bold** plus `Bay 8` in the left column beside the
photo. Target, Walmart, Home Depot and Albertsons all hold aisle data but
surface it inside a product page or store mode rather than in results.

Nobody treats the aisle as the primary answer. That is the opening — hence
signage-style presentation borrowed from transit and airport wayfinding
(`src/components/location-badge.tsx`), where a code must read from across a
concourse.

## Product card anatomy

No industry standard exists. The clearest split is **price-above-title**
(Target, Instacart — grocery, velocity) vs **price-below-title** (Home Depot,
Lowe's, Best Buy, Walgreens — considered purchases), correlating with how much
metadata the card carries.

- **Home Depot** — brand bold inline with title, `Model#`, price largest with
  superscript cents, then two fulfilment rows.
- **Walgreens** — the heaviest card; a green-checkmark triple-stack for
  fulfilment eats the most vertical space.
- **Kroger** — image, brand+name, size, price, unit price, badges. No aisle,
  no ratings.
- **Target** — price *first*, ranges across variants, no brand/title split.

FetchNFind keeps price below the title but subordinates it to the aisle, since
finding is the job the app is hired for.

*Unverified: image aspect ratios for every retailer — text extraction does not
preserve layout.*

## Search before you type

| App | Empty-focus state |
| --- | --- |
| Walmart | Recent Views + Recent Searches, max 5, with Clear All |
| Home Depot | `RECENTLY SCANNED` thumbnail row; mic + barcode + camera in-field |
| Target | Search + scan, then 11 labelled categories, then popular items |
| Instacart | Popular terms from the last 7 days; vanish on first keystroke |
| Walgreens | Scrolling icon+label chip row (Weekly Ad, Schedule vaccination) |
| Lowe's | Search is a **FAB**, not a tab; becomes a floating pill showing the live query |

Instacart shows a thumbnail in autocomplete only once a term has **≥3
conversions** — a neat guard against illustrating a term whose top result is
not yet trustworthy. Its autosuggest also only fires after 3 characters,
leaving a real empty-state gap.

**Applied:** the idle search screen now leads with *products* found before at
this store, with thumbnail and the aisle we gave — not just term strings
(`src/lib/recently-found.ts`). Recent terms follow.

## Baymard 2026 benchmark (11,000+ scores, 30 apps)

- **90%** lack a submit button beside the search field
- **33%** don't persist the query on the results page
- **42%** show repetitive autocomplete suggestions — Lowe's cited as an
  exemplar for clean, non-duplicative suggestions

FetchNFind persists the query and does not duplicate suggestions.

## Platform guidance applied

- **Tab bars** must hold destinations, not actions — so barcode scanning
  belongs in the search field (as Home Depot, Best Buy and Walgreens all do),
  never as a fifth tab.
- **WCAG 2.2 AA** — 4.5:1 normal text, 3:1 large text and UI components.
  Enforced token-by-token in `src/lib/__tests__/contrast.test.ts`, which fails
  the build on regression. The aisle badge is held to AAA (7:1) because it is
  the one thing that must be readable at arm's length in a store.
- **Reduced motion** must be honoured; no animation is load-bearing.

## Still open

Target's and Walmart's aisle typography, current tab bars for four retailers,
Kroger's search empty state, and card image aspect ratios. All resolvable with
in-store observation rather than more desk research.
