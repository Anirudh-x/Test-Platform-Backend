const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  id: { type: Number },
  title: { type: String, required: true },
  description: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  examples: { type: String, default: '' },
  constraints: { type: String, default: '' },
  starterCode: { type: String, default: '' },
}, { _id: false });

const TestSchema = new mongoose.Schema({
  testId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  duration: {
    type: Number,
    default: 60, // minutes
  },
  questions: [QuestionSchema],
}, {
  timestamps: true,
});

module.exports = mongoose.model('Test', TestSchema);
