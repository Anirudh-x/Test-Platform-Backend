const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const emitter = require('../events');

// POST /api/student/login
// Validates testId exists and checks if student already submitted
router.post('/login', async (req, res) => {
  try {
    const { testId, name, rollNo } = req.body;

    if (!testId || !name || !rollNo) {
      return res.status(400).json({ success: false, error: 'testId, name, and rollNo are required' });
    }

    const normalizedTestId = testId.trim().toUpperCase();
    const normalizedRollNo = rollNo.trim().toUpperCase();

    // Check if test exists
    const test = await Test.findOne({ testId: normalizedTestId }).lean();
    if (!test) {
      return res.status(404).json({ success: false, error: 'Invalid Test ID. Please check and try again.' });
    }

    // Check if student already submitted this test
    const existingSubmission = await Submission.findOne({
      testId: normalizedTestId,
      rollNo: normalizedRollNo,
    }).lean();

    if (existingSubmission && existingSubmission.status === 'Submitted') {
      return res.status(409).json({
        success: false,
        error: 'You have already submitted this test. You cannot take it again.',
      });
    }

    // Create an "In Progress" submission record to mark the student has started
    if (!existingSubmission) {
      const submission = await Submission.create({
        studentName: name.trim(),
        rollNo: normalizedRollNo,
        testId: normalizedTestId,
        testType: test.type || 'coding',
        status: 'In Progress',
        startTime: new Date(),
      });

      // 🔔 Notify admin panel in real-time
      emitter.emit('update', {
        type: 'student_started',
        student: {
          id: submission._id,
          name: submission.studentName,
          rollNo: submission.rollNo,
          testId: submission.testId,
          testType: submission.testType,
          status: submission.status,
          language: submission.language,
          answers: [],
          score: null,
          totalMarks: null,
          percentage: null,
          totalTime: 0,
          startTime: submission.startTime,
          endTime: null,
        },
      });
    }

    res.json({
      success: true,
      testInfo: {
        testId: test.testId,
        title: test.title,
        type: test.type || 'coding',
        duration: test.duration,
        totalQuestions: test.questions.length,
      },
    });
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// GET /api/student/test/:testId
// Returns the test questions (called after successful login)
router.get('/test/:testId', async (req, res) => {
  try {
    const normalizedTestId = req.params.testId.trim().toUpperCase();
    const test = await Test.findOne({ testId: normalizedTestId }).lean();

    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    // Security: for objective tests, redact correctOption so it is not visible in devtools
    const isObjective = test.type === 'objective';
    const sanitizedQuestions = test.questions.map(q => {
      if (isObjective) {
        return {
          id: q.id,
          title: q.title,
          description: q.description || '',
          difficulty: q.difficulty || 'Medium',
          options: q.options || [],
        };
      }
      return q;
    });

    res.json({
      success: true,
      test: {
        testId: test.testId,
        title: test.title,
        type: test.type || 'coding',
        duration: test.duration,
        questions: sanitizedQuestions,
      },
    });
  } catch (err) {
    console.error('Error fetching test:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch test' });
  }
});

// POST /api/student/submit
// Submits student answers and marks submission as Submitted
router.post('/submit', async (req, res) => {
  try {
    const { testId, name, rollNo, answers, language, totalTime } = req.body;

    if (!testId || !rollNo) {
      return res.status(400).json({ success: false, error: 'testId and rollNo are required' });
    }

    const normalizedTestId = testId.trim().toUpperCase();
    const normalizedRollNo = rollNo.trim().toUpperCase();

    // Check if already submitted
    const existing = await Submission.findOne({
      testId: normalizedTestId,
      rollNo: normalizedRollNo,
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'No active session found for this student' });
    }

    if (existing.status === 'Submitted') {
      return res.status(409).json({ success: false, error: 'Test already submitted' });
    }

    // Fetch the test to check type and evaluate if objective
    const test = await Test.findOne({ testId: normalizedTestId }).lean();
    const isObjective = test?.type === 'objective';

    existing.status = 'Submitted';
    existing.totalTime = totalTime || 0;
    existing.endTime = new Date();

    if (isObjective) {
      let correctCount = 0;
      const evaluatedAnswers = (answers || []).map(ans => {
        const q = (test?.questions || []).find(item => item.id === ans.questionId);
        const selectedOption = typeof ans.selectedOption === 'number' ? ans.selectedOption : null;
        const isCorrect = Boolean(q && selectedOption !== null && selectedOption === q.correctOption);
        if (isCorrect) {
          correctCount++;
        }
        return {
          questionId: ans.questionId,
          questionTitle: q ? q.title : (ans.questionTitle || ''),
          selectedOption,
          isCorrect,
          timeSpent: ans.timeSpent || 0,
        };
      });

      const totalQuestions = test?.questions?.length || (answers || []).length || 1;
      existing.score = correctCount;
      existing.totalMarks = totalQuestions;
      existing.percentage = Math.round((correctCount / totalQuestions) * 100);
      existing.answers = evaluatedAnswers;
      existing.testType = 'objective';
      existing.language = 'objective';
    } else {
      existing.answers = answers || [];
      existing.language = language || 'python';
      existing.testType = 'coding';
    }

    await existing.save();

    // 🔔 Notify admin panel in real-time
    emitter.emit('update', {
      type: 'student_submitted',
      student: {
        id: existing._id,
        name: existing.studentName,
        rollNo: existing.rollNo,
        testId: existing.testId,
        testType: existing.testType,
        status: existing.status,
        language: existing.language,
        answers: existing.answers,
        score: existing.score,
        totalMarks: existing.totalMarks,
        percentage: existing.percentage,
        totalTime: existing.totalTime,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
    });

    res.json({
      success: true,
      message: 'Test submitted successfully',
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit test' });
  }
});

// POST /api/student/run-code
// Executes student code in sandbox using Judge0 CE
const LANGUAGE_MAP = {
  python: 71,       // Python (3.8.1)
  javascript: 63,   // JavaScript (Node.js 12.14.0)
  cpp: 54,          // C++ (GCC 9.2.0)
  java: 62,         // Java (OpenJDK 13.0.1)
};

router.post('/run-code', async (req, res) => {
  try {
    const { sourceCode, language = 'python', stdin = '' } = req.body;

    if (!sourceCode && sourceCode !== '') {
      return res.status(400).json({ success: false, error: 'sourceCode is required' });
    }

    const languageId = LANGUAGE_MAP[language.toLowerCase()] || 71;

    const response = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || '',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: `Execution service error: ${errText}` });
    }

    const result = await response.json();
    return res.json({
      success: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compile_output: result.compile_output || '',
      message: result.message || '',
      status: result.status?.description || 'Executed',
      statusId: result.status?.id,
      time: result.time,
      memory: result.memory,
    });
  } catch (err) {
    console.error('Code execution error:', err);
    res.status(500).json({ success: false, error: 'Failed to execute code' });
  }
});

module.exports = router;

