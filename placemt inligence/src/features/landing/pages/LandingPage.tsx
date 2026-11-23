import React from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { HeroSection } from '../components/HeroSection';
import { PlacementJourney } from '../components/PlacementJourney';
import { PlatformOverview } from '../components/PlatformOverview';
import { FinalCTA } from '../components/FinalCTA';
import { LandingFooter } from '../components/LandingFooter';

/**
 * Public Landing Page — Placement Intelligence
 * STRICT FOUR-SECTION ARCHITECTURE:
 * Section 1: Hero & Product Identity (Pixel-accurate reproduction of reference visual)
 * Section 2: The Placement Journey (5-Stage Connected Pipeline)
 * Section 3: Platform Capabilities (9-Card Comprehensive Grid)
 * Section 4: College Value & Final CTA (Institutional Value + Action + Footer)
 */
export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-orange-500 selection:text-white">
      {/* Navigation Header */}
      <LandingHeader />

      {/* SECTION 1: Master Hero Section matching reference image */}
      <HeroSection />

      {/* SECTION 2: The Placement Journey (5 Connected Stages) */}
      <PlacementJourney />

      {/* SECTION 3: Platform Capabilities (9 Core Modules) */}
      <PlatformOverview />

      {/* SECTION 4: College Value & Final CTA */}
      <FinalCTA />

      {/* Compact Editorial Footer */}
      <LandingFooter />
    </div>
  );
};
