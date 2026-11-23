# Placement Intelligence — Master Landing Page Architecture & Design Specification

## Overview
Placement Intelligence is a modern enterprise college placement management and career-readiness technology ecosystem. The public web experience has been transformed into a visually exceptional, 3D isometric campus world built strictly through code (SVG + CSS 3D Transforms + React).

---

## 1. Design System & Tokens
The design system balances enterprise SaaS credibility with welcoming educational technology aesthetics.

### Color Palette
- **Primary Backgrounds**: Pure White (`#FFFFFF`), Off-White Cream (`#FAFAF8`), Subtle Neutral (`#F8F9FC`), Peach Tint (`#FFF9F5`), Soft Peach (`#FFF0E4`).
- **Primary Text**: Slate 900 (`#111827`), Navy Heading (`#172235`), Secondary Body (`#64748B`).
- **Brand Accents**: Primary Orange (`#F97316`), Deep Orange (`#EA580C`), Soft Peach Accent (`#FFF0E4`).
- **Supporting Accents**: Emerald Verification Green (`#22A06B`), Tech Blue (`#5277D7`), Intelligence Purple (`#8B5CF6`).
- **Borders & Dividers**: Subtle (`#E8EAF0`), Peach Subtle (`#FFE5D6`).

### Typography Tokens
- **Font Stack**: `Plus Jakarta Sans`, `Inter`, `JetBrains Mono` for code and telemetry data.
- **Hero Title**: `text-4xl sm:text-6xl md:text-7xl font-black text-[#111827] tracking-tight`
- **Section Heading**: `text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight`
- **Pill Badges**: `text-[11px] font-bold tracking-wider uppercase`

---

## 2. Master Component Architecture

```
src/features/landing/
├── components/
│   ├── LandingHeader.tsx              # Floating capsule navigation with 'Platform' drawer
│   ├── HeroSection.tsx                # Master Hero section with headline and 3D scene
│   ├── PlacementEcosystemScene.tsx    # Central 3D isometric miniature campus SVG scene
│   ├── IsometricBuilding.tsx          # Reusable 3D building primitive (top, left, right walls)
│   ├── IsometricTree.tsx              # Reusable campus greenery & landscaping
│   ├── IsometricPath.tsx              # Connected campus roadways, bridges & data pulses
│   ├── FloatingStudentCard.tsx        # Floating Candidate Profile & completeness ring
│   ├── FloatingSkillCard.tsx          # Floating Verified Skill Card (94/100, SHA-256)
│   ├── FloatingOpportunityCard.tsx    # Floating Job Match Card (96% match, eligibility met)
│   ├── FloatingReadinessCard.tsx      # Floating Placement Readiness Index Card (88/100)
│   ├── FloatingAssessmentCard.tsx     # Floating Dark-Mode IDE Coding Assessment Card
│   ├── PlatformOverview.tsx           # Section 1: 8 core platform capabilities
│   ├── PlacementJourney.tsx           # Section 2: 6-stage connected isometric workflow
│   ├── StudentFeatures.tsx            # Section 3: Student-focused intelligence suite
│   ├── CollegeFeatures.tsx            # Section 4: Enterprise College placement console
│   ├── StartupAtlasShowcase.tsx       # Section 5: India tech ecosystem corridors
│   ├── VerifiedSkillsSection.tsx      # Section 6: Cryptographic credibility & certificates
│   ├── OpportunityIntelligence.tsx    # Section 7: Campus recruitment drive matching
│   ├── PlacementAnalyticsSection.tsx  # Section 8: Institutional telemetry & readiness
│   ├── FinalCTA.tsx                   # Section 9: Dual candidate and admin CTA
│   └── LandingFooter.tsx              # Section 10: Multi-column comprehensive footer
├── pages/
│   └── LandingPage.tsx                # Assembled Master Landing Page orchestrator
└── tokens/
    └── designTokens.ts                # Master design tokens & styling variables
```

---

## 3. The 7 Architectural Campus Zones
The `PlacementEcosystemScene.tsx` component models the complete university placement lifecycle as an interconnected miniature campus:
1. **Zone A: Resume Intelligence** — Library / student development building with document stacks, parsing engines, and skill extraction beacons.
2. **Zone B: Skill Verification** — Computer laboratory with holographic verification badges, test terminals, and certification seals.
3. **Zone C: Assessment & Examination Centre** — Examination hall with proctored IDE monitors, auto-evaluation pods, and timer displays.
4. **Zone D: Personalized Roadmap** — Central pathway hub with adaptive milestone towers, weekly checkpoints, and career trajectory spirals.
5. **Zone E: Company & Job Intelligence** — Corporate technology tower with employer interfaces, recruitment radar, and active drive shortlists.
6. **Zone F: Placement Management & Analytics** — Directorate complex with dashboard domes, readiness telemetry distribution, and cohort tracking.
7. **Zone G: Startup Atlas** — Innovation pavilion with India technology ecosystem beacon, startup discovery nodes, and geographic cluster links.

---

## 4. Performance & Engineering Quality
- **Zero Heavy 3D Bloat**: Entire isometric scene is coded in pure SVG and GPU-accelerated CSS 3D transforms (`rotateX`, `rotateZ`, `perspective`).
- **Ultra-Lightweight Bundle**: Production bundle for the entire landing page is only **15.87 kB** gzipped (`73.43 kB` raw).
- **Responsive at All Breakpoints**:
  - `Desktop (>= 1280px)`: Full isometric campus with 5 floating animated interface cards.
  - `Tablet / Laptop (768px - 1024px)`: Scaled isometric campus with repositioned floating cards.
  - `Mobile (< 768px)`: Centered stacked layout with full touch navigation and scrollable cards.
- **Accessibility**: Semantic HTML, screen-reader labels, keyboard navigable controls, visible focus rings, and high-contrast color choices.
