/** The only place that reads Baserow runtime configuration. */
export const BASEROW_CONFIG = Object.freeze({
  baseUrl: import.meta.env.VITE_BASEROW_API_URL || "https://api.baserow.io/api/database/rows/table",
  token: import.meta.env.VITE_BASEROW_TOKEN || "KUOAepR6iaz2YwJ1J9E9Sxv0f26Mf1Ns",
});
/** Baserow Date fields accept calendar dates, not ISO date-time values. */
export const baserowDate = (date = new Date()) => date.toISOString().slice(0, 10);
export const QA_TABLES = { profile: 1124591, requirements: 1124592, reviews: 1124593, execution: 1124594, environments: 1124595, templates: 1124596, dataSets: 1124597, runs: 1124598 } as const;
export type QaTable = keyof typeof QA_TABLES;
export const baserowHeaders = () => { if (!BASEROW_CONFIG.token) throw new Error("Chưa cấu hình VITE_BASEROW_TOKEN cho ứng dụng."); return { Authorization: `Token ${BASEROW_CONFIG.token}`, "Content-Type": "application/json" }; };
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${BASEROW_CONFIG.baseUrl}/${path}`, { ...init, headers: { ...baserowHeaders(), ...init?.headers } }); if (!response.ok) throw new Error(`Không thể đồng bộ Baserow (HTTP ${response.status}).`); return response.json() as Promise<T>; }
export async function listQaRows<T>(table: QaTable, projectId: string): Promise<T[]> { const data = await request<{ results: T[] }>(`${QA_TABLES[table]}/?user_field_names=true&filter__projectId__equal=${encodeURIComponent(projectId)}&size=200`); return data.results; }
export async function createQaRow<T extends Record<string, unknown>>(table: QaTable, fields: T): Promise<T & { id: number }> { return request<T & { id: number }>(`${QA_TABLES[table]}/?user_field_names=true`, { method: "POST", body: JSON.stringify(fields) }); }
export async function updateQaRow<T extends Record<string, unknown>>(table: QaTable, id: string | number, fields: T): Promise<T & { id: number }> { return request<T & { id: number }>(`${QA_TABLES[table]}/${id}/?user_field_names=true`, { method: "PATCH", body: JSON.stringify(fields) }); }
export async function deleteQaRow(table: QaTable, id: string | number): Promise<void> { const response = await fetch(`${BASEROW_CONFIG.baseUrl}/${QA_TABLES[table]}/${id}/?user_field_names=true`, { method: "DELETE", headers: baserowHeaders() }); if (!response.ok) throw new Error(`Không thể xoá dữ liệu QA (HTTP ${response.status}).`); }
export async function listQaSelectOptions(table: QaTable, fieldName: string): Promise<string[]> { const fieldsUrl = BASEROW_CONFIG.baseUrl.replace("/rows/table", "/fields/table"); const response = await fetch(`${fieldsUrl}/${QA_TABLES[table]}/`, { headers: baserowHeaders() }); if (!response.ok) throw new Error(`Không thể đọc option Baserow (HTTP ${response.status}).`); const fields = await response.json() as Array<{ name?: string; select_options?: Array<{ value?: string }> }>; return fields.find((field) => field.name === fieldName)?.select_options?.map((option) => option.value || "").filter(Boolean) || []; }
export type QaProjectProfile = Record<string, string | number | undefined> & { id?: number; Name: string; projectId: string; updatedAt: string };
export async function loadQaProfile(projectId: string): Promise<QaProjectProfile | null> { return (await listQaRows<QaProjectProfile>("profile", projectId))[0] || null; }
export async function saveQaProfile(profile: QaProjectProfile) { const existing = await loadQaProfile(profile.projectId); const fields = { ...profile, updatedAt: baserowDate() }; return existing?.id ? updateQaRow("profile", existing.id, fields) : createQaRow("profile", fields); }
