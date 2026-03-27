import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  context: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export const Project = mongoose.model('Project', projectSchema);
