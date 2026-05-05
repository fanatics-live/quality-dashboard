import type { DashboardData, VerticalStats, TeamStats } from "./types.js";
import type { CouncilResult } from "../types.js";

const LINEAR_ORG = "fanaticscollect";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linearTeamUrl(teamKey: string, view = "active"): string {
  return `https://linear.app/${LINEAR_ORG}/team/${teamKey}/${view}`;
}

function linearFilterUrl(teamKey: string, filters: Record<string, string>): string {
  const base = `https://linear.app/${LINEAR_ORG}/team/${teamKey}/all`;
  const params = Object.entries(filters).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return params ? `${base}?${params}` : base;
}

function linkedCount(count: number, url: string, cls = ""): string {
  if (count === 0) return `<span class="zero">0</span>`;
  const classAttr = cls ? ` class="${cls}"` : "";
  return `<a href="${esc(url)}" target="_blank"${classAttr}>${count}</a>`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function mdToHtml(md: string): string {
  return md
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*$)/gm, "<h4>$1</h4>")
    .replace(/^## (.*$)/gm, "<h3>$1</h3>")
    .replace(/^# (.*$)/gm, "<h2>$1</h2>")
    .replace(/^- (.*$)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

type Grade = "A" | "B" | "C" | "D" | "E";

function qualityGrade(s: { total: number; open: number; regression: number }): Grade {
  if (s.total === 0) return "A";
  const openRatio = s.open / Math.max(s.total, 1);
  const regrRatio = s.regression / Math.max(s.total, 1);
  const raw = 100
    - openRatio * 40
    - regrRatio * 30
    - Math.min(s.total / 20, 1) * 30;
  if (raw >= 80) return "A";
  if (raw >= 60) return "B";
  if (raw >= 40) return "C";
  if (raw >= 20) return "D";
  return "E";
}

const GRADE_COLORS: Record<Grade, string> = {
  A: "#059669", B: "#16a34a", C: "#d97706", D: "#ea580c", E: "#dc2626",
};
const GRADE_CSS: Record<Grade, string> = {
  A: "grade-a", B: "grade-b", C: "grade-c", D: "grade-d", E: "grade-e",
};

function sevColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s.includes("critical") || s === "sev0" || s === "p0") return "#dc2626";
  if (s.includes("high") || s === "sev1" || s === "p1") return "#ea580c";
  if (s.includes("medium") || s === "sev2" || s === "p2") return "#ca8a04";
  return "#6b7280";
}

function barChart(items: [string, number][], color = "#6366f1"): string {
  if (items.length === 0) return "<p class='empty'>No data</p>";
  const max = Math.max(...items.map(([, v]) => v), 1);
  return items
    .map(([label, value]) => {
      const pct = Math.max(Math.round((value / max) * 100), 2);
      return `<div class="bar-row"><span class="bar-label">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div><span class="bar-value">${value}</span></div></div>`;
    })
    .join("");
}

function donutSvg(segments: { label: string; value: number; color: string }[], size = 110): string {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="40" fill="none" stroke="#e2e8f0" stroke-width="14"/><text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-size="18" font-weight="700" fill="#64748b">0</text></svg>`;
  const cx = size / 2, cy = size / 2, r = 40;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const paths = segments.filter((s) => s.value > 0).map((seg) => {
    const dash = (seg.value / total) * circ;
    const p = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return p;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="18" font-weight="700">${total}</text></svg>`;
}

function subteamRows(subteams: Record<string, TeamStats>): string {
  return Object.entries(subteams)
    .sort(([a], [b]) => {
      if (a === "(main)") return -1;
      if (b === "(main)") return 1;
      return 0;
    })
    .map(([name, s]) => {
      const k = s.teamKey;
      const rPct = s.total > 0 ? Math.round((s.regression / s.total) * 100) : 0;
      const rCls = rPct > 30 ? "status-red" : rPct > 15 ? "status-yellow" : "";
      const triageUrl = linearTeamUrl(k, "triage");
      const openUrl = linearTeamUrl(k, "active");
      const regrUrl = linearFilterUrl(k, { label: "Regression bug" });
      const totalUrl = linearTeamUrl(k, "all");
      const openCls = s.open > 5 ? "status-red" : s.open > 2 ? "status-yellow" : "status-green";
      return `<tr>
        <td>${esc(name)}</td>
        <td>${linkedCount(s.total, totalUrl)}</td>
        <td>${linkedCount(s.triage, triageUrl, "status-yellow")}</td>
        <td>${linkedCount(s.open, openUrl, openCls)}</td>
        <td>${linkedCount(s.regression, regrUrl, "status-red")}</td>
        <td><span class="${rCls}">${rPct}%</span></td>
      </tr>`;
    })
    .join("");
}

// ── Build vertical detail page ──
function verticalPage(name: string, vs: VerticalStats, data: DashboardData): string {
  const grade = qualityGrade(vs);
  const bugs = data.bugs.bugs.filter((b) => b.vertical === name);
  const envCounts = new Map<string, number>();
  const sevCounts = new Map<string, number>();
  for (const b of bugs) {
    envCounts.set(b.environment, (envCounts.get(b.environment) ?? 0) + 1);
    sevCounts.set(b.severity, (sevCounts.get(b.severity) ?? 0) + 1);
  }

  return `
  <div class="page" id="page-${slug(name)}" style="display:none">
    <button class="back-btn" onclick="showHome()">&larr; Back to Overview</button>
    <div class="page-header">
      <h2>${esc(name)}</h2>
      <div class="grade-badge ${GRADE_CSS[grade]}">${grade}</div>
    </div>

    <div class="kpi-grid kpi-grid-4">
      <div class="kpi"><div class="value">${vs.total}</div><div class="label">Total Bugs</div><div class="detail">${vs.triage} triage · ${vs.open} open</div></div>
      <div class="kpi danger"><div class="value">${vs.regression}</div><div class="label">Regressions</div></div>
      <div class="kpi info"><div class="value">${vs.progression}</div><div class="label">Progressions</div></div>
      <div class="kpi"><div class="value">${Object.keys(vs.subteams).length}</div><div class="label">Sub-teams</div></div>
    </div>

    <section>
      <h3>Bug Breakdown by Sub-team</h3>
      <table>
        <thead><tr><th>Sub-team</th><th>Total</th><th>Triage</th><th>Open</th><th>Regr.</th><th>Regr. %</th></tr></thead>
        <tbody>${subteamRows(vs.subteams)}</tbody>
      </table>
    </section>

    <div class="grid-2">
      <section>
        <h3>By Environment</h3>
        ${barChart([...envCounts.entries()].sort(([, a], [, b]) => b - a), "#6366f1")}
      </section>
      <section>
        <h3>By Severity</h3>
        ${barChart([...sevCounts.entries()].sort(([, a], [, b]) => b - a), "#ea580c")}
      </section>
    </div>

    <section>
      <h3>Recent Bugs</h3>
      <table class="bug-table">
        <thead><tr><th>Title</th><th>Sub-team</th><th>Type</th><th>Env</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>
          ${bugs.slice(0, 30).map((b) => {
            const typeClass = b.type === "regression" ? "tag-red" : b.type === "progression" ? "tag-blue" : "tag-gray";
            return `<tr>
              <td><a href="${esc(b.url)}" target="_blank">${esc(b.title.length > 70 ? b.title.slice(0, 67) + "..." : b.title)}</a></td>
              <td>${esc(b.subteam || "(main)")}</td>
              <td><span class="tag ${typeClass}">${b.type}</span></td>
              <td>${esc(b.environment)}</td>
              <td><span style="color:${sevColor(b.severity)}">${b.severity}</span></td>
              <td>${esc(b.status)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      ${bugs.length > 30 ? `<p class="detail" style="margin-top:8px">Showing 30 of ${bugs.length} bugs</p>` : ""}
    </section>
  </div>`;
}

// ── Main export ──
export function generateHtmlReport(data: DashboardData, council: CouncilResult | null): string {
  const verticals = Object.entries(data.bugs.byVertical).sort(([, a], [, b]) => b.total - a.total);
  const overallGrade = qualityGrade({ total: data.bugs.total, open: data.bugs.open, regression: data.bugs.byType.regression });

  // Vertical cards for homepage
  const verticalCards = verticals.map(([name, vs]) => {
    const grade = qualityGrade(vs);
    return `<div class="vertical-card" onclick="showPage('${slug(name)}')">
      <div class="vc-header">
        <span class="vc-name">${esc(name)}</span>
        <span class="grade-badge-sm ${GRADE_CSS[grade]}">${grade}</span>
      </div>
      <div class="vc-stats">
        <span>${vs.total} bugs</span>
        <span class="${vs.open > 5 ? "status-red" : vs.open > 2 ? "status-yellow" : "status-green"}">${vs.open} open</span>
        <span>${vs.regression} regr.</span>
      </div>
      <div class="vc-subteams">${Object.keys(vs.subteams).length} sub-team${Object.keys(vs.subteams).length > 1 ? "s" : ""}</div>
    </div>`;
  }).join("");

  // Council section
  const councilHtml = council
    ? `<section class="council">
        <h2>Council Analysis</h2>
        <div class="council-meta">
          <span>Agreement: <strong>${council.convergence.agreementScore}%</strong></span>
          <span>Rounds: <strong>${council.rounds}</strong></span>
          <span>Audit: <strong class="${council.audit.verdict === "CLEAN" ? "status-green" : "status-yellow"}">${council.audit.verdict}</strong></span>
        </div>
        ${council.synthesis.summary ? `<div class="executive-summary"><h3>Executive Summary</h3><p>${mdToHtml(council.synthesis.summary)}</p></div>` : ""}
        <div class="council-detail">${mdToHtml(council.synthesis.detail || council.synthesis.raw)}</div>
        ${council.synthesis.caveats ? `<div class="caveats"><h3>Caveats</h3><p>${mdToHtml(council.synthesis.caveats)}</p></div>` : ""}
      </section>`
    : "";

  // Generate detail pages for each vertical
  const detailPages = verticals.map(([name, vs]) => verticalPage(name, vs, data)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quality Dashboard — ${data.period.start} to ${data.period.end}</title>
<style>
  :root {
    --bg: #f1f5f9; --card: #ffffff; --text: #1e293b; --muted: #64748b;
    --border: #e2e8f0; --primary: #6366f1; --success: #059669;
    --warning: #d97706; --danger: #dc2626; --info: #2563eb;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }

  .header { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 28px 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-left h1 { font-size: 24px; font-weight: 700; }
  .header-left .subtitle { color: #c7d2fe; font-size: 13px; }
  .header-right { display: flex; align-items: center; gap: 16px; }
  .header-right .period { background: rgba(255,255,255,0.15); padding: 4px 14px; border-radius: 20px; font-size: 13px; }
  .overall-score { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; border: 3px solid rgba(255,255,255,0.3); }

  .container { max-width: 1280px; margin: 0 auto; padding: 24px 20px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .kpi-grid-4 { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .kpi { background: var(--card); border-radius: 10px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-left: 4px solid var(--primary); }
  .kpi .value { font-size: 32px; font-weight: 800; line-height: 1.1; }
  .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-top: 2px; }
  .kpi .detail { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .kpi.danger { border-left-color: var(--danger); }
  .kpi.warning { border-left-color: var(--warning); }
  .kpi.success { border-left-color: var(--success); }
  .kpi.info { border-left-color: var(--info); }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

  section { background: var(--card); border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  section h2 { font-size: 17px; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
  section h3 { font-size: 14px; font-weight: 600; margin: 14px 0 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { background: #f8fafc; }
  th { text-align: left; padding: 8px 10px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--muted); border-bottom: 2px solid var(--border); }
  td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: #f8fafc; }
  a { color: var(--primary); text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  a.status-red { color: var(--danger); }
  a.status-yellow { color: var(--warning); }
  a.status-green { color: var(--success); }
  .zero { color: #d1d5db; }

  .bug-table td { font-size: 12px; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .tag-red { background: #fef2f2; color: #dc2626; }
  .tag-blue { background: #eff6ff; color: #2563eb; }
  .tag-gray { background: #f1f5f9; color: #64748b; }

  .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
  .bar-label { width: 110px; font-size: 12px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { display: flex; align-items: center; flex: 1; }
  .bar-fill { height: 20px; border-radius: 4px; transition: width 0.3s; }
  .bar-value { font-size: 12px; font-weight: 600; margin-left: 8px; }

  .status-red { color: var(--danger); font-weight: 700; }
  .status-yellow { color: var(--warning); font-weight: 700; }
  .status-green { color: var(--success); font-weight: 700; }
  .empty { color: var(--muted); font-style: italic; }

  /* Grade badges */
  .grade-badge { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 900; color: white; flex-shrink: 0; letter-spacing: -0.5px; }
  .grade-badge-sm { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; color: white; flex-shrink: 0; }
  .overall-grade { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 900; color: white; border: 3px solid rgba(255,255,255,0.3); }
  .grade-a { background: #059669; }
  .grade-b { background: #16a34a; }
  .grade-c { background: #d97706; }
  .grade-d { background: #ea580c; }
  .grade-e { background: #dc2626; }

  /* Vertical cards grid */
  .verticals-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; margin-bottom: 12px; }
  .verticals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .vertical-card { background: var(--card); border-radius: 10px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; border-left: 4px solid var(--primary); }
  .vertical-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  .vc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .vc-name { font-size: 15px; font-weight: 700; }
  .vc-stats { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
  .vc-subteams { font-size: 11px; color: var(--muted); margin-top: 6px; }

  /* Page navigation */
  .back-btn { background: none; border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; margin-bottom: 16px; color: var(--text); }
  .back-btn:hover { background: #f8fafc; }
  .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .page-header h2 { font-size: 22px; margin: 0; border: none; padding: 0; }

  /* Council */
  .council { border-top: 4px solid var(--primary); }
  .council-meta { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 8px; font-size: 13px; }
  .council-meta span { color: var(--muted); }
  .executive-summary { background: #eef2ff; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px; }
  .executive-summary h3 { margin-top: 0; color: #4338ca; }
  .council-detail { font-size: 13px; line-height: 1.7; }
  .council-detail ul { margin: 6px 0; padding-left: 18px; }
  .council-detail li { margin-bottom: 3px; }
  .caveats { background: #fffbeb; border-radius: 8px; padding: 10px 14px; margin-top: 14px; font-size: 12px; }
  .caveats h3 { color: var(--warning); margin-top: 0; }

  /* Donut */
  .donut-row { display: flex; align-items: center; gap: 20px; }
  .donut-legend { font-size: 12px; }
  .donut-legend div { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }

  .footer { text-align: center; padding: 20px; color: var(--muted); font-size: 11px; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Quality Dashboard</h1>
    <div class="subtitle">Weekly Quality Report — Fanatics Live</div>
  </div>
  <div class="header-right">
    <div class="period">${data.period.start} &rarr; ${data.period.end}</div>
    <div class="overall-grade ${GRADE_CSS[overallGrade]}">${overallGrade}</div>
  </div>
</div>

<div class="container">

  <!-- ═══ HOME PAGE ═══ -->
  <div id="page-home">

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi ${data.bugs.open > 20 ? "danger" : data.bugs.open > 10 ? "warning" : "success"}">
        <div class="value">${data.bugs.total}</div>
        <div class="label">Total Bugs</div>
        <div class="detail">${data.bugs.triage} triage · ${data.bugs.open} open · ${data.bugs.closed} closed</div>
      </div>
      <div class="kpi ${data.bugs.byType.regression > 5 ? "danger" : data.bugs.byType.regression > 2 ? "warning" : "success"}">
        <div class="value">${data.bugs.byType.regression}</div>
        <div class="label">Regressions</div>
        <div class="detail">${data.bugs.byType.progression} progressions</div>
      </div>
      <div class="kpi ${data.incidents.total > 5 ? "danger" : data.incidents.total > 2 ? "warning" : "info"}">
        <div class="value">${data.incidents.total}</div>
        <div class="label">Incidents</div>
        <div class="detail">MTTR: ${data.incidents.mttr != null ? data.incidents.mttr + " min" : "N/A"}</div>
      </div>
      <div class="kpi ${data.automation.coveragePercent >= 60 ? "success" : data.automation.coveragePercent >= 30 ? "warning" : "danger"}">
        <div class="value">${data.automation.coveragePercent}%</div>
        <div class="label">Automation Coverage</div>
        <div class="detail">${data.automation.automatedCases} / ${data.automation.totalCases}</div>
      </div>
      <div class="kpi info">
        <div class="value">${data.automation.averagePassRate}%</div>
        <div class="label">Pass Rate</div>
        <div class="detail">${data.automation.totalRuns} runs</div>
      </div>
      <div class="kpi ${data.bugs.mttr != null && data.bugs.mttr > 72 ? "danger" : "info"}">
        <div class="value">${data.bugs.mttr != null ? data.bugs.mttr + "h" : "N/A"}</div>
        <div class="label">Bug MTTR</div>
        <div class="detail">Mean time to resolve</div>
      </div>
    </div>

    <!-- Verticals -->
    <div class="verticals-label">Quality by Vertical — click for details</div>
    <div class="verticals-grid">
      ${verticalCards}
    </div>

    <!-- Charts row -->
    <div class="grid-2">
      <section>
        <h2>Bug Classification</h2>
        <div class="donut-row">
          ${donutSvg([
            { label: "Regression", value: data.bugs.byType.regression, color: "#dc2626" },
            { label: "Progression", value: data.bugs.byType.progression, color: "#2563eb" },
            { label: "Unclassified", value: data.bugs.byType.unknown, color: "#9ca3af" },
          ])}
          <div class="donut-legend">
            <div><span class="legend-dot" style="background:#dc2626"></span>Regression: ${data.bugs.byType.regression}</div>
            <div><span class="legend-dot" style="background:#2563eb"></span>Progression: ${data.bugs.byType.progression}</div>
            <div><span class="legend-dot" style="background:#9ca3af"></span>Unclassified: ${data.bugs.byType.unknown}</div>
          </div>
        </div>
      </section>
      <section>
        <h2>Bugs by Environment</h2>
        ${barChart(Object.entries(data.bugs.byEnvironment).sort(([, a], [, b]) => b - a), "#6366f1")}
      </section>
    </div>

    <div class="grid-2">
      <section>
        <h2>Bugs by Severity</h2>
        ${barChart(Object.entries(data.bugs.bySeverity).sort(([, a], [, b]) => b - a), "#ea580c")}
      </section>
      <section>
        <h2>Incidents by Severity</h2>
        ${data.incidents.total > 0
          ? barChart(Object.entries(data.incidents.bySeverity).sort(([, a], [, b]) => b - a), "#dc2626")
          : "<p class='empty'>No incident data</p>"}
      </section>
    </div>

    <!-- Automation -->
    <section>
      <h2>Test Automation (QASE.io)</h2>
      ${data.automation.projects.length > 0 ? `<table>
        <thead><tr><th>Project</th><th>Total Cases</th><th>Automated</th><th>Coverage</th><th>Pass Rate</th><th>Runs</th></tr></thead>
        <tbody>
          ${data.automation.projects.map((p) => {
            const cov = p.totalCases > 0 ? Math.round((p.automatedCases / p.totalCases) * 100) : 0;
            const lr = p.runs[0];
            const pr = lr && lr.stats.total > 0 ? Math.round((lr.stats.passed / lr.stats.total) * 100) : null;
            const covCls = cov >= 60 ? "status-green" : cov >= 30 ? "status-yellow" : "status-red";
            const prCls = pr !== null ? (pr >= 90 ? "status-green" : pr >= 70 ? "status-yellow" : "status-red") : "";
            return `<tr><td><strong>${esc(p.projectName)}</strong></td><td>${p.totalCases}</td><td>${p.automatedCases}</td><td><span class="${covCls}">${cov}%</span></td><td><span class="${prCls}">${pr !== null ? pr + "%" : "N/A"}</span></td><td>${p.runs.length}</td></tr>`;
          }).join("")}
        </tbody>
      </table>` : "<p class='empty'>No automation data</p>"}
    </section>

    <!-- Council -->
    ${councilHtml}

  </div>

  <!-- ═══ VERTICAL DETAIL PAGES ═══ -->
  ${detailPages}

</div>

<div class="footer">
  Generated on ${new Date(data.generatedAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
  · Powered by LLM Council
</div>

<script>
function showPage(id) {
  document.getElementById('page-home').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const el = document.getElementById('page-' + id);
  if (el) { el.style.display = 'block'; window.scrollTo(0, 0); }
}
function showHome() {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('page-home').style.display = 'block';
  window.scrollTo(0, 0);
}
</script>

</body>
</html>`;
}
