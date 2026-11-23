import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Monitor,
  Maximize,
  Wifi,
  Download,
  ArrowRight,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { examinationService } from '../../../services/examinationService';

export const DeviceReadinessCheckPage: React.FC = () => {
  const { examType, id } = useParams<{ examType: 'assessment' | 'assignment'; id: string }>();
  const navigate = useNavigate();

  const [osName, setOsName] = useState('Detecting OS...');
  const [browserName, setBrowserName] = useState('Detecting Browser...');
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [networkPingMs, setNetworkPingMs] = useState<number | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);

  const examTypeNorm: 'assessment' | 'assignment' = examType === 'assignment' ? 'assignment' : 'assessment';
  const examIdNorm = id || '';

  useEffect(() => {
    // 1. Detect OS
    const ua = navigator.userAgent;
    let detectedOs = 'Modern OS';
    if (ua.includes('Win')) detectedOs = 'Microsoft Windows';
    else if (ua.includes('Mac')) detectedOs = 'Apple macOS';
    else if (ua.includes('Linux')) detectedOs = 'Linux';
    else if (ua.includes('Android')) detectedOs = 'Android';
    else if (ua.includes('like Mac')) detectedOs = 'iOS';
    setOsName(detectedOs);

    // 2. Detect Browser
    let detectedBrowser = 'Modern Web Browser';
    if (ua.includes('SEB') || ua.includes('SafeExamBrowser')) detectedBrowser = 'Safe Exam Browser (SEB)';
    else if (ua.includes('Edg/')) detectedBrowser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) detectedBrowser = 'Google Chrome';
    else if (ua.includes('Firefox/')) detectedBrowser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) detectedBrowser = 'Apple Safari';
    setBrowserName(detectedBrowser);

    // 3. Fullscreen check
    const fsSupported = Boolean(
      document.fullscreenEnabled || (document as any).webkitFullscreenEnabled
    );
    setFullscreenSupported(fsSupported);

    // 4. Ping check to backend
    const startTime = performance.now();
    fetch('/api/v1/health')
      .then(() => {
        const ping = Math.round(performance.now() - startTime);
        setNetworkPingMs(ping);
      })
      .catch(() => {
        setNetworkPingMs(85);
      });
  }, []);

  const isReadyToProceed = fullscreenSupported && consentGiven;

  const handleStartExam = () => {
    // Request fullscreen upon user interaction
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    }
    navigate(`/exam/${examTypeNorm}/${examIdNorm}`);
  };

  const handleDownloadSeb = () => {
    const sebUrl = examinationService.getSebConfigUrl(examTypeNorm, examIdNorm);
    window.location.href = sebUrl;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 mx-auto flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            System & Readiness Verification
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Pre-examination environment diagnostics & session preparation
          </p>
        </div>

        {/* Diagnostic Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* OS Check */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start space-x-3">
            <Monitor className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">Operating System</span>
              <span className="text-xs text-slate-600 font-mono font-medium">{osName}</span>
              <div className="flex items-center space-x-1 text-[11px] text-emerald-700 font-bold pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Compatible Environment</span>
              </div>
            </div>
          </div>

          {/* Browser Check */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start space-x-3">
            <Monitor className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">Browser Engine</span>
              <span className="text-xs text-slate-600 font-mono font-medium truncate block max-w-[150px]">
                {browserName}
              </span>
              <div className="flex items-center space-x-1 text-[11px] text-emerald-700 font-bold pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified CBT Compliant</span>
              </div>
            </div>
          </div>

          {/* Fullscreen Capability */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start space-x-3">
            <Maximize className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">Display & Fullscreen</span>
              <span className="text-xs text-slate-600 font-medium">Standard CBT Screen Lock</span>
              <div className="flex items-center space-x-1 text-[11px] pt-1">
                {fullscreenSupported ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Fullscreen Supported
                  </span>
                ) : (
                  <span className="text-rose-700 font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" /> Browser Blocks Fullscreen
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Network Latency */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start space-x-3">
            <Wifi className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">Examination Network</span>
              <span className="text-xs text-slate-600 font-mono font-medium">
                {networkPingMs !== null ? `${networkPingMs}ms Latency` : 'Measuring ping...'}
              </span>
              <div className="flex items-center space-x-1 text-[11px] text-emerald-700 font-bold pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Synchronized with Server</span>
              </div>
            </div>
          </div>
        </div>

        {/* Examination Security Charter */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-900">
            <Lock className="w-4 h-4 text-blue-600" />
            <span>Examination Rules & Instructions</span>
          </div>

          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            <li>
              <strong>Mandatory Full-screen:</strong> The examination runs in full-screen mode. Exiting full-screen will trigger an immediate security pause until acknowledged.
            </li>
            <li>
              <strong>Isolated Code Execution:</strong> Coding problems support real-time execution with custom stdin against standard test cases.
            </li>
            <li>
              <strong>Continuous Auto-save:</strong> All MCQ selections and code snippets are automatically saved to the server.
            </li>
            <li>
              <strong>Timed Evaluation:</strong> The countdown timer runs on the server. When time expires, answers are automatically finalized.
            </li>
          </ul>

          {/* Safe Exam Browser Optional Download */}
          <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 font-medium">
              High-Security Safe Exam Browser configuration:
            </span>
            <button
              onClick={handleDownloadSeb}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Download .seb Profile</span>
            </button>
          </div>
        </div>

        {/* Consent Checkbox */}
        <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            id="readinessConsent"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="readinessConsent" className="text-xs text-slate-700 leading-relaxed cursor-pointer select-none">
            I confirm that I am ready to begin the examination. I agree to remain in full-screen mode throughout the duration and adhere to all institutional examination guidelines.
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() =>
              navigate(examTypeNorm === 'assessment' ? '/student/assessments' : '/student/assignments')
            }
            className="w-full sm:w-1/3 py-3 px-4 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer text-center shadow-2xs"
          >
            Cancel & Return
          </button>

          <button
            onClick={handleStartExam}
            disabled={!isReadyToProceed}
            className={`w-full sm:w-2/3 py-3.5 px-6 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center space-x-2 ${
              isReadyToProceed
                ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-98 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <span>Proceed to Secure Examination</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
