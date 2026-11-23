import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileText,
  Map,
  ClipboardList,
  Trophy,
  ChevronRight,
  Upload,
  CheckCircle2,
  Compass,
  Award,
  MapPin,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge, SkillStatusBadge } from '../../../components/common/Badge';
import { ScoreRing } from '../../../components/common/ScoreRing';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { StatCard } from '../../../components/common/StatCard';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useAuth } from '../../../context/AuthContext';
import { useStudentData } from '../../../context/StudentDataContext';

function slugifySkill(skillName: string): string {
  return skillName
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, 'pp')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const StudentDashboardPage: React.FC = () => {
  const { user, openTour } = useAuth();
  const { isLoading, isSyncing, refreshAll, resume, readiness, roadmap, assessments, jobs, assignments } = useStudentData();
  const navigate = useNavigate();

  if (isLoading) {
    return <ClayLoader label="Loading Your Placement Intelligence Workspace..." fullScreen={false} />;
  }

  const hasResume = Boolean(resume && resume.detectedSkills && resume.detectedSkills.length > 0) || Boolean(readiness?.metrics?.has_resume);
  const overallScore = Math.round(readiness?.overall_score ?? 0);
  const extractedSkills = resume?.detectedSkills || [];
  const totalExtractedCount = readiness?.metrics?.extracted_skills_count ?? extractedSkills.length;
  const verifiedSkillsCount = readiness?.metrics?.verified_skills_count ?? extractedSkills.filter((s) => s.isVerified).length;
  const assessedSkillsCount = assessments.filter((a) => a.hasAttempted).length;
  const atsScore = Math.round(readiness?.breakdown?.resume_ats_score ?? (resume as any)?.atsScore ?? 0);
  const roadmapPct = Math.round(roadmap?.progressPercentage ?? readiness?.metrics?.roadmap_progress ?? 0);
  const evaluatedAssignments = assignments.filter((a) => a.status === 'Graded');
  const pendingAssignments = assignments.filter((a) => a.status === 'Pending');

  const topJobs = [...jobs].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 1. Welcome Banner */}
      <div className="clay-card-peach p-6 sm:p-7 border border-orange-200/90 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-orange-200 text-xs font-bold text-orange-700 mb-2.5 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>
                {hasResume
                  ? `${readiness?.readiness_band || 'Profile Active'} • Synced with MongoDB Atlas`
                  : 'New Student Account — Ready for First Resume Upload'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Welcome{user?.name ? `, ${user.name}` : ''}
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-xl font-medium leading-relaxed">
              {hasResume
                ? `You have ${totalExtractedCount} extracted skills (${verifiedSkillsCount} verified) and ${topJobs.length} ranked employer matches based on your uploaded resume.`
                : 'Your workspace starts cleanly at 0%. Upload your PDF, DOCX, or TXT resume to extract skills, unlock tailored assessments, generate your 4-week study roadmap, and rank live job matches.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="white"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 text-orange-600 ${isSyncing ? 'animate-spin' : ''}`} />}
              onClick={() => void refreshAll()}
              isLoading={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Live Data'}
            </Button>
            <Button
              variant="white"
              size="sm"
              leftIcon={<Compass className="w-4 h-4 text-orange-500" />}
              onClick={openTour}
            >
              Guide Tour
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={hasResume ? <ArrowRight className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              onClick={() => navigate(hasResume ? '/student/assessments' : '/student/resume')}
            >
              {hasResume ? 'Verify Next Skill' : 'Upload Resume to Begin'}
            </Button>
          </div>
        </div>
      </div>

      {/* Zero-State First-Time Activation Banner */}
      {!hasResume && (
        <Card variant="default" className="border-2 border-dashed border-orange-300 bg-white">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <Badge variant="brand" size="sm">Step 1 of Your Placement Journey</Badge>
              <h2 className="text-lg font-black text-slate-900">
                Upload Your Resume to Adapt the Entire Platform
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Once you upload your resume, our engine stores it in MongoDB Atlas and automatically populates your{' '}
                <strong>Extracted Profile & Skills</strong>, <strong>5-Q / 10-Q Coding Assessments</strong>,{' '}
                <strong>4-Week Personalized Roadmap</strong>, and <strong>Live Job Match Percentages</strong>.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => navigate('/student/resume')}
              className="shrink-0"
            >
              Go to Resume Intelligence
            </Button>
          </div>
        </Card>
      )}

      {/* 2. KPI Stats Row (Strictly Real Values — 0 for New User) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Placement Readiness"
          value={`${overallScore}%`}
          change={readiness?.readiness_band || 'Getting Started'}
          trend={overallScore >= 50 ? 'up' : 'neutral'}
          icon={<Trophy className="w-4 h-4 text-orange-500" />}
          subtitle={`Profile ${readiness?.profile_completion ?? 0}% complete`}
          onClick={() => navigate('/student/readiness')}
        />
        <StatCard
          title="Verified Skills"
          value={`${verifiedSkillsCount} / ${totalExtractedCount}`}
          change={`${assessedSkillsCount} tested`}
          trend={verifiedSkillsCount > 0 ? 'up' : 'neutral'}
          icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
          subtitle={totalExtractedCount === 0 ? 'Upload resume first' : 'Pass 75%+ to verify'}
          onClick={() => navigate('/student/verified-portfolio')}
        />
        <StatCard
          title="Roadmap Progress"
          value={`${roadmapPct}%`}
          change={roadmap?.hasRoadmap ? `${roadmap.completedTasks}/${roadmap.totalTasks} tasks` : 'Not generated'}
          trend={roadmapPct > 0 ? 'up' : 'neutral'}
          icon={<Map className="w-4 h-4 text-amber-500" />}
          subtitle={roadmap?.hasRoadmap ? roadmap.targetRole : 'Generated on upload'}
          onClick={() => navigate('/student/roadmap')}
        />
        <StatCard
          title="Practical Assignments"
          value={`${readiness?.metrics?.assignments_submitted ?? assignments.filter((a) => a.status !== 'Pending').length} / ${assignments.length}`}
          change={`${evaluatedAssignments.length} graded`}
          trend={evaluatedAssignments.length > 0 ? 'up' : 'neutral'}
          icon={<ClipboardList className="w-4 h-4 text-[#E86144]" />}
          subtitle={`${pendingAssignments.length} pending`}
          onClick={() => navigate('/student/assignments')}
        />
      </div>

      {/* Flagship Feature Highlights: College Verification & Startup Discovery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: College Verification */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-white via-blue-50/30 to-blue-50/60 border border-blue-200/90 shadow-[0_10px_25px_rgba(37,99,235,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider border border-blue-200">
                <Award className="w-3 h-3 text-blue-700" /> Official Credential Authority
              </span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Level 1 & 2 Active
              </span>
            </div>
            <h3 className="text-base font-black text-slate-900">
              College-Verified Identity & Digital Badges
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Earn tamper-proof <strong>Blue Verified ✓</strong> (5-min assessment) or <strong>Green Fully Verified ✓</strong> (10-min comprehensive) credentials, stream high-res PDF certificates with QR codes, and share public verification links with recruiters.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-blue-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Tamper-proof SHA-256 Digest
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/student/verification')}
              className="bg-blue-600 hover:bg-blue-700 border-blue-700 shadow-sm text-xs font-bold"
            >
              Open Verification Center →
            </Button>
          </div>
        </div>

        {/* Card 2: India Startup & Tech Opportunity Atlas */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-white via-[#FFF7F3] to-[#FFF1EA] border border-orange-200/90 shadow-[0_10px_25px_rgba(255,122,89,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#E86144] text-[10px] font-black uppercase tracking-wider border border-orange-200">
                <Compass className="w-3 h-3 text-[#E86144]" /> Survey of India Vectors
              </span>
              <span className="text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-full border border-orange-200">
                36 States &amp; UTs
              </span>
            </div>
            <h3 className="text-base font-black text-slate-900">
              India Startup &amp; Tech Opportunity Atlas
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Explore multi-source Indian tech companies: bootstrapped titans, funded unicorns, and deep-tech pioneers across Bengaluru, Hyderabad, Pune, Mumbai, Chennai, and Delhi NCR. Save targets to your career watchlist and track direct openings.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-orange-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Multi-Source Tech Directory
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/student/startups')}
              className="bg-gradient-to-r from-[#FF7A59] to-[#E86144] hover:opacity-95 text-xs font-bold shadow-sm"
            >
              Open Startup Atlas →
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Skill Breakdown */}
          <Card variant="default">
            <CardHeader
              title="Detected & Verified Skill Matrix"
              subtitle="Extracted from your uploaded resume and updated as you pass assessments"
              action={
                <Link
                  to="/student/skills"
                  className="text-xs text-orange-600 hover:text-orange-700 font-bold inline-flex items-center gap-1"
                >
                  Skill Intelligence <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              }
            />

            {extractedSkills.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-xs text-slate-500 font-medium">
                  0 skills extracted yet. Upload a resume to detect your technical stack.
                </p>
                <Button variant="white" size="sm" onClick={() => navigate('/student/resume')}>
                  Upload Resume Now
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-orange-100 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                    Total: {totalExtractedCount}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-mono text-[11px] font-bold">
                    Assessed: {assessedSkillsCount}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] font-bold">
                    Verified: {verifiedSkillsCount}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {extractedSkills.slice(0, 6).map((skill) => (
                    <div
                      key={skill.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200/90 hover:border-orange-300 shadow-xs flex items-center justify-between transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{skill.name}</span>
                          <SkillStatusBadge
                            status={skill.isVerified ? 'verified' : skill.confidenceScore > 75 ? 'assessed' : 'extracted'}
                            score={skill.confidenceScore}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{skill.category}</p>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] text-orange-600 hover:text-orange-700 font-bold"
                        onClick={() => navigate(`/exam/assessment/test-${slugifySkill(skill.name)}-5/readiness`)}
                      >
                        Test
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* 4-Week Roadmap Preview */}
          <Card variant="default">
            <CardHeader
              title="Personalized 4-Week Roadmap"
              subtitle="Tailored daily tasks generated directly from your resume gaps"
              action={
                <Link
                  to="/student/roadmap"
                  className="text-xs text-orange-600 hover:text-orange-700 font-bold inline-flex items-center gap-1"
                >
                  Open Roadmap <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              }
            />

            {!roadmap?.hasRoadmap || roadmap.weeks.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Your 4-week study roadmap is empty (0%) until you upload a resume.
              </div>
            ) : (
              <>
                <ProgressBar
                  value={roadmapPct}
                  label="Overall Completion Progress"
                  variant="brand"
                  className="mb-4"
                />

                <div className="space-y-2.5">
                  {roadmap.weeks[0]?.tasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-orange-50/40 border border-orange-100/90 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-5 h-5 rounded-full mt-0.5 flex items-center justify-center shrink-0 text-[10px] font-bold ${
                            task.isCompleted
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                              : 'bg-white text-slate-400 border border-slate-300'
                          }`}
                        >
                          {task.isCompleted ? <CheckCircle2 className="w-3 h-3" /> : ''}
                        </span>
                        <div>
                          <p className={`text-xs font-semibold ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {task.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{task.description}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
                        {task.estimatedMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Job Matches */}
          <Card variant="default">
            <CardHeader
              title="Live Job Compatibility Rankings"
              subtitle="Scored against your verified & extracted skill stack"
              action={
                <Link
                  to="/student/jobs"
                  className="text-xs text-orange-600 hover:text-orange-700 font-bold inline-flex items-center gap-1"
                >
                  All {jobs.length} Opportunities <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              }
            />

            {topJobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active hiring requisitions found right now.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {topJobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => navigate('/student/jobs')}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 truncate">{job.company}</span>
                      <span className="text-[11px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                        {job.matchScore ?? 0}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium mt-1.5 line-clamp-1">{job.role}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-100 font-medium">
                      <span className="font-mono text-slate-800 font-bold">₹{job.ctcMin}-{job.ctcMax} LPA</span>
                      <span>{job.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card variant="default" className="text-center">
            <CardHeader title="Readiness Status" subtitle="5-Pillar MongoDB composite" />
            <ScoreRing score={overallScore} size="lg" showTier className="my-3" />
            <p className="text-xs text-slate-600 font-medium leading-relaxed px-2">
              {readiness?.next_actions?.[0] || 'Upload your resume to begin calculating your live placement score.'}
            </p>
            <div className="mt-4 pt-4 border-t border-orange-100">
              <Button variant="white" size="sm" className="w-full text-xs font-bold" onClick={() => navigate('/student/readiness')}>
                Inspect 5-Pillar Breakdown
              </Button>
            </div>
          </Card>

          <Card variant="default">
            <CardHeader title="Next Practical Assignment" subtitle="Project deliverables" />
            {pendingAssignments.length === 0 ? (
              <div className="py-4 text-xs text-slate-500 text-center">
                All seeded practical assignments completed ({assignments.length}).
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-900">{pendingAssignments[0].title}</span>
                  <span className="font-mono text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                    {pendingAssignments[0].category}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 font-medium line-clamp-2">
                  {pendingAssignments[0].description}
                </p>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="text-[11px] text-amber-800 font-bold" onClick={() => navigate('/student/assignments')}>
                    Open Assignment Center →
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card variant="default">
            <CardHeader title="Active Resume Snapshot" subtitle="Stored in MongoDB resumes" />
            <div className="p-3.5 rounded-2xl bg-orange-50/40 border border-orange-100 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Document:</span>
                <span className="font-bold text-slate-800 truncate max-w-[140px]">
                  {resume?.fileName || 'None uploaded'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">ATS Signal Score:</span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {atsScore} / 100
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Projects Parsed:</span>
                <span className="text-orange-700 font-bold">{resume?.detectedProjects.length ?? 0}</span>
              </div>
            </div>
            <div className="mt-3.5">
              <Button variant="white" size="sm" className="w-full text-xs font-bold" onClick={() => navigate('/student/resume')}>
                <FileText className="w-3.5 h-3.5 mr-1.5 inline" />
                {hasResume ? 'Manage / Update Resume' : 'Upload Resume Now'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
