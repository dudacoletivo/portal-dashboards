---
name: Portal de Dashboards
description: Painel de operação multi-cliente da Agência Coletivo — um shell neutro de acesso e, por trás de cada login, um dashboard de performance com a cor e identidade daquele cliente.
colors:
  shell-ink: "#1b2430"
  shell-ink-soft: "#5b6675"
  shell-bg: "#f4f6fb"
  shell-card: "#ffffff"
  shell-line: "#e7ebf3"
  shell-accent: "#4f5eff"
  shell-accent-soft: "#eef0ff"
  shell-red: "#c8433d"
  shell-red-bg: "#fbeaea"
  status-good: "#1E7A46"
  status-bad: "#c32525"
  status-neutral: "#8a6d1a"
  client-cumbuca-primary: "#5e1255"
  client-pato-primary: "#F89E26"
  client-spesso-primary: "#00498e"
  client-sunomono-primary: "#c32525"
  client-garami-primary: "#221F1D"
  client-tapi-primary: "#7B131F"
  client-delli-primary: "#C1503F"
  client-bar-do-ge-primary: "#DD6627"
typography:
  display:
    fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  label:
    fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.04em"
  body:
    fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  pill: "999px"
  lg: "18px"
  sm: "10px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
components:
  kpi-tile:
    backgroundColor: "{colors.shell-card}"
    rounded: "{rounded.lg}"
    padding: "16px 18px"
  pill-badge:
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  button-primary:
    backgroundColor: "{colors.shell-accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "13px 18px"
---

# Design System: Portal de Dashboards

## Overview

**Creative North Star: "O Painel de Operação"**

This is an operator's tool, not a showcase: every screen exists so someone at Agência Coletivo can glance at a number, see if it's up or down, and decide the next move on a campaign. The system has two layers that deliberately look different from each other on purpose. The **shell** (login screen, admin panel) is the agency's own neutral territory — indigo accent, soft blue-grey background, no client branding visible until after login, because the point of that screen is that nobody should learn which clients exist just by looking at it. The **dashboards** (one per client, behind `clientes/<slug>.html`) share one structural recipe — light cards, rounded corners, soft shadow, uppercase micro-labels, green/red/amber status language — but each is skinned in that client's own primary color, logo, and occasional named-category accent colors specific to their business. The two layers never swap vocabulary: the shell's indigo never appears inside a client dashboard, and a client's brand color never appears in the shell.

Within a dashboard, density is high and intentional: KPI tiles, tabbed sections, filter bars, and tables are built to be scanned fast, not admired. Decoration is minimal and functional — a soft shadow to lift a card off the page, a colored left-border or pill to carry meaning (status, category, delta direction), never ornament for its own sake.

The current recipe is deliberately plain ("planilha turbinada" — a souped-up spreadsheet), and that's an acknowledged, confirmed starting point rather than a fixed ceiling: the agency wants room to grow each client's dashboard beyond just an accent color into more of that client's actual brand identity over time (typography texture, imagery, bespoke motifs), as long as it never compromises the fast-read KPI/table core.

**Key Characteristics:**
- Two-layer system: a neutral agency shell + per-client-skinned dashboards, never mixing vocabularies.
- One shared structural recipe (cards, radius, shadow, badges) reused across all 8 client dashboards, re-colored per client.
- Status language (green = good, red = bad, amber/gold = neutral/attention) is constant across every dashboard regardless of client color.
- Flat, light, high-density — built for a fast read and a decision, not for dwelling.

## Colors

The shell and each client dashboard each define their own small palette; only the *roles* and the shared status colors travel across all of them.

### Primary (per client — accent only, swapped per dashboard)
- **Cumbuca Deep Plum** (`#5e1255`): Cumbuca's header text, active tab, table header fill, primary buttons.
- **Pato com Laranja Marigold** (`#F89E26`): Pato com Laranja's accent.
- **Spesso Navy** (`#00498e`): Spesso's accent (also used as the shared "Atualizar" refresh-button color across all dashboards via `live-status-ui.js`, independent of client color).
- **Sunomono Crimson** (`#c32525`): Sunomono's accent.
- **Garami/Kimura/Ipoke Near-Black** (`#221F1D`): this client's accent; also reused in the admin shell's "sair/logout" button.
- **Tapí Tapioca Brick Red** (`#7B131F`): Tapí's accent.
- **Delli Jardim Terracotta** (`#C1503F`): Delli's accent.
- **Bar do Ge Burnt Orange** (`#DD6627`): Bar do Ge's accent.

