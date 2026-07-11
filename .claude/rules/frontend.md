---
paths:
  - "src/app/**"
  - "src/components/**"
---

# Frontend Rules

## Component Conventions

- All components are functional with TypeScript interfaces for props
- Named exports for components (not default exports), except page.tsx files which must be default exports
- Server components by default. Add `'use client'` only when the component uses: hooks, event handlers, browser APIs, Zustand stores
- Co-locate component-specific types in the component file; shared types go in `src/types/index.ts`

## Zustand Store Access

Read from stores at the top of the component, not inline in JSX:

```typescript
// Correct
const { questions, currentIndex, navigateTo } = useSessionStore()

// Wrong — don't do this
<div>{useSessionStore().questions.length}</div>
```

Subscribe to only the fields the component needs. For performance-sensitive components (NavGrid, StatsDisplay), use selector functions to prevent unnecessary re-renders:

```typescript
const answeredCount = useSessionStore(s =>
  Object.keys(s.answers).length
)
```

## KaTeX Rendering

Always use `<KaTeXRenderer content={text} />` for any text that may contain math. Never call KaTeX directly in components.

Delimiter format in DB: `$...$` inline, `$$...$$` block. Do not assume plain text is safe — always route through KaTeXRenderer.

KaTeXRenderer is memoized with `React.memo`. Do not wrap it in another memo.

> **UI note**: never apply `font-family` overrides to any container that wraps `<KaTeXRenderer>`. The design system font (`DM Sans`) must not bleed into KaTeX output. KaTeX and its surrounding `.katex` container are explicitly excluded from global font rules in `globals.css`.

## Images from Supabase Storage

Always use `<QuestionImage chapterId={} questionPage={} />` — never construct storage URLs manually in components. The component handles:
- URL construction from `storage_prefix` + `question_page`
- Lazy loading with Intersection Observer
- Skeleton placeholder while loading
- Graceful failure (hides itself if 404)

## Session Page Layout

The session page (`/session/[sessionId]`) is full-screen with no global navbar.

```
┌─────────────────────────────────────────────────────────┐
│  [Back] Chapter Name                      [Timer/Submit] │  ← top bar
├────────────────────────────────┬────────────────────────┤
│                                │  Stats counts           │
│   Content area (2/3 width)     │  ─────────────────────  │
│   Scrollable                   │  C1 C2 Q1 Q2 Q3 ...    │
│   Concepts → Questions         │  Nav grid (scrollable)  │
│                                │  ─────────────────────  │
│                                │  [Submit] (mock only)   │
├────────────────────────────────┴────────────────────────┤
│  [← Prev]  [Mark]  [Save]  [Next →]                     │  ← bottom nav
└─────────────────────────────────────────────────────────┘
```

On mobile (< 768px): right panel hidden by default, toggled by a floating button (bottom-right). Bottom nav always visible.

## shadcn/ui Usage

Use shadcn components for: Dialog (modals), Sheet (mobile panels), Button, Badge, Skeleton, Separator, ScrollArea.

Do not use shadcn for: the question option buttons (custom component needed for answer state colors), the nav grid blocks (custom colored squares), the mock test settings pill selectors (custom `.pill` / `.pill-group` pattern — see Design System).

## Loading & Error States

Every component that fetches or reads async data must handle three states:
1. Loading → show Skeleton from shadcn/ui
2. Error → show inline error message with retry option
3. Empty → show a helpful empty state (not just blank)

Never use `!` non-null assertions to skip null checks in components.

## Mobile

- Minimum supported viewport: 375px wide
- Test at 375px and 768px breakpoints
- Touch targets minimum 44×44px (buttons, nav grid blocks)
- Right panel collapses to Sheet (shadcn) triggered by a `<button>` floating at bottom-right, z-index above content

---

## Design System

The app follows a **refined editorial dark** aesthetic — clean and serious, not flashy. Think Linear.app meets a study tool. Every visual decision should feel intentional and fast, not decorative.

### Typography

