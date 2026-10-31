# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the Agência Coletivo team (the agency itself), using each client's dashboard internally to monitor and report on that client's marketing performance. Each dashboard is also directly reachable by the client (restaurant owner/manager) via their own password, but the agency team is the one driving day-to-day use and the decisions made from the data.

Clients today are restaurants/food businesses: Pato com Laranja, Spesso, Sunomono, Cumbuca, Garami/Kimura/Ipoke, Tapí Tapioca, Delli Jardim, Bar do Ge.

## Product Purpose

A static, password-gated portal that gives Agência Coletivo one dashboard per client, showing that client's ad/marketing performance pulled live from the client's own Google Sheets. It exists so the agency can track and act on campaign performance per client without building a backend, and so each client can also check in on their own numbers if they want to. Success is the agency being able to see current ad spend/bids/performance at a glance and make a campaign decision (raise a bid, pause a campaign, flag a drop) from what's on screen.

## Positioning

Each dashboard is hand-built per client to match that client's own spreadsheet structure and the specific metrics that matter for their campaigns — not a generic templated reporting tool. Data is live-synced from Google Sheets with automatic fallback to the last-known snapshot, so the dashboard keeps working even if the sheet is temporarily unreachable.

## Operating Context

- Hosted as a static site on GitHub Pages — no backend, no server-side code.
- Each client's dashboard (`clientes/<slug>.html`) loads live data straight from that client's Google Sheet (shared as "anyone with the link can view") via `assets/sheets-sync.js` and a per-client mapping script in `assets/live/<slug>.js`, interpreting the sheet as CSV.
- A live/snapshot status indicator and manual "Atualizar" (refresh) button are on every dashboard (`assets/live-status-ui.js`).
- Tapí Tapioca is the one exception: it has its own self-contained Google Sheets integration built directly into `clientes/tapi.html`, not the shared `sheets-sync.js`/`live/*.js` pipeline.
- `admin/painel.html` is the agency's internal admin view: one password gets in and lists/opens any client's dashboard without re-entering that client's password.
- `admin/gerar-senha.html` is an offline utility to generate a new password hash when a client's password needs to change.
- The agency's day-to-day use includes logging specific campaign actions (bid changes, budget changes, campaign activations) per client over time, as reflected in the project's commit history.

## Capabilities and Constraints

- Login is a shared-link-style access gate, not real security: GitHub Pages serves everything as static files, so the source, password hashes, and all clients' data are visible to anyone with technical know-how. Nothing that can't tolerate leaking should go into this project.
- Each client has one password (SHA-256 hash stored in `assets/portal-config.js`); a session lasts 12 hours in that browser's `localStorage`.
- Adding a client means: an HTML file in `clientes/`, an entry in `PORTAL_CLIENTS` in `assets/portal-config.js`, and (for live sync) a new `assets/live/<slug>.js` mapping script — each dashboard's data shape is bespoke, so this script is written by hand per client, not generated from a shared schema.
- Live sync depends on the client's sheet staying shared as "anyone with the link can view"; if that permission is removed, the dashboard silently falls back to its last saved snapshot rather than breaking.
- Known per-client quirks to preserve: Cumbuca's "🆕 novo produto" tag can't be detected from the plain CSV export (it's a cell color in the sheet), so it's maintained as a manual keyword list in `assets/live/cumbuca.js`. Sunomono has ~20 units and only drops its "live" indicator if more than 40% of units fail to fetch at once, so a single unit's stale data doesn't flag the whole dashboard as down.

## Brand Commitments

- Agency: Agência Coletivo (logo at `assets/logos/agencia-coletivo.jpg`), shown on the portal login screen.
- Each client has its own name, logo, and accent color recorded in `assets/portal-config.js` (`color` field), carried into that client's dashboard.
- Dashboards are titled "<Cliente> | Dashboard de Performance"; all UI copy is in Brazilian Portuguese.

## Evidence on Hand

- Real, live client data via each client's own Google Sheet — not sample/placeholder data.
- Git history contains dated records of real campaign actions taken per client (bid changes, budget activations), used as a working log by the agency.

## Product Principles

- Build each dashboard around the client's actual spreadsheet and the metrics that drive a real campaign decision — never a generic template stretched to fit.
- Never let a data-source hiccup (sheet moved, permission changed, offline) break the page — always fall back to the last good snapshot and say so visibly.
- Treat this as a visual access gate, not a security boundary — don't design features or copy that imply real secrecy or protection.
- Keep every client's dashboard independently maintainable; a change to one client's sheet or metrics should never require touching another client's file.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established.
