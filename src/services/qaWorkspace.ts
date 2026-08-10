import type { TestCase } from "./api";
import { baserowDate, createQaRow, deleteQaRow, listQaRows, updateQaRow } from "./qaBaserow";

export type Requirement = { rowId?: number; id: string; title: string; statement: string; acceptanceCriteria: string[]; risks: string[]; source?: string; status?: string };
export type ReviewFinding = { severity: "High" | "Medium" | "Low"; category: "Coverage" | "Clarity" | "Data" | "Expected result" | "Duplication" | "Risk"; message: string; suggestion: string };
export type TestCaseReview = { rowId?: number; testCaseId: string; score: number; priorityReason: string; riskAreas: string[]; findings: ReviewFinding[]; reviewStatus?: string };
export type TestDataItem = { label: string; category: "Valid" | "Invalid" | "Boundary" | "Empty" | "Special format"; value: string; expectedOutcome: string };
export type TestDataSet = { rowId?: number; testCaseId: string; items: TestDataItem[] };
export type ExecutionStatus = "Not Run" | "Pass" | "Fail" | "Blocked";
export type ExecutionRecord = { rowId?: number; status: ExecutionStatus; actualResult: string; evidenceUrl: string; defectId: string; executedBy: string; executedAt?: string };
export type QaWorkspace = { requirements: Requirement[]; coverage: Record<string, string[]>; reviews: TestCaseReview[]; testData: TestDataSet[]; execution: Record<string, ExecutionRecord>; securityTestCaseIds: string[] };

const json = <T>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };
const empty = (): QaWorkspace => ({ requirements: [], coverage: {}, reviews: [], testData: [], execution: {}, securityTestCaseIds: [] });

export async function loadQaWorkspace(projectId: string | null): Promise<QaWorkspace> {
  if (!projectId) return empty();
  const [requirements, reviews, execution, dataSets] = await Promise.all([
    listQaRows<any>("requirements", projectId), listQaRows<any>("reviews", projectId), listQaRows<any>("execution", projectId), listQaRows<any>("dataSets", projectId),
  ]);
  return {
    requirements: requirements.map((r) => ({ rowId: r.id, id: r.requirementId || `REQ-${r.id}`, title: r.Name || r.requirementId, statement: r.statement || "", acceptanceCriteria: json(r.acceptanceCriteria, []), risks: json(r.risks, []), source: json<{ origin?: string }>(r.source, { origin: r.source || "" }).origin || "", status: r.status || "Open" })),
    coverage: Object.fromEntries(requirements.map((r) => [r.requirementId || `REQ-${r.id}`, json<{ coverageTestCaseIds?: string[] }>(r.source, {}).coverageTestCaseIds || []])),
    reviews: reviews.map((r) => ({ rowId: r.id, testCaseId: String(r.testCaseId), score: Number(r.qualityScore || 0), priorityReason: r.priorityReason || "", riskAreas: json(r.riskAreas, []), findings: json(r.findings, []), reviewStatus: r.reviewStatus || "Open" })),
    execution: Object.fromEntries(execution.map((r) => [String(r.testCaseId), { rowId: r.id, status: r.status || "Not Run", actualResult: r.actualResult || "", evidenceUrl: r.evidenceUrl || "", defectId: r.defectId || "", executedBy: r.executedBy || "", executedAt: r.executedAt }])),
    testData: dataSets.map((r) => ({ rowId: r.id, testCaseId: String(r.relatedTestCaseId || ""), items: json(r.inputValues, []) })),
    securityTestCaseIds: [],
  };
}

export async function saveRequirements(projectId: string, requirements: Requirement[], coverage: Record<string, string[]>) {
  await Promise.all(requirements.map(async (item) => {
    const fields = { Name: item.title, projectId, requirementId: item.id, statement: item.statement, acceptanceCriteria: JSON.stringify(item.acceptanceCriteria), risks: JSON.stringify(item.risks), source: JSON.stringify({ origin: item.source || "QA Workspace", coverageTestCaseIds: coverage[item.id] || [] }), status: item.status || "Open", updatedAt: baserowDate() };
    if (item.rowId) await updateQaRow("requirements", item.rowId, fields); else await createQaRow("requirements", { ...fields, createdAt: baserowDate() });
  }));
}
export async function deleteRequirement(rowId: number) { await deleteQaRow("requirements", rowId); }
export async function saveReview(projectId: string, review: TestCaseReview) { const fields = { Name: `Review ${review.testCaseId}`, projectId, testCaseId: review.testCaseId, qualityScore: review.score, priorityReason: review.priorityReason, riskAreas: JSON.stringify(review.riskAreas), findings: JSON.stringify(review.findings), reviewStatus: review.reviewStatus || "Open", reviewedAt: baserowDate() }; return review.rowId ? updateQaRow("reviews", review.rowId, fields) : createQaRow("reviews", fields); }
export async function saveExecution(projectId: string, testCaseId: string, record: ExecutionRecord) { const fields = { Name: `Execution ${testCaseId}`, projectId, testCaseId, status: record.status, actualResult: record.actualResult, evidenceUrl: record.evidenceUrl, defectId: record.defectId, executedBy: record.executedBy, executedAt: baserowDate(), updatedAt: baserowDate() }; return record.rowId ? updateQaRow("execution", record.rowId, fields) : createQaRow("execution", fields); }
export async function saveTestData(projectId: string, testCaseId: string, data: TestDataSet) { const fields = { Name: `Test data ${testCaseId}`, projectId, templateId: "", relatedTestCaseId: testCaseId, category: "AI generated", inputValues: JSON.stringify(data.items), expectedOutcome: "See input values", updatedAt: baserowDate() }; return data.rowId ? updateQaRow("dataSets", data.rowId, fields) : createQaRow("dataSets", { ...fields, createdAt: baserowDate() }); }
export function getExecution(workspace: QaWorkspace, testCaseId: string): ExecutionRecord { return workspace.execution[testCaseId] || { status: "Not Run", actualResult: "", evidenceUrl: "", defectId: "", executedBy: "" }; }
export function buildCoverage(requirements: Requirement[], testCases: TestCase[], coverageMap: Record<string, string[]> = {}) { return requirements.map((requirement) => { const matched = testCases.filter((testCase) => (coverageMap[requirement.id] || []).includes(testCase._id)); return { requirement, testCases: matched, positive: matched.some((x) => x.type === "Positive Flow"), negative: matched.some((x) => x.type === "Negative Flow"), edge: matched.some((x) => x.type === "Edge Case") }; }); }
