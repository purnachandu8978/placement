import React from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Shield, ArrowLeft } from 'lucide-react';

export const CookiePolicyPage: React.FC = () => {
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
              <Cookie className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Cookie Policy
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Information on how Placement Intelligence uses cookies and browser storage
              </p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. What Are Cookies?</h2>
              <p>
                Cookies are small text fragments stored on your device when you load our web application. We use cookies
                strictly to manage authenticated user sessions and protect against cross-site request forgery (CSRF).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. Cookies We Use</h2>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3">Cookie Name</th>
                      <th className="p-3">Purpose</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    <tr>
                      <td className="p-3 font-mono font-bold text-slate-800">access_token</td>
                      <td className="p-3">Secure HttpOnly session credential for API communication.</td>
                      <td className="p-3">Session / 24 Hours</td>
                      <td className="p-3">Strictly Necessary</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-slate-800">pi_theme</td>
                      <td className="p-3">Stores user interface theme and layout preferences.</td>
                      <td className="p-3">1 Year</td>
                      <td className="p-3">Functional</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. Third-Party Tracking & Advertising</h2>
              <p>
                Placement Intelligence does <strong>NOT</strong> deploy third-party advertising cookies or sell student telemetry to external data brokers.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
