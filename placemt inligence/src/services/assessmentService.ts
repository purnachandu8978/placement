import { apiClient } from './apiClient';
import type {
  Assessment,
  AssessmentSubmission,
  CodeExecutionResponse,
  CodeSubmissionHistoryItem,
  CodingLanguage,
  Question,
} from '../types';

export interface SkillAssessmentMeta {
  skillName: string;
  category: string;
  isAvailable: boolean;
  hasAttempted: boolean;
  previousScore?: number;
  lastAttemptedDate?: string;
  currentProficiency?: string;
  fiveQuestionTestId: string;
  tenQuestionTestId: string;
  isVerified?: boolean;
}

interface BackendStudentAssessmentItem {
  id: string;
  skill_id: string;
  skill_name: string;
  category: string;
  title: string;
  assessment_size: number;
  duration_minutes: number;
  pass_score_percentage: number;
  attempt_status: string;
  best_score: number | null;
  passed: boolean;
  is_verified: boolean;
}

interface BackendAssessmentQuestion {
  id: string;
  type: 'mcq' | 'simple_coding' | 'hard_coding';
  difficulty?: string;
  question?: string;
  options?: string[];
  title?: string;
  problem_statement?: string;
  input_format?: string;
  output_format?: string;
  constraints?: string[];
  supported_languages?: CodingLanguage[];
  time_limit_ms?: number;
  memory_limit_kb?: number;
  hidden_test_count?: number;
  starter_code?: Record<string, string> | string;
  test_cases?: Array<{ id?: string; label?: string; input: string; expected: string; is_hidden?: boolean }>;
  points?: number;
}

interface BackendAssessmentDoc {
  id: string;
  skill_name: string;
  category: string;
  title: string;
  assessment_size: number;
  duration_minutes: number;
  pass_score_percentage: number;
  question_distribution?: { mcq?: number; simple_coding?: number; hard_coding?: number };
  questions: BackendAssessmentQuestion[];
}

