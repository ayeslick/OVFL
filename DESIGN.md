---
name: OVRFLO Markets
description: Calm, guided position management for self-repaying loans, streams, and fixed returns
mode: operate
creative_north_star: A calm path through one economic choice at a time
colors:
  canvas: "#FFFFFF"
  surface: "#FFFFFF"
  ink: "#051A42"
  muted: "#687E9F"
  border: "#DCE7F3"
  control_border: "#CBDFF1"
  primary: "#078BEF"
  primary_hover: "#0074D6"
  primary_soft: "#EEF7FF"
  loan: "#079CF0"
  loan_soft: "#E8F2FF"
  fixed_return: "#06966D"
  fixed_return_soft: "#E2F8EE"
  pale: "#BFE9FF"
  claimed: "#E4F3FD"
  waiting_fill: "#EDF0F5"
  working: "#087BCC"
  hover_border: "#8AC5FA"
  success: "#06966D"
  success_soft: "#E2F8EE"
  warning: "#9A5A00"
  warning_soft: "#FFF4DF"
  error: "#BA334B"
  error_soft: "#FDECEC"
  disabled_surface: "#EEF2F7"
  focus: "#0060BE"
typography:
  display: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "40px", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.055em", fontFeatureSettings: "\"tnum\" 1" }
  headline: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "30px", fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.04em" }
  title: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "20px", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.03em" }
  body: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.45, letterSpacing: "-0.02em" }
  label: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "16px", fontWeight: 600, lineHeight: 1.35, letterSpacing: "0" }
  numeric: { fontFamily: "Arial, Helvetica, system-ui, sans-serif", fontSize: "16px", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.045em", fontFeatureSettings: "\"tnum\" 1, \"lnum\" 1" }
radii:
  control: "999px"
  card: "28px"
  panel: "28px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
layout:
  compact_max: "767px"
  wide_min: "1024px"
  hub_max_width: "1440px"
  focused_max_width: "720px"
  gutter_compact: "16px"
  gutter_wide: "24px"
  grid_gap: "16px"
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.surface}", typography: "{typography.label}", borderRadius: "{radii.control}", minHeight: "54px", padding: "15px 28px", boxShadow: "none" }
  button-primary-hover: { backgroundColor: "{colors.primary_hover}", textColor: "{colors.surface}", typography: "{typography.label}", borderRadius: "{radii.control}", minHeight: "54px", padding: "15px 28px" }
  button-primary-pressed: { backgroundColor: "{colors.primary_hover}", textColor: "{colors.surface}", typography: "{typography.label}", borderRadius: "{radii.control}", minHeight: "54px", padding: "15px 28px" }
  button-primary-disabled: { backgroundColor: "{colors.disabled_surface}", textColor: "{colors.muted}", typography: "{typography.label}", borderRadius: "{radii.control}", minHeight: "54px", padding: "15px 28px" }
  button-secondary: { backgroundColor: "{colors.primary_soft}", textColor: "{colors.primary_hover}", typography: "{typography.label}", borderRadius: "{radii.control}", minHeight: "54px", padding: "15px 28px" }
  card: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.border}", borderRadius: "{radii.card}", padding: "30px", boxShadow: "none" }
  collection-row: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.border}", borderRadius: "{radii.card}", minHeight: "64px", padding: "24px" }
  status-info: { backgroundColor: "{colors.primary_soft}", textColor: "{colors.ink}", typography: "{typography.label}", borderRadius: "999px", minHeight: "24px", padding: "10px 15px" }
  status-success: { backgroundColor: "{colors.success_soft}", textColor: "{colors.ink}", typography: "{typography.label}", borderRadius: "999px", minHeight: "24px", padding: "10px 15px" }
  status-warning: { backgroundColor: "{colors.warning_soft}", textColor: "{colors.ink}", typography: "{typography.label}", borderRadius: "999px", minHeight: "24px", padding: "10px 15px" }
  status-error: { backgroundColor: "{colors.error_soft}", textColor: "{colors.ink}", typography: "{typography.label}", borderRadius: "999px", minHeight: "24px", padding: "10px 15px" }
  amount-field: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.numeric}", border: "1px solid {colors.border}", borderRadius: "22px", minHeight: "56px", padding: "20px", focusColor: "{colors.focus}" }
