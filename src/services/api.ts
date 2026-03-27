export type Project = {
  _id: string;
  name: string;
  context: string;
  createdAt: string;
};

export type TestCase = {
  _id: string;
  projectId: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string[];
  expected_result: string;
  type: "Positive Flow" | "Negative Flow" | "Edge Case";
  priority: "High" | "Medium" | "Low";
  createdAt: string;
};

import { generateTestCases, updateTestCaseAI, regenerateTestCaseAI } from "./aiService";

const BASEROW_API_KEY = "KUOAepR6iaz2YwJ1J9E9Sxv0f26Mf1Ns";
const PROJECTS_TABLE_ID = "905209";
const TESTCASES_TABLE_ID = "905210";

const getHeaders = () => ({
  "Authorization": `Token ${BASEROW_API_KEY}`,
  "Content-Type": "application/json"
});

export const api = {
  // Projects
  getProjects: async (): Promise<Project[]> => {
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${PROJECTS_TABLE_ID}/?user_field_names=true`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch projects");
    const data = await res.json();
    return data.results.map((row: any) => ({
      _id: row.id.toString(),
      name: row.name || "",
      context: row.context || "",
      createdAt: row.createdAt || new Date().toISOString(),
    }));
  },
  createProject: async (name: string): Promise<Project> => {
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${PROJECTS_TABLE_ID}/?user_field_names=true`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, context: "", createdAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error("Failed to create project");
    const row = await res.json();
    return {
      _id: row.id.toString(),
      name: row.name || "",
      context: row.context || "",
      createdAt: row.createdAt || new Date().toISOString(),
    };
  },
  updateProject: async (id: string, name: string, context: string): Promise<Project> => {
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${PROJECTS_TABLE_ID}/${id}/?user_field_names=true`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ name, context }),
    });
    if (!res.ok) throw new Error("Failed to update project");
    const row = await res.json();
    return {
      _id: row.id.toString(),
      name: row.name || "",
      context: row.context || "",
      createdAt: row.createdAt || new Date().toISOString(),
    };
  },
  deleteProject: async (id: string): Promise<void> => {
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${PROJECTS_TABLE_ID}/${id}/`, { method: "DELETE", headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to delete project");
    
    // Delete associated test cases
    try {
      const testCases = await api.getTestCases(id);
      for (const tc of testCases) {
        await api.deleteTestCase(tc._id);
      }
    } catch (e) {
      console.error("Failed to delete associated test cases", e);
    }
  },

  // Test Cases
  getTestCases: async (projectId: string): Promise<TestCase[]> => {
    // Using filter to get test cases for the project
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/?user_field_names=true&filter__projectId__equal=${projectId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch test cases");
    const data = await res.json();
    return data.results.map((row: any) => ({
      _id: row.id.toString(),
      projectId: row.projectId || "",
      title: row.title || "",
      description: row.description || "",
      preconditions: row.preconditions || "",
      steps: row.steps ? JSON.parse(row.steps) : [],
      expected_result: row.expected_result || "",
      type: row.type?.value || "Positive Flow",
      priority: row.priority?.value || "Medium",
      createdAt: row.createdAt || new Date().toISOString(),
    }));
  },
  generateTestCases: async (projectId: string, newRequirements: string): Promise<{ testCases: TestCase[], updatedContext: string }> => {
    // 1. Get project context
    const projects = await api.getProjects();
    const project = projects.find(p => p._id === projectId);
    if (!project) throw new Error("Project not found");

    // 2. Generate test cases using AI
    const { testCases, summarizedRequirements } = await generateTestCases(project.context, newRequirements);
    
    // 3. Save test cases to Baserow
    const savedTestCases: TestCase[] = [];
    for (const tc of testCases) {
      const res = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/?user_field_names=true`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          projectId,
          title: tc.title,
          description: tc.description,
          preconditions: tc.preconditions,
          steps: JSON.stringify(tc.steps),
          expected_result: tc.expected_result,
          type: tc.type,
          priority: tc.priority,
          createdAt: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const row = await res.json();
        savedTestCases.push({
          _id: row.id.toString(),
          projectId: row.projectId || "",
          title: row.title || "",
          description: row.description || "",
          preconditions: row.preconditions || "",
          steps: row.steps ? JSON.parse(row.steps) : [],
          expected_result: row.expected_result || "",
          type: row.type?.value || "Positive Flow",
          priority: row.priority?.value || "Medium",
          createdAt: row.createdAt || new Date().toISOString(),
        });
      }
    }

    // 4. Update project context
    const updatedContext = project.context ? `${project.context}\n\n### New Requirements Summary\n${summarizedRequirements}` : summarizedRequirements;
    await api.updateProject(projectId, project.name, updatedContext);

    return { testCases: savedTestCases, updatedContext };
  },
  smartEditTestCase: async (id: string, newTitle: string, newDescription: string): Promise<TestCase> => {
    // 1. Get existing test case
    const resGet = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, { headers: getHeaders() });
    if (!resGet.ok) throw new Error("Failed to fetch test case");
    const row = await resGet.json();
    const existingTestCase = {
      title: row.title || "",
      description: row.description || "",
      preconditions: row.preconditions || "",
      steps: row.steps ? JSON.parse(row.steps) : [],
      expected_result: row.expected_result || "",
      type: row.type?.value || "Positive Flow",
      priority: row.priority?.value || "Medium",
    };

    // 1.5 Get project context
    const projects = await api.getProjects();
    const project = projects.find(p => p._id === row.projectId);
    const context = project?.context || "";

    // 2. AI update
    const updatedData = await updateTestCaseAI(existingTestCase as any, newTitle, newDescription, context);

    // 3. Save to Baserow
    const resUpdate = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({
        title: updatedData.title,
        description: updatedData.description,
        preconditions: updatedData.preconditions,
        steps: JSON.stringify(updatedData.steps),
        expected_result: updatedData.expected_result,
        type: updatedData.type,
        priority: updatedData.priority,
      }),
    });
    if (!resUpdate.ok) throw new Error("Failed to update test case");
    const updatedRow = await resUpdate.json();
    return {
      _id: updatedRow.id.toString(),
      projectId: updatedRow.projectId || "",
      title: updatedRow.title || "",
      description: updatedRow.description || "",
      preconditions: updatedRow.preconditions || "",
      steps: updatedRow.steps ? JSON.parse(updatedRow.steps) : [],
      expected_result: updatedRow.expected_result || "",
      type: updatedRow.type?.value || "Positive Flow",
      priority: updatedRow.priority?.value || "Medium",
      createdAt: updatedRow.createdAt || new Date().toISOString(),
    };
  },
  regenerateTestCase: async (id: string): Promise<TestCase> => {
    // 1. Get existing test case
    const resGet = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, { headers: getHeaders() });
    if (!resGet.ok) throw new Error("Failed to fetch test case");
    const row = await resGet.json();
    const existingTestCase = {
      title: row.title || "",
      description: row.description || "",
      preconditions: row.preconditions || "",
      steps: row.steps ? JSON.parse(row.steps) : [],
      expected_result: row.expected_result || "",
      type: row.type?.value || "Positive Flow",
      priority: row.priority?.value || "Medium",
    };

    // 1.5 Get project context
    const projects = await api.getProjects();
    const project = projects.find(p => p._id === row.projectId);
    const context = project?.context || "";

    // 2. AI regenerate
    const updatedData = await regenerateTestCaseAI(existingTestCase as any, context);

    // 3. Save to Baserow
    const resUpdate = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({
        title: updatedData.title,
        description: updatedData.description,
        preconditions: updatedData.preconditions,
        steps: JSON.stringify(updatedData.steps),
        expected_result: updatedData.expected_result,
        type: updatedData.type,
        priority: updatedData.priority,
      }),
    });
    if (!resUpdate.ok) throw new Error("Failed to update test case");
    const updatedRow = await resUpdate.json();
    return {
      _id: updatedRow.id.toString(),
      projectId: updatedRow.projectId || "",
      title: updatedRow.title || "",
      description: updatedRow.description || "",
      preconditions: updatedRow.preconditions || "",
      steps: updatedRow.steps ? JSON.parse(updatedRow.steps) : [],
      expected_result: updatedRow.expected_result || "",
      type: updatedRow.type?.value || "Positive Flow",
      priority: updatedRow.priority?.value || "Medium",
      createdAt: updatedRow.createdAt || new Date().toISOString(),
    };
  },
  deleteTestCase: async (id: string): Promise<void> => {
    const res = await fetch(`https://api.baserow.io/api/database/rows/table/${TESTCASES_TABLE_ID}/${id}/`, { method: "DELETE", headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to delete test case");
  },
};
