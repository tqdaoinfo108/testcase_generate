import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import path from "path";
import { Project } from "./src/models/Project.js";
import { TestCaseModel } from "./src/models/TestCase.js";
import { generateTestCases, updateTestCaseAI, regenerateTestCaseAI } from "./src/services/aiService.js";

const MONGO_URI = "mongodb+srv://daotq:100897@testcase.x5m996z.mongodb.net/?appName=testcase";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Connect to MongoDB
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }

  app.get("/api/env-check", (req, res) => {
    res.json({
      geminiKey: process.env.GEMINI_API_KEY,
      apiKey: process.env.API_KEY
    });
  });

  // API Routes

  // Projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await Project.find().sort({ createdAt: -1 });
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { name } = req.body;
      const project = new Project({ name });
      await project.save();
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const { name, context } = req.body;
      const project = await Project.findByIdAndUpdate(
        req.params.id,
        { $set: { name, context } },
        { new: true }
      );
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await Project.findByIdAndDelete(req.params.id);
      await TestCaseModel.deleteMany({ projectId: req.params.id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Test Cases
  app.get("/api/projects/:id/testcases", async (req, res) => {
    try {
      const testCases = await TestCaseModel.find({ projectId: req.params.id }).sort({ createdAt: -1 });
      res.json(testCases);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch test cases" });
    }
  });

  app.post("/api/projects/:id/testcases/generate", async (req, res) => {
    try {
      const { newRequirements } = req.body;
      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { testCases, summarizedRequirements } = await generateTestCases(project.context, newRequirements);
      
      const testCasesToSave = testCases.map(tc => ({
        ...tc,
        projectId: project._id
      }));

      const savedTestCases = await TestCaseModel.insertMany(testCasesToSave);
      
      // Optionally update project context by appending summarized requirements
      project.context = project.context ? `${project.context}\n\n### New Requirements Summary\n${summarizedRequirements}` : summarizedRequirements;
      await project.save();

      res.json({ testCases: savedTestCases, updatedContext: project.context });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to generate test cases";
      res.status(500).json({ error: message });
    }
  });

  app.put("/api/testcases/:id/smart-edit", async (req, res) => {
    try {
      const { newTitle, newDescription } = req.body;
      const testCase = await TestCaseModel.findById(req.params.id);
      if (!testCase) return res.status(404).json({ error: "Test case not found" });

      const project = await Project.findById(testCase.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const updatedData = await updateTestCaseAI(testCase, newTitle, newDescription, project.context);
      
      const updatedTestCase = await TestCaseModel.findByIdAndUpdate(
        req.params.id,
        { $set: updatedData },
        { new: true }
      );

      res.json(updatedTestCase);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to smart edit test case" });
    }
  });

  app.put("/api/testcases/:id/regenerate", async (req, res) => {
    try {
      const testCase = await TestCaseModel.findById(req.params.id);
      if (!testCase) return res.status(404).json({ error: "Test case not found" });

      const project = await Project.findById(testCase.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const regeneratedData = await regenerateTestCaseAI(testCase, project.context);
      
      const updatedTestCase = await TestCaseModel.findByIdAndUpdate(
        req.params.id,
        { $set: regeneratedData },
        { new: true }
      );

      res.json(updatedTestCase);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to regenerate test case" });
    }
  });

  app.delete("/api/testcases/:id", async (req, res) => {
    try {
      await TestCaseModel.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete test case" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
