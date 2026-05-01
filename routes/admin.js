const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const emitter = require('../events');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === adminUsername && password === adminPassword) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return res.json({ success: true, token, user: { username, role: 'admin' } });
  }
  return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// GET /api/admin/stream  — Server-Sent Events for real-time admin updates
router.get('/stream', (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send a heartbeat immediately so the browser knows the connection is alive
  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  // Keep-alive ping every 25 seconds (prevents proxy/browser timeouts)
  const heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 25000);

  // Forward update events to this client
  const onUpdate = (payload) => {
    res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  emitter.on('update', onUpdate);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(heartbeat);
    emitter.off('update', onUpdate);
  });
});

// GET /api/admin/tests  — get all tests with submission stats
router.get('/tests', async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 }).lean();

    const testsWithStats = await Promise.all(
      tests.map(async (test) => {
        const submissions = await Submission.find({ testId: test.testId }).lean();
        const submitted = submissions.filter(s => s.status === 'Submitted').length;
        const inProgress = submissions.filter(s => s.status === 'In Progress').length;

        return {
          id: test.testId,
          _id: test._id,
          title: test.title,
          testId: test.testId,
          duration: test.duration,
          createdDate: test.createdAt,
          totalQuestions: test.questions.length,
          totalStudents: submissions.length,
          submitted,
          inProgress,
          notStarted: 0,
          questions: test.questions,
          submissions: submissions.map(s => ({
            studentId: s._id,
            name: s.studentName,
            rollNo: s.rollNo,
            status: s.status,
            language: s.language,
            answers: s.answers,
            totalTime: s.totalTime,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        };
      })
    );

    res.json({ success: true, tests: testsWithStats });
  } catch (err) {
    console.error('Error fetching tests:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tests' });
  }
});

// POST /api/admin/tests  — create a new test
router.post('/tests', async (req, res) => {
  try {
    const { testId, title, duration, questions } = req.body;

    if (!testId || !title) {
      return res.status(400).json({ success: false, error: 'testId and title are required' });
    }
    if (!questions || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one question is required' });
    }

    const mappedQuestions = questions.map((q, idx) => ({
      id: idx + 1,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty || 'Medium',
      examples: q.examples || '',
      constraints: q.constraints || '',
      starterCode: q.starterCode || '',
    }));

    const newTest = new Test({
      testId: testId.trim().toUpperCase(),
      title: title.trim(),
      duration: duration || 60,
      questions: mappedQuestions,
    });

    await newTest.save();

    const testPayload = {
      id: newTest.testId,
      testId: newTest.testId,
      title: newTest.title,
      duration: newTest.duration,
      createdDate: newTest.createdAt,
      totalQuestions: newTest.questions.length,
      totalStudents: 0,
      submitted: 0,
      inProgress: 0,
      notStarted: 0,
      questions: newTest.questions,
      submissions: [],
    };

    // 🔔 Notify admin panel in real-time about new test
    emitter.emit('update', { type: 'test_created', test: testPayload });

    res.status(201).json({ success: true, test: testPayload });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A test with this Test ID already exists' });
    }
    console.error('Error creating test:', err);
    res.status(500).json({ success: false, error: 'Failed to create test' });
  }
});

// GET /api/admin/students  — get all student submissions
router.get('/students', async (req, res) => {
  try {
    const submissions = await Submission.find().sort({ createdAt: -1 }).lean();

    const students = submissions.map(s => ({
      id: s._id,
      name: s.studentName,
      rollNo: s.rollNo,
      testId: s.testId,
      status: s.status,
      language: s.language,
      answers: s.answers,
      score: null,
      totalTime: s.totalTime,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    res.json({ success: true, students });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

module.exports = router;
