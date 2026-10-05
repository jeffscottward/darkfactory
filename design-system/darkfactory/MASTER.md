# DarkFactory Web Design System

> **Authority:** This file is the source of truth for every DarkFactory web surface.
> Before building a page, check `design-system/darkfactory/pages/<page-name>.md`.
> A page file may record deviations only; everything not explicitly overridden inherits this file.

**Project:** DarkFactory  
**Product:** Domain-neutral, production-grade application starter and AI-native architecture  
**Surfaces:** Public marketing and documentation site; authenticated application portal  
**Design posture:** Engineered, candid, refined, modular, and quietly confident

---

## 1. Product and Audience

### Primary audience

DarkFactory is for developers and AI agents evaluating, learning, and adapting a production starter. It must feel credible to an experienced engineer without assuming a specific industry, customer type, or business model.

### Core use cases

1. Learn the architecture and its boundaries.
2. Sign in with seeded development accounts.
3. Exercise a complete, domain-neutral vertical slice.
4. Inspect practical states, contracts, data flow, and observability.
5. Adapt the starter into a real product without first removing a fictional business domain.

### Requirement classes

| Class | Meaning | Design-system examples |
| --- | --- | --- |
| **Core** | Present in every DarkFactory project | Public surface, portal surface, shadcn tokens, Geist, responsive shell |
| **Capability** | Optional and explicitly enabled | Additional marketing sections, charts, richer documentation, product-specific navigation |
| **Convention** | Rule followed by humans and agents | Token-only styling, complete states, no domain assumptions, visible focus, stable interactions |
| **Implementation** | Current replaceable technical choice | Tailwind, shadcn/ui primitives, Lucide icons, CSS custom properties |

### Personality and voice

- **Engineered:** hierarchy and behavior make the architecture legible.
- **Candid:** copy says what exists, what is seeded, and what is optional.
- **Refined:** typography, whitespace, and alignment do the visual work.
- **Modular:** components and sections look composable, not locked into a single page.
- **Quiet confidence:** no hype, visual shouting, decorative glow, or inflated claims.

Use concise declarative copy. Prefer “Trace a complete request from UI to Postgres” over “Revolutionize your development workflow.” Label demo data and unavailable capabilities honestly.

### Non-goals

- DarkFactory is not a vertical SaaS product.
- It is not dark-only.
- It is not a cyberpunk coding interface.
- It is not an AI landing page with purple/cyan gradients, glowing borders, or floating glass cards.
- It does not imitate Squarespace or shadcn blocks literally; those references guide composition and usability.

---

## 2. Unified Aesthetic Direction

The shared visual language is **shadcn/ui**: neutral tokens, Geist, Tailwind spacing, thin borders and restrained color. Public pages add generous negative space.

### Shared DNA

- DarkFactory has no custom look. It is **shadcn/ui** (new-york-v4 style): its tokens, Tailwind v4 type scale, radii, sizes and component anatomy. When in doubt, match <https://ui.shadcn.com>.
- Geist Sans for all text; Geist Mono for code and tabular data.
- A theme is a set of shadcn CSS variables. Swapping themes changes color only, never layout.
- Color communicates state, selection, or theme, not decoration.
- Motion clarifies state changes without moving layout bounds.

### Surface-specific expression

| Public site | Authenticated portal |
| --- | --- |
| shadcn site header and typography | shadcn sidebar-07 / dashboard-01 blocks |
| Generous whitespace and expressive type scale | Compact, scannable information hierarchy |
| Asymmetric compositions and image/content rhythm | Clear shell, sidebar, forms, tables, and states |
| Mostly flat sections separated by space and rules | Bordered surfaces used only where grouping is necessary |
| Narrative progression across neutral pages | Task progression across neutral feature and account flows |

The two surfaces must look related, not identical. Public pages may be spacious and expressive; the portal must prioritize comprehension and repeated use.

---

## 3. Foundations and Tokens

The source of truth is shadcn/ui: <https://ui.shadcn.com/docs/theming> and the new-york-v4 registry. DarkFactory keeps shadcn's names and values; the only differences are listed in "Extensions" and "Touch targets".

### 3.1 Typography

| Role | Family | Use |
| --- | --- | --- |
| Sans | **Geist** (`@fontsource-variable/geist`) | All text. `--font-sans`. |
| Mono | **Geist Mono** (`@fontsource-variable/geist-mono`) | Code, IDs, tabular data. `--font-mono`. |

