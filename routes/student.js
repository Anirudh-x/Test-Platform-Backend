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
          status: submission.status,
          language: submission.language,
          answers: [],
          score: null,
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

    res.json({
      success: true,
      test: {
        testId: test.testId,
        title: test.title,
        duration: test.duration,
        questions: test.questions,
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

    // Update the submission with answers
    existing.status = 'Submitted';
    existing.answers = answers || [];
    existing.language = language || 'python';
    existing.totalTime = totalTime || 0;
    existing.endTime = new Date();
    await existing.save();

    // 🔔 Notify admin panel in real-time
    emitter.emit('update', {
      type: 'student_submitted',
      student: {
        id: existing._id,
        name: existing.studentName,
        rollNo: existing.rollNo,
        testId: existing.testId,
        status: existing.status,
        language: existing.language,
        answers: existing.answers,
        score: null,
        totalTime: existing.totalTime,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
    });

    res.json({ success: true, message: 'Test submitted successfully' });
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