- **Primary font**: `'DM Sans'` — geometric, slightly warm, works well alongside Devanagari
- **Mono font**: `'DM Mono'` — used exclusively for numbers, stats, timers, question counts, and code-like data
- Import in `globals.css`:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..500&family=DM+Mono:wght@400;500&display=swap');
  ```
- **Devanagari/Hindi text**: never override with a Latin font. Keep `system-ui` for Hindi content. Apply `line-height: 1.7` via `:lang(hi)`.
- **KaTeX containers**: excluded from DM Sans — see KaTeX Rendering section above.

### Color Tokens

Define in `:root` inside `globals.css`. These are the only color values used throughout the app — no hardcoded hex values anywhere except in this definition block.

```css
:root {
  --bg-primary:   #0d0d0f;   /* page background — near-black, slightly warm */
  --bg-surface:   #141416;   /* card / panel backgrounds */
  --bg-elevated:  #1a1a1e;   /* hover states, modals, tooltips */
  --bg-input:     #1e1e23;   /* search inputs, text fields */

  --border-subtle: rgba(255,255,255,0.06);  /* default borders */
  --border-medium: rgba(255,255,255,0.10);  /* hover / active borders */
  --border-strong: rgba(255,255,255,0.16);  /* focus rings */

  --text-primary:   #f0efe8;  /* warm white — not pure #fff */
  --text-secondary: #8a8880;  /* labels, metadata */
  --text-tertiary:  #555450;  /* section headings, disabled */

  --accent:        #5b6af5;                  /* indigo — single accent */
  --accent-hover:  #6b7af7;
  --accent-subtle: rgba(91,106,245,0.12);
  --accent-text:   #a5aeff;                  /* accent tint for text on dark */

  --success:        #34c27a;
  --success-subtle: rgba(52,194,122,0.12);
  --danger:         #e5534b;
  --danger-subtle:  rgba(229,83,75,0.12);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  --transition: 140ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

### Spacing

8px base unit. Use multiples: `4 8 12 16 24 32 48 64px`. Do not introduce arbitrary values.

### Global CSS (`globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..500&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-family: 'DM Sans', system-ui, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Exclude KaTeX from DM Sans */
.katex, .katex * { font-family: KaTeX_Main, 'Times New Roman', serif !important; }

:lang(hi), [lang="hi"] { font-family: system-ui, sans-serif; line-height: 1.7; }

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
::selection { background: var(--accent-subtle); color: var(--text-primary); }

button:active { transform: scale(0.97); }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 3px var(--success-subtle); }
  50%       { box-shadow: 0 0 0 6px transparent; }
}
```

---

## Component Visual Specs

### Navbar (`components/Navbar.tsx`)

- Height: **52px**, `position: sticky; top: 0; z-index: 100`
- Background: `rgba(13,13,15,0.85)` with `backdrop-filter: blur(12px)` — frosted glass over scrolling content
- Bottom border: `1px solid var(--border-subtle)`
- Logo: replace emoji with a `26×26px` indigo square (`border-radius: 7px; background: var(--accent)`) containing the text `OL` in white DM Sans 700, followed by the wordmark
- Nav links: `font-size: 14px; color: var(--text-secondary)` default; `color: var(--text-primary)` on hover/active
- Sign In button: ghost style — `border: 1px solid var(--border-medium); background: transparent; color: var(--accent-text); border-radius: var(--radius-md); padding: 6px 14px; font-size: 13px; font-weight: 500`. Hover: `background: var(--accent-subtle); border-color: var(--accent)`

### Home Page (`app/page.tsx`)

**Hero**: `font-size: 28px; font-weight: 700; letter-spacing: -0.5px` for the title. Tagline at `font-size: 14px; color: var(--text-secondary); font-weight: 400`. Page content area has `padding-top: 64px`.

**Active Session Banner**: the most prominent element — styled as a live status indicator, not a card.

```tsx
<div className="session-banner">
  <div className="session-banner-dot" />
  <div className="session-banner-content">
    <span className="session-banner-label">Active Session</span>
    <span className="session-banner-meta">{questionCount} questions · {elapsed} elapsed</span>
  </div>
  <button className="btn-accent">Resume →</button>
</div>
```

```css
.session-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--success);
  border-radius: var(--radius-lg);
  margin-bottom: 40px;
}
.session-banner-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--success); flex-shrink: 0;
  box-shadow: 0 0 0 3px var(--success-subtle);
  animation: pulse-dot 2s ease-in-out infinite;
}
.session-banner-content { display: flex; flex-direction: column; flex: 1; }
.session-banner-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.session-banner-meta  { font-size: 12px; color: var(--text-secondary); font-family: 'DM Mono', monospace; }
```

**Section headings** ("Exams", etc.): `font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: 14px`

**Exam Cards**:
```css
.exam-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 20px 24px;
  transition: border-color var(--transition), background var(--transition);
}
.exam-card:hover { border-color: var(--border-medium); background: var(--bg-elevated); }
.exam-card-stats {
  display: flex; gap: 16px;
  font-size: 12px; color: var(--text-secondary);
  font-family: 'DM Mono', monospace;
  margin: 8px 0 20px;
}
.exam-card-stats span::before { content: '·'; margin-right: 16px; color: var(--text-tertiary); }
.exam-card-stats span:first-child::before { display: none; }
```

### Book Cards (`/ssc-cgl`)

Each book card has a 2px color-coded top accent stripe set via a CSS custom property:

```css
.book-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 24px;
  position: relative; overflow: hidden;
  transition: border-color var(--transition), transform var(--transition);
  cursor: pointer;
}
.book-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--book-accent, var(--accent));
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
}
.book-card:hover { border-color: var(--border-medium); transform: translateY(-1px); }
```

Set `--book-accent` per book via inline style:
- CGL Math: `#5b6af5`
- CGL REAS: `#34c27a`
- CGL ENG: `#f59e3a`
- CGL GS: `#e5534b`

