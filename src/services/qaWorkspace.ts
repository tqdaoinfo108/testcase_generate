import type { TestCase } from "./api";

export type Requirement = {
  id: string;
  title: string;
  statement: string;
  acceptanceCriteria: string[];
  risks: string[];
};

export type ReviewFinding = {
  severity: "High" | "Medium" | "Low";
  category: "Coverage" | "Clarity" | "Data" | "Expected result" | "Duplication" | "Risk";
  message: string;
  suggestion: string;
};

export type TestCaseReview = {
  testCaseId: string;
  score: number;
  priorityReason: string;
  riskAreas: string[];
  findings: ReviewFinding[];
};

export type TestDataItem = {
  label: string;
  category: "Valid" | "Invalid" | "Boundary" | "Empty" | "Special format";
  value: string;
  expectedOutcome: string;
};

export type TestDataSet = { testCaseId: string; items: TestDataItem[] };

export type ExecutionStatus = "Not Run" | "Pass" | "Fail" | "Blocked";

export type ExecutionRecord = {
  status: ExecutionStatus;
  actualResult: string;
  evidenceUrl: string;
  defectId: string;
  executedBy: string;
  executedAt?: string;
};

export type QaWorkspace = {
  requirements: Requirement[];
  coverage: Record<string, string[]>;
  reviews: TestCaseReview[];
  testData: TestDataSet[];
  execution: Record<string, ExecutionRecord>;
  securityTestCaseIds: string[];
  updatedAt?: string;
};

const emptyWorkspace = (): QaWorkspace => ({ requirements: [], coverage: {}, reviews: [], testData: [], execution: {}, securityTestCaseIds: [] });
const keyFor = (projectId: string) => `QA_WORKSPACE_${projectId}`;

export function loadQaWorkspace(projectId: string | null): QaWorkspace {
  if (!projectId) return emptyWorkspace();
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(projectId)) || "null") as Partial<QaWorkspace> | null;
    return {
      ...emptyWorkspace(),
      ...parsed,
      execution: parsed?.execution || {},
      coverage: parsed?.coverage || {},
      requirements: parsed?.requirements || [],
      reviews: parsed?.reviews || [],
      testData: parsed?.testData || [],
      securityTestCaseIds: parsed?.securityTestCaseIds || [],
    };
  } catch {
    return emptyWorkspace();
  }
}

export function saveQaWorkspace(projectId: string, workspace: QaWorkspace): QaWorkspace {
  const next = { ...workspace, updatedAt: new Date().toISOString() };
  localStorage.setItem(keyFor(projectId), JSON.stringify(next));
  return next;
}

export function getExecution(workspace: QaWorkspace, testCaseId: string): ExecutionRecord {
  return workspace.execution[testCaseId] || { status: "Not Run", actualResult: "", evidenceUrl: "", defectId: "", executedBy: "" };
}

export function buildCoverage(requirements: Requirement[], testCases: TestCase[], coverageMap: Record<string, string[]> = {}) {
  return requirements.map((requirement) => {
    const terms = `${requirement.title} ${requirement.statement} ${requirement.acceptanceCriteria.join(" ")}`
      .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 3);
    const inferred = testCases.filter((testCase) => {
      const text = `${testCase.title} ${testCase.description} ${testCase.preconditions} ${testCase.steps.join(" ")} ${testCase.expected_result}`.toLowerCase();
      return terms.some((term) => text.includes(term));
    });
    const matched = coverageMap[requirement.id]
      ? testCases.filter((testCase) => coverageMap[requirement.id].includes(testCase._id))
      : inferred;
    return {
      requirement,
      testCases: matched,
      positive: matched.some((item) => item.type === "Positive Flow"),
      negative: matched.some((item) => item.type === "Negative Flow"),
      edge: matched.some((item) => item.type === "Edge Case"),
    };
  });
}
