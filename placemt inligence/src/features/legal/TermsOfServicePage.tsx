import React from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Shield, ArrowLeft } from 'lucide-react';

export const TermsOfServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FDFDFC] text-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-orange-600 hover:text-orange-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-200/80">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Terms of Service
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Academic Integrity, Code Evaluation Governance, and Platform Usage Terms
              </p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. Acceptance of Terms</h2>
              <p>
                By accessing or registering with Placement Intelligence, you agree to comply with and be bound by these
                Terms of Service. If you do not agree with these terms, you must discontinue use immediately.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. Code Integrity & Examination Standards</h2>
              <p>
                All candidates taking technical evaluations agree to abide by the highest standards of academic integrity:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>No automated plagiarism, unauthorized assistance, or external scripting tools during proctored tests.</li>
                <li>Code submissions are executed inside sandboxed containers with CPU, memory, and timeout constraints.</li>
                <li>Any attempt to break or probe the sandboxed environment results in immediate disqualification.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. Institutional Administration</h2>
              <p>
                Colleges and placement directorates are responsible for verifying student cohorts and configuring question
                banks. Administrative credentials must not be shared.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">4. Service Availability & Maintenance</h2>
              <p>
                We strive for 99.9% uptime. Periodic scheduled maintenance will be communicated with reasonable notice,
                during which candidate interfaces may temporarily return HTTP 503 maintenance status.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
