import { GoogleGenAI, Type, Schema } from "@google/genai";

const apiKeyFromVite = typeof import.meta !== "undefined" ? import.meta.env?.VITE_GEMINI_API_KEY : undefined;
const apiKeyFromNode = typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined;
const GEMINI_API_KEY = apiKeyFromVite || apiKeyFromNode || "";

if (!GEMINI_API_KEY) {
  console.warn("Gemini API key is missing. Set VITE_GEMINI_API_KEY (frontend build) or GEMINI_API_KEY (server).");
}

const GEMINI_MODEL = "gemini-2.5-flash";
const NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "google/gemma-4-31b-it";

export type AiProvider = "gemini" | "nvidia";

export type AiProviderConfig = {
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
};

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
  const provider = providerConfig.provider || "gemini";

  if (provider === "nvidia") {
    if (!providerConfig.apiKey?.trim()) {
      throw new Error("NVIDIA API key is required.");
    }

    const response = await fetch(NVIDIA_INVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey.trim()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
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
