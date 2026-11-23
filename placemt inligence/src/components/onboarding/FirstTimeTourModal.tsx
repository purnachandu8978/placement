import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  FileUp,
  Award,
  Map,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';

interface TourStep {
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  icon: React.ReactNode;
  accentLabel: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Your Clean Workspace',
    subtitle: 'Zero Pre-Filled Data • Built Around You',
    description:
      'Every metric, skill matrix, readiness gauge, and roadmap on your dashboard starts cleanly at 0%. Everything shown here is backed by your real activity stored safely in MongoDB Atlas.',
    highlights: [
      'Google account authenticated via Firebase Auth',
      'Dedicated profile, login audit, and resume collections',
      'Zero simulated demo profiles or inflated readiness numbers',
    ],
    icon: <Sparkles className="w-7 h-7 text-[#FF7A59]" />,
    accentLabel: 'Step 1 of 5 • Clean Starting Point',
  },
  {
    title: 'Upload Your Resume First',
    subtitle: 'One Upload Personalizes the Entire Platform',
    description:
      'Head to Resume Intelligence and upload your .pdf, .docx, or .txt resume. Our extraction engine reads your actual coursework, projects, contact links, and skills to unlock the whole app.',
    highlights: [
      'Real ATS score & bullet strength breakdown computed from your file',
      'Detected technical skills automatically synced across your profile',
      'Personal 4-week roadmap & live job match percentages auto-generated',
    ],
    icon: <FileUp className="w-7 h-7 text-[#FF7A59]" />,
    accentLabel: 'Step 2 of 5 • Resume Intelligence',
  },
  {
    title: 'Verify Your Skills with Live Tests',
    subtitle: '5-Question Quick & 10-Question Comprehensive',
    description:
      'Each detected skill unlocks dedicated assessments combining timed MCQs with practical coding challenges graded directly on the backend.',
    highlights: [
      '5Q Quick: 3 MCQs + 1 Simple Coding + 1 Hard Coding',
      '10Q Comprehensive: 6 MCQs + 2 Simple Coding + 2 Hard Coding',
      'Score 75%+ to mint a cryptographically verifiable badge on your portfolio',
    ],
    icon: <Award className="w-7 h-7 text-[#FF7A59]" />,
    accentLabel: 'Step 3 of 5 • Assessment Center',
  },
  {
    title: 'Follow Your Tailored 4-Week Roadmap',
    subtitle: 'Track Tasks & Submit Practical Assignments',
    description:
      'Check off daily milestones generated specifically from your resume stack and submit real GitHub repositories in Assignment Center.',
    highlights: [
      'Task toggles persist immediately to MongoDB',
      'Assignments contribute 15% of your Placement Readiness Index',
      'Gap analysis highlights missing skills top recruiters want',
    ],
    icon: <Map className="w-7 h-7 text-[#FF7A59]" />,
    accentLabel: 'Step 4 of 5 • Roadmap & Labs',
  },
  {
    title: 'Apply with Real Match Intelligence',
    subtitle: 'Transparent Match Scores & Readiness Tracking',
    description:
      'Discover roles with exact skill-by-skill overlap percentages calculated from your verified and extracted skills—and track every application in one place.',
    highlights: [
      'Job match % rises transparently as you verify resume skills',
      'Direct ATS resume optimizer tailored per job opening',
      'Complete academic profile details in Profile Settings anytime',
    ],
    icon: <Briefcase className="w-7 h-7 text-[#FF7A59]" />,
    accentLabel: 'Step 5 of 5 • Ready for Placement',
  },
];

export const FirstTimeTourModal: React.FC = () => {
  const { isTourOpen, completeTour, user } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);

  if (!isTourOpen) return null;

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const handleClose = async () => {
    setStepIndex(0);
    await completeTour();
  };

  const handleGoToResume = async () => {
    setStepIndex(0);
    await completeTour();
    navigate('/student/resume');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-time-tour-title"
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-white border border-orange-100 shadow-[0_24px_60px_rgba(255,122,89,0.20)] overflow-hidden">
        {/* Top Peach Clay Ribbon */}
        <div className="bg-gradient-to-r from-[#FFF3ED] via-white to-[#FFF8F5] px-7 pt-6 pb-5 border-b border-orange-100/80 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-[6px_6px_16px_rgba(255,122,89,0.16),-4px_-4px_12px_rgba(255,255,255,0.9)] border border-orange-100 flex items-center justify-center shrink-0">
              {step.icon}
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#E86144] bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                {step.accentLabel}
              </span>
              <h2 id="first-time-tour-title" className="text-xl font-bold text-slate-900 mt-1.5">
                {stepIndex === 0 && user?.name ? `Welcome, ${user.name}!` : step.title}
              </h2>
              <p className="text-xs font-medium text-slate-500">{step.subtitle}</p>
            </div>
          </div>

          <button
            onClick={() => void handleClose()}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors"
            aria-label="Skip guided tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">
          <p className="text-slate-600 text-sm leading-relaxed">{step.description}</p>

          <div className="grid gap-2.5">
            {step.highlights.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#FFFDFB] border border-orange-100/80 shadow-[4px_4px_12px_rgba(15,23,42,0.03)]"
              >
                <CheckCircle2 className="w-4 h-4 text-[#FF7A59] shrink-0 mt-0.5" />
                <span className="text-sm text-slate-700 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Step Dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.accentLabel}
                onClick={() => setStepIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === stepIndex ? 'w-8 bg-[#FF7A59]' : 'w-2 bg-orange-200 hover:bg-orange-300'
                }`}
                aria-label={`Go to tour step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => void handleClose()}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2.5">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStepIndex((prev) => prev - 1)}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}

            {!isLast ? (
              <Button
                size="sm"
                onClick={() => setStepIndex((prev) => prev + 1)}
              >
                Next Step
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => void handleClose()}>
                  Explore Dashboard
                </Button>
                <Button size="sm" onClick={() => void handleGoToResume()}>
                  <FileUp className="w-4 h-4 mr-1.5" />
                  Upload Resume Now
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

