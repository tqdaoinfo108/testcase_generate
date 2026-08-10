import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSearch, FlaskConical, Loader2, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type TestCase } from "@/src/services/api";
import { generateTestData, mapTestCoverage, reviewTestCases } from "@/src/services/aiService";
import { buildCoverage, getExecution, loadQaWorkspace, saveQaWorkspace, type ExecutionStatus, type QaWorkspace } from "@/src/services/qaWorkspace";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; projectId: string | null; requirementsInput: string; testCases: TestCase[]; onTestCasesChanged: () => Promise<void> };
const statuses: ExecutionStatus[] = ["Not Run", "Pass", "Fail", "Blocked"];
const statusClass: Record<ExecutionStatus, string> = { "Not Run": "bg-slate-100 text-slate-700", Pass: "bg-emerald-100 text-emerald-800", Fail: "bg-red-100 text-red-800", Blocked: "bg-amber-100 text-amber-800" };

export function QaWorkspaceDialog({ open, onOpenChange, projectId, requirementsInput, testCases, onTestCasesChanged }: Props) {
  const [workspace, setWorkspace] = useState<QaWorkspace>(() => loadQaWorkspace(projectId));
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");
  const [executionDraft, setExecutionDraft] = useState({ status: "Not Run" as ExecutionStatus, actualResult: "", evidenceUrl: "", defectId: "", executedBy: "" });

  useEffect(() => { setWorkspace(loadQaWorkspace(projectId)); }, [projectId, open]);
  useEffect(() => {
    const selected = testCases.find((item) => item._id === selectedTestCaseId) || testCases[0];
    if (!selected) return;
    setSelectedTestCaseId(selected._id);
    setExecutionDraft(getExecution(workspace, selected._id));
  }, [selectedTestCaseId, testCases, workspace]);

  const persist = (next: QaWorkspace) => {
    if (!projectId) return;
    setWorkspace(saveQaWorkspace(projectId, next));
  };
  const coverage = useMemo(() => buildCoverage(workspace.requirements, testCases, workspace.coverage), [workspace.requirements, workspace.coverage, testCases]);
  const executionSummary = useMemo(() => statuses.map((status) => ({ status, count: testCases.filter((item) => getExecution(workspace, item._id).status === status).length })), [workspace.execution, testCases]);
  const selectedTestCase = testCases.find((item) => item._id === selectedTestCaseId);
  const selectedReview = workspace.reviews.find((item) => item.testCaseId === selectedTestCaseId);
  const selectedData = workspace.testData.find((item) => item.testCaseId === selectedTestCaseId);

  const perform = async (action: () => Promise<void>) => {
    setIsWorking(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hoàn tất thao tác AI. Vui lòng thử lại."); }
    finally { setIsWorking(false); }
  };
  const analyze = () => perform(async () => {
    if (!projectId || !requirementsInput.trim()) throw new Error("Hãy nhập yêu cầu mới trước khi phân tích.");
    const requirements = await api.analyzeRequirements(projectId, requirementsInput);
    const coverage = await mapTestCoverage(requirements, testCases);
    persist({ ...workspace, requirements, coverage });
  });
  const review = () => perform(async () => {
    if (!testCases.length) throw new Error("Chưa có testcase để đánh giá.");
    const reviews = await reviewTestCases(workspace.requirements, testCases);
    persist({ ...workspace, reviews });
  });
  const createData = () => perform(async () => {
    if (!selectedTestCase) throw new Error("Hãy chọn một testcase.");
    const data = await generateTestData(selectedTestCase);
    persist({ ...workspace, testData: [...workspace.testData.filter((item) => item.testCaseId !== selectedTestCase._id), data] });
  });
  const security = () => perform(async () => {
    if (!projectId || !requirementsInput.trim()) throw new Error("Hãy nhập yêu cầu cần kiểm thử bảo mật.");
    const created = await api.generateSecurityTestCases(projectId, requirementsInput);
    persist({ ...workspace, securityTestCaseIds: [...new Set([...workspace.securityTestCaseIds, ...created.map((item) => item._id)])] });
    await onTestCasesChanged();
  });
  const saveExecution = () => {
    if (!selectedTestCase) return;
    persist({ ...workspace, execution: { ...workspace.execution, [selectedTestCase._id]: { ...executionDraft, executedAt: new Date().toISOString() } } });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92dvh] w-[calc(100vw-2rem)] sm:!max-w-6xl overflow-y-auto rounded-xl p-0">
      <DialogHeader className="border-b px-6 py-5">
        <DialogTitle className="flex items-center gap-2 text-xl text-slate-900"><ClipboardCheck className="h-5 w-5 text-blue-700" /> Không gian kiểm thử QA</DialogTitle>
        <p className="text-sm text-slate-600">Phân tích yêu cầu, phát hiện điểm thiếu, chuẩn bị dữ liệu và ghi nhận kết quả kiểm thử.</p>
      </DialogHeader>
      <div className="px-6 pb-6 pt-4">
        {error && <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        <Tabs defaultValue="coverage">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-100 p-1 md:grid-cols-4">
            <TabsTrigger value="coverage">Yêu cầu & độ phủ</TabsTrigger><TabsTrigger value="quality">Chất lượng & dữ liệu</TabsTrigger><TabsTrigger value="security">Bảo mật</TabsTrigger><TabsTrigger value="execution">Thực thi</TabsTrigger>
          </TabsList>
          <TabsContent value="coverage" className="space-y-5 pt-5">
            <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">Phân tích yêu cầu bằng AI</h3><p className="mt-1 text-sm text-slate-600">Tách yêu cầu thành tiêu chí có thể kiểm thử và đối chiếu với các testcase hiện có.</p></div><Button onClick={analyze} disabled={isWorking || !projectId}><FileSearch className="mr-2 h-4 w-4" />Phân tích yêu cầu</Button></div></section>
            {workspace.requirements.length === 0 ? <Empty icon={<FileSearch />} text="Chưa có requirement được phân tích. Nhập yêu cầu ở màn hình chính rồi chọn Phân tích yêu cầu." /> : <div className="grid gap-3">{coverage.map(({ requirement, testCases: matched, positive, negative, edge }) => <div key={requirement.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-blue-700">{requirement.id}</p><h3 className="font-medium text-slate-900">{requirement.title}</h3><p className="mt-1 text-sm text-slate-600">{requirement.statement}</p></div><Badge className={matched.length ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>{matched.length ? `${matched.length} testcase liên quan` : "Chưa có testcase"}</Badge></div><div className="mt-3 flex flex-wrap gap-2 text-xs">{[["Positive",positive],["Negative",negative],["Edge",edge]].map(([label, covered]) => <span key={String(label)} className={`rounded-full px-2 py-1 ${covered ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{covered ? "✓" : "○"} {label}</span>)}</div>{requirement.acceptanceCriteria.length > 0 && <p className="mt-3 text-xs text-slate-500">Tiêu chí: {requirement.acceptanceCriteria.join("; ")}</p>}</div>)}</div>}
          </TabsContent>
          <TabsContent value="quality" className="space-y-5 pt-5">
            <section className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">Rà soát chất lượng bộ testcase</h3><p className="mt-1 text-sm text-slate-600">Kiểm tra độ rõ ràng, khả năng kiểm chứng, dữ liệu, trùng lặp và độ phù hợp của priority.</p></div><Button onClick={review} disabled={isWorking || !testCases.length}><CheckCircle2 className="mr-2 h-4 w-4" />Rà soát bằng AI</Button></div></section>
            <select value={selectedTestCaseId} onChange={(event) => setSelectedTestCaseId(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Chọn testcase</option>{testCases.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}</select>
            {selectedReview && <section className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Đánh giá testcase</h3><Badge className={selectedReview.score >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{selectedReview.score}/100</Badge></div><p className="mt-3 text-sm text-slate-700"><strong>Priority:</strong> {selectedReview.priorityReason}</p><p className="mt-2 text-sm text-slate-600"><strong>Vùng rủi ro:</strong> {selectedReview.riskAreas.join(", ") || "Chưa xác định"}</p>{selectedReview.findings.length > 0 ? <div className="mt-4 space-y-2">{selectedReview.findings.map((finding, index) => <div key={index} className="rounded-lg bg-slate-50 p-3 text-sm"><Badge className={finding.severity === "High" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>{finding.severity}</Badge><p className="mt-2 font-medium text-slate-800">{finding.message}</p><p className="mt-1 text-slate-600">Gợi ý: {finding.suggestion}</p></div>)}</div> : <p className="mt-4 text-sm text-emerald-700">Không có điểm cần sửa đáng kể.</p>}</section>}
            <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">Dữ liệu kiểm thử</h3><p className="mt-1 text-sm text-slate-600">Sinh dữ liệu hợp lệ, không hợp lệ, biên, rỗng và định dạng đặc biệt phù hợp testcase.</p></div><Button variant="outline" onClick={createData} disabled={isWorking || !selectedTestCase}><FlaskConical className="mr-2 h-4 w-4" />Tạo dữ liệu</Button></div>{selectedData && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-2">Mục đích</th><th className="pb-2">Dữ liệu</th><th className="pb-2">Kết quả mong đợi</th></tr></thead><tbody>{selectedData.items.map((item, index) => <tr key={index} className="border-t"><td className="py-2 pr-3"><Badge variant="outline">{item.category}</Badge><p className="mt-1 text-slate-700">{item.label}</p></td><td className="py-2 pr-3 font-mono text-xs text-slate-700">{item.value}</td><td className="py-2 text-slate-600">{item.expectedOutcome}</td></tr>)}</tbody></table></div>}</section>
          </TabsContent>
          <TabsContent value="security" className="space-y-5 pt-5"><section className="rounded-xl border border-rose-100 bg-rose-50/50 p-5"><ShieldCheck className="h-6 w-6 text-rose-700" /><h3 className="mt-3 font-semibold text-slate-900">Bộ kiểm thử bảo mật theo yêu cầu</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">AI chỉ tạo các testcase phòng thủ, phù hợp phạm vi sản phẩm: xác thực, phân quyền, phiên làm việc, kiểm tra đầu vào, API, xử lý lỗi và logic nghiệp vụ. Không tạo hướng dẫn khai thác.</p><Button className="mt-4" onClick={security} disabled={isWorking || !projectId || !requirementsInput.trim()}><ShieldCheck className="mr-2 h-4 w-4" />Tạo Security Pack</Button></section>{workspace.securityTestCaseIds.length > 0 && <div className="rounded-xl border bg-white p-4 text-sm text-slate-700">Đã tạo {workspace.securityTestCaseIds.length} testcase bảo mật cho project này. Các testcase này xuất hiện trong danh sách chính và được export như bình thường.</div>}</TabsContent>
          <TabsContent value="execution" className="space-y-5 pt-5"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{executionSummary.map(({ status, count }) => <div key={status} className="rounded-xl border bg-white p-3"><Badge className={statusClass[status]}>{status}</Badge><p className="mt-3 text-2xl font-semibold text-slate-900">{count}</p></div>)}</div>{selectedTestCase ? <section className="rounded-xl border bg-white p-4"><h3 className="font-semibold text-slate-900">Ghi nhận kết quả thực thi</h3><p className="mt-1 text-sm text-slate-600">{selectedTestCase.title}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Trạng thái"><select value={executionDraft.status} onChange={(event) => setExecutionDraft({ ...executionDraft, status: event.target.value as ExecutionStatus })} className="h-9 w-full rounded-md border bg-white px-3 text-sm">{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field><Field label="Người thực hiện"><Input value={executionDraft.executedBy} onChange={(event) => setExecutionDraft({ ...executionDraft, executedBy: event.target.value })} placeholder="Tên người thực hiện" /></Field><Field label="Mã lỗi"><Input value={executionDraft.defectId} onChange={(event) => setExecutionDraft({ ...executionDraft, defectId: event.target.value })} placeholder="VD: BUG-123" /></Field><Field label="Link bằng chứng"><Input value={executionDraft.evidenceUrl} onChange={(event) => setExecutionDraft({ ...executionDraft, evidenceUrl: event.target.value })} placeholder="Link ảnh, video hoặc log" /></Field></div><Field label="Kết quả thực tế"><Textarea value={executionDraft.actualResult} onChange={(event) => setExecutionDraft({ ...executionDraft, actualResult: event.target.value })} placeholder="Mô tả kết quả quan sát được" rows={4} /></Field><Button className="mt-4" onClick={saveExecution}><PlayCircle className="mr-2 h-4 w-4" />Lưu kết quả</Button></section> : <Empty icon={<PlayCircle />} text="Chưa có testcase để thực thi." />}</TabsContent>
        </Tabs>
        {isWorking && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/20"><div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />AI đang xử lý...</div></div>}
      </div>
    </DialogContent>
  </Dialog>;
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) { return <div className="grid place-items-center rounded-xl border border-dashed bg-slate-50 p-10 text-center text-sm text-slate-500"><div className="mb-3 text-slate-400">{icon}</div>{text}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mt-3 block text-sm font-medium text-slate-700">{label}<div className="mt-1">{children}</div></label>; }
