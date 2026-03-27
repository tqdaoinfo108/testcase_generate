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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const buildApiUrl = (path: string) => `${API_BASE_URL}${path}`;

export const api = {
  parseError: async (res: Response, fallback: string): Promise<string> => {
    try {
      const data = await res.json();
      if (data && typeof data.error === "string" && data.error.trim()) {
        return data.error;
      }
    } catch {
      // Ignore JSON parse failures and use fallback.
    }
    return fallback;
  },

  // Projects
  getProjects: async (): Promise<Project[]> => {
    const res = await fetch(buildApiUrl("/api/projects"));
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
  },
  createProject: async (name: string): Promise<Project> => {
    const res = await fetch(buildApiUrl("/api/projects"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create project");
    return res.json();
  },
  updateProject: async (id: string, name: string, context: string): Promise<Project> => {
    const res = await fetch(buildApiUrl(`/api/projects/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, context }),
    });
    if (!res.ok) throw new Error("Failed to update project");
    return res.json();
  },
  deleteProject: async (id: string): Promise<void> => {
    const res = await fetch(buildApiUrl(`/api/projects/${id}`), { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete project");
  },

  // Test Cases
  getTestCases: async (projectId: string): Promise<TestCase[]> => {
    const res = await fetch(buildApiUrl(`/api/projects/${projectId}/testcases`));
    if (!res.ok) throw new Error("Failed to fetch test cases");
    return res.json();
  },
  generateTestCases: async (projectId: string, newRequirements: string): Promise<{ testCases: TestCase[], updatedContext: string }> => {
    const res = await fetch(buildApiUrl(`/api/projects/${projectId}/testcases/generate`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newRequirements }),
    });
    if (!res.ok) {
      const message = await api.parseError(res, "Failed to generate test cases");
      throw new Error(message);
    }
    return res.json();
  },
  smartEditTestCase: async (id: string, newTitle: string, newDescription: string): Promise<TestCase> => {
    const res = await fetch(buildApiUrl(`/api/testcases/${id}/smart-edit`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newTitle, newDescription }),
    });
    if (!res.ok) throw new Error("Failed to smart edit test case");
    return res.json();
  },
  regenerateTestCase: async (id: string): Promise<TestCase> => {
    const res = await fetch(buildApiUrl(`/api/testcases/${id}/regenerate`), { method: "PUT" });
    if (!res.ok) throw new Error("Failed to regenerate test case");
    return res.json();
  },
  deleteTestCase: async (id: string): Promise<void> => {
    const res = await fetch(buildApiUrl(`/api/testcases/${id}`), { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete test case");
  },
};
