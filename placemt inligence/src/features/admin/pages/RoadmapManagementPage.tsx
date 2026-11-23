import React, { useEffect, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useToast } from '../../../context/ToastContext';
import { adminService } from '../../../services/adminService';

export const RoadmapManagementPage: React.FC = () => {
  const { success } = useToast();
  const [studentsCount, setStudentsCount] = useState(0);
  const [resumesCount, setResumesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService
      .getDashboardMetrics()
      .then((m) => {
        setStudentsCount(m.total_students ?? 0);
        setResumesCount(m.students_with_resumes ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const tracks = [
    {
      id: 'trk-1',
      name: 'Backend & Distributed Systems',
      duration: '4 Weeks',
      description: 'Auto-assigned when student resumes target backend APIs, Python, Java, Go, or databases.',
    },
    {
      id: 'trk-2',
      name: 'Frontend & Full-Stack Architecture',
      duration: '4 Weeks',
      description: 'Auto-assigned when student resumes prioritize React, TypeScript, Next.js, or UI performance.',
    },
    {
      id: 'trk-3',
      name: 'Cloud Infrastructure & DevOps SRE',
      duration: '4 Weeks',
      description: 'Auto-assigned when student resumes include Docker, Kubernetes, AWS, or CI/CD pipelines.',
    },
  ];

  if (loading) {
    return <ClayLoader label="Loading Roadmap Engine Overview..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Adaptive Curriculum & Roadmap Engine
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Personalized 4-week study plans are dynamically generated in MongoDB whenever a student uploads a resume.
          </p>
        </div>

        <Badge variant="brand" size="md">
          {resumesCount} / {studentsCount} Students With Active Roadmaps
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tracks.map((trk) => (
          <div key={trk.id} className="clay-card p-5 bg-white border border-orange-100 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <Badge variant="brand" size="sm">{trk.duration}</Badge>
                <span className="text-[11px] font-mono font-bold text-[#E86144]">Resume-Adaptive</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-3">{trk.name}</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{trk.description}</p>

              <div className="mt-4 p-3.5 rounded-xl bg-orange-50/40 border border-orange-100 text-xs space-y-1.5 font-medium">
                <div className="flex justify-between text-slate-500">
                  <span>Structured Weekly Cadence:</span>
                  <span className="text-slate-900 font-bold font-mono">4 Weeks</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Initial Student Progress:</span>
                  <span className="text-slate-900 font-bold font-mono">0% (Verified on Completion)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <Button
                variant="white"
                size="sm"
                className="w-full text-xs font-bold"
                onClick={() => success(`${trk.name} engine rule is active.`)}
              >
                <Layers className="w-3.5 h-3.5 mr-1.5 inline" /> Rule Status: Active
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
