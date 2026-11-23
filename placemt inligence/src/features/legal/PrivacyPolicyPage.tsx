import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, FileText, ArrowLeft, Mail } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
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
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Privacy Policy & Data Protection
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Compliant with India's Digital Personal Data Protection Act (DPDPA 2023) & FERPA Guidelines
              </p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. Overview & Data Fiduciary Details</h2>
              <p>
                Placement Intelligence operates as a verified Data Fiduciary under the provisions of the Digital Personal
                Data Protection Act, 2023 (DPDPA). We are committed to safeguarding the digital personal data of college
                students, academic faculty, and campus placement administrators with state-of-the-art security controls.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. Personal Data We Collect</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-slate-800">Identity Data:</strong> Full name, university email address, student registration ID, institutional enrollment details.</li>
                <li><strong className="text-slate-800">Resume & Academic Records:</strong> Uploaded resumes (PDF/DOCX), GPA/CGPA, academic branch, detected technical skills, GitHub and LinkedIn links.</li>
                <li><strong className="text-slate-800">Assessment Telemetry:</strong> Code execution submissions, MCQ attempt logs, timestamps, proctoring telemetry, and verified skill badges.</li>
                <li><strong className="text-slate-800">Security Audit Logs:</strong> Sign-in timestamps, IP addresses, and user-agent strings stored in MongoDB Atlas for fraud prevention.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. Purpose of Data Processing</h2>
              <p>
                We process personal data solely for educational and placement readiness purposes:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Extracting technical capabilities and generating customized ATS resume feedback.</li>
                <li>Administering proctored technical coding assessments and auto-grading submissions.</li>
                <li>Matching qualified candidates with campus hiring drives and job opportunities.</li>
                <li>Providing institutional placement cells with aggregated readiness analytics.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">4. Your Statutory Rights Under DPDPA 2023</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-100">
                  <h3 className="font-bold text-orange-950 text-xs mb-1">Right to Access & Data Portability</h3>
                  <p className="text-xs text-orange-900/80">
                    Students can download a complete cryptographic export of their personal data at any time via <code>/api/v1/students/me/data-export</code>.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-100">
                  <h3 className="font-bold text-orange-950 text-xs mb-1">Right to Correction & Erasure</h3>
                  <p className="text-xs text-orange-900/80">
                    Students may request immediate profile correction or account de-identification and permanent data erasure.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">5. Data Retention & Cryptographic Security</h2>
              <p>
                All personal data is encrypted in transit using TLS 1.3 and at rest using AES-256 in MongoDB Atlas. Administrator
                credentials are encrypted using Argon2id with 64MB memory cost. Passwords are never stored in plaintext.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">6. Grievance Officer & Contact Details</h2>
              <p>
                Pursuant to Section 13 of DPDPA 2023, for any privacy inquiries, grievance redressal, or data subject requests, please contact:
              </p>
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <Mail className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-bold text-xs text-slate-900">Data Protection Officer (DPO)</p>
                  <p className="text-xs text-slate-600">privacy@placementintelligence.edu • New Delhi, India</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
