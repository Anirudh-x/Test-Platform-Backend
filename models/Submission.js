const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  questionId: { type: Number },
  questionTitle: { type: String },
  code: { type: String, default: '' },
  language: { type: String, default: 'python' },
  timeSpent: { type: Number, default: 0 }, // seconds
}, { _id: false });

const SubmissionSchema = new mongoose.Schema({
  studentName: {
    type: String,
    required: true,
    trim: true,
  },
  rollNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  testId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  status: {
    type: String,
    enum: ['In Progress', 'Submitted', 'Cancelled'],
    default: 'In Progress',
  },
  language: {
    type: String,
    default: 'python',
  },
  answers: [AnswerSchema],
  totalTime: {
    type: Number,
    default: 0, // seconds
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Composite unique index: one student can only submit once per test
SubmissionSchema.index({ rollNo: 1, testId: 1 }, { unique: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
