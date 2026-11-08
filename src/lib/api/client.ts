/**
 * Browser client for the BIORY API.
 * Call shape matches the previous database client so screens keep the same queries:
 * lists, filters, allowlisted functions, and private files.
 */

const API = `${import.meta.env["VITE_API_URL"] ?? ""}/api/v1`;
const STORAGE_KEY = "biory.session";

type Stored = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email: string };
};

export type ApiError = { message: string; code?: string; details?: string };
export type ApiResult<T = any> = { data: T; error: ApiError | null; status: number };

type Filter = { column: string; op: string; value?: unknown };
type Listener = (event: string, session: Stored | null) => void;

const listeners = new Set<Listener>();
let refreshInFlight: Promise<Stored | null> | null = null;
let lastNetworkFailure = false;

function read(): Stored | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.access_token || !parsed.refresh_token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(session: Stored | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function notify(event: string, session: Stored | null) {
  for (const listener of listeners) listener(event, session);
}

function sessionOf(stored: Stored | null) {
  if (!stored) return null;
  return {
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expires_at: stored.expires_at,
    user: stored.user,
  };
}

async function raw(path: string, init: RequestInit, token?: string): Promise<ApiResult> {
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${API}${path}`, { ...init, headers });
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: ApiError } | null;
    if (!response.ok) {
      return {
        data: null,
        error: body?.error ?? { message: response.statusText || "Request failed" },
        status: response.status,
      };
    }
    if (body && typeof body === "object" && "data" in body) {
      return { data: body.data, error: null, status: response.status };
    }
    return { data: body, error: null, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch";
    return { data: null, error: { message, code: "network" }, status: 0 };
  }
}

async function refresh(): Promise<Stored | null> {
  const current = read();
  if (!current) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const result = await raw("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (result.status === 0) {
        lastNetworkFailure = true;
        return null;
      }
      if (result.error || !result.data) {
        if (result.status === 401) write(null);
        return null;
      }
      const next = result.data as Stored;
      write(next);
      return next;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function ensureAccess(): Promise<Stored | null> {
  lastNetworkFailure = false;
  const current = read();
  if (!current) return null;
  if (current.expires_at * 1000 > Date.now() + 30_000) return current;
  return refresh();
}

async function authed(path: string, init: RequestInit): Promise<ApiResult> {
  const session = await ensureAccess();
  if (!session) {
    if (lastNetworkFailure) return { data: null, error: { message: "Failed to fetch", code: "network" }, status: 0 };
    return { data: null, error: { message: "Not signed in", code: "not_authenticated" }, status: 401 };
  }
  const result = await raw(path, init, session.access_token);
  if (result.status !== 401) return result;
  const renewed = await refresh();
  if (!renewed) return result;
  return raw(path, init, renewed.access_token);
}

class Query<T = any[]> {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private values: Record<string, unknown> | null = null;
  private columns = "*";
  private filters: Filter[] = [];
  private orFilters: Filter[][] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private rowLimit: number | null = null;
  private one: "single" | "maybe" | null = null;
  private pending: Promise<ApiResult> | null = null;

  constructor(private readonly table: string) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.action = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.action = "delete";
    this.values = {};
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push({ column, op: "gt", value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ column, op: "gte", value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ column, op: "lt", value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "lte", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }
  is(column: string, value: null) {
    this.filters.push({ column, op: "is", value });
    return this;
  }
  or(expression: string) {
    const group = expression.split(",").map((part) => {
      const match = part.match(/^([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte)\.(.*)$/i);
      if (!match) throw new Error(`Unsupported filter: ${part}`);
      return { column: match[1]!, op: match[2]!.toLowerCase(), value: match[3] };
    });
    this.orFilters.push(group);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(count: number) {
    this.rowLimit = count;
    return this;
  }
  single(): Query<any> {
    this.one = "single";
    return this as unknown as Query<any>;
  }
  maybeSingle(): Query<any> {
    this.one = "maybe";
    return this as unknown as Query<any>;
  }

  then<TResult1 = ApiResult<T>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return (this.execute() as Promise<ApiResult<T>>).then(onfulfilled, onrejected);
  }

  private execute(): Promise<ApiResult> {
    if (!this.pending) this.pending = this.run();
    return this.pending;
  }

  private async run(): Promise<ApiResult> {
    if (this.action === "select") {
      return authed("/query", {
        method: "POST",
        body: JSON.stringify({
          table: this.table,
          select: this.columns,
          filters: this.filters,
          or_filters: this.orFilters,
          order: this.sorts,
          limit: this.rowLimit,
          single: this.one === "single",
          maybe_single: this.one === "maybe",
        }),
      });
    }
    return authed("/write", {
      method: "POST",
      body: JSON.stringify({
        table: this.table,
        op: this.action,
        values: this.values ?? {},
        filters: this.filters,
      }),
    });
  }
}

class Bucket {
  constructor(private readonly bucket: string) {}

  async upload(path: string, file: Blob, _options?: { contentType?: string; upsert?: boolean }) {
    const body = new FormData();
    body.append("path", path);
    body.append("file", file);
    return authed(`/files/${this.bucket}`, { method: "POST", body });
  }

  async createSignedUrl(path: string, expiresIn: number) {
    const result = await authed(`/files/${this.bucket}/sign`, {
      method: "POST",
      body: JSON.stringify({ path, expires_in: expiresIn }),
    });
    return { data: (result.data ?? { signedUrl: "" }) as { signedUrl: string }, error: result.error };
  }

  async createSignedUrls(paths: string[], expiresIn: number) {
    const result = await authed(`/files/${this.bucket}/sign`, {
      method: "POST",
      body: JSON.stringify({ paths, expires_in: expiresIn }),
    });
    return { data: (result.data as { signedUrl: string }[] | null) ?? [], error: result.error };
  }
}

function saveIssued(data: unknown): Stored | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<Stored>;
  if (!row.access_token || !row.refresh_token || !row.user || !row.expires_at) return null;
  const stored: Stored = {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    user: row.user,
  };
  write(stored);
  return stored;
}

export const api = {
  from(table: string) {
    return new Query(table);
  },
  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<ApiResult> {
    return authed("/rpc", { method: "POST", body: JSON.stringify({ fn, args }) });
  },
  staff: {
    createSalesOfficer(body: {
      email: string;
      password: string;
      full_name: string;
      phone?: string | null;
      territory_id?: string | null;
    }) {
      return authed("/staff/sales-officers", { method: "POST", body: JSON.stringify(body) });
    },
    resetSalesOfficerPassword(userId: string, password: string) {
      return authed(`/staff/sales-officers/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    },
    setUserPassword(userId: string, password: string) {
      return authed(`/staff/users/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    },
  },
  storage: {
    from(bucket: string) {
      return new Bucket(bucket);
    },
  },
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const result = await raw("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.error) return { data: { user: null, session: null }, error: result.error };
      const stored = saveIssued(result.data);
      notify("SIGNED_IN", stored);
      return { data: { user: stored?.user ?? null, session: sessionOf(stored) }, error: null };
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string; data?: { full_name?: string } };
    }) {
      const result = await raw("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name: options?.data?.full_name ?? "" }),
      });
      if (result.error) return { data: { user: null, session: null }, error: result.error };
      const stored = saveIssued(result.data);
      notify("SIGNED_IN", stored);
      return { data: { user: stored?.user ?? null, session: sessionOf(stored) }, error: null };
    },
    async signOut(_options?: { scope?: string }) {
      const current = read();
      write(null);
      notify("SIGNED_OUT", null);
      if (current) {
        await raw("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: current.refresh_token }),
        });
      }
      return { error: null };
    },
    async getSession() {
      const current = read();
      return { data: { session: sessionOf(current) }, error: null };
    },
    async getUser() {
      const session = await ensureAccess();
      if (!session && lastNetworkFailure) {
        return { data: { user: null }, error: { message: "Failed to fetch", status: 0, name: "AuthRetryableFetchError" } };
      }
      if (!session) return { data: { user: null }, error: { message: "Not signed in", status: 401 } };
      return { data: { user: session.user }, error: null };
    },
    async refreshSession() {
      const session = await refresh();
      if (!session) return { data: { session: null, user: null }, error: { message: "Not signed in" } };
      return { data: { session: sessionOf(session), user: session.user }, error: null };
    },
    async resetPasswordForEmail(email: string, _options?: { redirectTo?: string }) {
      const result = await raw("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
      return { data: {}, error: result.error };
    },
    async updateUser({ password }: { password: string }) {
      const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
      if (token) {
        const result = await raw("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
        if (result.error) return { data: { user: null }, error: result.error };
        const stored = saveIssued(result.data);
        notify("SIGNED_IN", stored);
        return { data: { user: stored?.user ?? null }, error: null };
      }
      const result = await authed("/auth/password", { method: "POST", body: JSON.stringify({ password }) });
      if (result.error) return { data: { user: null }, error: result.error };
      const stored = saveIssued(result.data);
      return { data: { user: stored?.user ?? read()?.user ?? null }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: ReturnType<typeof sessionOf>) => void) {
      const listener: Listener = (event, session) => callback(event, sessionOf(session));
      listeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(listener);
            },
          },
        },
      };
    },
  },
};