function normalizeStarterMap(raw: Record<string, string> | string | undefined, title?: string): {
  python: string;
  javascript: string;
  java: string;
  cpp: string;
  [key: string]: string;
} {
  if (raw && typeof raw === 'object') {
    return {
      python: raw.python || `# Solution for ${title || 'problem'}\n`,
      javascript: raw.javascript || `// Solution for ${title || 'problem'}\n`,
      java: raw.java || `public class Main {\n    public static void main(String[] args) {}\n}\n`,
      cpp: raw.cpp || `#include <bits/stdc++.h>\nusing namespace std;\nint main() { return 0; }\n`,
      ...raw,
    };
  }
  const fallback = typeof raw === 'string' && raw ? raw : `// Write your solution for ${title || 'challenge'}\n`;
  return {
    python: `# Implement solution for ${title || 'challenge'}\nimport sys\nprint(sys.stdin.read().strip())\n`,
    javascript: fallback,
    java: `public class Main {\n    public static void main(String[] args) {\n        // Implement solution\n    }\n}\n`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    return 0;\n}\n`,
  };
}

function mapQuestions(rawQuestions: BackendAssessmentQuestion[], category: string): Question[] {
  return (rawQuestions || []).map((q) => {
    if (q.type === 'mcq') {
      return {
        id: q.id,
        type: 'mcq',
        question: q.question || '',
        options: q.options || [],
        correctAnswer: 0, // Graded server-side in MongoDB
        explanation: '',
        category,
      };
    }
    return {
      id: q.id,
      type: 'coding',
      difficulty: q.difficulty || (q.type === 'hard_coding' ? 'hard' : 'medium'),
      points: q.points ?? (q.type === 'hard_coding' ? 30 : 20),
      title: q.title || 'Coding Problem',
      problemStatement: q.problem_statement || '',
      inputFormat: q.input_format || 'Standard input (stdin)',
      outputFormat: q.output_format || 'Standard output (stdout)',
      supportedLanguages: q.supported_languages?.length ? q.supported_languages : ['python', 'javascript', 'java', 'cpp'],
      timeLimitMs: q.time_limit_ms || 2000,
      memoryLimitKb: q.memory_limit_kb || 262144,
      hiddenTestCount: q.hidden_test_count ?? 0,
      starterCode: normalizeStarterMap(q.starter_code, q.title),
      testCases: (q.test_cases || []).map((tc, idx) => ({
        id: tc.id || `sample-${idx + 1}`,
        label: tc.label || `Sample Case ${idx + 1}`,
        input: tc.input,
        expectedOutput: tc.expected,
        isHidden: Boolean(tc.is_hidden),
      })),
      constraints: q.constraints?.length
        ? q.constraints
        : [q.type === 'hard_coding' ? 'Hard Algorithmic Problem (30 pts)' : 'Core Implementation Problem (20 pts)'],
      category,
    };
  });
}

function mapAssessmentDoc(doc: BackendAssessmentDoc): Assessment {
  const count = doc.assessment_size || doc.questions?.length || 5;
  return {
    id: doc.id,
    title: doc.title,
    description: `Proctored ${count}-question evaluation for ${doc.skill_name} (graded in MongoDB Atlas).`,
    category: doc.category || 'Technical Skills',
    difficulty: count === 10 ? 'Advanced' : 'Intermediate',
    type: 'hybrid',
    durationMinutes: doc.duration_minutes || (count === 10 ? 60 : 30),
    questionCount: count,
    totalMarks: 100,
    passingPercentage: doc.pass_score_percentage || 75,
    skillsAssessed: [doc.skill_name],
    instructions: [
      `Total questions: ${count} (${count === 10 ? '6 MCQ + 2 Simple Coding + 2 Hard Coding' : '3 MCQ + 1 Simple Coding + 1 Hard Coding'}).`,
      'Test coding implementations against sample test cases before finalizing.',
      `Scoring ${doc.pass_score_percentage || 75}%+ issues a cryptographically verifiable badge on your profile.`,
    ],
    questions: mapQuestions(doc.questions || [], doc.skill_name),
  };
}

export const assessmentService = {
  async getSkillAssessmentsList(): Promise<SkillAssessmentMeta[]> {
    const rows = await apiClient.get<BackendStudentAssessmentItem[]>('/assessments/for-student');
    if (!rows || rows.length === 0) {
      return [];
    }

    const bySkill = new Map<string, SkillAssessmentMeta>();
    for (const r of rows) {
      const key = r.skill_name.toLowerCase();
      const existing = bySkill.get(key);
      if (!existing) {
        bySkill.set(key, {
          skillName: r.skill_name,
          category: r.category,
          isAvailable: true,
          hasAttempted: r.attempt_status === 'completed',
          previousScore: r.best_score ?? undefined,
          currentProficiency: r.is_verified ? 'Verified' : r.best_score !== null ? `${r.best_score}%` : 'Unverified',
          isVerified: r.is_verified,
          fiveQuestionTestId: r.assessment_size === 5 ? r.id : `test-${r.skill_id}-5`,
          tenQuestionTestId: r.assessment_size === 10 ? r.id : `test-${r.skill_id}-10`,
        });
      } else {
        if (r.assessment_size === 5) existing.fiveQuestionTestId = r.id;
        if (r.assessment_size === 10) existing.tenQuestionTestId = r.id;
        if (r.best_score !== null && (existing.previousScore === undefined || r.best_score > existing.previousScore)) {
          existing.hasAttempted = true;
          existing.previousScore = r.best_score;
        }
        if (r.is_verified) {
          existing.isVerified = true;
          existing.currentProficiency = 'Verified';
        }
      }
    }
    return Array.from(bySkill.values());
  },

  async getAssessmentById(id: string): Promise<Assessment> {
    const doc = await apiClient.get<BackendAssessmentDoc>(`/assessments/${encodeURIComponent(id)}`);
    return mapAssessmentDoc(doc);
  },

  async startAttempt(assessmentId: string): Promise<{ attemptId: string; assessment: Assessment }> {
    const res = await apiClient.post<{
      attempt_id: string;
      assessment_id: string;
      skill_name: string;
      title: string;
      duration_minutes: number;
      questions: BackendAssessmentQuestion[];
    }>('/attempts/start', { assessment_id: assessmentId });

    return {
      attemptId: res.attempt_id,
      assessment: mapAssessmentDoc({
        id: res.assessment_id,
        skill_name: res.skill_name,
        category: 'Technical Skills',
        title: res.title,
        assessment_size: res.questions.length,
        duration_minutes: res.duration_minutes,
        pass_score_percentage: 75,
        questions: res.questions,
      }),
    };
  },

  async saveMcqAnswer(attemptId: string, questionId: string, answer: number | string) {
    return apiClient.post(`/attempts/${encodeURIComponent(attemptId)}/answer`, {
      question_id: questionId,
      answer,
    });
  },

  async runSampleCode(
    attemptId: string,
    questionId: string,
    code: string,
    language: CodingLanguage = 'python',
    customInput?: string
  ): Promise<CodeExecutionResponse> {
    return apiClient.post<CodeExecutionResponse>(`/attempts/${encodeURIComponent(attemptId)}/run`, {
      question_id: questionId,
      code,
      language,
      ...(customInput !== undefined ? { custom_input: customInput } : {}),
    });
  },

  async runCodeSubmission(
    attemptId: string,
    questionId: string,
    code: string,
    language: CodingLanguage | string = 'python'
  ): Promise<CodeExecutionResponse> {
    return apiClient.post<CodeExecutionResponse>(`/attempts/${encodeURIComponent(attemptId)}/submit`, {
      question_id: questionId,
      code,
      language,
    });
  },

  async getAttemptCodeSubmissions(attemptId: string, questionId?: string): Promise<CodeSubmissionHistoryItem[]> {
    const qs = questionId ? `?question_id=${encodeURIComponent(questionId)}` : '';
    return apiClient.get<CodeSubmissionHistoryItem[]>(`/attempts/${encodeURIComponent(attemptId)}/submissions${qs}`);
  },

  async submitAssessment(
    assessmentId: string,
    answers: Record<string, any>,
    studentId: string,
    existingAttemptId?: string,
    codeLanguages?: Record<string, CodingLanguage>,
    alreadySubmittedCodingIds?: Set<string>
  ): Promise<AssessmentSubmission> {
    let attemptId = existingAttemptId;
    if (!attemptId) {
      const started = await this.startAttempt(assessmentId);
      attemptId = started.attemptId;
    }

    const mcqAnswers: Record<string, number | string> = {};
    for (const [qid, val] of Object.entries(answers || {})) {
      if (qid.startsWith('code-') || typeof val === 'string') {
        // Only auto-submit unsubmitted edited code using the student's actual active language
        if (!alreadySubmittedCodingIds?.has(qid) && typeof val === 'string' && val.trim().length > 0) {
          const lang = codeLanguages?.[qid] || 'python';
          try {
            await this.runCodeSubmission(attemptId, qid, val, lang);
          } catch {
            // Finalize proceeds gracefully with whatever was successfully submitted
          }
        }
      } else if (val !== undefined && val !== null) {
        mcqAnswers[qid] = val;
      }
    }

    const res = await apiClient.post<{
      attempt_id: string;
      assessment_id: string;
      skill_name: string;
      overall_score: number;
      earned_points: number;
      total_points: number;
      passed: boolean;
      proficiency: string;
      strengths: string[];
      weaknesses: string[];
      question_breakdown?: AssessmentSubmission['questionBreakdown'];
    }>(`/results/${encodeURIComponent(attemptId)}/finalize`, { answers: mcqAnswers });

    return {
      id: res.attempt_id,
      assessmentId: res.assessment_id,
      studentId,
      submittedAt: new Date().toISOString(),
      score: res.overall_score,
      totalMarks: 100,
      earnedPoints: res.earned_points,
      totalPoints: res.total_points,
      percentage: Math.round(res.overall_score),
      passed: res.passed,
      answers,
      verifiedSkillsEarned: res.passed ? [res.skill_name] : [],
      questionBreakdown: res.question_breakdown,
      feedback: res.passed
        ? `Passed ${res.skill_name} (${res.overall_score}% — ${res.proficiency}). Verified credential added to portfolio.`
        : `Scored ${res.overall_score}%. ${(res.weaknesses || []).join(' ')}`,
    };
  },

  async getSubmissions(): Promise<AssessmentSubmission[]> {
    const docs = await apiClient.get<
      Array<{
        attempt_id: string;
        assessment_id: string;
        skill_name: string;
        score: number;
        result: string;
        completed_at: string;
      }>
    >('/assessments/submissions/me');

    return (docs || []).map((d) => ({
      id: d.attempt_id,
      assessmentId: d.assessment_id,
      studentId: 'me',
      submittedAt: d.completed_at,
      score: Math.round(d.score),
      totalMarks: 100,
      percentage: Math.round(d.score),
      passed: d.result === 'passed',
      answers: {},
      verifiedSkillsEarned: d.result === 'passed' ? [d.skill_name] : [],
      feedback: `${d.skill_name}: ${d.score}% (${d.result})`,
    }));
  },
};