---

# Design System: OVRFLO Markets

## Overview

**Creative north star: A calm path through one economic choice at a time.**

OVRFLO Markets is a guided position manager. It helps a connected wallet understand what it owns, choose one meaningful economic action, and complete that action with exact consequences visible before signing. It is not a trading terminal or a metrics dashboard.

This file is the normative visual and interaction system. The approved interactive UI zip is acceptance evidence for Default pixels: white canvas, Arial, 28px cards, pill actions, logo wordmark, and SVG capsules. It is not a fallback source for implementation-time token changes. Any token change requires an explicit design-system revision here before implementation. Agent cockpit: `docs/agents/system.md`.

Default and Advanced are disclosure levels over the same current destination. They share tokens, position identities, action intent, transaction feedback, accessibility behavior, and responsive structure. Advanced may reveal exact protocol controls when product truth supports them. It is not a separate theme, alternate home, or license to invent Dashboard or Markets destinations.

Amounts default to USD for the selected column's underlying. The customer can switch to token units. Signing stays token-native. A missing USD quote hides dollars for that column and does not invent a figure.

**Key characteristics:**

- White canvas and white surfaces.
- Deep navy text with cobalt actions.
- Capsule geometry for Remaining / Repaid, Releasing / Released, and Arriving / Arrived / Claimed / Waiting.
- Blue Self-Repaying Loan identity, stream identity, and green Fixed Return identity.
- Exact token-native consequences before signing.
- USD as the default display for the selected column.
- One active economic decision at a time.
- Clear incomplete, waiting, failed, and recovery states.

## Colors

The palette is calm and functional. Color identifies actions, product types, and outcomes without implying investment performance.

- **Canvas** supports the page background.
- **Surface** supports cards, collections, controls, review panels, and sheets.
- **Ink** is the default text and strong-icon color.
- **Muted** is reserved for secondary explanation and metadata. It must still meet the applicable contrast requirement.
- **Border** is decorative separation for cards, collections, and dividers.
- **Control border** marks interactive boundaries such as fields, secondary buttons, radios, and selectors.
- **Primary** marks purposeful links, progress, selection, and the main action.
- **Loan**, **Pale**, and **Claimed** paint capsule segments. They do not indicate favorable or unfavorable performance.
- **Fixed Return** identifies supply positions. It does not indicate favorable performance.
- **Success**, **Warning**, and **Error** color the icon and use their matching soft background. Status text remains Ink.
- **Disabled surface** supports unavailable controls. Disabled text remains legible and a nearby reason explains the state.
- **Focus** is a visible keyboard focus ring distinct from selection.

Never rely on hue alone. Pair every state with an icon and plain label.

## Typography

Arial, Helvetica, and system-ui are the Default interface face. Use 400, 600, and 700. Do not synthesize weight 600 from another family.

- **Display** carries large amounts and capsule figures.
- **Headline** carries page titles and the current step question.
- **Title** carries card, collection, and position names.
- **Body** carries explanations and recovery guidance.
- **Label** carries fields, badges, and controls.
- **Numeric** carries token amounts, dates, APRs, balances, and progress with lining tabular numerals.

Use sentence case for actions and guidance. Use title case for product types and page titles. Keep token units adjacent to their values. Preserve at least 16px input text on mobile. Keep explanatory text near a 65–75 character measure.

Martian Mono is allowed only for narrow technical identifiers in Advanced, such as full addresses, hashes, calldata, and exact protocol IDs. It is not the navigation, card-title, amount, or receipt face.

## Layout

The application uses a centered hub container up to 1440px and a focused task container up to 720px. Compact gutters are 16px. Wide gutters are 24px. Grid gaps are 16px.

