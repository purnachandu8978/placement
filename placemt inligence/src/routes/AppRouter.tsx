import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { StudentLayout } from '../components/layout/StudentLayout';
import { AdminLayout } from '../components/layout/AdminLayout';
import { ClayLoader } from '../components/common/ClayLoader';
import { useAuth } from '../context/AuthContext';

const LandingPage = lazy(() =>
  import('../features/landing/pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const AdminLoginPage = lazy(() =>
  import('../features/auth/pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage }))
);
const StudentAuthPage = lazy(() =>
  import('../features/auth/pages/StudentAuthPage').then((m) => ({ default: m.StudentAuthPage }))
);

// Legal & Compliance Pages
const PrivacyPolicyPage = lazy(() =>
  import('../features/legal/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsOfServicePage = lazy(() =>
  import('../features/legal/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage }))
);
const CookiePolicyPage = lazy(() =>
  import('../features/legal/CookiePolicyPage').then((m) => ({ default: m.CookiePolicyPage }))
);

// Student Pages
const StudentDashboardPage = lazy(() =>
  import('../features/student/pages/StudentDashboardPage').then((m) => ({ default: m.StudentDashboardPage }))
);
const ResumeIntelligencePage = lazy(() =>
  import('../features/resume/pages/ResumeIntelligencePage').then((m) => ({ default: m.ResumeIntelligencePage }))
);
const AssessmentCenterPage = lazy(() =>
  import('../features/assessment/pages/AssessmentCenterPage').then((m) => ({ default: m.AssessmentCenterPage }))
);
const AssessmentTakePage = lazy(() =>
  import('../features/assessment/pages/AssessmentTakePage').then((m) => ({ default: m.AssessmentTakePage }))
);
const SkillIntelligencePage = lazy(() =>
  import('../features/skills/pages/SkillIntelligencePage').then((m) => ({ default: m.SkillIntelligencePage }))
);
const PersonalizedRoadmapPage = lazy(() =>
  import('../features/roadmap/pages/PersonalizedRoadmapPage').then((m) => ({ default: m.PersonalizedRoadmapPage }))
);
const AssignmentCenterPage = lazy(() =>
  import('../features/assignment/pages/AssignmentCenterPage').then((m) => ({ default: m.AssignmentCenterPage }))
);
const VerifiedPortfolioPage = lazy(() =>
  import('../features/skills/pages/VerifiedPortfolioPage').then((m) => ({ default: m.VerifiedPortfolioPage }))
);
const JobIntelligencePage = lazy(() =>
  import('../features/jobs/pages/JobIntelligencePage').then((m) => ({ default: m.JobIntelligencePage }))
);
const PlacementReadinessPage = lazy(() =>
  import('../features/readiness/pages/PlacementReadinessPage').then((m) => ({ default: m.PlacementReadinessPage }))
);
const ProfileSettingsPage = lazy(() =>
  import('../features/profile/pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage }))
);
const NotificationCenterPage = lazy(() =>
  import('../features/notifications/pages/NotificationCenterPage').then((m) => ({ default: m.NotificationCenterPage }))
);
const CollegeVerificationPage = lazy(() =>
  import('../features/verification/pages/CollegeVerificationPage').then((m) => ({ default: m.CollegeVerificationPage }))
);
const StartupMapPage = lazy(() =>
  import('../features/startups/pages/StartupMapPage').then((m) => ({ default: m.StartupMapPage }))
);
const PublicSkillVerificationPage = lazy(() =>
  import('../features/verification/pages/PublicSkillVerificationPage').then((m) => ({ default: m.PublicSkillVerificationPage }))
);
const CareerPassportPage = lazy(() =>
  import('../features/student/pages/CareerPassportPage').then((m) => ({ default: m.CareerPassportPage }))
);

// Unified Secure Examination System Pages
const UnifiedExaminationPage = lazy(() =>
  import('../features/examination/pages/UnifiedExaminationPage').then((m) => ({ default: m.UnifiedExaminationPage }))
);
const DeviceReadinessCheckPage = lazy(() =>
  import('../features/examination/pages/DeviceReadinessCheckPage').then((m) => ({ default: m.DeviceReadinessCheckPage }))
);
const ExaminationControlRoomPage = lazy(() =>
  import('../features/admin/pages/ExaminationControlRoomPage').then((m) => ({ default: m.ExaminationControlRoomPage }))
);

// Admin Pages
const AdminDashboardPage = lazy(() =>
  import('../features/admin/pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);
const StudentManagementPage = lazy(() =>
  import('../features/admin/pages/StudentManagementPage').then((m) => ({ default: m.StudentManagementPage }))
);
const LoginAuditPage = lazy(() =>
  import('../features/admin/pages/LoginAuditPage').then((m) => ({ default: m.LoginAuditPage }))
);
const ResumeManagementPage = lazy(() =>
  import('../features/admin/pages/ResumeManagementPage').then((m) => ({ default: m.ResumeManagementPage }))
);
const SkillManagementPage = lazy(() =>
  import('../features/admin/pages/SkillManagementPage').then((m) => ({ default: m.SkillManagementPage }))
);
const AssessmentManagementPage = lazy(() =>
  import('../features/admin/pages/AssessmentManagementPage').then((m) => ({ default: m.AssessmentManagementPage }))
);
const QuestionBankPage = lazy(() =>
  import('../features/admin/pages/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage }))
);
const AssignmentManagementPage = lazy(() =>
  import('../features/admin/pages/AssignmentManagementPage').then((m) => ({ default: m.AssignmentManagementPage }))
);
const RoadmapManagementPage = lazy(() =>
  import('../features/admin/pages/RoadmapManagementPage').then((m) => ({ default: m.RoadmapManagementPage }))
);
const SkillVerificationPage = lazy(() =>
  import('../features/admin/pages/SkillVerificationPage').then((m) => ({ default: m.SkillVerificationPage }))
);
const JobManagementPage = lazy(() =>
  import('../features/admin/pages/JobManagementPage').then((m) => ({ default: m.JobManagementPage }))
);
const StartupConsolePage = lazy(() =>
  import('../features/admin/pages/StartupConsolePage').then((m) => ({ default: m.StartupConsolePage }))
);
const CertificateTemplateManagementPage = lazy(() =>
  import('../features/admin/pages/CertificateTemplateManagementPage').then((m) => ({ default: m.CertificateTemplateManagementPage }))
);
const PlacementAnalyticsPage = lazy(() =>
  import('../features/admin/pages/PlacementAnalyticsPage').then((m) => ({ default: m.PlacementAnalyticsPage }))
);
const GroupManagementPage = lazy(() =>
  import('../features/admin/pages/GroupManagementPage').then((m) => ({ default: m.GroupManagementPage }))
);
const CommunicationCenterPage = lazy(() =>
  import('../features/admin/pages/CommunicationCenterPage').then((m) => ({ default: m.CommunicationCenterPage }))
);
const AdminSettingsPage = lazy(() =>
  import('../features/admin/pages/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage }))
);

const PageLoaderFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-8 bg-white">
    <ClayLoader
      label="Loading Workspace..."
      subtext="Synchronizing real telemetry from MongoDB Atlas"
    />
  </div>
);

const RequireStudent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <PageLoaderFallback />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (role !== 'student') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
};

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <PageLoaderFallback />;
  if (!isAuthenticated || role !== 'admin') return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const location = useLocation();
  const isExam = location.pathname.startsWith('/exam');

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {!isExam && <Navbar />}
      <main className="flex-1">
        <Suspense fallback={<PageLoaderFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<StudentAuthPage />} />
            <Route path="/register" element={<StudentAuthPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/verify/:hash" element={<PublicSkillVerificationPage />} />
            <Route path="/passport/:registrationId" element={<CareerPassportPage />} />

            {/* Public Legal & Compliance Routes */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/terms-of-service" element={<TermsOfServicePage />} />
            <Route path="/cookies" element={<CookiePolicyPage />} />
            <Route path="/cookie-policy" element={<CookiePolicyPage />} />

            {/* Unified Secure Examination System Routes (Full-screen, minimal proctored layout) */}
            <Route
              path="/exam/:examType/:id"
              element={
                <RequireStudent>
                  <UnifiedExaminationPage />
                </RequireStudent>
              }
            />
            <Route
              path="/exam/:examType/:id/readiness"
              element={
                <RequireStudent>
                  <DeviceReadinessCheckPage />
                </RequireStudent>
              }
            />

            {/* Protected Student Portal */}
            <Route
              path="/student"
              element={
                <RequireStudent>
                  <StudentLayout />
                </RequireStudent>
              }
            >
              <Route index element={<Navigate to="/student/dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboardPage />} />
              <Route path="resume" element={<ResumeIntelligencePage />} />
              <Route path="assessments" element={<AssessmentCenterPage />} />
              <Route path="assessments/:testId" element={<AssessmentTakePage />} />
              <Route path="skills" element={<SkillIntelligencePage />} />
              <Route path="roadmap" element={<PersonalizedRoadmapPage />} />
              <Route path="assignments" element={<AssignmentCenterPage />} />
              <Route path="verified-portfolio" element={<VerifiedPortfolioPage />} />
              <Route path="verification" element={<CollegeVerificationPage />} />
              <Route path="passport" element={<CareerPassportPage />} />
              <Route path="jobs" element={<JobIntelligencePage />} />
              <Route path="startups" element={<StartupMapPage />} />
              <Route path="readiness" element={<PlacementReadinessPage />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="notifications" element={<NotificationCenterPage />} />
            </Route>

            <Route path="/notifications" element={<Navigate to="/student/notifications" replace />} />

            {/* Strictly Protected Admin Console */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="students" element={<StudentManagementPage />} />
              <Route path="groups" element={<GroupManagementPage />} />
              <Route path="logins" element={<LoginAuditPage />} />
              <Route path="resumes" element={<ResumeManagementPage />} />
              <Route path="skills" element={<SkillManagementPage />} />
              <Route path="examination-control" element={<ExaminationControlRoomPage />} />
              <Route path="assessments" element={<AssessmentManagementPage />} />
              <Route path="question-bank" element={<QuestionBankPage />} />
              <Route path="assignments" element={<AssignmentManagementPage />} />
              <Route path="roadmaps" element={<RoadmapManagementPage />} />
              <Route path="verifications" element={<SkillVerificationPage />} />
              <Route path="jobs" element={<JobManagementPage />} />
              <Route path="startups" element={<StartupConsolePage />} />
              <Route path="templates" element={<CertificateTemplateManagementPage />} />
              <Route path="communication" element={<CommunicationCenterPage />} />
              <Route path="analytics" element={<PlacementAnalyticsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!isExam && <Footer />}
    </div>
  );
};
