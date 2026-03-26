import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { Api, getApiBase } from "./api/client";
import { Sparkline } from "./components/Sparkline";
import { parseCsv } from "./utils/csv";

function formatKwh(v) {
  const num = Number(v || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString();
}

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState("light");
  const [active, setActive] = useState("overview"); // overview|alerts|benchmark|export

  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [meterId, setMeterId] = useState("MAIN");
  const [startIso, setStartIso] = useState(isoDaysAgo(7));
  const [endIso, setEndIso] = useState(new Date().toISOString());

  const [timeseries, setTimeseries] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [benchmark, setBenchmark] = useState(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadInfo, setUploadInfo] = useState("");

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  async function loadSites() {
    setErr("");
    try {
      const s = await Api.listSites();
      setSites(s);
      if (!siteId && s.length) setSiteId(String(s[0].id));
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function refreshOverview() {
    if (!siteId) return;
    setErr("");
    setBusy(true);
    try {
      const ts = await Api.timeseries({
        siteId: Number(siteId),
        meterId,
        start: startIso,
        end: endIso,
      });
      setTimeseries(ts);

      const al = await Api.listAlerts({ siteId: Number(siteId), acknowledged: false, limit: 25 });
      setAlerts(al);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshAlerts() {
    if (!siteId) return;
    setErr("");
    setBusy(true);
    try {
      const al = await Api.listAlerts({ siteId: Number(siteId), limit: 100 });
      setAlerts(al);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshBenchmark() {
    if (!siteId) return;
    setErr("");
    setBusy(true);
    try {
      // default to Retail group; can be expanded later
      const b = await Api.benchmark({
        siteId: Number(siteId),
        groupName: "Retail",
        start: startIso,
        end: endIso,
      });
      setBenchmark(b);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // seed demo data for first run convenience (idempotent)
    Api.seedDemo().catch(() => {});
    loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!siteId) return;
    if (active === "overview") refreshOverview();
    if (active === "alerts") refreshAlerts();
    if (active === "benchmark") refreshBenchmark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, siteId]);

  const selectedSite = useMemo(() => sites.find((s) => String(s.id) === String(siteId)), [sites, siteId]);

  const kpis = useMemo(() => {
    const pts = timeseries?.points || [];
    const total = pts.reduce((acc, p) => acc + Number(p.kwh || 0), 0);
    const peak = pts.reduce((acc, p) => Math.max(acc, Number(p.kwh || 0)), 0);
    const avg = pts.length ? total / pts.length : 0;
    return { total, peak, avg, count: pts.length };
  }, [timeseries]);

  async function onAckAlert(id) {
    setErr("");
    try {
      await Api.ackAlert(id);
      if (active === "overview") refreshOverview();
      else refreshAlerts();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function onUploadCsv(file) {
    setUploadInfo("");
    setErr("");
    if (!file) return;

    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);

      // Expected headers: site_id,meter_id,ts,kwh,demand_kw(optional),quality_flag(optional)
      const readings = rows
        .map((r) => ({
          site_id: Number(r.site_id || siteId),
          meter_id: (r.meter_id || meterId || "MAIN").trim(),
          ts: r.ts,
          kwh: Number(r.kwh),
          demand_kw: r.demand_kw !== undefined && r.demand_kw !== "" ? Number(r.demand_kw) : null,
          quality_flag: r.quality_flag ? String(r.quality_flag) : null,
        }))
        .filter((r) => r.site_id && r.meter_id && r.ts && Number.isFinite(r.kwh));

      if (!readings.length) {
        throw new Error("No valid readings found. CSV must include ts and kwh columns.");
      }

      const resp = await Api.uploadReadings(readings);
      setUploadInfo(`Uploaded. Inserted: ${resp.inserted}, skipped duplicates: ${resp.skipped_duplicates}.`);
      // Refresh current view
      if (active === "overview") await refreshOverview();
      if (active === "alerts") await refreshAlerts();
      if (active === "benchmark") await refreshBenchmark();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const exportJson = useMemo(() => {
    const payload = {
      site: selectedSite || null,
      meterId,
      start: startIso,
      end: endIso,
      timeseries,
      alerts,
      benchmark,
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(payload, null, 2);
  }, [selectedSite, meterId, startIso, endIso, timeseries, alerts, benchmark]);

  function downloadExport() {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `energy-insights-export-site-${siteId || "unknown"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand" role="banner" aria-label="Energy Insights Platform">
          <div className="brandMark">E</div>
          <div className="brandTitle">
            <strong>Energy Insights</strong>
            <span>Trends • Alerts • Benchmark</span>
          </div>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          <button className={`navBtn ${active === "overview" ? "navBtnActive" : ""}`} onClick={() => setActive("overview")}>
            Overview <span className="badge">{busy ? "…" : "Live"}</span>
          </button>
          <button className={`navBtn ${active === "alerts" ? "navBtnActive" : ""}`} onClick={() => setActive("alerts")}>
            Alerts <span className="badge">{alerts.filter((a) => !a.acknowledged).length}</span>
          </button>
          <button className={`navBtn ${active === "benchmark" ? "navBtnActive" : ""}`} onClick={() => setActive("benchmark")}>
            Benchmark <span className="badge">Retail</span>
          </button>
          <button className={`navBtn ${active === "export" ? "navBtnActive" : ""}`} onClick={() => setActive("export")}>
            Export <span className="badge">JSON</span>
          </button>
        </nav>

        <div className="sidebarFooter">
          <div className="kvRow">
            <label>Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Select site">
              <option value="" disabled>
                Select…
              </option>
              {sites.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.customer_name} — {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="kvRow">
            <label>Meter ID</label>
            <input value={meterId} onChange={(e) => setMeterId(e.target.value)} placeholder="e.g. MAIN" />
          </div>

          <div className="kvRow">
            <label>Start (ISO)</label>
            <input value={startIso} onChange={(e) => setStartIso(e.target.value)} />
          </div>

          <div className="kvRow">
            <label>End (ISO)</label>
            <input value={endIso} onChange={(e) => setEndIso(e.target.value)} />
          </div>

          <button className="btn" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
            Theme: {theme === "light" ? "Light" : "Dark"}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1 className="h1">
              {active === "overview" && "Overview"}
              {active === "alerts" && "Alerts"}
              {active === "benchmark" && "Benchmark"}
              {active === "export" && "Export"}
            </h1>
            <p className="subtle">
              API: {apiBase || "(same-origin)"} • Site:{" "}
              {selectedSite ? `${selectedSite.customer_name} / ${selectedSite.name}` : "—"}
            </p>
          </div>

          <div className="actions">
            <button className="btn btnPrimary" onClick={() => setShowUpload(true)}>
              Upload interval CSV
            </button>

            {active === "overview" && (
              <button className="btn" onClick={refreshOverview} disabled={busy || !siteId}>
                Refresh
              </button>
            )}
            {active === "alerts" && (
              <button className="btn" onClick={refreshAlerts} disabled={busy || !siteId}>
                Refresh
              </button>
            )}
            {active === "benchmark" && (
              <button className="btn" onClick={refreshBenchmark} disabled={busy || !siteId}>
                Refresh
              </button>
            )}
            {active === "export" && (
              <button className="btn btnWarn" onClick={downloadExport} disabled={!siteId}>
                Download JSON
              </button>
            )}
          </div>
        </div>

        {err ? <div className="errorBox" role="alert">{err}</div> : null}

        <div className="notice" role="status" aria-live="polite">
          If you see demo data, the backend API endpoints may not be implemented yet. Configure{" "}
          <code>REACT_APP_API_BASE</code> or <code>REACT_APP_BACKEND_URL</code> to point to a backend that exposes the full
          Energy Insights API.
        </div>

        {active === "overview" && (
          <div className="grid">
            <section className="card">
              <div className="cardTitle">
                <h2>Energy usage trend (kWh per interval)</h2>
                <span>{timeseries?.points?.length || 0} points</span>
              </div>

              <Sparkline data={(timeseries?.points || []).map((p) => Number(p.kwh || 0))} />

              <div className="notice">
                Tip: Upload interval data, then refresh. Simple anomaly detection will auto-create alerts based on recent baseline.
              </div>
            </section>

            <aside className="card">
              <div className="cardTitle">
                <h2>KPIs</h2>
                <span>Range: {startIso.slice(0, 10)} → {endIso.slice(0, 10)}</span>
              </div>

              <div className="kpiRow">
                <div className="kpi">
                  <label>Total kWh</label>
                  <strong>{formatKwh(kpis.total)}</strong>
                </div>
                <div className="kpi">
                  <label>Avg kWh</label>
                  <strong>{formatKwh(kpis.avg)}</strong>
                </div>
                <div className="kpi">
                  <label>Peak kWh</label>
                  <strong>{formatKwh(kpis.peak)}</strong>
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div className="cardTitle">
                <h2>Recent unacked alerts</h2>
                <span>{alerts.filter((a) => !a.acknowledged).length}</span>
              </div>

              <table className="table" aria-label="Recent alerts">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>When</th>
                    <th>Title</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span
                          className={`pill ${
                            a.severity === "high" ? "pillHigh" : a.severity === "medium" ? "pillMed" : "pillLow"
                          }`}
                        >
                          {a.severity}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>{String(a.ts).replace("T", " ").slice(0, 16)}</td>
                      <td>{a.title}</td>
                      <td>
                        {!a.acknowledged ? (
                          <button className="btn" onClick={() => onAckAlert(a.id)}>
                            Ack
                          </button>
                        ) : (
                          <span className="pill">Acked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!alerts.length ? (
                    <tr>
                      <td colSpan="4" style={{ color: "var(--muted)" }}>
                        No alerts yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </aside>
          </div>
        )}

        {active === "alerts" && (
          <section className="card">
            <div className="cardTitle">
              <h2>All alerts</h2>
              <span>Most recent first</span>
            </div>

            <table className="table" aria-label="All alerts table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>When</th>
                  <th>Meter</th>
                  <th>Title</th>
                  <th>Ack</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span
                        className={`pill ${
                          a.severity === "high" ? "pillHigh" : a.severity === "medium" ? "pillMed" : "pillLow"
                        }`}
                      >
                        {a.severity}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{a.alert_type}</td>
                    <td style={{ color: "var(--muted)" }}>{String(a.ts).replace("T", " ").slice(0, 16)}</td>
                    <td>{a.meter_id}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{a.title}</div>
                      {a.details ? <div style={{ color: "var(--muted)", marginTop: 4 }}>{a.details}</div> : null}
                    </td>
                    <td>
                      {a.acknowledged ? (
                        <span className="pill">Acked</span>
                      ) : (
                        <button className="btn" onClick={() => onAckAlert(a.id)}>
                          Ack
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!alerts.length ? (
                  <tr>
                    <td colSpan="6" style={{ color: "var(--muted)" }}>
                      No alerts for this site yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        )}

        {active === "benchmark" && (
          <section className="card">
            <div className="cardTitle">
              <h2>Benchmark vs similar sites</h2>
              <span>Group: Retail</span>
            </div>

            <div className="kpiRow">
              <div className="kpi">
                <label>Site total kWh</label>
                <strong>{benchmark ? formatKwh(benchmark.site_total_kwh) : "—"}</strong>
              </div>
              <div className="kpi">
                <label>Group avg total kWh</label>
                <strong>{benchmark ? formatKwh(benchmark.group_avg_total_kwh) : "—"}</strong>
              </div>
              <div className="kpi">
                <label>Group site count</label>
                <strong>{benchmark ? benchmark.group_site_count : "—"}</strong>
              </div>
            </div>

            <div className="notice">
              Benchmark is computed as total kWh within the selected date range, compared to the average of sites assigned to the selected group.
            </div>
          </section>
        )}

        {active === "export" && (
          <section className="card">
            <div className="cardTitle">
              <h2>Export snapshot</h2>
              <span>Download JSON for reporting / sharing</span>
            </div>

            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                maxHeight: 420,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              {exportJson}
            </pre>
          </section>
        )}
      </main>

      {showUpload ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Upload interval CSV">
          <div className="modal">
            <div className="modalHeader">
              <h3>Upload interval meter CSV</h3>
              <button className="btn" onClick={() => setShowUpload(false)}>
                Close
              </button>
            </div>

            <div className="modalBody">
              <div style={{ color: "var(--muted)" }}>
                CSV headers expected: <code>site_id</code>, <code>meter_id</code>, <code>ts</code>, <code>kwh</code>
                , optional <code>demand_kw</code>, <code>quality_flag</code>. Timestamp should be ISO8601.
              </div>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onUploadCsv(e.target.files && e.target.files[0])}
              />

              {uploadInfo ? <div className="notice">{uploadInfo}</div> : null}
              {busy ? <div className="notice">Processing…</div> : null}
            </div>

            <div className="modalActions">
              <button className="btn btnPrimary" onClick={() => setShowUpload(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