At 1024px and wider, the welcome banner spans the hub. Position-type cards occupy equal columns. Help sits below the type cards. Below 1024px, these regions stack in source order. At 767px and below, controls and collections use the compact single-column treatment without horizontal page overflow.

Desktop create flows show the active decision surface plus a sticky capsule preview. The six-card board documents sequence. It is not a simultaneous production layout. Mobile shows one decision surface at a time, a compact preview, full-width controls, a clear Back action, and safe-area padding where content meets viewport edges. Review remains its own step.

### Navigation and modes

The header has no destination tabs. The logo and `OVRFLO` wordmark return to `/`. Wallet and network remain visible but secondary. Create is a flow. Empty Your OVRFLO is the three-type chooser. A hub **New position** control goes to `/create/`. `Portfolio` is not an alternate Default label.

`Go to Advanced` is available from desktop account navigation and the mobile menu on every Default route. The hub help panel may repeat it. Advanced exposes `Return to Default` in the same global location. A mode change preserves the current object or task when the destination supports it. Otherwise it routes to the closest truthful parent and explains the change.

Destination URLs use a trailing slash. Advanced writes no path and no query param. Refresh on a destination lands in Default. `?lens=` is ignored and stripped. Unknown query keys must not crash. Pre-CS4 shapes have no compatibility redirects.

| Destination | URL | Notes |
|---|---|---|
| Your OVRFLO hub, empty, or incomplete scan | `/` | Incomplete scan does not change the path and does not write matrix query params from a provisional count |
| Self-Repaying Loan collection | `/?type=loan` | Written only after complete hydration on `/` |
| Self-Repaying Loan detail | `/?lending=<market>&loan=<id>` | Identity stays `(lending, id)` |
| Fixed Return collection | `/?type=fixed` | Written only after complete hydration on `/` |
| Fixed Return detail | `/?lending=<market>&position=<id>` | Same identity rule as today |
| Stream collection | `/?type=stream` | Wallet-held unpledged streams. Written only after complete hydration |
| Stream detail | `/?stream=<id>` | Lockup-wide stream id |
| Create (type not yet chosen) | `/create/` | Empty-portfolio Create and New position land here |
| Create Self-Repaying Loan | `/borrow/` | Existing page. `?stream=` and `?step=` stay |
| Create Fixed Return | `/supply/` | Existing page. `?step=` stays |
| Create Stream | `/create/stream/` | PT deposit flow. Hosted convert when the source is underlying |
| Risk | `/risk/` | Unchanged |
| Default vs Advanced | no path or query change | Disclosure only. `Return to Default` is the control. Browser Back does not toggle disclosure. Refresh lands in Default on the same destination |

Query keys that survive: `?lending=`, `?loan=`, `?position=`, `?stream=`, `?step=`, `?type=` (`loan`, `fixed`, or `stream`). Transaction checkpoints remain unenterable from history.

After route or stage navigation, focus moves to the new surface heading. Inline refresh, validation, and transaction-status updates retain focus and announce through a concise live region. Back returns focus to the control that opened the prior surface.

### Portfolio routing and trust

On-chain enumerable books supply stream, loan, supply, and resting-request ids. Each id becomes a position only after direct on-chain hydration confirms ownership, type, status, and amount.

Route to empty, detail, collection, or mixed-type hub only after those books are complete and every row is hydrated. While a book is partial or retrying, keep a stable incomplete `Your OVRFLO` surface. Preserve confirmed cards. Never route from a provisional count.

After complete hydration:

1. Zero positions shows the empty portfolio chooser (Self-Repaying Loan, Fixed Return, Stream).
2. One position routes to its detail.
3. Multiple positions of one type route to that type's collection.
4. Multiple position types show the `Your OVRFLO` hub.

Waiting requests count as the loan type. Wallet-held streams that still sit in the wallet count as the stream type. A pledged stream lives on the loan. View stream from a loan reads that loan's `streamId`.

