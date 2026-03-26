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

// PUBLIC_INTERFACE
export const Api = {
  /** Health check. */
  health() {
    return request("/", { method: "GET" });
  },

  /** Site operations. */
  listSites(customerName) {
    const qs = customerName ? `?customer_name=${encodeURIComponent(customerName)}` : "";
    return request(`/sites${qs}`, { method: "GET" });
  },

  createSite(payload) {
    return request("/sites", { method: "POST", body: JSON.stringify(payload) });
  },

  /** Ingestion. */
  uploadReadings(readings) {
    return request("/readings/upload", {
      method: "POST",
      body: JSON.stringify({ readings }),
    });
  },

  /** Analytics. */
  timeseries({ siteId, meterId, start, end }) {
    const qs = new URLSearchParams({
      site_id: String(siteId),
      meter_id: String(meterId),
      start,
      end,
    });
    return request(`/analytics/timeseries?${qs.toString()}`, { method: "GET" });
  },

  benchmark({ siteId, groupName, start, end }) {
    const qs = new URLSearchParams({
      site_id: String(siteId),
      group_name: groupName,
      start,
      end,
    });
    return request(`/analytics/benchmark?${qs.toString()}`, { method: "GET" });
  },

  /** Alerts. */
  listAlerts({ siteId, acknowledged, limit = 50 } = {}) {
    const qs = new URLSearchParams();
    if (siteId !== undefined && siteId !== null) qs.set("site_id", String(siteId));
    if (acknowledged !== undefined && acknowledged !== null) qs.set("acknowledged", String(acknowledged));
    qs.set("limit", String(limit));
    return request(`/alerts?${qs.toString()}`, { method: "GET" });
  },

  ackAlert(alertId) {
    return request(`/alerts/${alertId}/ack`, { method: "POST" });
  },

  seedDemo() {
    return request("/admin/seed-demo", { method: "GET" });
  },
};
