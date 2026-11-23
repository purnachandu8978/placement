export * from './types/auth';

export type SkillCategory =
  | 'Programming Languages'
  | 'Frameworks & Libraries'
  | 'Databases & Storage'
  | 'Cloud & DevOps'
  | 'AI & Data Science'
  | 'Core Engineering';

export interface SkillItem {
  id: string;
  name: string;
  category: SkillCategory | string;
  isVerified: boolean;
  proficiency: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | string;
  confidenceScore: number;
  verificationSource?: string;
  requiresImprovement?: boolean;
  sourceEvidence?: string;
  extractionMethod?: 'gemini_ai' | 'deterministic_fallback' | string;
}

export interface SemanticSkillClassification {
  core_skills: string[];
  supporting_skills: string[];
  missing_skills: string[];
  related_skills: string[];
  outdated_skills: string[];
  skills_requiring_assessment: string[];
}

export interface ResumeOptimizationSuggestion {
  section: string;
  original_bullet: string;
  improved_bullet: string;
  improvement_rationale: string;
  action_verbs_used: string[];
  quantified_metrics_referenced: string[];
  student_approved: boolean;
}

export interface ExtractionMetadata {
  method: 'gemini_ai' | 'deterministic_fallback' | string;
  model: string;
  latency_ms?: number;
  tokens_used?: number;
  fallback_used?: boolean;
  error_message?: string | null;
}

export interface DetectedProject {
  title: string;
  description: string;
  techStack: string[];
  metricsFound?: string[];
}

export interface ExtractedResume {
  id?: string;
  version?: number;
  atsScore?: number;
  suggestions?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  rawText: string;
  fileName: string;
  uploadedAt: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  education: {
    college: string;
    degree: string;
    graduationYear: string;
    cgpa: number;
  };
  detectedSkills: SkillItem[];
  detectedProjects: DetectedProject[];
  detectedCertifications: string[];
  isConfirmedByStudent: boolean;
  extractionMetadata?: ExtractionMetadata;
  semanticSkills?: SemanticSkillClassification;
  optimizationSuggestions?: ResumeOptimizationSuggestion[];
}

export interface ResumeAnalysis {
  id: string;
  resumeId: string;
  jobId: string;
  overallScore: number;
  keywordDensity: number;
  hardSkillsOverlap: number;
  quantifiableMetrics: number;
  atsCleanlinessScore: number;
  strengths: string[];
  matchedKeywords: string[];
  weaknesses: Array<{
    title: string;
    description: string;
    severity: 'critical' | 'moderate' | 'minor';
  }>;
  missingSkills: string[];
  timestamp: string;
}

export interface OptimizedResume {
  originalText: string;
  optimizedText: string;
  changes: Array<{
    original: string;
    optimized: string;
    reason: string;
    type: string;
  }>;
  projectedScore: number;
  targetScore: number;
}

export interface QuestionMCQ {
  id: string;
  type: 'mcq';
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  category?: string;
}

export type CodingLanguage = 'python' | 'javascript' | 'java' | 'cpp';

export interface QuestionCoding {
  id: string;
  type: 'coding';
  difficulty?: string;
  points?: number;
  title: string;
  problemStatement: string;
  inputFormat?: string;
  outputFormat?: string;
  supportedLanguages?: CodingLanguage[];
  timeLimitMs?: number;
  memoryLimitKb?: number;
  hiddenTestCount?: number;
  starterCode: {
    python: string;
    javascript: string;
    java: string;
    cpp: string;
    [key: string]: string;
  };
  testCases: Array<{
    id?: string;
    label?: string;
    input: string;
    expectedOutput: string;
    isHidden?: boolean;
  }>;
  constraints?: string[];
  category?: string;
}

export interface CodePublicCaseResult {
  id: string;
  label: string;
  passed: boolean;
  status: string;
  execution_time_ms: number;
  input: string;
  expected_output: string;
  actual_output: string;
  stderr?: string;
}

export interface CodeExecutionResponse {
  submission_id?: string | null;
  question_id?: string;
  run_type: 'sample' | 'custom' | 'submit';
  status: string;
  language: CodingLanguage | string;
  passed_test_cases: number;
  total_test_cases: number;
  score_percentage: number;
  earned_points: number;
  max_points: number;
  execution_time_ms: number;
  compile_error: string;
  runtime_error: string;
  public_results: CodePublicCaseResult[];
  hidden_summary: {
    passed: number;
    total: number;
  };
  stdout: string;
  submitted_at?: string;
}

export interface CodeSubmissionHistoryItem {
  submission_id: string;
  question_id: string;
  language: CodingLanguage | string;
  run_type: 'sample' | 'submit';
  status: string;
  passed_test_cases: number;
  total_test_cases: number;
  score_percentage: number;
  earned_points: number;
  max_points: number;
  execution_time_ms: number;
  compile_error?: string;
  runtime_error?: string;
  hidden_summary?: { passed: number; total: number };
  source_code?: string;
  submitted_at: string;
}

export type Question = QuestionMCQ | QuestionCoding;

export interface Assessment {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  type: 'mcq' | 'coding' | 'hybrid';
  durationMinutes: number;
  questionCount: number;
  totalMarks: number;
  passingPercentage: number;
  skillsAssessed: string[];
  instructions: string[];
  questions: Question[];
}

export interface AssessmentSubmission {
  id: string;
  assessmentId: string;
  studentId: string;
  submittedAt: string;
  score: number;
  totalMarks: number;
  earnedPoints?: number;
  totalPoints?: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, any>;
  verifiedSkillsEarned: string[];
  feedback: string;
  questionBreakdown?: Array<{
    question_id: string;
    type: string;
    title?: string;
    language?: string;
    status?: string;
    passed_test_cases?: number;
    total_test_cases?: number;
    execution_time_ms?: number;
    hidden_summary?: { passed: number; total: number };
    earned_points: number;
    max_points: number;
  }>;
}