Never sum positions with different token symbols. Aggregate only positions with the same underlying. When underlyings differ, show the count and group collection totals by underlying.

## Elevation & Depth

Cards use a decorative border on the white canvas. Hover may add a light shadow. Do not combine a prominent border with a wide idle shadow. Nested content uses spacing, dividers, or a soft tint rather than another elevated card.

A card border is decorative and uses Border. Any boundary that communicates interactivity uses Control border.

Motion confirms a state change rather than decorating an idle screen. Capsule segment weights may ease for 550ms when labels stay the same. Remove nonessential motion under `prefers-reduced-motion: reduce`. Do not use ambient movement, ticking numerals, confetti, parallax, looping gradients, or repeated card entrances.

## Shapes

Primary controls are pills. Cards use a 28px radius. Major panels use a 28px radius. Status badges are pill-shaped. Rounding is shared across Default and Advanced.

The Default progress visual is the capsule: a tall rounded SVG whose stacked bands are Remaining / Repaid, Releasing / Released, or Arriving / Arrived / Claimed / Waiting. Loan Remaining and Repaid come from lending accounting. Stream Releasing and Released come from the stream schedule. Do not paint stream withdrawable as loan Repaid.

Use one rounded-outline icon family with a 1.75px stroke and rounded caps. Loan and Stream use water/wave geometry. Fixed Return uses stable/growth geometry. The header uses the verified OVRFLO logo mark.

## Components

### Position identities

A **Self-Repaying Loan** is borrowed value now with deterministic repayment from an eligible stream. Show the exact amount received or obligation, amount remaining, repayment progress, qualified completion timing, status, and valid next action. Progress is not a risk meter. Capsule Remaining is outstanding. Capsule Repaid is obligation minus outstanding. Coverage estimates stay off that capsule.

A **Stream** is a wallet-held lockup that releases ovrfloToken on a fixed schedule. Show immediate receipt, releasing amount, released amount, end date, and Borrow when the stream is eligible and unpledged.

A **Fixed Return** is the Default presentation of an OVRFLOLending supply position. The user supplies ovrfloToken to a selected APR tick. Before match, the funds rest, remain withdrawable, and show `Waiting`; do not promise the target return. `No borrower demand yet` is a waiting supply state. After match, show the exact contractual return and date only when authoritative position and loan reads establish them. PT acquisition is not the Default Fixed Return position. It may remain an Advanced conversion primitive only when product truth supports it.

Canonical lifecycle labels are `Active`, `Working`, `Waiting`, `Completed`, `Unavailable`, and `Failed`. Surface briefs map protocol states to these labels and add explanation. They do not invent badge synonyms.

### Create flows

Position types use the adaptive grammar `SOURCE → UNDERLYING → AMOUNT → TERM → OUTCOME → REVIEW`.

- Source appears only for a meaningful source choice.
- Underlying appears only when multiple supported assets exist.
- Amount remains unless the source fixes it exactly.
- Term appears only when multiple valid terms exist. Live market or PT expiry supplies the date. Do not invent 90 / 180 / 270 day menus.
- Outcome appears only when multiple valid outcomes exist.
- Review never hides.
- Zero valid options produce a named blocking state.

When an upstream choice changes, preserve a downstream value only if it remains valid. Clear every invalid dependent value. Recompute stage visibility. Move to the first newly required or blocking stage before Review.

Self-Repaying Loan Review states the exact asset used, amount received, obligation, relevant date, fees, and current executable availability from `previewBorrow`. Fixed Return Review states the exact ovrfloToken supplied, selected APR tick, resting or matched status, withdrawability while resting, and any authoritative contractual return/date. Stream Review states the PT deposited, immediate ovrfloToken, stream face, and end date. Default hides PT internals, route, approval, and calldata unless Advanced disclosure is on.

A new-stream loan is one customer journey. The graph may require several wallet prompts. Do not promise one signature. Total received is immediate deposit proceeds plus net borrowed proceeds.

### Amount fields

