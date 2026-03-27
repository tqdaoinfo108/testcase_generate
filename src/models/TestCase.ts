import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  preconditions: { type: String, required: true },
  steps: [{ type: String }],
  expected_result: { type: String, required: true },
  type: { type: String, enum: ["Positive Flow", "Negative Flow", "Edge Case"], required: true },
  priority: { type: String, enum: ["High", "Medium", "Low"], required: true },
  createdAt: { type: Date, default: Date.now }
});

export const TestCaseModel = mongoose.model('TestCase', testCaseSchema);
