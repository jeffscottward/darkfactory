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
| **Core** | Present in every DarkFactory project | Public surface, portal surface, accessible semantic tokens, Manrope + Public Sans, responsive shell |
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

The shared visual language is **engineered editorial**: quiet neutrals, strong sans-serif typography, disciplined rules, restrained color, and generous negative space.

### Shared DNA

- Warm, tinted neutrals instead of pure white or pure black.
- Manrope for display and headings; Public Sans for body and interface text.
- Thin rules, crisp surfaces, restrained shadows, and moderate radii.
- Left-aligned content and purposeful asymmetry.
- Color communicates state, selection, or theme—not decoration.
- Motion clarifies state changes without moving layout bounds.

### Surface-specific expression

| Public site | Authenticated portal |
| --- | --- |
| Squarespace-inspired editorial restraint | shadcn-blocks-inspired application clarity |
| Generous whitespace and expressive type scale | Compact, scannable information hierarchy |
| Asymmetric compositions and image/content rhythm | Clear shell, sidebar, forms, tables, and states |
| Mostly flat sections separated by space and rules | Bordered surfaces used only where grouping is necessary |
| Narrative progression across neutral pages | Task progression across neutral feature and account flows |

The two surfaces must look related, not identical. Public pages may be spacious and expressive; the portal must prioritize comprehension and repeated use.

---

## 3. Foundations and Tokens

### 3.1 Typography

All DarkFactory typography is sans serif.

| Role | Family | Weights | Use |
| --- | --- | --- | --- |
| Display and headings | **Manrope** | 500, 600, 700 | Public hero, page titles, section headings, portal headings |
| Body and interface | **Public Sans** | 400, 500, 600, 700 | Paragraphs, navigation, controls, labels, data, code-adjacent copy |

Do not use Libre Bodoni or any other serif. Do not use Inter, Roboto, Arial, or Open Sans. Generic `sans-serif` may appear only as the final system fallback.

```css
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap");

:root {
  --font-heading: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Public Sans", ui-sans-serif, system-ui, sans-serif;
}
```

#### Type scale

Every step is multiplied by `--font-scale`. The user sets it with **Appearance → Font size** (`data-font-size` on `<html>`): Small `0.875`, Default `0.9375`, Large `1.0625`. The table shows the base values (scale 1).

| Token | Size / line-height | Intended use |
| --- | --- | --- |
| `--text-xs` | `0.75rem / 1rem` | Metadata only; never primary instructions |
| `--text-sm` | `0.875rem / 1.25rem` | Secondary UI, table metadata, most portal text |
| `--text-base` | `1rem / 1.5rem` | Default body and controls |
| `--text-lg` | `1.125rem / 1.625rem` | Lead copy |
| `--text-xl` | `1.25rem / 1.75rem` | Portal page title |
| `--text-2xl` | `1.5rem / 2rem` | Large numbers |
| `--text-3xl` | `1.875rem / 2.25rem` | Public subsection title |
| `--text-4xl` | `clamp(2.25rem, 1.85rem + 2vw, 3.5rem) / 1.05` | Public page title |
| `--text-display` | `clamp(3rem, 2rem + 4vw, 6.5rem) / 0.96` | Public hero only |

- Headings use `--font-heading`, weight 600 by default, and slightly tightened tracking.
- Body and UI use `--font-body`.
- Use sentence case. Avoid all-caps except short metadata labels with increased tracking.
- Keep long-form text between 55 and 72 characters per line.
- Public hero copy should usually stay under 12 words; supporting copy under three lines at its target width.
- Portal body text remains at least `--text-sm`; controls and form fields remain at least `--text-base`.

### 3.2 Themes and semantic color

Components consume semantic tokens only (`--background`, `--surface`, `--primary`, `--sidebar`, `--chart-1` and the rest). Pages and components must not introduce one-off hex values.

The token values live in one place: `packages/ui/src/theme-tokens.ts`. Its `renderThemeCss()` generates `packages/ui/src/themes.css`, which `styles.css` imports. Do not edit `themes.css` by hand. After a token change, regenerate it:

```sh
mise exec -- bun -e 'import { renderThemeCss } from "./packages/ui/src/theme-tokens.ts"; await Bun.write("packages/ui/src/themes.css", renderThemeCss());'
```

`styles.contract.test.ts` fails when the file is stale.

#### Theme catalog

The root element carries `data-theme`. `:root` without the attribute uses Default Light. **System** uses Default Light, or Default Dark under `prefers-color-scheme: dark`.

