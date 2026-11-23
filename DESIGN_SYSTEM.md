# Placement Intelligence — Master Design System Documentation

## 1. Design System Philosophy & Identity
Placement Intelligence is an enterprise college-to-student placement ecosystem. Its visual identity balances modern educational technology with enterprise SaaS rigor.

The visual system is anchored in clean, light, warm surfaces, subtle depth, editorial typography, and high-contrast accessibility.
- **Student Portal Theme:** Warm light surfaces with an energetic, encouraging Orange accent (`#F97316`, `#EA580C`, `#FFF0E4`).
- **Institutional Admin Portal Theme:** High-trust Enterprise Blue accents (`#2563EB`, `#1E40AF`, `#EFF6FF`) with structured, scannable data views.
- **Unified Examination Center:** Pristine distraction-free White (`#FFFFFF`, neutral borders `#E2E8F0`, slate typography `#0F172A`) ensuring zero candidate cognitive fatigue.

---

## 2. Core Color Tokens

### 2.1 CSS Variables (`:root`)
```css
:root {
  --background: #FAFAF9;
  --surface: #FFFFFF;
  --surface-muted: #F5F6F8;
  --text-primary: #172235;
  --text-secondary: #64748B;
  --brand-primary: #F97316;
  --brand-hover: #EA580C;
  --brand-soft: #FFF0E4;
  --success: #16A36A;
  --warning: #E9A23B;
  --danger: #DC4545;
  --border: #E6E8EC;
}
```

### 2.2 Semantic Color Mapping
| Role | Hex | Tailwind Utility Equivalent | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#FAFAF9` | `bg-[#FAFAF9]` / `bg-stone-50` | Primary app canvas |
| **Surface Card** | `#FFFFFF` | `bg-white` | Elevated content containers |
| **Surface Muted** | `#F5F6F8` | `bg-[#F5F6F8]` | Nested panels, tables headers |
| **Primary Text** | `#172235` | `text-[#172235]` / `text-slate-900` | Headings, primary data labels |
| **Secondary Text** | `#64748B` | `text-[#64748B]` / `text-slate-500` | Body text, captions, metadata |
| **Brand Primary (Student)** | `#F97316` | `text-orange-500` / `bg-orange-500` | CTAs, active highlights |
| **Brand Deep** | `#EA580C` | `text-orange-600` / `bg-orange-600` | Hover states, active borders |
| **Brand Soft** | `#FFF0E4` | `bg-[#FFF0E4]` | Pill backdrops, badges |
| **Institutional Blue (Admin)**| `#2563EB` | `bg-blue-600` | Admin CTAs, admin navigation |
| **Success** | `#16A36A` | `text-emerald-600` / `bg-emerald-600` | Passed, verified, high ATS |
| **Warning** | `#E9A23B` | `text-amber-500` / `bg-amber-500` | Medium readiness, review pending |
| **Danger** | `#DC4545` | `text-rose-600` / `bg-rose-600` | Critical alerts, violations, errors |

---

## 3. Typography Scale

Default Font Family: `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`  
Monospace Font Family: `'JetBrains Mono', monospace` (code questions & terminal output)

- **Display / Hero Headline:** `text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.08]`
- **Section Heading:** `text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172235]`
- **Card Heading:** `text-base sm:text-lg font-bold text-[#172235]`
- **Body Regular:** `text-sm text-[#64748B] leading-relaxed`
- **Caption / Badge:** `text-[11px] font-bold tracking-wider uppercase`
- **Code & Syntax:** `font-mono text-xs text-slate-800`

---

## 4. Component Standards

### 4.1 Buttons
- **Primary Action (Brand Orange):** `bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white font-bold px-6 py-3 rounded-full shadow-[0_4px_14px_rgba(249,115,22,0.3)] hover:shadow-lg transition-all`
- **Secondary / Ghost:** `bg-white border border-[#E8EAF0] text-slate-800 font-bold px-6 py-3 rounded-full hover:bg-slate-50 transition-all`
- **Admin Action (Enterprise Blue):** `bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-2xl shadow-sm transition-all`
- **Minimum Touch Target:** $44\text{px} \times 44\text{px}$ across mobile viewports.

### 4.2 Cards & Surfaces
- **Card Default:** White `#FFFFFF`, border `1px solid #E6E8EC`, radius `20px` to `24px`, shadow `0 10px 30px -5px rgba(17, 24, 39, 0.04)`.
- **Card Hover:** Subtle elevation translation `-2px`, shadow `0 16px 40px -10px rgba(17, 24, 39, 0.08)`.
- **Status Pills:** Pill capsule shape (`rounded-full`), padding `px-3 py-1`, text `text-xs font-bold`.

### 4.3 Form Inputs
- Background `#FFFFFF` or `#F8FAFC`, border `1.5px solid #E2E8F0`, focus border `1.5px solid #F97316` (Student) or `#2563EB` (Admin).
- Standard height `44px` on mobile, `40px` on desktop.

---

## 5. Responsive Grid & Breakpoint Specifications
- **Container Max Width:** `1240px` for landing pages, `1200px` for portal dashboards.
- Breakpoints:
  - `sm`: `640px`
  - `md`: `768px`
  - `lg`: `1024px`
  - `xl`: `1280px`
  - `2xl`: `1536px`
- Zero horizontal overflow guarantee: `overflow-x-hidden` on parent wrappers, mobile horizontal tables wrapped in fluid scrolling containers with visual gradient fades.
