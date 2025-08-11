// Lightweight API client for frontend -> Next API routes
// Ensures consistent timeouts, headers, and error handling across calls

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 30000, headers, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = isJson ? await response.json() : await response.text();
      } catch (_) {
        // ignore parse errors
      }
      const error = new Error(
        typeof errorBody === 'string'
          ? errorBody
          : errorBody?.error || `HTTP ${response.status}: ${response.statusText}`
      ) as Error & { status?: number; body?: any };
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    if (isJson) return (await response.json()) as T;
    return (await response.text()) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: <T = any>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};

export default apiClient;


