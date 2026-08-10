const BASE_URL = import.meta.env.VITE_BASEROW_API_URL || "https://api.baserow.io/api/database/rows/table";
const token = import.meta.env.VITE_BASEROW_TOKEN || "";
export const QA_TABLES = { profile: 1124591, requirements: 1124592, reviews: 1124593, execution: 1124594, environments: 1124595, templates: 1124596, dataSets: 1124597, runs: 1124598 } as const;
export type QaTable = keyof typeof QA_TABLES;
const headers = () => { if (!token) throw new Error("Chưa cấu hình VITE_BASEROW_TOKEN cho ứng dụng."); return { Authorization: `Token ${token}`, "Content-Type": "application/json" }; };
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${BASE_URL}/${path}`, { ...init, headers: { ...headers(), ...init?.headers } }); if (!response.ok) throw new Error(`Không thể đồng bộ Baserow (HTTP ${response.status}).`); return response.json() as Promise<T>; }
export async function listQaRows<T>(table: QaTable, projectId: string): Promise<T[]> { const data = await request<{ results: T[] }>(`${QA_TABLES[table]}/?user_field_names=true&filter__projectId__equal=${encodeURIComponent(projectId)}&size=200`); return data.results; }
export async function createQaRow<T extends Record<string, unknown>>(table: QaTable, fields: T): Promise<T & { id: number }> { return request<T & { id: number }>(`${QA_TABLES[table]}/?user_field_names=true`, { method: "POST", body: JSON.stringify(fields) }); }
export async function updateQaRow<T extends Record<string, unknown>>(table: QaTable, id: string | number, fields: T): Promise<T & { id: number }> { return request<T & { id: number }>(`${QA_TABLES[table]}/${id}/?user_field_names=true`, { method: "PATCH", body: JSON.stringify(fields) }); }
export type QaProjectProfile = Record<string, string | number | undefined> & { id?: number; Name: string; projectId: string; updatedAt: string };
export async function loadQaProfile(projectId: string): Promise<QaProjectProfile | null> { return (await listQaRows<QaProjectProfile>("profile", projectId))[0] || null; }
export async function saveQaProfile(profile: QaProjectProfile) { const existing = await loadQaProfile(profile.projectId); const fields = { ...profile, updatedAt: new Date().toISOString() }; return existing?.id ? updateQaRow("profile", existing.id, fields) : createQaRow("profile", fields); }
