import { apiClient } from './apiClient';
import type { PersonalizedRoadmap } from '../types';

interface BackendRoadmapResponse {
  has_roadmap: boolean;
  user_id?: string;
  duration?: string;
  target_role?: string;
  skill_focus?: string[];
  progress: number;
  weeks: Array<{
    week_number: number;
    title: string;
    focus: string;
    is_completed: boolean;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      category?: string;
      estimated_hours?: number;
      resource_type?: string;
      is_completed: boolean;
    }>;
  }>;
  created_at?: string;
  updated_at?: string;
  message?: string;
}

function mapRoadmap(data: BackendRoadmapResponse): PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] } {
  const weeks = (data.weeks || []).map((w) => ({
    weekNumber: w.week_number,
    title: w.title,
    theme: w.focus,
    description: w.focus,
    learningObjectives: [w.focus],
    isLocked: false,
    tasks: (w.tasks || []).map((t, idx) => ({
      id: t.id,
      dayNumber: idx + 1,
      title: t.title,
      description: t.description,
      type: (t.category?.toLowerCase().includes('assessment') || t.category?.toLowerCase().includes('verif')
        ? 'assessment'
        : t.category?.toLowerCase().includes('assign')
        ? 'assignment'
        : t.category?.toLowerCase().includes('cod')
        ? 'coding'
        : 'concept') as 'concept' | 'coding' | 'assignment' | 'assessment',
      estimatedMinutes: Math.round((t.estimated_hours || 2) * 60),
      isCompleted: Boolean(t.is_completed),
      resourceLinks: [],
    })),
  }));

  const allTasks = weeks.flatMap((w) => w.tasks);
  const completedTasks = allTasks.filter((t) => t.isCompleted).length;

  return {
    id: `rm-${data.user_id || 'student'}`,
    hasRoadmap: Boolean(data.has_roadmap),
    skillFocus: data.skill_focus || [],
    studentId: data.user_id || '',
    targetRole: data.target_role || 'Software Engineer',
    weeks,
    totalTasks: allTasks.length,
    completedTasks,
    progressPercentage: Math.round(data.progress || 0),
    createdAt: data.created_at || new Date().toISOString(),
    lastUpdated: data.updated_at || new Date().toISOString(),
  };
}

export const roadmapService = {
  async getRoadmap(): Promise<PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] }> {
    const res = await apiClient.get<BackendRoadmapResponse>('/roadmaps');
    return mapRoadmap(res);
  },

  async generateRoadmap(targetRole?: string): Promise<PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] }> {
    const res = await apiClient.post<BackendRoadmapResponse>('/roadmaps/generate', {
      target_role: targetRole || undefined,
    });
    return mapRoadmap(res);
  },

  async toggleTaskCompletion(taskId: string): Promise<PersonalizedRoadmap & { hasRoadmap: boolean; skillFocus: string[] }> {
    const res = await apiClient.put<{ roadmap: BackendRoadmapResponse }>(`/roadmaps/tasks/${encodeURIComponent(taskId)}/toggle`, {});
    return mapRoadmap({ ...res.roadmap, has_roadmap: true });
  },
};