| Theme | Scheme | Background | Surface | Foreground | Primary | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Default Dark | dark | `#333333` | `#3a3a3a` | `#ededed` | `#7ab0ff` | DarkFactory (neutral gray, r=g=b) |
| Default Light | light | `#f5f5f5` | `#fafafa` | `#1f1f1f` | `#1d4ed8` | DarkFactory (neutral gray, r=g=b) |
| Tokyo Night | dark | `#1a1b26` | `#1f2335` | `#c0caf5` | `#7aa2f7` | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) night |
| Catppuccin Mocha | dark | `#1e1e2e` | `#181825` | `#cdd6f4` | `#cba6f7` | [catppuccin/palette](https://github.com/catppuccin/palette) |
| Catppuccin Latte | light | `#e6e9ef` | `#eff1f5` | `#4c4f69` | `#8738ed` | [catppuccin/palette](https://github.com/catppuccin/palette) |
| Gruvbox Dark | dark | `#282828` | `#32302f` | `#ebdbb2` | `#fe8019` | [morhetz/gruvbox](https://github.com/morhetz/gruvbox) dark medium |
| Nord | dark | `#2e3440` | `#3b4252` | `#eceff4` | `#88c0d0` | [nordtheme.com](https://www.nordtheme.com/docs/colors-and-palettes) |
| Everforest | dark | `#2d353b` | `#343f44` | `#d3c6aa` | `#a7c080` | [sainnhe/everforest](https://github.com/sainnhe/everforest) dark medium |
| Rosé Pine | dark | `#191724` | `#1f1d2e` | `#e0def4` | `#ebbcba` | [rosepinetheme.com](https://rosepinetheme.com/palette/ingredients/) main |
| Kanagawa | dark | `#1f1f28` | `#2a2a37` | `#dcd7ba` | `#7e9cd8` | [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim) wave |

`accent` is the neutral hover and selected fill. `primary` is the theme's main color for buttons, links and active navigation. Subtle fills (`*-subtle`) are blends of the color into the surface.

#### Contrast

Published colors are used as given when they pass. When a published color fails WCAG AA for its role, the builder moves it toward white (dark themes) or black (light themes) in 1% steps until it passes, and records the change in the theme's `adjustments` list. `theme-tokens.test.ts` checks every pair:

- 4.5:1 for text: foreground, muted, sidebar, accent, primary, destructive and status text on their backgrounds, and primary and destructive on the page and surface.
- 3:1 for boundaries: ring, `border-strong`, `primary-border`, status borders, chart colors and disabled text.

Themes must also stay perceptually distinct (Lab distance of background and primary).

#### Status colors

Success, warning, info, and destructive styles must include an icon or text label in addition to color. Status tokens keep their meaning in every theme: red for destructive, green or teal for success, yellow for warning, blue for info.

#### Swatches

`<span class="theme-swatch" data-theme-swatch="<theme>">` renders a 1.25rem (20px) circle split diagonally into the theme's background and primary. The System swatch shows the Default Light and Default Dark backgrounds.

### 3.3 Spacing and density

Density is one variable. Tailwind spacing utilities (`p-*`, `m-*`, `gap-*`, `w-*`, `h-*`) compute `calc(var(--spacing) * n)`, and **Appearance → Density** (`data-density` on `<html>`) sets `--spacing`:

| Density | `--spacing` | `p-4` |
| --- | --- | --- |
| Compact | `0.1875rem` | 12px |
| Default | `0.21875rem` | 14px |
| Comfortable | `0.25rem` | 16px |

- Steps 11 and 12 (`--spacing-11: 2.75rem`, `--spacing-12: 3rem`) are fixed. They are the 44px and 48px touch-target sizes, so `min-h-11` and `size-11` never shrink.
- `--space-N` equals `calc(var(--spacing) * N)` for CSS outside Tailwind.
- Shell tokens: `--header-height: 3rem`, `--sidebar-width: 13rem`, `--target-min: 2.75rem`.
- Portal pages: stack sections with `gap-4` or `space-y-4`, pad cards and tables with `p-3` or `p-4`, and do not use `py-10` or larger.

### 3.4 Radius, borders, and elevation

| Token | Value | Use |
| --- | --- | --- |
| `--radius-xs` | `0.25rem × scale` | Code chips and compact tags |
| `--radius-sm` | `0.375rem × scale` | Inputs and compact controls |
| `--radius-md` | `0.5rem × scale` | Buttons and menus |
| `--radius-lg` | `0.75rem × scale` | Grouped portal surfaces |
| `--radius-xl` | `1rem × scale` | Rare public media frames |
| `--radius-pill` | `9999px` | Status pills, avatars and swatches (never scaled) |
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.08)` | Menus and subtle lift |
| `--shadow-md` | `0 8px 24px rgb(0 0 0 / 0.12)` | Popovers and dialogs |
| `--shadow-lg` | `0 20px 48px rgb(0 0 0 / 0.16)` | Rare high-priority overlay |

`scale` is `--radius-scale`, set by **Appearance → Roundness** (`data-radius`): None `0`, Small `0.5` (default), Medium `1`, Large `1.5`.

- Borders and whitespace establish hierarchy before shadows.
- Cards are not the default container. Prefer flat composition with section spacing.
- Do not nest cards inside cards.
- Do not apply hover elevation to non-interactive content.

### 3.5 Motion

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
- Let large Manrope headlines, rules, and whitespace create drama.
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

- Desktop: a narrow left sidebar with **core product navigation only** (in the template: Overview), a 3rem top bar, and a bounded content column.
- Below 1024px: the sidebar becomes a popover drawer opened from the top bar.
- Everything else lives in **one user menu** at the top right. Its trigger is the avatar initials and the user name. Order: Features (Feature items and generated features), Account (Profile, Address, Preferences, Security — a flat list, no account hub page), Administration (admins only), Appearance (Theme, Font size, Density, Roundness submenus), Sign out.
- `/account` redirects to `/account/profile`. Do not add hub pages that only list links.
- The user menu uses the Radix dropdown primitive (`packages/ui/src/client/dropdown-menu.ts`): arrow keys move, Enter or ArrowRight opens a submenu, Escape closes and returns focus to the trigger.
- Show active navigation with icon, text, and selected treatment; never color alone.

### Information hierarchy

- Portal page header: title and actions only (`PageHeader` without `description` or `eyebrow`; the type rejects them unless `variant="public"`). Title: Manrope `--text-xl`.
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
- In the portal the controls are the Appearance submenus of the user menu. Public and auth pages use the standalone "Appearance settings" menu (`ThemeMenu`).
- Each theme option shows a 1.25rem (20px) swatch circle (background and primary), a fixed 0.75rem (12px) gap, then the name. Selection uses radio-item semantics.
- Persistence: a `darkfactory-theme=<theme>:<fontSize>:<density>:<radius>` cookie for server rendering without a flash, localStorage `darkfactory.anonymous-ui.v2` for anonymous visitors, and the `user_preferences` row (`theme`, `font_size`, `density`, `radius`) for signed-in users.
- Theme changes update color only; they must not move, resize, or reflow controls.
- Authenticated preferences may persist according to application architecture, but reduced motion remains OS/CSS driven only.

---

## 7. Component Standards

### Buttons and links

- Variants: primary, secondary, ghost, destructive, and text link.
- Minimum target: 44×44px, including icon-only controls.
- Use native `button` and `a` semantics.
- Primary buttons use `--primary` and `--primary-foreground`.
- Secondary buttons use a stable border; hover changes surface color without changing border width.
- Icon-only buttons require an accessible name and tooltip where the icon may be unfamiliar.
- Do not make every action primary.

### Inputs and controls

- Default control height is at least 44px.
- Inputs use `--surface`, `--foreground`, and `--border-strong`.
- Placeholder text is an example, never the only label.
- Focus uses the shared ring treatment; errors retain a visible focus ring.
- Checkbox and radio hit areas extend to their labels.
- Selects reserve stable room for their indicator so labels do not jump.

### Cards and grouped surfaces

- Use a card only when a group has a meaningful boundary.
- Static cards have no pointer cursor or hover treatment.
- Interactive cards use a real internal link or button, not an unlabeled clickable container.
- Avoid identical icon-heading-paragraph card grids. Vary hierarchy through content structure, not decorative styling.

### Dialogs, drawers, and popovers

- Prefer inline disclosure or a dedicated page when the task needs context or sustained work.
- Trap focus in modal surfaces, support Escape, label the surface, and restore focus to the trigger.
- Use a sufficiently strong scrim without decorative blur.
- Drawers and dialogs must remain usable at 375px without clipped actions.

### Icons

- Use one coherent outline family, preferably Lucide.
- Standard visible sizes: 16px compact, 20px default, 24px emphasis; targets remain at least 44px.
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

- [ ] Manrope is used for all headings and Public Sans for body/interface text.
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