Use a labeled decimal input with `inputmode="decimal"`, visible asset unit, balance, optional Max action, and associated error text. Accept a dot or the active locale decimal separator only when unambiguous. Reject mixed conventions and grouping separators. Normalize to an ASCII decimal string using the asset's declared decimals. Never parse an execution amount through JavaScript `Number`. Floor lending amounts to the live UNIT.

### Actions and controls

One primary action is a maximum, not a requirement. Quote-refreshing and transaction-pending states may have no primary action. Permit at most one secondary button. Explorer and learning destinations are optional text actions and do not count as competing primary controls.

Primary button hover uses Primary hover. Pressed keeps that color and uses a restrained pressed treatment without changing size. Disabled uses Disabled surface, retains a legible label, and has a nearby explanation. Focus uses a 3px Focus ring with enough offset to remain visible. Secondary controls use Primary soft; hover may deepen that tint without dark inversion.

Choice rows use native radio behavior when selection is exclusive. The full row is at least 44px high. Selection uses control state, icon, and Primary soft rather than full dark inversion.

### Status and recovery

Status badges use their semantic soft background with Ink text. The icon and label carry state. The badge never carries the only explanation of a blocked action.

Every state answers: what happened, what remains true, and what the user can do next. If a previously valid action becomes obsolete, disable it, explain why, and preserve any authoritative recovery action. Do not expose retired implementation details as durable product language.

Loading, stale, unavailable, failed, incomplete, and empty are separate states. A failed read never becomes zero. A quote refresh keeps entered choices visible and suppresses stale submission.

### Review, runtime, and finality

Reviewed values must equal submitted values. If a quote, route, amount, fee, or deadline changes, return to a current Review before submission. Default and Advanced must resolve to the same mode-neutral action intent before calldata.

A transaction is confirmed only after a successful receipt reaches `RECEIPT_CONFIRMATIONS`, currently 2. A first-mined receipt remains pending. A position may display Completed, settled, closed, or repaid only after the final receipt threshold and a fresh authoritative state read establish that state.

Default may summarize an internal action graph as one user outcome. It must still show partial completion truthfully and offer only a valid continuation or recovery. Transaction milestones announce without moving focus.

### Exits

PT claim and unwrap are separate exits. PT claim requires maturity and sufficient PT backing. Unwrap is available whenever `OVRFLOReserve` and the wallet's ovrfloToken balance permit one-to-one redemption. Never describe unwrap as maturity-only. Those exits live on the position that owns them.

## Do's and Don'ts

### Do

- **Do** guide the user from a confirmed position to one valid next action.
- **Do** keep confirmed cards visible during partial portfolio discovery.
- **Do** group financial totals by underlying when token symbols differ.
- **Do** expose Advanced globally while preserving the current object or task.
- **Do** use exact token units wherever an amount affects a decision.
- **Do** explain why a resting Fixed Return remains withdrawable and why no return is promised before match.
- **Do** preserve completed and waiting positions in portfolio navigation.
- **Do** use the same visual, action, finality, and accessibility system in Default and Advanced.
- **Do** source capsule Remaining / Repaid from lending, and Releasing / Released from the stream schedule.

### Don't

- **Don't** treat the frontend boards or the demo zip as permission to revise tokens during implementation.
- **Don't** present a Pendle PT purchase as the Default Fixed Return position.
- **Don't** route from a provisional portfolio count or call partial history empty.
- **Don't** sum unlike token symbols.
- **Don't** show all six create stages as simultaneous production cards.
- **Don't** invent Dashboard or Markets navigation without product or active-surface authority.
- **Don't** use APY, health factor, LTV, or liquidation framing in Default.
- **Don't** reveal hidden Default mechanics through Details, transaction copy, or errors.
- **Don't** let USD, cached discovery data, or stale quotes become execution authority.
- **Don't** create a second visual system inside Advanced, mobile, errors, or create flows.
- **Don't** ship the demo wallet, clock, matching script, or localStorage portfolio.
- **Don't** count stream withdrawable as loan Repaid.
