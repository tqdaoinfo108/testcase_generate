import { GoogleGenAI, Type, Schema } from "@google/genai";
import type { Requirement, TestCaseReview, TestDataSet } from "./qaWorkspace";

const apiKeyFromVite = typeof import.meta !== "undefined" ? import.meta.env?.VITE_GEMINI_API_KEY : undefined;
const apiKeyFromNode = typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined;
const GEMINI_API_KEY = apiKeyFromVite || apiKeyFromNode || "";

const GEMINI_MODEL = "gemini-2.5-flash";
const API_BASE_URL = typeof import.meta !== "undefined" ? (import.meta.env?.VITE_API_BASE_URL || "") : "";
const NVIDIA_INVOKE_URL = `${API_BASE_URL}/api/nvidia/chat/completions`;
const NVIDIA_MODEL = "google/gemma-4-31b-it";

export type AiProvider = "gemini" | "nvidia";

export type AiProviderConfig = {
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
};

const DEFAULT_AI_PROVIDER: AiProvider = "gemini";

export type TestCaseData = {
  title: string;
  description: string;
  preconditions: string;
  steps: string[];
  expected_result: string;
  type: "Positive Flow" | "Negative Flow" | "Edge Case";
  priority: "High" | "Medium" | "Low";
};

export type GenerateResponse = {
  testCases: TestCaseData[];
  summarizedRequirements: string;
};

export type RequirementAnalysis = { requirements: Requirement[]; clarificationQuestions: string[] };

const priorityGuidance = `
Priority assessment (required): assign exactly one priority based on the impact if the scenario fails and its likelihood of occurring.
- High: blocks a critical user journey, causes data loss/security/privacy risk, payment/authentication failure, or has no practical workaround.
- Medium: affects an important feature with a reasonable workaround and limited business impact.
- Low: cosmetic, minor usability, or rare edge behavior with minimal impact.
Evaluate priority independently for every test case; do not default all cases to the same value.`;

