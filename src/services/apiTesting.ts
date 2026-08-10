export type ApiRequest = { method: string; url: string; headers: Record<string, string>; body?: string; safeCurl: string };
const secretHeader = /^(authorization|x-api-key|api-key|cookie)$/i;
export function parseCurl(curl: string): ApiRequest {
  const url = curl.match(/(?:curl\s+)?(?:'([^']+)'|"([^"]+)"|(https?:\/\/\S+))/)?.slice(1).find(Boolean);
  if (!url) throw new Error("Không tìm thấy URL trong cURL.");
  const method = curl.match(/(?:-X|--request)\s+([A-Z]+)/i)?.[1]?.toUpperCase() || "GET";
  const headers = Object.fromEntries([...curl.matchAll(/(?:-H|--header)\s+(?:'([^']+)'|"([^"]+)")/g)].map((m) => { const [key, ...value] = (m[1] || m[2]).split(":"); const raw = value.join(":").trim(); return [key.trim(), secretHeader.test(key.trim()) ? `{{${key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}}}` : raw]; }));
  const body = curl.match(/(?:-d|--data(?:-raw)?)\s+(?:'([^']*)'|"([^"]*)")/)?.slice(1).find((value) => value !== undefined);
  const safeCurl = `curl -X ${method} '${url}'${Object.entries(headers).map(([k, v]) => ` -H '${k}: ${v}'`).join("")}${body ? ` --data '${body}'` : ""}`;
  return { method, url, headers, body, safeCurl };
}
export type ApiResponse = { status: number; ok: boolean; body: string; headers: Record<string, string>; durationMs: number };
export type ValidationRules = { expectedStatus?: number; requiredHeaders?: string[]; requiredFields?: string[]; expectedValues?: Record<string, unknown>; maxDurationMs?: number };
export function validateApiResponse(response: ApiResponse, rules: ValidationRules) { let parsed: any; try { parsed = JSON.parse(response.body); } catch { parsed = undefined; } const get = (path: string) => path.split(".").reduce((value, key) => value?.[key], parsed); const checks = [{ rule: "HTTP status", passed: !rules.expectedStatus || response.status === rules.expectedStatus }, ...(rules.requiredHeaders || []).map((key) => ({ rule: `Header ${key}`, passed: Object.keys(response.headers).some((h) => h.toLowerCase() === key.toLowerCase()) })), ...(rules.requiredFields || []).map((path) => ({ rule: `Required field ${path}`, passed: get(path) !== undefined && get(path) !== null })), ...Object.entries(rules.expectedValues || {}).map(([path, value]) => ({ rule: `Expected ${path}`, passed: JSON.stringify(get(path)) === JSON.stringify(value) })), ...(rules.maxDurationMs ? [{ rule: "Response time", passed: response.durationMs <= rules.maxDurationMs }] : [])]; return { passed: checks.every((x) => x.passed), checks }; }
export async function runApiRequest(request: ApiRequest): Promise<ApiResponse> { const started = performance.now(); const response = await fetch(request.url, { method: request.method, headers: request.headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body }); const body = await response.text(); return { status: response.status, ok: response.ok, body, headers: Object.fromEntries(response.headers.entries()), durationMs: Math.round(performance.now() - started) }; }
