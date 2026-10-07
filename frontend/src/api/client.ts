export async function apiRequest<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.error || `请求失败 (${res.status})`);
  }

  return json;
}
