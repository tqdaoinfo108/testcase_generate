import { GoogleGenAI, Type, Schema } from "@google/genai";

console.log("GEMINI_API_KEY is:", process.env.GEMINI_API_KEY ? "Set" : "Not Set", "Length:", process.env.GEMINI_API_KEY?.length);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export async function generateTestCases(context: string, newRequirements: string): Promise<GenerateResponse> {
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
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: generateResponseSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  return JSON.parse(text) as GenerateResponse;
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
  context: string
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
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: singleTestCaseSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  return JSON.parse(text) as TestCaseData;
}

export async function regenerateTestCaseAI(
  testCase: any,
  context: string
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
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: singleTestCaseSchema,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  return JSON.parse(text) as TestCaseData;
}
