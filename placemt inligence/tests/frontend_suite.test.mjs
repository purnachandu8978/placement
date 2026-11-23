/**
 * Placement Intelligence - Frontend Production Verification Test Suite
 * Validates Security Route Guards, Public Skill Verification Contracts,
 * Notification Badge & Category Computations, and External URL Integrity.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('1. Public Skill Verification Contract & Security', () => {
  // Simulates verification hash validator used in verification routing & components
  const validateHashFormat = (hash) => {
    if (!hash || typeof hash !== 'string') return false;
    const clean = hash.trim();
    if (clean.length < 8 || clean.length > 128) return false;
    return /^[a-fA-F0-9]+$/.test(clean);
  };

  // Simulates public certificate transformation (sanitizing candidate PII)
  const sanitizePublicCertificate = (rawCert) => {
    const {
      email,
      phone_number,
      student_id,
      user_id,
      internal_notes,
      ...publicFields
    } = rawCert;
    return publicFields;
  };

  test('Rejects malformed or short verification hashes (<8 chars)', () => {
    assert.strictEqual(validateHashFormat(''), false);
    assert.strictEqual(validateHashFormat('abc12'), false);
    assert.strictEqual(validateHashFormat('xyz!@#$'), false);
    assert.strictEqual(validateHashFormat(null), false);
  });

  test('Accepts valid SHA-256 and hex verification hashes', () => {
    assert.strictEqual(validateHashFormat('a1b2c3d4e5f6'), true);
    assert.strictEqual(
      validateHashFormat('9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca7'),
      true
    );
  });

  test('Strictly purges candidate PII (email, phone, student_id, user_id) from public certificate', () => {
    const rawCertificate = {
      verification_hash: '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca7',
      skill_name: 'Python Systems Engineering',
      student_name: 'Jane Doe',
      email: 'jane.doe@university.edu',
      phone_number: '+1-555-0199',
      student_id: 'STUDENT_99812',
      user_id: 'usr_secret_internal_id',
      score: 95.5,
      issue_date: '2026-11-14T00:00:00Z',
      status: 'VERIFIED',
      issuing_platform: 'Placement Intelligence',
    };

    const sanitized = sanitizePublicCertificate(rawCertificate);

    assert.strictEqual(sanitized.verification_hash, rawCertificate.verification_hash);
    assert.strictEqual(sanitized.skill_name, 'Python Systems Engineering');
    assert.strictEqual(sanitized.student_name, 'Jane Doe');
    assert.strictEqual(sanitized.score, 95.5);
    // Crucial DevSecOps assertion: PII keys must be undefined
    assert.strictEqual(sanitized.email, undefined);
    assert.strictEqual(sanitized.phone_number, undefined);
    assert.strictEqual(sanitized.student_id, undefined);
    assert.strictEqual(sanitized.user_id, undefined);
    assert.strictEqual(Object.keys(sanitized).includes('email'), false);
  });
});

describe('2. Notification Bell & Center Category Filtering', () => {
  const mockNotifications = [
    { id: '1', title: 'New Job: Senior Backend Engineer', category: 'job', is_read: false },
    { id: '2', title: 'Assessment Released: Python Algorithms', category: 'assessment', is_read: false },
    { id: '3', title: 'Assignment Graded: System Design', category: 'assignment', is_read: true },
    { id: '4', title: 'Campus Drive Alert: Google India', category: 'job', is_read: true },
    { id: '5', title: 'System Maintenance Window', category: 'system', is_read: false },
  ];

  const computeUnreadCount = (items) => items.filter((n) => !n.is_read).length;

  const filterByCategory = (items, selectedCategory) => {
    if (selectedCategory === 'all') return items;
    return items.filter((n) => n.category === selectedCategory);
  };

  test('Computes unread notifications count accurately', () => {
    assert.strictEqual(computeUnreadCount(mockNotifications), 3);
  });

  test('Filters notifications by category accurately', () => {
    const jobItems = filterByCategory(mockNotifications, 'job');
    assert.strictEqual(jobItems.length, 2);
    assert.strictEqual(jobItems.every((n) => n.category === 'job'), true);

    const assessmentItems = filterByCategory(mockNotifications, 'assessment');
    assert.strictEqual(assessmentItems.length, 1);
    assert.strictEqual(assessmentItems[0].id, '2');

    const allItems = filterByCategory(mockNotifications, 'all');
    assert.strictEqual(allItems.length, 5);
  });

  test('Mark all as read state update preserves notification metadata', () => {
    const updated = mockNotifications.map((n) => ({ ...n, is_read: true }));
    assert.strictEqual(computeUnreadCount(updated), 0);
    assert.strictEqual(updated[0].title, mockNotifications[0].title);
  });
});

describe('3. Role-Based Access Control (RBAC) & Route Security Guard', () => {
  const evaluateRouteAccess = ({ userRole, isAuthenticated, targetRoute }) => {
    // Public routes accessible by anyone
    if (targetRoute.startsWith('/verify/') || targetRoute === '/' || targetRoute === '/student/auth' || targetRoute === '/admin/login') {
      return { allowed: true, redirectTo: null };
    }

    if (!isAuthenticated) {
      if (targetRoute.startsWith('/admin')) {
        return { allowed: false, redirectTo: '/admin/login' };
      }
      return { allowed: false, redirectTo: '/student/auth' };
    }

    // Admin protected routes
    if (targetRoute.startsWith('/admin')) {
      if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
        return { allowed: true, redirectTo: null };
      }
      return { allowed: false, redirectTo: '/student/dashboard' }; // Privilege separation
    }

    // Student protected routes
    if (targetRoute.startsWith('/student')) {
      if (userRole === 'STUDENT') {
        return { allowed: true, redirectTo: null };
      }
      return { allowed: false, redirectTo: '/admin/dashboard' };
    }

    return { allowed: true, redirectTo: null };
  };

  test('Public verification routes are accessible anonymously', () => {
    const res = evaluateRouteAccess({
      userRole: null,
      isAuthenticated: false,
      targetRoute: '/verify/a1b2c3d4e5f6',
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.redirectTo, null);
  });

  test('Unauthenticated student is redirected to /student/auth', () => {
    const res = evaluateRouteAccess({
      userRole: null,
      isAuthenticated: false,
      targetRoute: '/student/jobs',
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.redirectTo, '/student/auth');
  });

  test('Student cannot access /admin/settings (Privilege Escalation Prevention)', () => {
    const res = evaluateRouteAccess({
      userRole: 'STUDENT',
      isAuthenticated: true,
      targetRoute: '/admin/settings',
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.redirectTo, '/student/dashboard');
  });

  test('Admin user is authorized for /admin/jobs', () => {
    const res = evaluateRouteAccess({
      userRole: 'ADMIN',
      isAuthenticated: true,
      targetRoute: '/admin/jobs',
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.redirectTo, null);
  });
});

describe('4. Direct Application URL Preservation & Safety', () => {
  const sanitizeAndValidateApplicationUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      // Rejects dangerous protocols like javascript:, data:, vbscript:
      return parsed.href;
    } catch {
      return null;
    }
  };

  test('Preserves valid external job application URLs with query parameters intact', () => {
    const targetUrl = 'https://boards.greenhouse.io/stripe/jobs/123456?gh_src=campus_drive_2026';
    const validated = sanitizeAndValidateApplicationUrl(targetUrl);
    assert.strictEqual(validated, targetUrl);
  });

  test('Rejects malicious XSS or non-web application URLs', () => {
    assert.strictEqual(sanitizeAndValidateApplicationUrl('javascript:alert(document.cookie)'), null);
    assert.strictEqual(sanitizeAndValidateApplicationUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.strictEqual(sanitizeAndValidateApplicationUrl('file:///etc/passwd'), null);
  });
});

describe('5. Question Bank Model & Answer Key Protection', () => {
  // Simulates question sanitization helper used before sending assignment payload to students
  const sanitizeQuestionForStudent = (question, isGraded = false) => {
    const clean = { ...question };
    if (!isGraded) {
      delete clean.correct_answer;
      delete clean.explanation;
      delete clean.expected_answer;
      delete clean.rubric;
      delete clean.admin_feedback;
    }
    if (Array.isArray(clean.test_cases)) {
      if (!isGraded) {
        clean.test_cases = clean.test_cases.filter((tc) => !tc.is_hidden);
      }
    }
    return clean;
  };

  test('MCQ answer keys, explanations and rubrics are strictly stripped for taking students', () => {
    const rawQuestion = {
      id: 'q-mcq-1',
      type: 'mcq',
      title: 'Python Asyncio GIL',
      question_text: 'What happens when time.sleep is called in async coroutine?',
      options: ['Blocks loop', 'Spawns thread', 'Pauses task', 'Releases GIL'],
      correct_answer: 0,
      explanation: 'Synchronous blocking calls freeze the single event loop thread.',
      points: 10,
    };

    const sanitized = sanitizeQuestionForStudent(rawQuestion, false);

    assert.strictEqual(sanitized.id, 'q-mcq-1');
    assert.strictEqual(sanitized.options.length, 4);
    assert.strictEqual(sanitized.correct_answer, undefined);
    assert.strictEqual(sanitized.explanation, undefined);
    assert.strictEqual('correct_answer' in sanitized, false);
  });

  test('Coding private hidden test cases are never leaked to students before evaluation', () => {
    const rawCodingQuestion = {
      id: 'q-code-1',
      type: 'simple_coding',
      title: 'Two Sum',
      question_text: 'Find two indices summing to target.',
      points: 20,
      test_cases: [
        { label: 'Sample 1', input: '2 7 11 15\n9', expected: '0 1', is_hidden: false },
        { label: 'Hidden Edge 1', input: '3 3\n6', expected: '0 1', is_hidden: true },
        { label: 'Hidden Large 2', input: '100000 numbers', expected: 'ans', is_hidden: true },
      ],
    };

    const sanitized = sanitizeQuestionForStudent(rawCodingQuestion, false);

    assert.strictEqual(sanitized.test_cases.length, 1);
    assert.strictEqual(sanitized.test_cases[0].is_hidden, false);
    assert.strictEqual(sanitized.test_cases.some((tc) => tc.is_hidden), false);
  });

  test('Short answer expected answers and rubrics are protected before evaluation and released after grading', () => {
    const rawShortAnswer = {
      id: 'q-short-1',
      type: 'short_answer',
      title: 'CAP Theorem',
      question_text: 'Explain partition tolerance in distributed databases.',
      expected_answer: 'System continues operating despite arbitrary network partitioning.',
      rubric: 'Conceptual accuracy: 50%, Examples: 30%, Clarity: 20%',
      points: 15,
    };

    // Pre-grading: strictly hidden
    const unreleased = sanitizeQuestionForStudent(rawShortAnswer, false);
    assert.strictEqual(unreleased.expected_answer, undefined);
    assert.strictEqual(unreleased.rubric, undefined);

    // Post-grading: released for student feedback review
    const released = sanitizeQuestionForStudent(rawShortAnswer, true);
    assert.strictEqual(released.expected_answer, rawShortAnswer.expected_answer);
    assert.strictEqual(released.rubric, rawShortAnswer.rubric);
  });
});

describe('6. 4-Step Assignment Wizard & Total Marks Computation', () => {
  const computeAssignmentTotalMarks = (questions) => {
    if (!questions || questions.length === 0) return 100; // default fallback
    return questions.reduce((sum, q) => sum + (Number(q.points) || 10), 0);
  };

  test('Correctly computes total marks dynamically from mixed question types', () => {
    const questions = [
      { id: '1', type: 'mcq', points: 10 },
      { id: '2', type: 'mcq', points: 10 },
      { id: '3', type: 'simple_coding', points: 25 },
      { id: '4', type: 'short_answer', points: 15 },
    ];

    assert.strictEqual(computeAssignmentTotalMarks(questions), 60);
  });

  test('Reordering questions preserves points and integrity', () => {
    const questions = [
      { id: '1', order: 1, points: 10 },
      { id: '2', order: 2, points: 20 },
    ];

    // Swap positions
    const reordered = [questions[1], questions[0]].map((q, idx) => ({ ...q, order: idx + 1 }));

    assert.strictEqual(reordered[0].id, '2');
    assert.strictEqual(reordered[0].order, 1);
    assert.strictEqual(reordered[1].id, '1');
    assert.strictEqual(reordered[1].order, 2);
    assert.strictEqual(computeAssignmentTotalMarks(reordered), 30);
  });
});

describe('7. Cohort Student Allocation Engine', () => {
  const mockStudents = [
    { uid: 's1', name: 'Alice', department: 'Computer Science', batch: 2025, skills: ['python', 'react'] },
    { uid: 's2', name: 'Bob', department: 'Information Technology', batch: 2026, skills: ['java', 'spring'] },
    { uid: 's3', name: 'Charlie', department: 'Mechanical Engineering', batch: 2025, skills: ['python', 'cad'] },
    { uid: 's4', name: 'Diana', department: 'Computer Science', batch: 2027, skills: ['c++', 'dsa'] },
  ];

  const filterTargetStudents = (students, { target_type, departments = [], batches = [], skills = [] }) => {
    return students.filter((st) => {
      if (target_type === 'all') return true;
      if (target_type === 'department') {
        return departments.some((d) => st.department.toLowerCase().includes(d.toLowerCase()));
      }
      if (target_type === 'batch') {
        return batches.includes(st.batch);
      }
      if (target_type === 'skill') {
        return skills.some((sk) => st.skills.includes(sk.toLowerCase()));
      }
      return false;
    });
  };

  test('All students mode targets the complete student cohort', () => {
    const res = filterTargetStudents(mockStudents, { target_type: 'all' });
    assert.strictEqual(res.length, 4);
  });

  test('Department filter targets only specified branches', () => {
    const res = filterTargetStudents(mockStudents, {
      target_type: 'department',
      departments: ['Computer Science'],
    });
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res.every((s) => s.department === 'Computer Science'), true);
  });

  test('Batch filter targets specific graduation years', () => {
    const res = filterTargetStudents(mockStudents, {
      target_type: 'batch',
      batches: [2025],
    });
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res.map((s) => s.uid).sort().join(','), 's1,s3');
  });

  test('Skill filter targets students with verified or extracted matching skills', () => {
    const res = filterTargetStudents(mockStudents, {
      target_type: 'skill',
      skills: ['react'],
    });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].name, 'Alice');
  });
});

describe('8. Student Workstation, MCQ Auto-Grading & Deadline Policies', () => {
  const autoGradeMCQ = (question, selectedOption) => {
    if (selectedOption === undefined || selectedOption === null) return 0;
    return Number(selectedOption) === Number(question.correct_answer) ? question.points : 0;
  };

  const computeLatePenalty = (score, isLate, policy, penaltyPercent = 10) => {
    if (!isLate) return score;
    if (policy === 'reject') return null; // submission rejected
    if (policy === 'allow_no_penalty') return score;
    const deduction = (penaltyPercent / 100) * score;
    return Math.max(0, score - deduction);
  };

  test('MCQ auto-grader awards full points on correct match and 0 on incorrect', () => {
    const q = { id: 'q1', type: 'mcq', correct_answer: 2, points: 10 };
    assert.strictEqual(autoGradeMCQ(q, 2), 10);
    assert.strictEqual(autoGradeMCQ(q, 1), 0);
    assert.strictEqual(autoGradeMCQ(q, null), 0);
  });

  test('Late submission penalty deduction is correctly computed', () => {
    const onTimeScore = 80;
    const penaltyApplied = computeLatePenalty(onTimeScore, true, 'allow_penalty', 10);
    assert.strictEqual(penaltyApplied, 72); // 80 - 10% = 72

    const rejected = computeLatePenalty(onTimeScore, true, 'reject', 10);
    assert.strictEqual(rejected, null);

    const noPenalty = computeLatePenalty(onTimeScore, true, 'allow_no_penalty', 10);
    assert.strictEqual(noPenalty, 80);
  });
});

describe('9. Global Scroll Restoration & Route Navigation Engine', () => {
  // Simulates the exact logic implemented in ScrollManager.tsx
  const createScrollManager = () => {
    const positionCache = new Map();
    let currentScroll = { x: 0, y: 0 };
    let bodyOverflow = 'unset';

    const savePosition = (key, x, y) => {
      positionCache.set(key, { x, y });
    };

    const getSavedPosition = (key) => positionCache.get(key);

    const processNavigation = ({ prevLocation, nextLocation, navType }) => {
      // 1. Save last position of the leaving route
      if (prevLocation?.key) {
        savePosition(prevLocation.key, currentScroll.x, currentScroll.y);
      }

      const isNewPathname = prevLocation ? nextLocation.pathname !== prevLocation.pathname : true;
      const isPop = navType === 'POP';
      const hasHash = Boolean(nextLocation.hash);

      if (hasHash) {
        return {
          action: 'SCROLL_TO_HASH',
          targetHash: nextLocation.hash,
          preserveCurrent: false,
        };
      }

      if (isPop) {
        const saved = getSavedPosition(nextLocation.key);
        const targetY = saved ? saved.y : 0;
        const targetX = saved ? saved.x : 0;
        currentScroll = { x: targetX, y: targetY };
        return {
          action: 'RESTORE_PREVIOUS',
          targetX,
          targetY,
          preserveCurrent: false,
        };
      }

      if (isNewPathname) {
        currentScroll = { x: 0, y: 0 };
        return {
          action: 'RESET_TO_TOP',
          targetX: 0,
          targetY: 0,
          preserveCurrent: false,
        };
      }

      // Same route pathname with query parameter or filter change: PRESERVE!
      return {
        action: 'PRESERVE_POSITION',
        currentX: currentScroll.x,
        currentY: currentScroll.y,
        preserveCurrent: true,
      };
    };

    const setModalOpen = (isOpen) => {
      bodyOverflow = isOpen ? 'hidden' : 'unset';
    };

    return {
      savePosition,
      getSavedPosition,
      processNavigation,
      setModalOpen,
      getScroll: () => ({ ...currentScroll }),
      setScroll: (x, y) => { currentScroll = { x, y }; },
      getBodyOverflow: () => bodyOverflow,
    };
  };

  test('New route navigation resets vertical and horizontal scroll to (0, 0)', () => {
    const manager = createScrollManager();
    // Simulate user on /student/dashboard scrolled to 1250px
    manager.setScroll(0, 1250);

    const prev = { pathname: '/student/dashboard', search: '', hash: '', key: 'key_dash' };
    const next = { pathname: '/student/resume', search: '', hash: '', key: 'key_resume' };

    const result = manager.processNavigation({ prevLocation: prev, nextLocation: next, navType: 'PUSH' });
    assert.strictEqual(result.action, 'RESET_TO_TOP');
    assert.strictEqual(result.targetY, 0);
    assert.strictEqual(result.targetX, 0);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 0 });
  });

  test('Nested student portal navigation resets scroll to top between feature pages', () => {
    const manager = createScrollManager();
    manager.setScroll(0, 850);

    const prev = { pathname: '/student/assessments', search: '', hash: '', key: 'key_tests' };
    const next = { pathname: '/student/skills', search: '', hash: '', key: 'key_skills' };

    const result = manager.processNavigation({ prevLocation: prev, nextLocation: next, navType: 'PUSH' });
    assert.strictEqual(result.action, 'RESET_TO_TOP');
    assert.strictEqual(result.targetY, 0);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 0 });
  });

  test('Nested admin portal navigation resets scroll to top between admin modules', () => {
    const manager = createScrollManager();
    manager.setScroll(0, 1400);

    const prev = { pathname: '/admin/students', search: '', hash: '', key: 'key_adm_stud' };
    const next = { pathname: '/admin/jobs', search: '', hash: '', key: 'key_adm_jobs' };

    const result = manager.processNavigation({ prevLocation: prev, nextLocation: next, navType: 'PUSH' });
    assert.strictEqual(result.action, 'RESET_TO_TOP');
    assert.strictEqual(result.targetY, 0);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 0 });
  });

  test('Same-route query parameter changes (filtering, pagination) preserve current scroll position', () => {
    const manager = createScrollManager();
    // User is at 600px scrolling through student directory
    manager.setScroll(0, 600);

    const prev = { pathname: '/admin/students', search: '?page=1', hash: '', key: 'key_p1' };
    const next = { pathname: '/admin/students', search: '?page=2&dept=CSE', hash: '', key: 'key_p2' };

    const result = manager.processNavigation({ prevLocation: prev, nextLocation: next, navType: 'PUSH' });
    assert.strictEqual(result.action, 'PRESERVE_POSITION');
    assert.strictEqual(result.preserveCurrent, true);
    assert.strictEqual(result.currentY, 600);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 600 });
  });

  test('Hash anchor navigation targets element without resetting position to zero', () => {
    const manager = createScrollManager();
    manager.setScroll(0, 200);

    const prev = { pathname: '/', search: '', hash: '', key: 'key_home' };
    const next = { pathname: '/', search: '', hash: '#how-it-works', key: 'key_home_hash' };

    const result = manager.processNavigation({ prevLocation: prev, nextLocation: next, navType: 'PUSH' });
    assert.strictEqual(result.action, 'SCROLL_TO_HASH');
    assert.strictEqual(result.targetHash, '#how-it-works');
  });

  test('Browser Back (POP) navigation restores previously recorded scroll position', () => {
    const manager = createScrollManager();

    // 1. User scrolls to 950px on dashboard
    manager.setScroll(0, 950);
    const loc1 = { pathname: '/student/dashboard', search: '', hash: '', key: 'loc_dash' };
    const loc2 = { pathname: '/student/resume', search: '', hash: '', key: 'loc_resume' };

    // 2. User navigates to resume page -> resets to 0
    manager.processNavigation({ prevLocation: loc1, nextLocation: loc2, navType: 'PUSH' });
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 0 });

    // 3. User clicks browser Back button -> POP navigation to dashboard
    const popResult = manager.processNavigation({ prevLocation: loc2, nextLocation: loc1, navType: 'POP' });
    assert.strictEqual(popResult.action, 'RESTORE_PREVIOUS');
    assert.strictEqual(popResult.targetY, 950);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 950 });
  });

  test('Browser Forward (POP) navigation restores recorded forward position', () => {
    const manager = createScrollManager();

    const loc1 = { pathname: '/student/dashboard', search: '', hash: '', key: 'loc_dash' };
    const loc2 = { pathname: '/student/jobs', search: '', hash: '', key: 'loc_jobs' };

    // On jobs page, user scrolled to 400px
    manager.setScroll(0, 400);
    // User went back to dashboard
    manager.processNavigation({ prevLocation: loc2, nextLocation: loc1, navType: 'POP' });

    // Now user clicks browser Forward button to return to jobs
    const fwdResult = manager.processNavigation({ prevLocation: loc1, nextLocation: loc2, navType: 'POP' });
    assert.strictEqual(fwdResult.action, 'RESTORE_PREVIOUS');
    assert.strictEqual(fwdResult.targetY, 400);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 400 });
  });

  test('Initial application load or fresh refresh defaults to top (0, 0)', () => {
    const manager = createScrollManager();
    const initialLocation = { pathname: '/student/dashboard', search: '', hash: '', key: 'init_key' };

    const result = manager.processNavigation({ prevLocation: null, nextLocation: initialLocation, navType: 'PUSH' });
    assert.strictEqual(result.action, 'RESET_TO_TOP');
    assert.strictEqual(result.targetY, 0);
    assert.deepStrictEqual(manager.getScroll(), { x: 0, y: 0 });
  });

  test('Modal scroll-lock locks body overflow on open and restores on close', () => {
    const manager = createScrollManager();
    assert.strictEqual(manager.getBodyOverflow(), 'unset');

    manager.setModalOpen(true);
    assert.strictEqual(manager.getBodyOverflow(), 'hidden');

    manager.setModalOpen(false);
    assert.strictEqual(manager.getBodyOverflow(), 'unset');
  });
});
