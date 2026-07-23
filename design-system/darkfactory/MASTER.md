# DarkFactory Web Design System

> **Authority:** This file is the source of truth for every DarkFactory web surface.
> Before building a page, check `design-system/darkfactory/pages/[page-name].md`.
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
|---|---|---|
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

The shared visual language is **engineered editorial**: warm tinted neutrals, strong sans-serif typography, disciplined rules, restrained color, and generous negative space.

### Shared DNA

- Warm, tinted neutrals instead of pure white or pure black.
- Manrope for display and headings; Public Sans for body and interface text.
- Thin rules, crisp surfaces, restrained shadows, and moderate radii.
- Left-aligned content and purposeful asymmetry.
- Color communicates state, selection, or theme—not decoration.
- Motion clarifies state changes without moving layout bounds.

### Surface-specific expression

| Public site | Authenticated portal |
|---|---|
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
|---|---|---|---|
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

| Token | Size / line-height | Intended use |
|---|---|---|
| `--text-xs` | `0.75rem / 1rem` | Metadata only; never primary instructions |
| `--text-sm` | `0.875rem / 1.25rem` | Secondary UI, table metadata |
| `--text-base` | `1rem / 1.5rem` | Default body and controls |
| `--text-lg` | `1.125rem / 1.75rem` | Lead copy |
| `--text-xl` | `1.25rem / 1.75rem` | Small section heading |
| `--text-2xl` | `1.5rem / 2rem` | Portal page title |
| `--text-3xl` | `1.875rem / 2.25rem` | Public subsection title |
| `--text-4xl` | `clamp(2.25rem, 1.85rem + 2vw, 3.5rem) / 1.05` | Public page title |
| `--text-display` | `clamp(3rem, 2rem + 4vw, 6.5rem) / 0.96` | Public hero only |

- Headings use `--font-heading`, weight 600 by default, and slightly tightened tracking.
- Body and UI use `--font-body`.
- Use sentence case. Avoid all-caps except short metadata labels with increased tracking.
- Keep long-form text between 55 and 72 characters per line.
- Public hero copy should usually stay under 12 words; supporting copy under three lines at its target width.
- Portal body text remains at least `--text-sm`; controls and form fields remain at least `--text-base`.

### 3.2 Semantic color system

Components consume semantic tokens only. Palette values are defined centrally; pages and components must not introduce one-off hex values.

#### Neutral foundation

| Semantic token | Light | Dark | Purpose |
|---|---|---|---|
| `--background` | `#F6F2EA` | `#171715` | Page canvas |
| `--foreground` | `#211F1B` | `#F1EDE5` | Primary text |
| `--surface` | `#FBF9F4` | `#1D1C19` | Default grouped surface |
| `--surface-raised` | `#FEFCF7` | `#25231F` | Popover, menu, raised region |
| `--muted` | `#EEE9DF` | `#2D2A25` | Quiet fills |
| `--muted-foreground` | `#615D55` | `#B9B1A5` | Secondary text |
| `--border` | `#D6D0C4` | `#3D3933` | Passive separators |
| `--border-strong` | `#938B7F` | `#6D665B` | Inputs and meaningful boundaries |
| `--accent` | `#E6DFD3` | `#37332C` | Hover and selected-neutral fill |
| `--accent-foreground` | `#26231F` | `#F1EDE5` | Text on accent |
| `--destructive` | `#B42318` | `#FF9389` | Destructive actions and errors |
| `--destructive-foreground` | `#FFF7F5` | `#410E0A` | Text on destructive |
| `--ring` | `#6F675B` | `#B9A98F` | Keyboard focus |

The neutral foundation is intentionally warm. Avoid pure `#000000`, pure `#FFFFFF`, blue-gray default canvases, and gray text placed directly on colored surfaces.

#### Ten selectable palettes

Mode and palette are independent. The mode control offers **light**, **dark**, and **system**. The palette control offers exactly ten schemes:

| Palette | Light primary / foreground | Dark primary / foreground |
|---|---|---|
| Neutral | `#3D3933 / #FAF7F0` | `#D8D1C5 / #1B1A17` |
| Slate | `#334155 / #F8FAFC` | `#CBD5E1 / #18202B` |
| Blue | `#1D4ED8 / #F7FAFF` | `#9DB8FF / #102452` |
| Cyan | `#0E7490 / #F4FCFD` | `#67D0E7 / #082E38` |
| Green | `#18733C / #F6FCF7` | `#72D99A / #0B321C` |
| Amber | `#8A5A00 / #FFF9EB` | `#F0C15B / #382500` |
| Orange | `#B54708 / #FFF8F2` | `#FFAA72 / #421B07` |
| Red | `#B42318 / #FFF7F5` | `#FF9389 / #410E0A` |
| Rose | `#AE124C / #FFF7FA` | `#F793B8 / #3E0C20` |
| Violet | `#6941C6 / #FBF9FF` | `#B7A0F4 / #251648` |

Each row maps to `--primary` and `--primary-foreground`. Derive selected fills, chart colors, and quiet accents centrally from the same palette. Cyan and violet are valid user-selected accents, but neither may define the default brand aesthetic, pair into a gradient, or create an “AI glow.”

All listed primary/foreground pairs meet at least WCAG AA for normal text. Validate derived tokens independently in both modes.

#### Status colors

