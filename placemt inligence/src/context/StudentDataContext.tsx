import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { resumeService } from '../services/resumeService';
import { skillService } from '../services/skillService';
import { readinessService, type BackendReadinessResponse } from '../services/readinessService';
import { roadmapService } from '../services/roadmapService';
import { jobService } from '../services/jobService';
import { assessmentService, type SkillAssessmentMeta } from '../services/assessmentService';
import { assignmentService } from '../services/assignmentService';
import type { ExtractedResume, PersonalizedRoadmap, Assignment } from '../types';

interface StudentDataContextValue {
  isLoading: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  resume: ExtractedResume | null;
  readiness: BackendReadinessResponse | null;
  roadmap: (PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] }) | null;
  assessments: SkillAssessmentMeta[];
  jobs: Awaited<ReturnType<typeof jobService.getJobs>>;
  assignments: Assignment[];
  refreshAll: () => Promise<void>;
  uploadResumeAndSync: (file: File) => Promise<ExtractedResume>;
}

const StudentDataContext = createContext<StudentDataContextValue | undefined>(undefined);

export const StudentDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, role, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [resume, setResume] = useState<ExtractedResume | null>(null);
  const [readiness, setReadiness] = useState<BackendReadinessResponse | null>(null);
  const [roadmap, setRoadmap] = useState<(PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] }) | null>(null);
  const [assessments, setAssessments] = useState<SkillAssessmentMeta[]>([]);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof jobService.getJobs>>>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated || role !== 'student') return;
    setIsSyncing(true);
    try {
      const [resResume, resReadiness, resRoadmap, resAssessments, resJobs, resAssignments] =
        await Promise.all([
          resumeService.getExtractedResume().catch(() => null),
          readinessService.getRawReadiness().catch(() => null),
          roadmapService.getRoadmap().catch(() => null),
          assessmentService.getSkillAssessmentsList().catch(() => []),
          jobService.getJobs().catch(() => []),
          assignmentService.getAssignments().catch(() => []),
        ]);

      setResume(resResume);
      setReadiness(resReadiness);
      setRoadmap(resRoadmap);
      setAssessments(resAssessments);
      setJobs(resJobs);
      setAssignments(resAssignments);
      setLastSynced(new Date());

      // Also ensure student profile and skills are refreshed in memory
      await Promise.all([
        refreshUser().catch(() => null),
        skillService.getStudentSkills().catch(() => []),
      ]);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [isAuthenticated, role, refreshUser]);

  useEffect(() => {
    if (isAuthenticated && role === 'student') {
      setIsLoading(true);
      void refreshAll();
    } else {
      setResume(null);
      setReadiness(null);
      setRoadmap(null);
      setAssessments([]);
      setJobs([]);
      setAssignments([]);
      setLastSynced(null);
    }
  }, [isAuthenticated, role, refreshAll]);

  // Real-time synchronization: automatically re-sync when window receives focus, tab becomes visible, or on a 20s interval
  useEffect(() => {
    if (!isAuthenticated || role !== 'student') return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshAll();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshAll();
      }
    }, 20000);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(interval);
    };
  }, [isAuthenticated, role, refreshAll]);

  const uploadResumeAndSync = useCallback(
    async (file: File): Promise<ExtractedResume> => {
      const parsed = await resumeService.parseResumeFile(file);
      await refreshUser();
      await refreshAll();
      return parsed;
    },
    [refreshAll, refreshUser]
  );

  return (
    <StudentDataContext.Provider
      value={{
        isLoading,
        isSyncing,
        lastSynced,
        resume,
        readiness,
        roadmap,
        assessments,
        jobs,
        assignments,
        refreshAll,
        uploadResumeAndSync,
      }}
    >
      {children}
    </StudentDataContext.Provider>
  );
};

export const useStudentData = (): StudentDataContextValue => {
  const ctx = useContext(StudentDataContext);
  if (!ctx) {
    throw new Error('useStudentData must be used within StudentDataProvider');
  }
  return ctx;
};