**The One Accent Per Client Rule.** Each dashboard has exactly one primary brand color (from `assets/portal-config.js`), used for headers, active states, and primary actions. A dashboard may add 2-4 named secondary colors for its own categories (e.g. Cumbuca's teal for "Cumbuca Brasileira", red for "Wraps") — those are that dashboard's own business taxonomy, not shared system colors.

### Neutral (shared shape, client-specific exact value)
- **Card White** (`#ffffff`): every card, tile, table, and modal surface.
- **Soft Background** (`#f4f6fb` shell / warm off-whites like `#f7f5f2` or `#faf7f2` per dashboard): page background behind cards.
- **Ink** (`#1b2430` shell / per-dashboard dark neutral like `#2b2320`): primary text.
- **Ink Soft** (`#5b6675` shell / per-dashboard muted neutral like `#6b6560`): secondary text, micro-labels, captions.
- **Border/Line** (`#e7ebf3` shell / per-dashboard light neutral like `#e7e1da`): 1-1.5px hairline borders on every card and input.

### Status (identical across the whole system — never recolor these)
- **Good / Up** (`#1E7A46` text on `#e7f5ec` background): positive delta, "live" status pill, healthy campaign state.
- **Bad / Down** (`#c32525`–`#c8433d` text on `#fbeaea` background): negative delta, fatal-error banner, failed-sync state.
- **Neutral / Watch** (`#8a6d1a` text on `#fff3d6`/`#faf3e0` background): flat delta, snapshot-mode indicator, attention callouts.

**The Status Colors Are Sacred Rule.** Green/red/amber mean good/bad/watch everywhere in this system, independent of whatever client color is active. A dashboard's brand color is never substituted for a status color, even if they'd clash.

## Typography

**Body/Display Font:** Calibri (with `'Segoe UI', Candara, Optima, Arial, sans-serif` fallback) — used everywhere, shell and dashboards alike, no exceptions.

**Character:** A plain, legible system font stack chosen for density and speed of reading, not personality. There is no separate display or mono face; hierarchy comes entirely from size, weight, and color, not font-family changes.

### Hierarchy
- **Display** (800 weight, 24–32px): screen-level titles — "Portal de Dashboards", the admin hero heading.
- **Title** (700 weight, 15–22px): client/brand name in a dashboard header, card titles, section titles.
- **Label** (700 weight, 11–12px, uppercase, +0.04em tracking): KPI labels, filter-field labels, table column headers — the uppercase micro-label is the system's main hierarchy device at the component level.
- **Body** (400–600 weight, 13.5–15px): paragraph text, table cell content, form inputs.
- **Value** (800 weight, 22–23px): the one place numbers get oversized — a KPI's headline figure.

**The Uppercase Label Rule.** Any field or metric name that isn't a card title is set uppercase, 11–12px, 700 weight, with slight letter-spacing. This is how the system signals "this is a label, not content" without changing font.

## Layout

The shell centers a single narrow card (max-width ~380px) on the viewport; dashboards use a wide, max-width 1440px container (`.app`) with generous but efficient 20–24px outer padding. Inside a dashboard, content stacks top to bottom: header → tab nav (when present) → filter bar → KPI row (CSS grid, `repeat(auto-fit, minmax(170px,1fr))`) → two-column or single-column content grid (`grid-2` at 1.3fr/1fr, or `grid-1`) → tables. Gaps between sections run 14–18px; that's the system's one spacing rhythm, reused at every level instead of a wider type scale.

Responsive behavior relies on CSS grid auto-fit rather than hand-tuned breakpoints: KPI tiles and leverage cards reflow by wrapping, not by a named mobile layout. Sticky positioning is used sparingly and only for genuinely persistent reference UI (table header rows; one client's "sticky chart while scrolling a comparison table" pattern), and is explicitly turned off below ~900px width or ~700px height rather than fighting small viewports.

## Elevation & Depth

Flat-by-default with one consistent soft-shadow treatment for anything that reads as a "panel" sitting above the page: `0 1–2px 2px rgba(ink,.04-.05), 0 6–24px rgba(ink,.06-.08)` (exact rgba tint varies slightly per client's ink color, but the two-layer tight+diffuse shadow formula is constant). There is no hover-elevation choreography — cards don't lift on interaction; elevation is structural (this is a panel) not responsive (you're hovering it).

### Shadow Vocabulary
- **Panel shadow** (two-layer soft shadow as above): every card, KPI tile, table wrapper, modal, pill badge, and the live-status indicator.
- **Deep modal shadow** (`0 20px 50-60px rgba(0,0,0,.14-.25)`): reserved for the legend/help modal overlay only — the one element meant to feel like it's floating above everything else.

**The Flat-By-Default Rule.** Nothing lifts or deepens on hover. The only hover feedback is a color/background swap (e.g. a ghost button filling with its accent color), never a shadow change.

## Shapes

Three radius steps used consistently, with exact pixel values varying ±2-4px per client file (not yet unified to one literal token):
- **Pill** (`999px`): every badge, status indicator, chip, tab-free action button, and filter chip. The pill is the system's signature "this is a small tappable/readable unit" shape.
- **Large** (≈18-22px): outer cards, KPI tiles, modals, the login card.
- **Small** (≈9-14px): inputs, selects, table-wrap containers, nested sub-cards.

**The Two-Radius Rule.** A card radius and its children's radius are never the same number — an inner element (input, sub-card, table wrapper) always uses the smaller step, which is what keeps dense, nested layouts from looking like a stack of identical rounded rectangles.

## Components

### Buttons
- **Shape:** pill (`999px`) for most actions (refresh, legend, logout); small radius (`9-10px`) only for the shell's full-width primary submit button.
- **Primary:** solid fill in the active color scope's accent (shell indigo, or that dashboard's client color), white text, bold (700) weight.
- **Ghost/ outline:** 1.5px border in the accent color, transparent/white background, text in accent color; fills solid on hover (`:hover{ background: accent; color: #fff; }`) — this hover recipe repeats everywhere a ghost button appears.
- **Ghost + status button for logout/admin exit:** dark neutral fill (`#221F1D`) regardless of client color, since it's a shell-level action, not a client-branded one.

### Pills / Chips / Badges
- **Status pill** (live/snapshot/loading indicator): background+text pair drawn from the status palette, never the client color.
- **Delta badge** (up/down/flat): pill-shaped, status-colored background + text, used inline next to any KPI value or table row.
- **Category chip** (client-specific taxonomy, e.g. brand/store filters): pill-shaped, outlined by default, fills solid with a client-chosen color (not necessarily the primary accent) when toggled on.

### Cards / Containers
- **Corner style:** large radius (system Shapes section).
- **Background:** white (`--card`).
- **Shadow:** panel shadow (system Elevation section).
- **Border:** always a 1-1.5px hairline in the dashboard's neutral border color, even though the shadow alone would read as "lifted" — the border is what keeps cards crisp against a busy page.
- **KPI tile variant:** same card recipe, often with a colored top border (3-4px) as the only extra accent.

### Inputs / Selects
- **Style:** 1.5px border, small radius, white background, inherited font.
- **Focus:** a 2px outline in the dashboard's secondary accent (not the primary), offset 1px — deliberately distinct from the primary accent so focus doesn't compete with brand color.
- **Custom select arrow:** inlined SVG chevron in the dashboard's ink-soft color, never the browser default arrow.

### Tables
- **Header:** solid fill in the dashboard's primary accent color, white uppercase label text, rounded only at the two outer top corners.
- **Row hover:** a near-white warm tint, never a shadow or border change.
- **Cell badges:** same pill-badge component, used for status/category tags inside cells.

### Modal
- **Style:** white, large radius, deep modal shadow, dark translucent overlay (`rgba(ink,.55)`) behind it — the one place in the system an overlay/scrim is used.

### Live-Status Indicator (signature component)
A fixed-position pill + pill-button pair (`assets/live-status-ui.js`) present on every synced dashboard, independent of that dashboard's own styling: a status pill that reads "● dados ao vivo (hora)" / "○ snapshot" / "… atualizando" in status colors, next to a solid navy "🔄 Atualizar" button. Because it's injected by shared JS rather than per-dashboard CSS, its colors are hardcoded rather than token-driven — it is the one component that does not adapt to a client's accent color, by design, since it represents system/data state rather than client identity.

## Do's and Don'ts

### Do:
- **Do** keep the shell (login, admin) in its own neutral indigo territory — no client name, logo, or color should ever be visible before a successful login.
- **Do** reuse the pill shape for anything meant to be scanned as a small status/category unit, and the two-step radius pattern (large outer, small inner) for anything nested.
- **Do** keep the green/red/amber status vocabulary literal and identical across every client dashboard, regardless of that client's accent color.
- **Do** treat the uppercase micro-label as the system's primary hierarchy tool at the component level, rather than introducing new type sizes.
- **Do** look for ways to extend a client's brand identity beyond just the accent swatch (texture, imagery, type treatment) as the system matures — the current flat "spreadsheet" look is a confirmed starting point, not a ceiling, as long as KPI/table scanability stays intact.

### Don't:
- **Don't** let a client's brand color leak into the shell, or the shell's indigo leak into a client dashboard.
- **Don't** add hover elevation (shadow growth) to cards or tiles — hover feedback here is color/fill only.
- **Don't** repurpose a status color (green/red/amber) for anything other than good/bad/watch meaning, even where a client's own palette would make it tempting.
- **Don't** recolor the live-status indicator per client — it signals data-sync state, not brand, and stays constant on purpose.
