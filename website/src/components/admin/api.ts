const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** JSON request to the wiki API with the session cookie. */
export async function adminApi<T>(
    path: string,
    init?: { method?: string; body?: unknown },
): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method: init?.method ?? "GET",
        credentials: "include",
        headers:
            init?.body === undefined
                ? undefined
                : { "Content-Type": "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return response.json() as Promise<T>;
}