Success, warning, info, and destructive styles must include an icon or text label in addition to color. Keep status tokens independent from the selected theme so changing a palette never changes meaning.

### 3.3 Spacing

Use a 4px/8px-based scale only.

| Token | Value | Typical use |
|---|---|---|
| `--space-0` | `0` | Reset |
| `--space-1` | `0.25rem` | Tight optical adjustment |
| `--space-2` | `0.5rem` | Icon-to-label gap |
| `--space-3` | `0.75rem` | Compact control gap |
| `--space-4` | `1rem` | Default component gap |
| `--space-5` | `1.25rem` | Dense surface inset |
| `--space-6` | `1.5rem` | Standard surface inset |
| `--space-8` | `2rem` | Group separation |
| `--space-10` | `2.5rem` | Page gutter tier |
| `--space-12` | `3rem` | Section separation |
| `--space-16` | `4rem` | Large section separation |
| `--space-20` | `5rem` | Public section rhythm |
| `--space-24` | `6rem` | Public large-screen rhythm |
| `--space-32` | `8rem` | Public hero breathing room |

Public pages may use the upper tiers. Portal components should usually stay between `--space-2` and `--space-8`.

### 3.4 Radius, borders, and elevation

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `0.25rem` | Code chips and compact tags |
| `--radius-sm` | `0.375rem` | Inputs and compact controls |
| `--radius-md` | `0.5rem` | Buttons and menus |
| `--radius-lg` | `0.75rem` | Grouped portal surfaces |
| `--radius-xl` | `1rem` | Rare public media frames |
| `--radius-pill` | `9999px` | Status pills only |
| `--shadow-sm` | `0 1px 2px rgb(33 31 27 / 0.08)` | Menus and subtle lift |
| `--shadow-md` | `0 8px 24px rgb(33 31 27 / 0.10)` | Popovers and dialogs |
| `--shadow-lg` | `0 20px 48px rgb(33 31 27 / 0.14)` | Rare high-priority overlay |

- Borders and whitespace establish hierarchy before shadows.
- Cards are not the default container. Prefer flat composition with section spacing.
- Do not nest cards inside cards.
- Do not apply hover elevation to non-interactive content.

### 3.5 Motion

| Token | Value |
|---|---|
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
|---|---|---|
| `--content-reading` | `45rem` | Long-form copy |
| `--content-portal` | `80rem` | Portal content maximum |
| `--content-public` | `90rem` | Public composition maximum |
| `--gutter-mobile` | `1rem` | 375px horizontal gutter |
| `--gutter-tablet` | `1.5rem` | 768px horizontal gutter |
| `--gutter-desktop` | `2.5rem` | 1024px+ horizontal gutter |
| `--header-public` | `4.5rem` | Public header height |
| `--header-portal` | `4rem` | Portal top bar height |
| `--sidebar-expanded` | `16rem` | Portal desktop sidebar |
| `--sidebar-collapsed` | `4rem` | Optional portal compact sidebar |

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

The default public mode is light with warm tinted neutrals. Dark mode remains complete and accessible.

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
|---|---|
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

### Reference and intent

Use [shadcn blocks](https://ui.shadcn.com/blocks) as the continual composition reference for the authenticated portal. Reuse the clarity of its shells, navigation, forms, settings, tables, and authentication patterns while preserving DarkFactory tokens and voice.

### Portal shell

- Desktop: persistent left sidebar, quiet top bar, breadcrumb or page context, and a bounded content column.
- Tablet: compact sidebar or drawer selected according to available width and task density.
- Mobile: modal navigation drawer with focus trapping, escape-to-close, and focus return.
- Group navigation by user goal, not by package or framework name.
- A suggested neutral hierarchy is: Overview, Feature Items, Architecture, Account, and Admin when authorized.
- Show active navigation with icon, text, and selected treatment; never color alone.
- Keep theme and account controls discoverable without making them the primary hierarchy.

### Information hierarchy

- Portal page title: Manrope `--text-2xl`; short supporting copy: Public Sans `--text-sm` or `--text-base`.
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
2. **Empty:** explain what belongs here and provide the next valid action.
3. **Filtered empty:** show that filters caused the result and offer a clear reset.
4. **Error:** explain what failed, preserve context, and offer a relevant retry or recovery.
5. **Success:** confirm completion without blocking the next task.
6. **Unauthorized or forbidden:** explain the boundary without exposing sensitive detail.
7. **Offline or interrupted:** preserve unsaved input where feasible and state what will happen next.

Avoid empty states that only say “Nothing here.”

### Theme controls

- Offer mode choices: light, dark, and system.
- Offer the ten palettes defined in Section 3.2.
- Show palette swatches with text names and selected semantics.
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
- [ ] Light, dark, and all ten palettes are coherent and accessible.
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
- [ ] Theme controls offer ten palettes plus light, dark, and system modes.

### Accessibility and responsive behavior

- [ ] Normal text meets 4.5:1 contrast; UI boundaries and large elements meet 3:1 where required.
- [ ] All interactive targets are at least 44×44px.
- [ ] Keyboard focus is visible and focus behavior is predictable.
- [ ] Reduced-motion CSS safety is present without a user/profile preference.
- [ ] Interactions and loading states do not cause layout jump.
- [ ] Pages are verified at 375px, 768px, 1024px, and 1440px.
- [ ] No content is hidden by fixed navigation and no page-level horizontal scroll is introduced.
