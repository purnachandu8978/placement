# Placement Intelligence — Responsive Design & Viewport Architecture Guide

## 1. Overview & Core Principles
Placement Intelligence is designed as an accessible, cross-device application delivering zero layout breakdown, zero horizontal clipping, and optimized cognitive flow from a 320px smartphone to a 1920px+ ultra-wide workstation monitor.

---

## 2. Standardized Viewport Breakpoint Matrix

| Tier | Breakpoint Query | Representative Devices | Layout Adaptation Strategy |
| :--- | :--- | :--- | :--- |
| **Mobile Small** | `320px – 375px` | iPhone SE, Galaxy A-series | Single fluid column, bottom sticky 5-action navigation, touch targets $\ge 44\text{px}$, modal full-bleed. |
| **Mobile Standard** | `376px – 430px` | iPhone 14/15/16 Pro, Pixel 8/9 | Single column, generous padding (`p-4`), compact stat cards (`grid-cols-2`). |
| **Tablet Portrait** | `768px – 1023px` | iPad Mini, iPad 10th Gen | 2-column grid (`grid-cols-2`), compact sidebar or slide-over drawer, responsive tables with horizontal scroll indicators. |
| **Laptop Desktop** | `1024px – 1439px` | MacBook Pro 14", ThinkPad | Full vertical sidebar rail (`w-64`), multi-column dashboard grids (`grid-cols-3` / `grid-cols-4`), split-pane IDE. |
| **Large Desktop** | `1440px – 1920px+` | Studio Display, 4K Monitors | Max container constraint (`1320px` centered), luxury whitespace, optimal reading line length. |

---

## 3. Navigation System Adaptations

### 3.1 Public Landing Page
- **Desktop ($\ge 1024\text{px}$):**
  - Left: 2x2 Grid Icon + Bold Orange `PI` Monogram + "Placement Intelligence".
  - Center: Capsule Navigation with active orange indicator on `Home`, dropdown menus on `Platform`.
  - Right: Quick Action icons (`Location`, `Bell`, `Star`, `⚡`, Avatar dropdown).
- **Mobile ($< 1024\text{px}$):**
  - Capsule collapses into clean hamburger menu toggle.
  - Tapping hamburger opens full-height backdrop-blurred drawer with direct links to all 4 sections and portal logins.

### 3.2 Candidate Student Portal
- **Desktop ($\ge 1024\text{px}$):**
  - Left 64-width sticky sidebar rail (`w-64 sticky top-20`) with student avatar, college, live MongoDB Atlas status, readiness index, categorized navigation links, and Guided Tour launcher.
- **Mobile ($< 1024\text{px}$):**
  - Sticky top bar: Avatar, name, live readiness score, MongoDB sync button, Menu drawer toggle.
  - Sliding Drawer: Full list of 14 student navigation modules with status badges.
  - Fixed Bottom Bar: 5 primary touch actions (`Home`, `Tests`, `Skills`, `Roadmap`, `Modules`).
  - Container padding: `pb-20 lg:pb-6` ensuring zero content overlap.

### 3.3 Institutional Admin Portal
- **Desktop ($\ge 1024\text{px}$):**
  - Left 64-width sticky sidebar rail with instant module search filter, categorized sections (`Overview`, `Student Management`, `Academic & Examination`, `Career & Placement`, `Communication & Platform`).
  - Top breadcrumb hierarchy on main content column.
- **Mobile ($< 1024\text{px}$):**
  - Sticky top bar with admin role badge and Console drawer toggle.
  - Drawer with live search filtering across all 19 administration modules.
  - Fixed Bottom Bar: 5 vital administrative hubs (`Home`, `Students`, `Exams`, `Verify`, `All`).
  - Container padding: `pb-20 lg:pb-6`.

### 3.4 Unified Examination & Proctored IDE
- **Desktop ($\ge 1024\text{px}$):**
  - Top header: Exam title, violation warning pill, countdown timer, connectivity indicator, fullscreen toggle, and Submit button.
  - Body: Split-pane (50% Problem Statement & Test Cases, 50% Coding Editor & Execution Console) + Right-side Question Palette (grid of question bubbles).
- **Mobile ($< 1024\text{px}$):**
  - Stacked layout: Problem Statement on top, Code Editor below, followed by expandable bottom sheet for Question Palette.
  - Large touch-friendly option selection buttons on MCQs ($\ge 48\text{px}$).

---

## 4. Touch Target & Accessibility Compliance
- Every interactive element (buttons, tabs, inputs, question bubbles) has a minimum tap boundary of $44\text{px} \times 44\text{px}$ on touch viewports.
- Color contrast meets WCAG AA standards:
  - Dark Charcoal text (`#111827`, `#172235`) on White canvas (`#FFFFFF`): Contrast ratio $> 12:1$.
  - Brand Orange text (`#EA580C`) on White canvas: Contrast ratio $> 4.8:1$.
  - Muted secondary text (`#64748B`) on White canvas: Contrast ratio $> 4.6:1$.
