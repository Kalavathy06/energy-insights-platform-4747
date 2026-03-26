/**
 * Small API client using fetch.
 * Uses environment variables:
 * - REACT_APP_API_BASE or REACT_APP_BACKEND_URL
 */

// PUBLIC_INTERFACE
export function getApiBase() {
  /** Returns the API base URL from env vars, defaulting to same-origin. */
  const fromApiBase = process.env.REACT_APP_API_BASE;
  const fromBackendUrl = process.env.REACT_APP_BACKEND_URL;
  return (fromApiBase || fromBackendUrl || "").replace(/\/$/, "");
}

async function request(path, options = {}) {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data?.detail || JSON.stringify(data);
    } catch (e) {
      // ignore
    }
    throw new Error(detail);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function isMissingEndpointError(message) {
  return /HTTP\s+(404|405)/i.test(String(message || ""));
}

async function safeRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch (e) {
    // If the backend doesn't implement an endpoint yet, allow the UI to degrade gracefully.
    if (isMissingEndpointError(e?.message)) {
      const err = new Error("API endpoint not implemented on backend yet.");
      err.code = "MISSING_ENDPOINT";
      err.original = e;
      throw err;
    }
    throw e;
  }
}

function demoSites() {
  return [
    { id: 1, customer_name: "Demo Customer", name: "HQ" },
    { id: 2, customer_name: "Demo Customer", name: "Warehouse" },
  ];
}

function demoTimeseries({ start, end }) {
  const startMs = Date.parse(start) || Date.now() - 7 * 24 * 3600 * 1000;
  const endMs = Date.parse(end) || Date.now();
  const points = [];
  const n = 48; // keep small for UI
  const span = Math.max(1, endMs - startMs);
  for (let i = 0; i < n; i++) {
    const t = startMs + (i / (n - 1)) * span;
    // simple deterministic wave
    const base = 12 + 6 * Math.sin(i / 5);
    const noise = 1.5 * Math.sin(i / 2.7);
    points.push({ ts: new Date(t).toISOString(), kwh: Math.max(0, base + noise) });
  }
  return { points };
}

function demoAlerts() {
  return [
    {
      id: 101,
      site_id: 1,
      meter_id: "MAIN",
      ts: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      alert_type: "anomaly",
      severity: "medium",
      title: "Usage spike detected",
      details: "Demo alert (backend endpoints not available).",
      acknowledged: false,
    },
  ];
}

function demoBenchmark() {
  return { site_total_kwh: 512.3, group_avg_total_kwh: 477.8, group_site_count: 18 };
}

// PUBLIC_INTERFACE
export const Api = {
  /** Health check. */
  health() {
    return safeRequest("/", { method: "GET" });
  },

  /** Site operations. */
  async listSites(customerName) {
    const qs = customerName ? `?customer_name=${encodeURIComponent(customerName)}` : "";
    try {
      return await safeRequest(`/sites${qs}`, { method: "GET" });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") return demoSites();
      throw e;
    }
  },

  async createSite(payload) {
    try {
      return await safeRequest("/sites", { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") {
        // minimal demo behavior
        const created = { id: Date.now(), ...payload };
        return created;
      }
      throw e;
    }
  },

  /** Ingestion. */
  async uploadReadings(readings) {
    try {
      return await safeRequest("/readings/upload", {
        method: "POST",
        body: JSON.stringify({ readings }),
      });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") {
        return { inserted: Array.isArray(readings) ? readings.length : 0, skipped_duplicates: 0 };
      }
      throw e;
    }
  },

  /** Analytics. */
  async timeseries({ siteId, meterId, start, end }) {
    const qs = new URLSearchParams({
      site_id: String(siteId),
      meter_id: String(meterId),
      start,
      end,
    });

    try {
      return await safeRequest(`/analytics/timeseries?${qs.toString()}`, { method: "GET" });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") return demoTimeseries({ start, end });
      throw e;
    }
  },

  async benchmark({ siteId, groupName, start, end }) {
    const qs = new URLSearchParams({
      site_id: String(siteId),
      group_name: groupName,
      start,
      end,
    });

    try {
      return await safeRequest(`/analytics/benchmark?${qs.toString()}`, { method: "GET" });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") return demoBenchmark();
      throw e;
    }
  },

  /** Alerts. */
  async listAlerts({ siteId, acknowledged, limit = 50 } = {}) {
    const qs = new URLSearchParams();
    if (siteId !== undefined && siteId !== null) qs.set("site_id", String(siteId));
    if (acknowledged !== undefined && acknowledged !== null) qs.set("acknowledged", String(acknowledged));
    qs.set("limit", String(limit));

    try {
      return await safeRequest(`/alerts?${qs.toString()}`, { method: "GET" });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") {
        const demo = demoAlerts();
        const filtered = acknowledged === undefined ? demo : demo.filter((a) => a.acknowledged === Boolean(acknowledged));
        return filtered.slice(0, Number(limit) || 50);
      }
      throw e;
    }
  },

  async ackAlert(alertId) {
    try {
      return await safeRequest(`/alerts/${alertId}/ack`, { method: "POST" });
    } catch (e) {
      if (e?.code === "MISSING_ENDPOINT") return { ok: true, id: alertId };
      throw e;
    }
  },

  async seedDemo() {
    try {
      return await safeRequest("/admin/seed-demo", { method: "GET" });
    } catch (e) {
      // Seeding is optional; ignore missing endpoint.
      if (e?.code === "MISSING_ENDPOINT") return { ok: true, skipped: true };
      throw e;
    }
  },
};