Fonts are bundled. No CDN at runtime. `--font-heading` and `--font-body` are legacy aliases of `--font-sans`.

#### Type scale

Tailwind's default scale, as in shadcn. Every step is multiplied by `--font-scale`, set by **Appearance → Font size** (`data-font-size` on `<html>`): Small `0.875`, Default `1`, Large `1.125`. At Default the values equal Tailwind.

| Token | Size / line-height | Use (shadcn) |
| --- | --- | --- |
| `text-xs` | `0.75rem / 1rem` | Badges, sidebar group labels, metadata |
| `text-sm` | `0.875rem / 1.25rem` | Default UI text: buttons, menus, tables, labels, descriptions |
| `text-base` | `1rem / 1.5rem` | Site header page title, card title, inputs on mobile |
| `text-lg` | `1.125rem / 1.75rem` | Dialog title, settings section title |
| `text-2xl` | `1.5rem / 2rem` | Page title (`font-bold tracking-tight`), KPI numbers |
| `text-4xl` | `2.25rem / 2.5rem` | Public page title (`font-extrabold tracking-tight`) |
| `text-display` | `3rem / 1` | Public hero only |

- Weights: `font-medium` for buttons, labels, menu items, tabs and active navigation; `font-semibold` for card and dialog titles; `font-bold` for page titles.
- Muted copy is `text-sm text-muted-foreground`.
- Use sentence case.

### 3.2 Themes and semantic color

#### Token contract

Components use only the shadcn variables, mapped onto Tailwind colors in `@theme inline` (`packages/ui/src/styles.css`):

`background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `border`, `input`, `ring`, `chart-1` … `chart-5`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`, and `--radius`.

#### Extensions

Set by each theme next to the shadcn variables:

- `destructive-foreground`: text on a solid destructive button or badge. shadcn hard-codes `text-white` and paints the button at 60% in dark mode; neither passes AA on bright IDE reds, so dark themes use dark text on a solid red and the destructive Button and Badge drop `dark:bg-destructive/60`.
- `success`, `warning`, `info`: status colors, text-safe on `background` and `card` (shadcn's documented way to add tokens).

Derived by `deriveTokens()` in `theme-tokens.ts`, never set by hand. They exist for app code written before the shadcn contract; new code uses the shadcn names:

`surface` (= card), `surface-raised` (= popover), `border-strong`, `primary-hover`, `primary-active`, `primary-subtle`, `primary-subtle-foreground`, `primary-border`, `destructive-hover`, `destructive-active`, `destructive-subtle`, `destructive-border`, `success|warning|info-subtle`, `-foreground` (text on the subtle fill), `-border`, `disabled`, `disabled-foreground`, `disabled-border`, `overlay`.

The dark Tailwind variant (`dark:`) is active for every dark theme and for System when the OS prefers dark. `themes.css` defines it with `@custom-variant dark`.

#### Theme catalog

The root element carries `data-theme`. `:root` without the attribute uses Default Light. **System** uses Default Light, or Default Dark under `prefers-color-scheme: dark`.

| Theme | Scheme | Background | Primary | Source |
| --- | --- | --- | --- | --- |
| Default Light | light | `oklch(1 0 0)` | `oklch(0.205 0 0)` | shadcn Neutral |
| Default Dark | dark | `oklch(0.145 0 0)` | `oklch(0.922 0 0)` | shadcn Neutral |
| Graphite | dark | `#333333` | `#ededed` | DarkFactory neutral gray |
| Dracula | dark | `#282a36` | `#bd93f9` | [draculatheme.com/spec](https://draculatheme.com/spec) |
| Monokai | dark | `#272822` | `#a6e22e` | Monokai Classic |
| Tokyo Night | dark | `#1a1b26` | `#7aa2f7` | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) night |
| One Dark | dark | `#282c34` | `#61afef` | Atom One Dark |
| Night Owl | dark | `#011627` | `#c792ea` | [sdras/night-owl-vscode-theme](https://github.com/sdras/night-owl-vscode-theme) |
| Synthwave '84 | dark | `#262335` | `#ff7edb` | [robb0wen/synthwave-vscode](https://github.com/robb0wen/synthwave-vscode) |
| GitHub Dark | dark | `#0d1117` | `#4493f8` | [Primer](https://primer.style/foundations/primitives/color) |
| GitHub Light | light | `#ffffff` | `#1f883d` | [Primer](https://primer.style/foundations/primitives/color) |

IDE themes use the official, saturated accent colors. Do not soften them into pastels. In IDE themes the active sidebar item text uses the theme primary when it passes AA on the row.

#### Add a theme

1. Get a shadcn variable set: from [tweakcn](https://tweakcn.com), the shadcn theme page, or by mapping an editor palette.
2. Add the name to `CONCRETE_THEME_NAMES` in `packages/ui/src/theme-tokens.ts` and an entry to `THEME_DEFINITIONS`: `label`, `source`, `colorScheme`, `adjustments` and `tokens`. Paste the shadcn variables into `tokens` without the `--` prefix (oklch, hex and rgb are accepted). Add `destructive-foreground`, `success`, `warning` and `info`. For an editor palette, `fromPalette()` maps it onto the shadcn variables.
3. Add the name and label to `THEME_NAMES` and `THEME_OPTIONS` in `packages/ui/src/themes.ts`, and to the light set there if it is light. Add the name to `packages/state`, `packages/api` (`contracts/appearance.ts`) and `packages/db` (schema check plus a migration).
4. Regenerate `themes.css`:

```sh
mise exec -- bun -e 'import { renderThemeCss } from "./packages/ui/src/theme-tokens.ts"; await Bun.write("packages/ui/src/themes.css", renderThemeCss());'
```

`styles.contract.test.ts` fails when `themes.css` is stale. `theme-tokens.test.ts` fails when a pair misses WCAG AA.

#### Contrast

Published colors are used as given when they pass. When one fails WCAG AA for its role, prefer another color from the same official palette; otherwise lighten (dark themes) or darken (light themes) it just enough, and record it in the theme's `adjustments` as `token: from -> to (reason)`. `theme-tokens.test.ts` checks:

- 4.5:1 for text: every `*-foreground` on its fill, `muted-foreground` on background, card and muted, `primary` and `destructive` on background and card, status text on card and its subtle fill, and `destructive-foreground` on a destructive button (60% fill in dark themes, as shadcn paints it).
- 3:1 for boundaries: `ring`, `border-strong`, status borders, chart colors and disabled text.

Themes must stay perceptually distinct (Lab distance of background and primary).

#### Status colors

Success, warning, info and destructive styles must include an icon or text label in addition to color. Red is destructive, green is success, yellow or amber is warning, blue or cyan is info, in every theme.

#### Swatches

`<span class="theme-swatch" data-theme-swatch="<theme>">` renders a 1.25rem (20px) circle split diagonally into the theme's background and primary. The System swatch shows the Default Light and Default Dark backgrounds.

### 3.3 Spacing and density

Tailwind spacing utilities compute `calc(var(--spacing) * n)`. **Appearance → Density** (`data-density`) sets `--spacing`:

| Density | `--spacing` | `p-4` |
| --- | --- | --- |
| Compact | `0.21875rem` | 14px |
| Default | `0.25rem` (Tailwind and shadcn) | 16px |
| Comfortable | `0.28125rem` | 18px |

- Steps 11 and 12 (`--spacing-11: 2.75rem`, `--spacing-12: 3rem`) are fixed: they are the 44px and 48px touch-target sizes.
- Shell: `--header-height: calc(var(--spacing) * 12)` (dashboard-01), sidebar `16rem`, icon mode `3rem`, mobile sheet `18rem`.

### 3.4 Radius and elevation

shadcn radii derive from `--radius`:

| Token | Value | At default (10px) |
| --- | --- | --- |
| `rounded-sm` | `--radius × 0.6` | 6px |
| `rounded-md` | `--radius × 0.8` | 8px |
| `rounded-lg` | `--radius` | 10px |
| `rounded-xl` | `--radius × 1.4` | 14px |
| `rounded-2xl` … `4xl` | `× 1.8`, `× 2.2`, `× 2.6` | |

**Appearance → Roundness** (`data-radius`) sets `--radius`: None `0`, Small `0.375rem`, Medium `0.625rem` (default, shadcn), Large `1rem`.

Elevation is shadcn's: `shadow-xs` on outline buttons and inputs, `shadow-sm` on cards, `shadow-md` on menus, `shadow-lg` on dialogs and sheets.

### 3.5 Touch targets

The 44px gate stays: every link, button, input, select, textarea, `role="button"` and `role="menuitemradio"` has a box of at least 44×44px. Primitives keep shadcn's visible size:

- **Button, IconButton, TabsTrigger, DropdownMenu items, SidebarMenuButton, SidebarTrigger, Dialog close:** the element is a transparent 44px box. The shadcn chrome (background, border, radius, focus ring, text) is an inner span with shadcn's exact size and classes; state classes move from `hover:` to `group-hover/<name>:` on the box. Negative margins give back the extra size, so layout matches shadcn (36px buttons, 32px menu and sidebar rows).
- **Input:** a text field cannot draw smaller chrome inside a bigger box, so it is 44px tall (`min-h-11`). This is the only visible size difference from shadcn.
- **`buttonVariants()` on a bare element** (for example a link) adds `min-h-11 min-w-11`, so it is 44px tall. Prefer `<Button asChild>`.

### 3.6 Motion

| Token | Value |
| --- | --- |
| `--duration-fast` | `120ms` |
| `--duration-base` | `180ms` |
| `--duration-slow` | `240ms` |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Animate color, background, border, opacity, and shadow. Do not change padding, borders, font weight, width, or height on interaction. Buttons and cards must not jump, bounce, scale, or translate on hover.

Reduced-motion support is CSS safety, not a saved user profile preference:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not add a reduced-motion toggle, account field, database column, cookie, or local-storage preference.

---

## 4. Layout and Responsive System

### Viewport validation targets

Every public and portal page must be reviewed at:

- **375px:** one-column phone layout.
- **768px:** tablet and compact sidebar transition.
- **1024px:** full portal shell and multi-column public composition.
- **1440px:** maximum public composition and comfortable portal density.

Use mobile-first styles. Content must remain usable between targets, not only at the four exact widths.

### Shared layout tokens

| Token | Value | Purpose |
| --- | --- | --- |
| `--content-reading` | `45rem` | Long-form copy |
| `--content-portal` | `80rem` | Portal content maximum |
| `--content-public` | `90rem` | Public composition maximum |
| `--gutter-mobile` | `--spacing × 3` | 375px horizontal gutter |
| `--gutter-tablet` | `--spacing × 4` | 768px horizontal gutter |
| `--gutter-desktop` | `--spacing × 6` | 1024px+ horizontal gutter |
| `--header-height` | `3rem` | Portal top bar and sidebar brand row |
| `--sidebar-width` | `13rem` | Portal desktop sidebar |

### Responsive rules

- At 375px, content is one column; actions wrap or become full-width when labels need room.
- At 768px, public compositions may use asymmetric 7/5 or 8/4 splits; the portal may use a drawer or compact sidebar.
- At 1024px, the portal sidebar is persistent and the public site uses a full composition grid.
- At 1440px, cap line lengths and containers; never stretch copy merely to fill the viewport.
- Sticky headers and action bars must reserve their own space and never cover focused or scrolled content.
- No page-level horizontal scrolling. Transform complex tables into stacked labeled rows on narrow screens, or place unavoidable tabular overflow in a clearly labeled, keyboard-accessible scroll region.
- Images reserve intrinsic aspect ratio before loading to prevent layout shift.

---

## 5. Public Site Direction

### Reference and intent

Use Squarespace as a reference for editorial restraint: strong type, exact spacing, asymmetric rhythm, generous negative space, and confident image placement. Do not copy its branding, navigation, copy, layouts, or assets.

The default theme is System: Default Light, or Default Dark when the OS prefers dark. Every theme remains complete and accessible.

### Composition

- Use a calm, left-aligned header with one primary action and a lower-emphasis sign-in link.
- Build hero compositions from an asymmetrical text/media split, not a centered headline floating above generic cards.
- Let large Geist headlines (`font-extrabold tracking-tight`), rules, and whitespace create drama.
- Alternate text-led, media-led, and proof/detail sections to avoid repetitive card grids.
- Use flat editorial bands and hairline separators more often than boxed cards.
- Keep primary calls to action specific: “Explore the architecture,” “Open the demo,” or “Sign in to the portal.”
- Use one primary action per section; secondary actions are text links or outline buttons.

### Neutral public page family

The public surface must support multiple pages without inventing a business domain:

| Page | Purpose |
| --- | --- |
| **Home** | Explain DarkFactory and route visitors to architecture, demo, and sign-in |
| **Architecture** | Show boundaries, request flow, and Core/Capability/Convention/Implementation distinctions |
| **Vertical Slice** | Explain the neutral feature item from interface through persistence and observability |
| **Components** | Demonstrate the design primitives and complete UI states |
| **Documentation** | Provide structured starter guidance and internal API entry points |
| **About** | Explain the Postgres-first, AI-native philosophy without founder mythology |
| **Sign in** | Present seeded development access clearly and safely |

Additional pages inherit these patterns. A public page must earn its existence with distinct information; do not create several pages containing the same hero and card grid with renamed headings.

### Public content and placeholder policy

- Generic placeholder media may use `placehold.co` during implementation.
- Fake avatars and favicons are allowed when clearly part of demo content.
- Give every meaningful image useful alt text; decorative images use empty alt text.
- Reserve final media dimensions to prevent content shift.
- Placeholder copy should describe architecture, seeded accounts, capabilities, or adaptation—not fictional revenue, customers, products, or testimonials.
- Never imply that fake logos, avatars, activity, or metrics are real proof.

---

## 6. Authenticated Portal Direction

### Portal composition reference

Use [shadcn blocks](https://ui.shadcn.com/blocks) as the continual composition reference for the authenticated portal. Reuse the clarity of its shells, navigation, forms, settings, tables, and authentication patterns while preserving DarkFactory tokens and voice.

### Portal shell

- Desktop: shadcn sidebar-07 / dashboard-01 anatomy (`packages/ui/src/client/sidebar.tsx`, `apps/web/src/components/portal-shell.tsx`). `SidebarProvider` → `Sidebar variant="inset" collapsible="icon"` (16rem, 3rem in icon mode, toggled by `SidebarTrigger`, the rail or Ctrl/⌘+B; the state lives in the UI store) → `SidebarInset` with a site header: trigger, vertical separator, page title (`text-base font-medium`) and the user menu on the right. The sidebar has two groups: core navigation without a label (in the template: Overview, the `/dashboard` page) and **Features** (Feature items and every generated feature). The word "Dashboard" does not appear in navigation.
- Below 768px: the sidebar is a left drawer styled like the shadcn sheet (18rem, `bg-sidebar`, `border-r`, `shadow-lg`, `bg-black/50` backdrop). It uses the native popover API (`#portal-navigation`, `popover="auto"`, named "Navigation"), so it opens and closes before hydration; the "Open portal navigation" button toggles it, "Close portal navigation" gets focus, and links close it.
- The **user menu** at the top right has exactly two items: Settings and Sign out. Its trigger is the avatar initials and the user name. It uses the Radix dropdown primitive (`packages/ui/src/client/dropdown-menu.ts`): arrow keys move, Escape closes and returns focus to the trigger.
- **Settings** is one page (`/settings`) with an h1 "Settings" and link tabs, each its own URL: Account (`/settings/account/*`), Administration (`/settings/administration`, admins only; members are sent to their account), and Appearance (`/settings/appearance`). Account has a section list: Profile, Address, Preferences, Security. Each tab or section names itself with an h2.
- `/settings` and `/settings/account` redirect to `/settings/account/profile`. Old URLs redirect to their tab: `/account` and `/account/profile` → Profile, `/account/{address,preferences,security}` → the same section, `/admin` and `/admin/users` → Administration. The manifest is `apps/web/src/lib/navigation.ts`. Do not add hub pages that only list links.
- Show active navigation with icon, text, and selected treatment; never color alone.

### Information hierarchy

- Portal page header: title and actions only (`PageHeader` without `description` or `eyebrow`; the type rejects them unless `variant="public"`). Title: `text-2xl font-bold tracking-tight`.
- No filler text in the portal: no subtitles that restate the title, no explanatory paragraphs, no empty-state prose. Keep data, actions, labels, error messages and required safety or legal notices.
- Use section headings before adding containers.
- Prefer one dominant page task and a small number of secondary actions.
- Do not use oversized “hero metrics” or decorative dashboard charts.
- Demo metrics, if needed to exercise a component, must be labeled as sample data and tied to a clear architectural behavior.

### Forms

- Labels are always visible and programmatically associated.
- Help text precedes errors; errors are specific and linked with `aria-describedby`.
- Fields and buttons have a minimum 44px interactive height.
- Required status is expressed in text and semantics, not color alone.
- Validation should occur after blur or submit unless immediate feedback prevents an error.
- Preserve entered values on recoverable errors.
- Submission states are explicit: idle, submitting, success, and error.
- Disabled controls use native semantics and remain legible; do not use opacity alone.
- Destructive actions require clear wording and an appropriately proportional confirmation pattern.

### Tables and collections

- Include a descriptive title, optional summary, and explicit empty state.
- Header cells use correct `scope`; row actions have accessible names that include the row identity.
- Provide loading skeletons that match final column geometry.
- Distinguish no data, no search results, permission denied, and load failure.
- At 375px, present priority data as labeled stacked rows or a controlled accessible scroll region.
- Filters and sort state must be reflected in text, URL state where appropriate, and accessible control state.
- Pagination does not reset focus without announcing the updated result context.

### Empty, loading, and error states

Every portal feature must design:

1. **Initial loading:** geometry-preserving skeleton or progress indicator with a status label.
2. **Empty:** render nothing, or one compact "No items" row where a table must stay. Keep the primary action in the page header.
3. **Filtered empty:** show that filters caused the result and offer a clear reset.
4. **Error:** explain what failed, preserve context, and offer a relevant retry or recovery.
5. **Success:** confirm completion without blocking the next task.
6. **Unauthorized or forbidden:** explain the boundary without exposing sensitive detail.
7. **Offline or interrupted:** preserve unsaved input where feasible and state what will happen next.

Public pages may use longer empty-state copy; the portal does not.

### Theme controls

- Offer the System option and the ten themes defined in Section 3.2, plus Font size, Density and Roundness.
- In the portal the controls are radio groups on the Appearance settings tab (`/settings/appearance`); a change applies at once and saves to the account. Public and auth pages use the compact standalone "Appearance settings" menu (`ThemeMenu`).
- Each theme option shows a 1.25rem (20px) swatch circle (background and primary), a fixed 0.75rem (12px) gap, then the name. Selection uses radio-item semantics.
- Persistence: a `darkfactory-theme=<theme>:<fontSize>:<density>:<radius>` cookie for server rendering without a flash, localStorage `darkfactory.anonymous-ui.v2` for anonymous visitors, and the `user_preferences` row (`theme`, `font_size`, `density`, `radius`) for signed-in users.
- Theme changes update color only; they must not move, resize, or reflow controls.
- Authenticated preferences may persist according to application architecture, but reduced motion remains OS/CSS driven only.

---

## 7. Component Standards

### Buttons and links

- Use the shadcn variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `default` (h-9), `sm` (h-8), `lg` (h-10), `icon`, `icon-sm`, `icon-lg`. Legacy names `primary`, `compact` and `large` map to `default`, `sm` and `lg`.
- Box at least 44×44px; see 3.5.
- Use native `button` and `a` semantics. Style a link as a button with `<Button asChild><a …/></Button>`.
- Icon-only buttons require an accessible name.
- Do not make every action primary.

### Auth pages

- shadcn login block (login-03/04): a centered `max-w-sm` card on `bg-muted`, title `text-xl font-semibold` (the page `h1`), `CardDescription`, the form in `CardContent`, and an optional muted footer line below the card.

### Inputs and controls

- shadcn `Input` and `Textarea` (`border-input`, `bg-transparent`, `dark:bg-input/30`, `shadow-xs`, `focus-visible:ring-[3px] ring-ring/50`). Inputs are 44px tall (3.5).
- Placeholder text is an example, never the only label.
- Errors use `aria-invalid`, which turns the border and ring destructive.
- Checkbox and radio hit areas extend to their labels.

### Cards and grouped surfaces

- shadcn `Card` anatomy: `rounded-xl border bg-card py-6 shadow-sm`, `CardHeader`/`CardContent`/`CardFooter` with `px-6`, `CardTitle` `leading-none font-semibold`, optional `CardAction`.
- Use a card only when a group has a meaningful boundary.
- Static cards have no pointer cursor or hover treatment.
- Interactive cards use a real internal link or button, not an unlabeled clickable container.
- Avoid identical icon-heading-paragraph card grids. Vary hierarchy through content structure, not decorative styling.

### Dialogs, drawers, and popovers

- Prefer inline disclosure or a dedicated page when the task needs context or sustained work.
- Trap focus in modal surfaces, support Escape, label the surface, and restore focus to the trigger.
- shadcn anatomy: `bg-black/50` overlay, `rounded-lg border bg-background p-6 shadow-lg sm:max-w-lg`, title `text-lg font-semibold`, close icon at the top right; menus `rounded-md border bg-popover p-1 shadow-md` with 32px rows.
- Drawers and dialogs must remain usable at 375px without clipped actions.

### Icons

- Use one coherent outline family, preferably Lucide.
- Default icon size is 16px (`size-4`), as in shadcn; targets remain at least 44px.
- Icons communicate action, status, or structure. Do not add icons merely to decorate headings.
- Do not use emoji as structural icons.
- Keep stroke weight consistent within a hierarchy level.

---

## 8. Accessibility and Interaction

### Contrast

- Normal text: at least 4.5:1.
- Large text and meaningful UI graphics: at least 3:1.
- Inputs, focus indicators, selected states, and status boundaries remain distinguishable in light and dark modes.
- Never rely on placeholder text, color, or motion alone.

### Keyboard and focus

- Provide a skip link on public and portal shells.
- Use logical DOM order that matches the visual order at every breakpoint.
- Every interactive element is reachable and operable by keyboard.
- Use a consistent `:focus-visible` ring with at least 2px visible thickness and separation from the component edge.
- Do not remove outlines without an equal or stronger replacement.
- Opening and closing drawers, menus, and dialogs moves and restores focus predictably.

### Semantics and announcements

- Use landmarks: `header`, `nav`, `main`, `aside`, and `footer` where appropriate.
- Maintain one descriptive `h1` per page and a logical heading hierarchy.
- Announce async results, validation summaries, and collection updates through appropriate live regions.
- Icons with adjacent duplicate text are decorative; standalone meaningful icons have accessible names.

### Stable interaction

- Hover, pressed, selected, loading, and focus states must not change layout bounds.
- Reserve width for changing labels, counters, and theme state when the control would otherwise jump.
- Prevent duplicate submissions while preserving button dimensions and an accessible loading label.
- Use skeleton dimensions that match the loaded content.

---

## 9. Anti-Patterns

Never use:

- Dark-only presentation or an assumption that “developer tool” means black canvas.
- Purple/cyan gradients, neon glow, star fields, glass panels, or decorative code rain.
- Serif typography anywhere in the product.
- Libre Bodoni, Inter, Roboto, Arial, or Open Sans.
- Pure black or pure white as major surfaces.
- Generic centered hero plus three identical feature cards.
- Gradient text on headings or metrics.
- Large rounded icon tiles above every heading.
- Nested cards and excessive shadows.
- Layout-shifting hover transforms, elastic motion, or bouncing controls.
- Vague hype, invented testimonials, fictional customer logos, or unlabeled fake metrics.
- Business-domain terminology in the starter’s core navigation or examples.
- Modals for tasks that need comparison, navigation, or substantial context.
- Missing loading, empty, error, disabled, focus, and success states.

---

## 10. Delivery Checklist

### System

- [ ] Geist Sans is used for all text and Geist Mono for code; no other families.
- [ ] No forbidden fonts or serif typography appear.
- [ ] Every color and spacing value comes from a defined token.
- [ ] System and all ten themes are coherent and accessible.
- [ ] Public and portal surfaces visibly belong to one system.

### Public

- [ ] Composition is editorial, generous, asymmetric, and left aligned.
- [ ] Multiple neutral pages have distinct informational purposes.
- [ ] Placeholder media and demo proof are clearly labeled.
- [ ] The page is not a repeated card grid or generic AI landing page.

### Portal

- [ ] Shell and navigation hierarchy remain clear at every target width.
- [ ] Forms include labels, help, validation, disabled, submission, success, and error states.
- [ ] Tables include loading, empty, filtered-empty, error, narrow-screen, and row-action behavior.
- [ ] Theme controls offer System plus the ten themes.

### Accessibility and responsive behavior

- [ ] Normal text meets 4.5:1 contrast; UI boundaries and large elements meet 3:1 where required.
- [ ] All interactive targets are at least 44×44px.
- [ ] Keyboard focus is visible and focus behavior is predictable.
- [ ] Reduced-motion CSS safety is present without a user/profile preference.
- [ ] Interactions and loading states do not cause layout jump.
- [ ] Pages are verified at 375px, 768px, 1024px, and 1440px.
- [ ] No content is hidden by fixed navigation and no page-level horizontal scroll is introduced.