### Chapters Page

**Breadcrumb** — add above the page title:
```tsx
<nav className="breadcrumb">
  <a href="/ssc-cgl">SSC CGL</a>
  <span>›</span>
  <span>CGL Math Hindi MCQ</span>
</nav>
```
```css
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
.breadcrumb a { color: var(--accent-text); text-decoration: none; }
.breadcrumb a:hover { text-decoration: underline; }
```

**Search input**:
```css
.search-input {
  width: 320px; height: 36px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0 12px 0 36px;
  font-size: 13px; color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  transition: border-color var(--transition);
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-input:focus { outline: none; border-color: var(--accent); background: var(--bg-elevated); }
```

**Chapter grid** — 3 columns (was 6), giving cards room to breathe:
```css
.chapters-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

.chapter-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px 14px;
  transition: border-color var(--transition);
}
.chapter-card:hover { border-color: var(--border-medium); }

.chapter-number {
  font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
  color: var(--accent-text); letter-spacing: 0.05em; margin-bottom: 4px;
}
.chapter-name  { font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 10px; line-height: 1.4; }
.chapter-stats { font-size: 11px; color: var(--text-tertiary); font-family: 'DM Mono', monospace; margin-bottom: 12px; }

.progress-bar      { height: 3px; background: var(--border-subtle); border-radius: 99px; margin-bottom: 14px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: var(--success); border-radius: 99px; transition: width 0.4s ease; }
/* Animate from 0 on mount — set width via inline style driven by progress value */

.chapter-actions { display: flex; gap: 8px; }

.btn-primary {
  flex: 1; height: 32px; font-size: 12px; font-weight: 500;
  background: var(--accent); color: #fff; border: none;
  border-radius: var(--radius-md); cursor: pointer;
  transition: background var(--transition);
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
  flex: 1; height: 32px; font-size: 12px; font-weight: 500;
  background: transparent; color: var(--text-secondary);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md); cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.btn-secondary:hover { background: var(--bg-elevated); color: var(--text-primary); }
```

### Question Option Buttons

These are custom — do **not** use shadcn Button here. The component manages three visual states: default, correct, and wrong.

```css
.option {
  width: 100%; text-align: left;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-primary); font-size: 15px; line-height: 1.5;
  cursor: pointer; margin-bottom: 8px;
  display: flex; align-items: flex-start; gap: 12px;
  transition: border-color var(--transition), background var(--transition);
}
.option:hover { border-color: var(--border-medium); background: var(--bg-elevated); }

.option-badge {
  min-width: 24px; height: 24px; border-radius: var(--radius-sm);
  background: var(--bg-elevated); border: 1px solid var(--border-medium);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace;
  color: var(--text-secondary); flex-shrink: 0; margin-top: 1px;
}

/* Correct answer */
.option.correct { background: var(--success-subtle); border-color: var(--success); }
.option.correct .option-badge { background: var(--success); border-color: var(--success); color: #fff; }

/* User's wrong selection */
.option.wrong { background: var(--danger-subtle); border-color: var(--danger); }
.option.wrong .option-badge { background: var(--danger); border-color: var(--danger); color: #fff; }
```

### Stats Display & Nav Grid (Right Sidebar)

```css
/* Score cards row */
.score-card {
  background: var(--bg-elevated); border-radius: var(--radius-md); padding: 10px 12px; text-align: center;
}
.score-num {
  font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; line-height: 1;
}
.score-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); margin-top: 2px; }
.score-num.correct { color: var(--success); }
.score-num.wrong   { color: var(--danger); }

/* Nav grid — custom colored squares, not shadcn */
.question-nav { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
.q-btn {
  aspect-ratio: 1; border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle); background: transparent;
  font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text-tertiary);
  cursor: pointer; transition: all var(--transition);
}
.q-btn:hover   { border-color: var(--border-medium); color: var(--text-secondary); }
.q-btn.active  { border-color: var(--accent);   color: var(--accent-text);  background: var(--accent-subtle); }
.q-btn.correct { border-color: var(--success);  color: var(--success);      background: var(--success-subtle); }
.q-btn.wrong   { border-color: var(--danger);   color: var(--danger);       background: var(--danger-subtle); }
.q-btn.skipped { background: var(--bg-elevated); color: var(--text-tertiary); }
```