function parseJsonResponse(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

async function generateJson(
  prompt: string,
  responseSchema: Schema,
  temperature: number,
  providerConfig: AiProviderConfig = {},
): Promise<unknown> {
  const provider = providerConfig.provider || DEFAULT_AI_PROVIDER;

  if (provider === "nvidia") {
    const apiKey = providerConfig.apiKey?.trim();

    const response = await fetch(NVIDIA_INVOKE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Nvidia-Api-Key": apiKey } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: `${prompt}\n\nReturn only valid JSON. Do not use Markdown code fences.` }],
        model: providerConfig.model?.trim() || NVIDIA_MODEL,
        chat_template_kwargs: { enable_thinking: true },
        max_tokens: 16384,
        stream: false,
        temperature,
        top_p: 0.95,
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`NVIDIA API request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from NVIDIA API.");
    return parseJsonResponse(content);
  }

  const gemini = new GoogleGenAI({ apiKey: providerConfig.apiKey?.trim() || GEMINI_API_KEY });
  const response = await gemini.models.generateContent({
    model: providerConfig.model?.trim() || GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema, temperature },
  });
  if (!response.text) throw new Error("No response from Gemini API.");
  return parseJsonResponse(response.text);
}

const testCaseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "A concise, action-oriented title (e.g., 'Verify successful login with valid credentials')" },
      description: { type: Type.STRING },
      preconditions: { type: Type.STRING },
      steps: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      expected_result: { type: Type.STRING },
      type: {
        type: Type.STRING,
        enum: ["Positive Flow", "Negative Flow", "Edge Case"],
      },
      priority: {
        type: Type.STRING,
        enum: ["High", "Medium", "Low"],
      },
    },
    required: [
      "title",
      "description",
      "preconditions",
      "steps",
      "expected_result",
      "type",
      "priority",
    ],
  },
};

const generateResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    testCases: testCaseSchema,
    summarizedRequirements: {
      type: Type.STRING,
      description: "A concise markdown summary of the new requirements. This will be appended to the project context to keep track of the project's evolution.",
    },
  },
  required: ["testCases", "summarizedRequirements"],
};

export async function generateTestCases(context: string, newRequirements: string, providerConfig?: AiProviderConfig): Promise<GenerateResponse> {
  const prompt = `
You are a Senior QA Engineer.
Analyze the given Product Context and New Requirements to generate a comprehensive set of test cases.
Also, provide a concise markdown summary of the New Requirements.

Product Context (Markdown):
${context}

New Requirements to add test cases for:
${newRequirements}

Cover:
- Positive flows
- Negative flows
- Edge cases
- UI behavior
- State transitions

Guidelines:
- **Title**: MUST be extremely concise (under 10 words), action-oriented, and clearly state the scenario being tested (e.g., "Verify successful login with valid credentials"). Do not use generic titles like "Test Case 1".
- Group test cases logically by feature.
- Use clear, concise, and professional QA language.
- Avoid duplication with existing context.
${priorityGuidance}
  `;
  return await generateJson(prompt, generateResponseSchema, 0.2, providerConfig) as GenerateResponse;
}

const singleTestCaseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    preconditions: { type: Type.STRING },
    steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    expected_result: { type: Type.STRING },
    type: {
      type: Type.STRING,
      enum: ["Positive Flow", "Negative Flow", "Edge Case"],
    },
    priority: {
      type: Type.STRING,
      enum: ["High", "Medium", "Low"],
    },
  },
  required: [
    "title",
    "description",
    "preconditions",
    "steps",
    "expected_result",
    "type",
    "priority",
  ],
};

const requirementSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING }, title: { type: Type.STRING }, statement: { type: Type.STRING },
    acceptanceCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
    risks: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["id", "title", "statement", "acceptanceCriteria", "risks"],
};

const requirementAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    requirements: { type: Type.ARRAY, items: requirementSchema },
    clarificationQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["requirements", "clarificationQuestions"],
};

const reviewSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    testCaseId: { type: Type.STRING }, score: { type: Type.NUMBER }, priorityReason: { type: Type.STRING },
    riskAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          severity: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
          category: { type: Type.STRING, enum: ["Coverage", "Clarity", "Data", "Expected result", "Duplication", "Risk"] },
          message: { type: Type.STRING }, suggestion: { type: Type.STRING },
        }, required: ["severity", "category", "message", "suggestion"],
      },
    },
  }, required: ["testCaseId", "score", "priorityReason", "riskAreas", "findings"],
};

const qaReviewSchema: Schema = { type: Type.OBJECT, properties: { reviews: { type: Type.ARRAY, items: reviewSchema } }, required: ["reviews"] };

const coverageSchema: Schema = { type: Type.OBJECT, properties: { coverage: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
  requirementId: { type: Type.STRING }, testCaseIds: { type: Type.ARRAY, items: { type: Type.STRING } },
}, required: ["requirementId", "testCaseIds"] } } }, required: ["coverage"] };

const testDataSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    testCaseId: { type: Type.STRING },
    items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      label: { type: Type.STRING }, category: { type: Type.STRING, enum: ["Valid", "Invalid", "Boundary", "Empty", "Special format"] },
      value: { type: Type.STRING }, expectedOutcome: { type: Type.STRING },
    }, required: ["label", "category", "value", "expectedOutcome"] } },
  }, required: ["testCaseId", "items"],
};

export async function analyzeRequirements(context: string, requirements: string, providerConfig?: AiProviderConfig): Promise<RequirementAnalysis> {
  const prompt = `You are a senior QA analyst. Convert the following product context and requirements into atomic, testable requirements. Use stable IDs REQ-01, REQ-02, etc. Acceptance criteria must be observable. Identify only genuine ambiguities as clarification questions.\n\nProduct context:\n${context}\n\nRequirements:\n${requirements}`;
  return await generateJson(prompt, requirementAnalysisSchema, 0.1, providerConfig) as RequirementAnalysis;
}

export async function reviewTestCases(requirements: Requirement[], testCases: Array<{ _id: string; title: string; description: string; preconditions: string; steps: string[]; expected_result: string; type: string; priority: string }>, providerConfig?: AiProviderConfig): Promise<TestCaseReview[]> {
  const prompt = `You are a QA lead reviewing a test suite. Review every test case below against the requirements. Score 0-100 for completeness and testability. Report only actionable findings. Check duplication, unclear steps, missing test data, unobservable expected results, coverage gaps, and risk. Reassess each priority and explain the reason.\n\nRequirements:\n${JSON.stringify(requirements)}\n\nTest cases:\n${JSON.stringify(testCases)}`;
  const result = await generateJson(prompt, qaReviewSchema, 0.1, providerConfig) as { reviews: TestCaseReview[] };
  return result.reviews;
}

export async function mapTestCoverage(requirements: Requirement[], testCases: Array<{ _id: string; title: string; description: string; preconditions: string; steps: string[]; expected_result: string }>, providerConfig?: AiProviderConfig): Promise<Record<string, string[]>> {
  const prompt = `You are a QA lead. Create a strict requirement-to-testcase traceability map. Link a testcase only when it meaningfully verifies the requirement or one of its acceptance criteria. Do not infer links from matching words alone. Include every requirement, using an empty array when no testcase covers it.\n\nRequirements:\n${JSON.stringify(requirements)}\n\nTest cases:\n${JSON.stringify(testCases)}`;
  const result = await generateJson(prompt, coverageSchema, 0.1, providerConfig) as { coverage: Array<{ requirementId: string; testCaseIds: string[] }> };
  return Object.fromEntries(result.coverage.map((item) => [item.requirementId, item.testCaseIds]));
}

export async function generateTestData(testCase: { _id: string; title: string; description: string; preconditions: string; steps: string[]; expected_result: string }, providerConfig?: AiProviderConfig): Promise<TestDataSet> {
  const prompt = `You are a QA test-data specialist. Create a practical, safe test-data set for this test case. Include valid, invalid, boundary, empty, and special-format data only when relevant. Do not use real personal, payment, or secret data. Make each expected outcome directly testable.\n\nTest case:\n${JSON.stringify(testCase)}`;
  return await generateJson(prompt, testDataSchema, 0.15, providerConfig) as TestDataSet;
}

export async function generateSecurityTestCases(context: string, requirements: string, providerConfig?: AiProviderConfig): Promise<TestCaseData[]> {
  const prompt = `You are an application security QA specialist. Create authorized, defensive test cases for the supplied product context and requirements. Cover only relevant areas: authentication, authorization, sessions, input validation, error handling, API protection, and business logic. Keep payloads benign and describe safe test data rather than exploit instructions. Each test case must be actionable and include priority.\n\nProduct context:\n${context}\n\nRequirements:\n${requirements}\n${priorityGuidance}`;
  return await generateJson(prompt, testCaseSchema, 0.15, providerConfig) as TestCaseData[];
}

export async function updateTestCaseAI(
  testCase: any,
  newTitle: string,
  newDescription: string,
  context: string,
  providerConfig?: AiProviderConfig,
): Promise<TestCaseData> {
  const prompt = `
You are a Senior QA Engineer.
A user has updated the title and/or description of a test case.
You need to intelligently update the test steps and the expected result to match the new title and description, while keeping the context of the original product requirements.

Product Context:
${context}

Original Test Case:
${JSON.stringify(testCase, null, 2)}

New Title: ${newTitle}
New Description: ${newDescription}

Return the updated test case as a JSON object matching the schema.
${priorityGuidance}
  `;
  return await generateJson(prompt, singleTestCaseSchema, 0.2, providerConfig) as TestCaseData;
}

export async function regenerateTestCaseAI(
  testCase: any,
  context: string,
  providerConfig?: AiProviderConfig,
): Promise<TestCaseData> {
  const prompt = `
You are a Senior QA Engineer.
A user has requested to regenerate a specific test case.
Please provide a new, improved version of this test case based on the product context. Make sure it covers the same general area but perhaps with better steps, clearer expected results, or more comprehensive preconditions.

Product Context:
${context}

Original Test Case to Regenerate:
${JSON.stringify(testCase, null, 2)}

Return the newly regenerated test case as a JSON object matching the schema.
${priorityGuidance}
  `;
  return await generateJson(prompt, singleTestCaseSchema, 0.4, providerConfig) as TestCaseData;
}
