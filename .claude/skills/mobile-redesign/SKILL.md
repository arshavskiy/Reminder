---
name: mobile-redesign
description: Make a Reminder client page mobile-friendly (<=640px) — compact tables, icon-only actions, collapsible filters, 2-col stat cards, simple pagination. Use when asked to fix/compact/redesign a view for mobile.
---

Apply the mobile pattern used on Invoices, Expenses and Dashboard pages. Client only (`client/src`). Desktop layout must stay unchanged — every change is gated by breakpoint or `isMobile`.

## Ground rules
- Single mobile breakpoint: `@media (max-width: 640px)`. Layout shell uses 900px (`.content--fullpage`) and 720px (pagination bar).
- Icons: `@vicons/ionicons5` Outline only, via `<n-icon>`. No emoji, no second pack. Icon-only buttons need `n-tooltip` + `aria-label`.
- Use tokens (`--brand-color`, `--border-color`, `--bg-hover`, `--text-secondary`, `--radius-md`, `--color-warning`), not raw colors.
- RTL Hebrew: use `padding-inline-start/end`, never left/right.
- Scoped-style specificity: shared components repeat the class (`.mobile-action.mobile-action`) to beat Naive/global rules.
- Grid/flex children: always `min-width: 0`, else content overflows the viewport.
- No new deps beyond `@vueuse/core` (already installed).

## Shared building blocks (reuse, don't re-create)
| Component | Use |
|---|---|
| `MobileActionButton.vue` | Header/toolbar action. Icon slot + label; label hidden <=640px, 36px square. Props: `label`. |
| `MobileFilterPanel.vue` | Search + "Filters" toggle; fields collapse into a panel on mobile. Slot `search`, default slot = fields, prop `activeCount`. |
| `ResponsiveFilterButton.vue` | Filter chip; icon-only on mobile, icon picked from `filterKey` regex. Props: `label`, `count`, `filterKey`. |
| `MobileMappedValue.vue` | Text label -> icon on mobile (category, type, status, cash flow). Props: `value` (key for icon map), `label`. Add new keys to its icon map. |
| `PaginationBar.vue` | Already wraps + `page-slot=5` on mobile. |
| `PageHeader.vue` | Already shrinks title to 20px, hides subtitle. |

`global.css` mobile block already handles: table wrappers scroll horizontally, `th/td` padding 8px/12px font, `.n-data-table` min-width 640px, header action wrapping, root spacing tokens. Check it before adding page CSS — add a new wrapper class to its `:is(...)` list instead of duplicating.

## Recipes

### 1. Detect mobile in script
```ts
const isMobile = ref(false);
const updateIsMobile = () => { isMobile.value = window.innerWidth <= 640; };
onMounted(() => { updateIsMobile(); window.addEventListener("resize", updateIsMobile); });
onUnmounted(() => window.removeEventListener("resize", updateIsMobile));
```
Use only for things CSS can't do (props like `simple`, `show-size-picker`, currency format). Prefer CSS otherwise.

### 2. Compact data table (see `InvoicesPage.vue`)
- Hide low-value columns (date, client) via `display:none` on both `<col>` and `td/th` classes.
- Move hidden info into a second line under the primary cell: render a `__meta` span that is `display:none` on desktop and `display:flex; flex-basis:100%; font-size:11px; color: var(--text-secondary)` on mobile.
- Shrink: `th/td` padding `3px 4px`, font `10px`, `line-height:1.1`, `.icon-btn` 18px, `.n-icon`/`.btn-icon` 12px, checkbox box 12px, row-action gap 1px.
- Fixed narrow cols: select 34px, category/type 48px, amount 90px, actions 60px; supplier col `width:auto; min-width:120px`.
- Table `min-width: 340px` (was 880px). Drop decorative bits (vendor mark, no-file flag, secondary type flow).
- Swap text cells to `MobileMappedValue`; hide secondary ones with `v-if="!isMobile"`.
- Strip currency symbol on mobile amounts (`Intl.NumberFormat` without `style:"currency"`); shrink foreign-amount subtext to 8px.
- Pagination: `:simple="isMobile"`, `:show-size-picker="!isMobile"`, `:page-slot="isMobile ? 5 : 9"`, wrap container `flex-wrap`, `justify-content:center`.

### 3. Filters / toolbar
- Search + many chips: `MobileFilterPanel`; chips -> `ResponsiveFilterButton`.
- Selects that must stay visible: wrap in `.toolbar__filters-row` -> `display:flex; flex-wrap:nowrap; overflow-x:auto; gap:6px; -webkit-overflow-scrolling:touch`, hide scrollbar (`::-webkit-scrollbar{display:none}`), children `flex:0 0 auto; width:140px; min-width:140px`. One scrollable line, never stacked.
- Date range block: `width:100%; min-width:0`. Toolbar `gap:8px; margin:10px 0 12px`.

### 4. Summary / stat cards (see `ExpenseAnalyticsPage.vue`, `DashboardPage.vue`)
- Grid `repeat(2, minmax(0, 1fr))` instead of 1 col.
- Card: `min-height:0; padding:10px 12px; gap:8px`. Number 16–20px, label 11px / line-height 1.3.
- Card structure: `n-icon` (18px desktop, 15px mobile) + `<div>` with num/label. Icon color `--brand-color`, `--color-warning` for warn, opacity .85. Match icon treatment across pages (expense metrics hide icon on mobile; dashboard stats keep it).

### 5. Persisted user settings
`useLocalStorage` from `@vueuse/core`, namespaced key `pageName.field` (e.g. `expenseAnalytics.dateBasis`). Persist selects (basis, category, suppliers). Do NOT persist date range or proof filter — those reset to defaults on load (3-month range via `resolveDateRangePreset("3m")`, proof `paid`).

### 6. Page chrome
- `.content` padding 12px 10px 20px (<=900) / 10px 8px 16px (<=640); `.page { min-width:0 }`; app root `height:100dvh`.
- Header actions: `MobileActionButton`, wrap with `gap:4px`.

## Workflow
1. Read target view + `global.css` mobile block; list what is missing vs recipes above.
2. Edit view template/script/style (scoped `@media (max-width:640px)` at end of `<style>`).
3. `cd client; npm run build` — must pass.
4. Verify in browser pane: `preview_start` client dev (port 4173), `resize_window` to `mobile` (375x812), screenshot; check no horizontal page scroll, RTL correct, then reset to `desktop` and confirm desktop unchanged.
5. Commit per page, short imperative subject (e.g. `Compact invoices table for mobile`). Push `dev`; merge to `master` only when user asks.

## Checklist
- [ ] Nothing changes above 640px
- [ ] No page-level horizontal scroll at 375px
- [ ] Icon-only controls have tooltip + aria-label
- [ ] Logical (`inline-*`) padding for RTL
- [ ] Reused shared components; no duplicate CSS already in `global.css`
- [ ] `npm run build` passes