export interface RoadmapTask {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  type: 'concept' | 'coding' | 'assignment' | 'assessment';
  estimatedMinutes: number;
  isCompleted: boolean;
  resourceLinks: Array<{ title: string; url: string }>;
}

export interface RoadmapWeek {
  weekNumber: number;
  title: string;
  theme: string;
  description: string;
  learningObjectives: string[];
  isLocked: boolean;
  tasks: RoadmapTask[];
}

export interface PersonalizedRoadmap {
  id: string;
  hasRoadmap?: boolean;
  skillFocus?: string[];
  studentId: string;
  targetRole: string;
  weeks: RoadmapWeek[];
  totalTasks: number;
  completedTasks: number;
  progressPercentage: number;
  createdAt: string;
  lastUpdated: string;
}

export type AssignmentStatus =
  | 'Pending'
  | 'Not Started'
  | 'In Progress'
  | 'Submitted'
  | 'Under Review'
  | 'Evaluated'
  | 'Graded'
  | 'Overdue';

export interface AssignmentAnswerSubmission {
  question_id: string;
  type: 'mcq' | 'simple_coding' | 'hard_coding' | 'short_answer' | string;
  selected_option?: number | null;
  code?: string;
  language?: string;
  text_answer?: string;
  awarded_marks?: number;
  status?: string;
  feedback?: string;
}

export interface AssignmentQuestion {
  question_id?: string;
  id?: string;
  title?: string;
  question_text: string;
  problem_statement?: string;
  type: 'mcq' | 'simple_coding' | 'hard_coding' | 'short_answer';
  points: number;
  order?: number;
  difficulty?: string;
  estimated_minutes?: number;
  instructions?: string;
  tags?: string[];
  options?: string[] | Array<{ id: string; option_text: string }>;
  correct_answer?: number;
  explanation?: string;
  input_format?: string;
  output_format?: string;
  constraints?: string[];
  starter_code?: Record<string, string>;
  supported_languages?: string[];
  test_cases?: Array<{
    id?: string;
    label?: string;
    input: string;
    expected: string;
    is_hidden?: boolean;
    weight?: number;
  }>;
  expected_answer?: string;
  rubric?: string;
  admin_feedback?: string;
}

export interface AssignmentSubmission {
  id: string;
  submittedAt: string;
  repoUrl?: string;
  deployedUrl?: string;
  codeSnippet?: string;
  notes?: string;
  answers?: AssignmentAnswerSubmission[];
  grade?: number;
  autoScore?: number;
  feedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  canResubmit?: boolean;
  status?: string;
  isLate?: boolean;
}

export interface AdminAssignmentSubmission {
  id: string;
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  skill: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  githubUrl: string;
  liveUrl?: string;
  codeSnippet?: string;
  notes?: string;
  answers?: AssignmentAnswerSubmission[];
  autoScore: number;
  grade?: number;
  feedback?: string;
  status: 'Submitted' | 'Graded' | 'Evaluated' | string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt: string;
}

export interface Assignment {
  id: string;
  weekNumber: number;
  title: string;
  category: string;
  skill?: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  description: string;
  instructions?: string;
  requirements: string[];
  deliverables: string;
  deadline: string;
  remainingSeconds?: number;
  durationMinutes?: number;
  totalMarks?: number;
  maxScore?: number;
  lateSubmissionPolicy?: string;
  questionCount?: number;
  questions?: AssignmentQuestion[];
  rubric: Array<{ criteria: string; weightage: number }>;
  status: AssignmentStatus;
  submission?: AssignmentSubmission;
}

export interface JobPosting {
  id: string;
  company: string;
  companyInitials: string;
  companyColor: string;
  role: string;
  category: string;
  location: string;
  workMode: 'Remote' | 'Hybrid' | 'Onsite' | string;
  ctcMin: number;
  ctcMax: number;
  salaryLabel?: string;
  experienceLevel: string;
  eligibleBatches: string[];
  eligibleDegrees: string[];
  minCGPA: number;
  maxBacklogs: number;
  techStack: string[];
  description: string;
  responsibilities: string[];
  interviewRounds: string[];
  postedDate?: string;
  applicationUrl?: string;
  isSaved: boolean;
  isApplied: boolean;
  hasApplied?: boolean;
  applicantsCount?: number;
  matchScore: number;
  matchedSkills?: string[];
  verifiedMatchedSkills?: string[];
  resumeSkillsMatched?: string[];
  missingSkills?: string[];
  preferredSkills?: string[];
  roleRelevanceSummary?: string;
  eligibilityConcerns?: string[];
  recommendedPreparation?: string[];
  formulaBreakdown?: Record<string, number>;
  sourceName?: string;
  sourceType?: string;
  originalJobUrl?: string;
  employmentType?: string;
  readinessStatus?: string;
  recommendation?: string;
}

export interface ReadinessMetric {
  name: string;
  score: number;
  weight: number;
  status: 'Ready' | 'In Progress' | 'Attention Needed';
  details: string;
}

export interface RecommendedAction {
  id: string;
  title: string;
  type: 'resume' | 'assignment' | 'roadmap' | 'assessment';
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
}

export interface PlacementReadinessSummary {
  overallScore: number;
  tierReadiness: string;
  readinessBand?: string;
  profileCompletion?: number;
  rawMetrics?: Record<string, any>;
  pillarScores: {
    technicalProficiency: number;
    codingAssessments: number;
    practicalAssignments: number;
    verifiedSkills: number;
    resumeQuality: number;
  };
  metrics: ReadinessMetric[];
  strengths: string[];
  weaknesses: string[];
  recommendedActions: RecommendedAction[];
}
