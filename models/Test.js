const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  id: { type: Number },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  // Coding fields
  examples: { type: String, default: '' },
  constraints: { type: String, default: '' },
  starterCode: { type: String, default: '' },
  // Objective (MCQ) fields
  options: [{ type: String }],
  correctOption: { type: Number }, // 0-based index of the correct option
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
  type: {
    type: String,
    enum: ['coding', 'objective'],
    default: 'coding',
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
