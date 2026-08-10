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

import { analyzeRequirements, generateSecurityTestCases, generateTestCases, updateTestCaseAI, regenerateTestCaseAI, type AiProviderConfig, type TestCaseData } from "./aiService";
import type { Requirement } from "./qaWorkspace";
import { BASEROW_CONFIG, baserowDate, baserowHeaders, loadQaProfile } from "./qaBaserow";

const BASEROW_URL = BASEROW_CONFIG.baseUrl;
const PROJECTS_TABLE_ID = "905209";
const TESTCASES_TABLE_ID = "905210";

const getHeaders = baserowHeaders;
const withQaProfile = async (projectId: string, context: string) => {
  const profile = await loadQaProfile(projectId);
  return profile ? `${context}\n\nQA PROJECT PROFILE:\n${Object.entries(profile).filter(([key, value]) => !["id", "projectId", "updatedAt"].includes(key) && value).map(([key, value]) => `${key}: ${value}`).join("\n")}` : context;
};

const toTestCase = (row: any, projectId = ""): TestCase => ({
  _id: row.id.toString(), projectId: row.projectId || projectId, title: row.title || "", description: row.description || "",
  preconditions: row.preconditions || "", steps: row.steps ? JSON.parse(row.steps) : [], expected_result: row.expected_result || "",
  type: row.type?.value || "Positive Flow", priority: row.priority?.value || "Medium", createdAt: row.createdAt || new Date().toISOString(),
});

async function saveGeneratedTestCases(projectId: string, testCases: TestCaseData[]): Promise<TestCase[]> {
  const saved: TestCase[] = [];
  for (const testCase of testCases) {
    const res = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/?user_field_names=true`, {
      method: "POST", headers: getHeaders(), body: JSON.stringify({ projectId, title: testCase.title, description: testCase.description,
        preconditions: testCase.preconditions, steps: JSON.stringify(testCase.steps), expected_result: testCase.expected_result,
        type: testCase.type, priority: testCase.priority, createdAt: baserowDate() }),
    });
    if (!res.ok) throw new Error("Failed to save generated test case");
    saved.push(toTestCase(await res.json(), projectId));
  }
  return saved;
}

export const api = {
  // Projects
  getProjects: async (): Promise<Project[]> => {
    const res = await fetch(`${BASEROW_URL}/${PROJECTS_TABLE_ID}/?user_field_names=true`, { headers: getHeaders() });
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
    const res = await fetch(`${BASEROW_URL}/${PROJECTS_TABLE_ID}/?user_field_names=true`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, context: "", createdAt: baserowDate() }),
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
    const res = await fetch(`${BASEROW_URL}/${PROJECTS_TABLE_ID}/${id}/?user_field_names=true`, {
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
    const res = await fetch(`${BASEROW_URL}/${PROJECTS_TABLE_ID}/${id}/`, { method: "DELETE", headers: getHeaders() });
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
    const res = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/?user_field_names=true&filter__projectId__equal=${projectId}`, { headers: getHeaders() });
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
  generateTestCases: async (projectId: string, newRequirements: string, providerConfig?: AiProviderConfig): Promise<{ testCases: TestCase[], updatedContext: string }> => {
    // 1. Get project context
    const projects = await api.getProjects();
    const project = projects.find(p => p._id === projectId);
    if (!project) throw new Error("Project not found");

    // 2. Generate test cases using AI
    const { testCases, summarizedRequirements } = await generateTestCases(await withQaProfile(projectId, project.context), newRequirements, providerConfig);
    
    // 3. Save test cases to Baserow
    const savedTestCases = await saveGeneratedTestCases(projectId, testCases);

    // 4. Update project context
    const updatedContext = project.context ? `${project.context}\n\n### New Requirements Summary\n${summarizedRequirements}` : summarizedRequirements;
    await api.updateProject(projectId, project.name, updatedContext);

    return { testCases: savedTestCases, updatedContext };
  },
  analyzeRequirements: async (projectId: string, requirements: string, providerConfig?: AiProviderConfig): Promise<Requirement[]> => {
    const project = (await api.getProjects()).find((item) => item._id === projectId);
    if (!project) throw new Error("Project not found");
    return (await analyzeRequirements(await withQaProfile(projectId, project.context), requirements, providerConfig)).requirements;
  },
  generateSecurityTestCases: async (projectId: string, requirements: string, providerConfig?: AiProviderConfig): Promise<TestCase[]> => {
    const project = (await api.getProjects()).find((item) => item._id === projectId);
    if (!project) throw new Error("Project not found");
    const generated = await generateSecurityTestCases(await withQaProfile(projectId, project.context), requirements, providerConfig);
    return saveGeneratedTestCases(projectId, generated);
  },
  smartEditTestCase: async (id: string, newTitle: string, newDescription: string, providerConfig?: AiProviderConfig): Promise<TestCase> => {
    // 1. Get existing test case
    const resGet = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, { headers: getHeaders() });
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
    const context = await withQaProfile(row.projectId, project?.context || "");

    // 2. AI update
    const updatedData = await updateTestCaseAI(existingTestCase as any, newTitle, newDescription, context, providerConfig);

    // 3. Save to Baserow
    const resUpdate = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, {
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
  regenerateTestCase: async (id: string, providerConfig?: AiProviderConfig): Promise<TestCase> => {
    // 1. Get existing test case
    const resGet = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, { headers: getHeaders() });
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
    const context = await withQaProfile(row.projectId, project?.context || "");

    // 2. AI regenerate
    const updatedData = await regenerateTestCaseAI(existingTestCase as any, context, providerConfig);

    // 3. Save to Baserow
    const resUpdate = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/${id}/?user_field_names=true`, {
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
    const res = await fetch(`${BASEROW_URL}/${TESTCASES_TABLE_ID}/${id}/`, { method: "DELETE", headers: getHeaders() });
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail || data?.error || "";
      } catch {
        try {
          detail = await res.text();
        } catch {
          detail = "";
        }
      }

      const message = detail
        ? `Failed to delete test case: ${detail}`
        : `Failed to delete test case (HTTP ${res.status})`;
      throw new Error(message);
    }
  },
};