### Timer

```css
.timer {
  font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 500;
  color: var(--text-secondary); letter-spacing: 0.05em;
  padding: 4px 10px;
  background: var(--bg-elevated); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}
/* Apply when remaining time < 30s */
.timer.urgent { color: var(--danger); border-color: var(--danger); background: var(--danger-subtle); }
```

### Solution Box

```css
.solution-box {
  margin-top: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}
.solution-box h4 {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--accent-text); margin-bottom: 10px;
}
```

### Bottom Navigation Bar (Session Page)

This bar is sticky at the bottom of the session page viewport, not a global nav.

```css
.action-bar {
  position: sticky; bottom: 0;
  background: rgba(13,13,15,0.92); backdrop-filter: blur(12px);
  border-top: 1px solid var(--border-subtle);
  padding: 10px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.btn-nav { padding: 8px 20px; font-size: 13px; font-weight: 500; border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition); }
.btn-nav-ghost { background: transparent; border: 1px solid var(--border-medium); color: var(--text-secondary); }
.btn-nav-ghost:hover { color: var(--text-primary); background: var(--bg-elevated); }
.btn-nav-solid { background: var(--accent); border: 1px solid transparent; color: #fff; }
.btn-nav-solid:hover { background: var(--accent-hover); }
```

### Mock Test Settings Modal

Use shadcn `Dialog` for the overlay/portal behaviour but style the inner content with these classes. Do not rely on shadcn's default dialog content styles — replace them.

```css
/* Dialog overlay: handled by shadcn, but enhance with blur */
/* Set in your shadcn Dialog overrides: backdrop-filter: blur(4px) on the overlay */

.modal-inner {
  background: var(--bg-surface); border: 1px solid var(--border-medium);
  border-radius: var(--radius-xl); padding: 28px 32px; width: 480px; max-width: calc(100vw - 32px);
}
.modal-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 24px; }
.modal-section-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: 10px;
}
.modal-divider { height: 1px; background: var(--border-subtle); margin: 20px 0; }

/* Pill selectors (question count, time limit) — NOT shadcn Button */
.pill-group { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.pill {
  padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border-medium); background: transparent; color: var(--text-secondary);
  cursor: pointer; transition: all var(--transition);
}
.pill:hover { background: var(--bg-elevated); color: var(--text-primary); }
.pill.active { background: var(--accent-subtle); border-color: var(--accent); color: var(--accent-text); }

/* Toggle rows (Shuffle, Sectional Timing) */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
.toggle-label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.toggle-sublabel { font-size: 12px; color: var(--text-secondary); margin-top: 1px; }

.modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
```

---

## Implementation Notes

**Adding classnames**: When applying design system styles to existing components, add new classnames alongside existing ones — do not remove classnames that are wired to Zustand selectors, event handlers, or test IDs.

**CSS custom properties vs Tailwind**: Define all design tokens as CSS variables in `globals.css` as shown above. Use them directly in CSS modules or `<style>` blocks. Do not recreate the token set inside `tailwind.config` — it creates two sources of truth.

**Progress bar animation**: Drive `width` from a CSS variable set via inline style on mount. Use a `useEffect` that sets the variable to the real value after the first render tick — this gives the browser a frame to start from `width: 0`.

**Micro-interactions**:
- Card hover lift: `transform: translateY(-1px)` — already in `.book-card:hover`; apply the same pattern to any card that represents a navigable item
- `button:active { transform: scale(0.97); }` is set globally in `globals.css`
- Page entry: wrap the root content `<div>` of each page in `animation: fadeIn 180ms ease-out`

---

## Testing Checklist

Before marking any UI change as complete:

- [ ] Hindi/Devanagari text is legible — no DM Sans override applied to Hindi content
- [ ] KaTeX math renders correctly — DM Sans does not bleed into `.katex` containers
- [ ] No white flash on navigation — `--bg-primary` is set at `:root`, not just on `<body>`
- [ ] Timer `.urgent` class applies correctly when time < 30s
- [ ] Answer option `.correct` / `.wrong` states render the right colors
- [ ] Progress bars animate from 0 on chapter card mount
- [ ] Sticky navbar applies `backdrop-filter` and blurs content behind it
- [ ] Modal overlay blurs and darkens background; Dialog accessible via keyboard
- [ ] All interactive elements have `:hover` and `:active` states
- [ ] `:focus-visible` ring visible on all focusable elements
- [ ] Touch targets ≥ 44×44px on mobile (375px viewport)
- [ ] Right panel collapses to Sheet on mobile; floating trigger button visible