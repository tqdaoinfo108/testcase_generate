import { GoogleGenAI, Type, Schema } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: 'AIzaSyDNr3k4EN_UHMEdNNMoVIeN_q5Url09wmg' });

export type TestCase = {
  id: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string[];
  expected_result: string;
  type: "Positive Flow" | "Negative Flow" | "Edge Case";
  priority: "High" | "Medium" | "Low";
};

const testCaseSchema: Schema = {
  type: Type.ARRAY,
  items: {
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
  },
};

export async function generateTestCases(requirements: string): Promise<TestCase[]> {
  const prompt = `
You are a Senior QA Engineer.
Analyze the given Product Requirements and generate a comprehensive set of test cases.

Cover:
- Positive flows
- Negative flows
- Edge cases
- UI behavior
- State transitions

Group test cases logically by feature.
Use clear, concise, and professional QA language.
Avoid duplication.

Product Requirements:
${requirements}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: testCaseSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  const parsed = JSON.parse(text) as Omit<TestCase, "id">[];
  return parsed.map((tc) => ({
    ...tc,
    id: crypto.randomUUID(),
  }));
}

export async function regenerateTestCase(
  testCase: TestCase,
  requirements: string
): Promise<TestCase> {
  const prompt = `
You are a Senior QA Engineer.
A user has requested to regenerate a specific test case.
Please provide a new, improved version of this test case based on the product requirements. Make sure it covers the same general area but perhaps with better steps, clearer expected results, or more comprehensive preconditions.

Product Requirements:
${requirements}

Original Test Case to Regenerate:
${JSON.stringify(testCase, null, 2)}

Return the newly regenerated test case as a JSON object matching the schema.
  `;

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

  const parsed = JSON.parse(text) as Omit<TestCase, "id">;
  return {
    ...parsed,
    id: testCase.id,
  };
}

export async function updateTestCase(
  testCase: TestCase,
  newTitle: string,
  newDescription: string,
  requirements: string
): Promise<TestCase> {
  const prompt = `
You are a Senior QA Engineer.
A user has updated the title and/or description of a test case.
You need to intelligently update the test steps and the expected result to match the new title and description, while keeping the context of the original product requirements.

Product Requirements:
${requirements}

Original Test Case:
${JSON.stringify(testCase, null, 2)}

New Title: ${newTitle}
New Description: ${newDescription}

Return the updated test case as a JSON object matching the schema.
  `;

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

  const parsed = JSON.parse(text) as Omit<TestCase, "id">;
  return {
    ...parsed,
    id: testCase.id,
  };
}
