import type {
  StoredRequest,
  DecisionOutput,
  Contribution,
  CounselorConfig,
  ProviderConfig,
  RequestInput,
  AuditEvent,
} from '@concilium/shared';

export type CounselorWithPrompt = CounselorConfig & { systemPrompt: string };

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()).data as T;
}

export const api = {
  listRequests:    () => http<StoredRequest[]>('/requests'),
  getRequest:      (id: string) => http<StoredRequest>(`/requests/${id}`),
  getRequestContributions: (id: string) => http<Contribution[]>(`/requests/${id}/contributions`),
  getRequestAudit: (id: string) => http<AuditEvent[]>(`/requests/${id}/audit`),
  createRequest:   (body: RequestInput) =>
    http<StoredRequest>('/requests', { method: 'POST', body: JSON.stringify(body) }),
  abortRequest:    (id: string, reason?: string) =>
    http<StoredRequest>(`/requests/${id}/abort`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  listDecisions:   () => http<DecisionOutput[]>('/decisions'),
  getDecision:     (id: string) =>
    http<{ decision: DecisionOutput; contributions: Contribution[]; request: StoredRequest | null }>(`/decisions/${id}`),
  listCounselors:    () => http<CounselorWithPrompt[]>('/counselors'),
  getCounselor:      (id: string) => http<CounselorWithPrompt>(`/counselors/${id}`),
  saveCounselor:     (cfg: CounselorConfig, systemPrompt: string) =>
    http<CounselorConfig>('/counselors', {
      method: 'POST',
      body: JSON.stringify({ config: cfg, systemPrompt }),
    }),
  deleteCounselor:   async (id: string) => {
    const res = await fetch(`${BASE}/counselors/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
  },
  listProviders:   () => http<ProviderConfig[]>('/providers'),
  saveProvider:    (cfg: ProviderConfig) =>
    http<ProviderConfig>('/providers', { method: 'POST', body: JSON.stringify(cfg) }),
  deleteProvider:  async (id: string) => {
    const res = await fetch(`${BASE}/providers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
  },
};
