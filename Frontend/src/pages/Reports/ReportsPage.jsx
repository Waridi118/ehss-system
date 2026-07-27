import { useState, useEffect } from "react";
import "./ReportsPage.css";
import apiFetch from "../../utils/api";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function formatKES(n) {
  return `KES ${Number(n).toLocaleString()}`;
}
function formatMonth(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

const PIE_COLORS = ["#2ecc71", "#f39c12", "#e74c3c"];
const COST_PIE_COLORS = [
  "#1a5276",
  "#27ae60",
  "#e67e22",
  "#8e44ad",
  "#c0392b",
  "#16a085",
];

function calcScope1(r, factors) {
  return (
    r.petrol_litres * factors.petrol +
    r.diesel_litres * factors.diesel +
    r.firewood_tonnes * factors.firewood +
    r.lpg_kg * factors.lpg
  );
}
function calcScope2(r, factors) {
  return r.electricity_kwh * factors.electricity;
}

function getCompStatus(item) {
  if (!item.date_of_expiry) return "Pending";

  const today = new Date();
  const expiry = new Date(item.date_of_expiry);
  const daysLeft = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return "Expired";
  if (daysLeft <= 60) return "Expiring soon";
  return "Valid";
}
function getCostTypeBadgeClass(type) {
  switch (type) {
    case "statutory_requirement":
      return "badge-statutory";
    case "staff_welfare":
      return "badge-welfare";
    case "ppe_provision":
      return "badge-ppe";
    case "improvement_initiative":
      return "badge-improvement";
    case "waste_management":
      return "badge-waste";
    case "training_best_practice":
      return "badge-training-best";
    case "training_standard_requirement":
      return "badge-training-standard";
    case "training_statutory_requirement":
      return "badge-training-statutory";
    default:
      return "badge-other";
  }
}
function friendlyCostType(type) {
  switch (type) {
    case "statutory_requirement":
      return "Statutory requirement";
    case "staff_welfare":
      return "Staff welfare";
    case "ppe_provision":
      return "PPE provision";
    case "waste_management":
      return "Waste management";
    case "training_best_practice":
      return "Training - Best practice";
    case "training_standard_requirement":
      return "Training - Standard requirement";
    case "training_statutory_requirement":
      return "Training - Statutory requirement";
    case "improvement_initiative":
      return "Improvement initiative";
    default:
      return type;
  }
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState("monthly_summary");
  const [generated, setGenerated] = useState(false);
  const [selectedPPE, setSelectedPPE] = useState("");
  const [loading, setLoading] = useState(false);

  // Data state for each module
  const [safetyRecords, setSafetyRecords] = useState([]);
  const [costRecords, setCostRecords] = useState([]);
  const [complianceItems, setComplianceItems] = useState([]);
  const [ppeItems, setPpeItems] = useState([]);
  const [ppeRequests, setPpeRequests] = useState([]);
  const [sustainabilityRecords, setSustainabilityRecords] = useState([]);
  const [emissionFactors, setEmissionFactors] = useState({
    petrol: 0,
    diesel: 0,
    firewood: 0,
    lpg: 0,
    electricity: 0,
  });
  const [actionTrackerData, setActionTrackerData] = useState([]);
  const [calendarActivities, setCalendarActivities] = useState([]);
  const [safetyData, setSafetyData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);

  const totalCost = costRecords.reduce((s, r) => s + r.cost_excl_vat, 0);
  const costTotals = costRecords.reduce((acc, r) => {
    acc[r.cost_type] = (acc[r.cost_type] || 0) + r.cost_excl_vat;
    return acc;
  }, {});
  const sortedCostTypes = Object.entries(costTotals).sort(
    (a, b) => b[1] - a[1],
  );
  const [highestCostType, highestCostValue] = sortedCostTypes[0] || ["None", 0];
  const [secondCostType, secondCostValue] = sortedCostTypes[1] || ["None", 0];
  const outsideBudget = costRecords
    .filter((r) => r.budget_status === "outside_budget")
    .reduce((s, r) => s + r.cost_excl_vat, 0);
  const costByMonth = (() => {
    const monthOrder = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const months = {};

    costRecords.forEach((r) => {
      const month = new Date(r.date).toLocaleDateString("en-GB", {
        month: "short",
      });

      if (!months[month]) {
        months[month] = {
          month,
          statutory: 0,
          staff_welfare: 0,
          ppe: 0,
          improvement: 0,
          waste: 0,
          training_best: 0,
          training_standard: 0,
          training_statutory: 0,
        };
      }

      switch (r.cost_type) {
        case "statutory_requirement":
          months[month].statutory += r.cost_excl_vat;
          break;

        case "staff_welfare":
          months[month].staff_welfare += r.cost_excl_vat;
          break;

        case "ppe_provision":
          months[month].ppe += r.cost_excl_vat;
          break;

        case "improvement_initiative":
          months[month].improvement += r.cost_excl_vat;
          break;

        case "waste_management":
          months[month].waste += r.cost_excl_vat;
          break;

        case "training_best_practice":
          months[month].training_best += r.cost_excl_vat;
          break;

        case "training_standard_requirement":
          months[month].training_standard += r.cost_excl_vat;
          break;

        case "training_statutory_requirement":
          months[month].training_statutory += r.cost_excl_vat;
          break;
      }
    });

    return monthOrder.filter((m) => months[m]).map((m) => months[m]);
  })();
  const COST_COLORS = {
    statutory: "#1a5276",
    staff_welfare: "#27ae60",
    ppe: "#e67e22",
    improvement: "#8e44ad",
    waste: "#16a085",
    training_best: "#f39c12",
    training_standard: "#c0392b",
    training_statutory: "#2c3e50",
  };
  const totalIncidents = safetyRecords.reduce(
    (s, r) => s + r.medical_treatment_incidents + r.lost_time_incidents,
    0,
  );
  const totalTraining = safetyRecords.reduce(
    (s, r) => s + r.hse_training_hours,
    0,
  );
  const complianceWithStatus = complianceItems.map((c) => ({
    ...c,
    status: getCompStatus(c),
  }));
  const expired = complianceWithStatus.filter((c) => c.status === "Expired");
  const expiring = complianceWithStatus.filter(
    (c) => c.status === "Expiring soon",
  );
  const lowStock = ppeItems.filter((p) => p.current_stock <= p.reorder_level);

  // PPE fast-moving chart data — for now uses transaction-less sample;
  // shows current stock per month placeholder until real transaction history connects
  const selectedItem = ppeItems.find((p) => p.id === Number(selectedPPE));
  const ppeMonthlyData = ["Jan", "Feb", "Mar", "Apr"].map((m, i) => ({
    month: m,
    stock: selectedItem
      ? Math.max(selectedItem.current_stock + (3 - i) * 5, 0)
      : 0,
    restocked: i === 1 ? 20 : 0,
  }));

  async function handleGenerate() {
    setLoading(true);
    setGenerated(false);

    try {
      if (reportType === "monthly_summary") {
        const [
          safety,
          costs,
          compliance,
          ppe,
          ppeReqs,
          sustainability,
          factors,
          actions,
          calendar,
          equipment,
        ] = await Promise.all([
          apiFetch(`/safety`).then((r) => r.json()),
          apiFetch(`/costs`).then((r) => r.json()),
          apiFetch(`/compliance`).then((r) => r.json()),
          apiFetch(`/ppe`).then((r) => r.json()),
          apiFetch(`/ppe/requests`).then((r) => r.json()),
          apiFetch(`/sustainability`).then((r) => r.json()),
          apiFetch(`/sustainability/factors`).then((r) => r.json()),
          apiFetch(`/actionTracker`).then((r) => r.json()),
          apiFetch(`/calendar`).then((r) => r.json()),
          apiFetch(`/equipment`).then((r) => r.json()),
        ]);

        setSafetyRecords(
          safety.map((r) => ({ ...r, period: r.period?.split("T")[0] })),
        );
        setCostRecords(
          costs.map((r) => ({
            ...r,
            date: r.date?.split("T")[0],
            cost_excl_vat: Number(r.cost_excl_vat),
          })),
        );
        setComplianceItems(
          compliance.map((c) => ({
            ...c,
            date_of_expiry: c.date_of_expiry?.split("T")[0] || "",
          })),
        );
        setPpeItems(ppe);
        setPpeRequests(ppeReqs);
        setSelectedPPE(ppe[0]?.id || "");
        setSustainabilityRecords(
          sustainability.map((r) => ({
            ...r,
            period: r.period?.split("T")[0],
          })),
        );
        const factorsObj = {};
        factors.forEach((f) => {
          factorsObj[f.factor_name] = Number(f.value);
        });
        setEmissionFactors(factorsObj);
        setActionTrackerData(
          actions.map((a) => ({
            ...a,
            targetDate: a.target_date?.split("T")[0],
          })),
        );
        setCalendarActivities(
          calendar.map((a) => ({
            ...a,
            scheduled_month: a.scheduled_month?.split("T")[0],
          })),
        );
        setEquipmentData(
          equipment.map((e) => ({
            ...e,
            last_inspection: e.last_inspection?.split("T")[0] || "",
            next_inspection: e.next_inspection?.split("T")[0] || "",
          })),
        );
      }

      if (reportType === "compliance") {
        const data = await apiFetch(`/compliance`).then((r) => r.json());
        setComplianceItems(
          data.map((c) => ({
            ...c,
            date_of_expiry: c.date_of_expiry?.split("T")[0] || "",
          })),
        );
      }

      if (reportType === "costs") {
        const data = await apiFetch(`/costs`).then((r) => r.json());
        setCostRecords(
          data.map((r) => ({
            ...r,
            date: r.date?.split("T")[0],
            cost_excl_vat: Number(r.cost_excl_vat),
          })),
        );
      }

      if (reportType === "ppe" || reportType === "ppe_trend") {
        const [data, reqs] = await Promise.all([
          apiFetch(`/ppe`).then((r) => r.json()),
          apiFetch(`/ppe/requests`).then((r) => r.json()),
        ]);
        setPpeItems(data);
        setPpeRequests(reqs);
        if (!selectedPPE && data.length > 0) setSelectedPPE(data[0].id);
      }

      if (reportType === "sustainability") {
        const [records, factors] = await Promise.all([
          apiFetch(`/sustainability`).then((r) => r.json()),
          apiFetch(`/sustainability/factors`).then((r) => r.json()),
        ]);
        setSustainabilityRecords(
          records.map((r) => ({ ...r, period: r.period?.split("T")[0] })),
        );
        const factorsObj = {};
        factors.forEach((f) => {
          factorsObj[f.factor_name] = Number(f.value);
        });
        setEmissionFactors(factorsObj);
      }

      if (reportType === "action_tracker") {
        const data = await apiFetch(`/actionTracker`).then((r) => r.json());
        setActionTrackerData(
          data.map((a) => ({ ...a, targetDate: a.target_date?.split("T")[0] })),
        );
      }

      if (reportType === "calendar") {
        const data = await apiFetch(`/calendar`).then((r) => r.json());
        setCalendarActivities(
          data.map((a) => ({
            ...a,
            scheduled_month: a.scheduled_month?.split("T")[0],
          })),
        );
      }

      if (reportType === "safety") {
        const data = await apiFetch(`/safety`).then((r) => r.json());
        setSafetyRecords(
          data.map((r) => ({ ...r, period: r.period?.split("T")[0] })),
        );
      }

      if (reportType === "equipment") {
        const data = await apiFetch(`/equipment`).then((r) => r.json());
        setEquipmentData(
          data.map((e) => ({
            ...e,
            next_inspection: e.next_inspection?.split("T")[0] || "",
          })),
        );
      }

      setGenerated(true);
    } catch (err) {
      console.error("Failed to fetch report data:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rep-page">
      <div className="rep-header">
        <div>
          <h1 className="rep-title">Reports</h1>
          <p className="rep-subtitle">
            Reports pull live data directly from each module.
          </p>
        </div>
      </div>

      <div className="rep-selector-wrap">
        <div className="rep-form-group">
          <label className="rep-form-label">Report type</label>
          <select
            className="rep-select"
            value={reportType}
            onChange={async (e) => {
              const type = e.target.value;
              setReportType(type);
              setGenerated(false);

              // Pre-fetch PPE items so the item selector dropdown populates immediately
              if (type === "ppe_trend") {
                const data = await apiFetch(`/ppe`).then((r) => r.json());
                setPpeItems(data);
                if (data.length > 0) setSelectedPPE(data[0].id);
              }
            }}
          >
            <option value="monthly_summary">Monthly EHSS Summary Report</option>
            <option value="safety">Safety Metrics Report</option>
            <option value="compliance">Compliance Status Report</option>
            <option value="costs">Cost Analysis Report</option>
            <option value="calendar">Calendar / Activities Report</option>
            <option value="equipment">Equipment Register Report</option>
            <option value="ppe">PPE Stock Report</option>
            <option value="ppe_trend">PPE Fast-Moving Items</option>
            <option value="sustainability">Sustainability Report</option>
            <option value="action_tracker">Action Tracker Report</option>
          </select>
        </div>
        {reportType === "ppe_trend" && (
          <div className="rep-form-group">
            <label className="rep-form-label">Select item</label>
            <select
              className="rep-select"
              value={selectedPPE}
              onChange={(e) => setSelectedPPE(e.target.value)}
            >
              {ppeItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.item_name} — {p.size_spec}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="rep-btn-primary" onClick={handleGenerate}>
          {loading ? "Loading..." : "Generate report"}
        </button>
      </div>

      {generated && (
        <div className="rep-preview">
          {reportType === "monthly_summary" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">
                    Monthly EHSS Summary Report
                  </div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>

              <div className="rep-section-title">Safety performance</div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total incidents</div>
                  <div className="rep-card-value red">{totalIncidents}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Training hours</div>
                  <div className="rep-card-value">{totalTraining}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Records logged</div>
                  <div className="rep-card-value">{safetyRecords.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Fatalities</div>
                  <div className="rep-card-value green">0</div>
                </div>
              </div>
              <div style={{ height: 160, minHeight: 160, marginTop: "10px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={safetyRecords.map((r) => {
                      const wh = Number(r.worked_hours);
                      const mti = Number(r.medical_treatment_incidents);
                      const lti = Number(r.lost_time_incidents);
                      const fat = Number(r.fatalities);
                      return {
                        month: formatMonth(r.period),
                        TRIFR: wh
                          ? +(((mti + lti + fat) * 1000000) / wh).toFixed(2)
                          : 0,
                        LTIFR: wh ? +((lti * 1000000) / wh).toFixed(2) : 0,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="TRIFR" fill="#c0392b" />
                    <Bar dataKey="LTIFR" fill="#1a5276" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Cost summary
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total Spend</div>
                  <div className="rep-card-value">{formatKES(totalCost)}</div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">Highest Cost Type</div>

                  <div style={{ marginTop: "8px" }}>
                    <span
                      className={`costs-badge ${getCostTypeBadgeClass(highestCostType)}`}
                    >
                      {friendlyCostType(highestCostType)}
                    </span>
                  </div>

                  <div className="costs-card-sub">
                    {formatKES(highestCostValue)}
                  </div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">2nd Highest Cost Type</div>

                  <div style={{ marginTop: "8px" }}>
                    <span
                      className={`costs-badge ${getCostTypeBadgeClass(secondCostType)}`}
                    >
                      {friendlyCostType(secondCostType)}
                    </span>
                  </div>

                  <div className="costs-card-sub">
                    {formatKES(secondCostValue)}
                  </div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">Outside Budget</div>

                  <div
                    className={`rep-card-value ${outsideBudget > 0 ? "red" : "green"}`}
                  >
                    {formatKES(outsideBudget)}
                  </div>
                </div>
              </div>

              <div
                style={{ height: 250, minHeight: 250, marginBottom: "16px" }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(
                      costRecords.reduce((acc, r) => {
                        acc[r.cost_type] =
                          (acc[r.cost_type] || 0) + r.cost_excl_vat;
                        return acc;
                      }, {}),
                    ).map(([name, value]) => ({ name, value }))}
                    margin={{ top: 10, right: 20, left: 60, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v) => formatKES(v)} />
                    <Bar dataKey="value" name="Total cost" fill="#1a5276" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Compliance alerts
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total items</div>
                  <div className="rep-card-value">
                    {complianceWithStatus.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Valid</div>
                  <div className="rep-card-value green">
                    {
                      complianceWithStatus.filter((c) => c.status === "Valid")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Expiring soon</div>
                  <div className="rep-card-value amber">
                    {
                      complianceWithStatus.filter(
                        (c) => c.status === "Expiring soon",
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Expired</div>
                  <div className="rep-card-value red">
                    {
                      complianceWithStatus.filter((c) => c.status === "Expired")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Pending</div>
                  <div className="rep-card-value">
                    {
                      complianceWithStatus.filter((c) => c.status === "Pending")
                        .length
                    }
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...expired, ...expiring].map((c, i) => (
                      <tr key={i}>
                        <td>{c.requirement}</td>
                        <td>{c.date_of_expiry || "—"}</td>
                        <td>
                          <span
                            className={`rep-badge ${c.status === "Expired" ? "badge-expired" : "badge-expiring"}`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                PPE stock alerts
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total items</div>
                  <div className="rep-card-value">{ppeItems.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">OK</div>
                  <div className="rep-card-value green">
                    {
                      ppeItems.filter((p) => p.current_stock > p.reorder_level)
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Low stock</div>
                  <div className="rep-card-value amber">
                    {
                      ppeItems.filter(
                        (p) =>
                          p.current_stock > 0 &&
                          p.current_stock <= p.reorder_level,
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Out of stock</div>
                  <div className="rep-card-value red">
                    {ppeItems.filter((p) => p.current_stock === 0).length}
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Size</th>
                      <th>Stock</th>
                      <th>Reorder</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((p, i) => (
                      <tr key={i}>
                        <td>{p.item_name}</td>
                        <td>{p.size_spec}</td>
                        <td>{p.current_stock}</td>
                        <td>{p.reorder_level}</td>
                        <td>
                          <span
                            className={`rep-badge ${p.current_stock === 0 ? "badge-expired" : "badge-expiring"}`}
                          >
                            {p.current_stock === 0
                              ? "Out of stock"
                              : "Low stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Sustainability
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total Scope 1 (kg CO2)</div>
                  <div className="rep-card-value">
                    {sustainabilityRecords
                      .reduce((s, r) => s + calcScope1(r, emissionFactors), 0)
                      .toFixed(2)}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Total Scope 2 (kg CO2)</div>
                  <div className="rep-card-value">
                    {sustainabilityRecords
                      .reduce((s, r) => s + calcScope2(r, emissionFactors), 0)
                      .toFixed(2)}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Total water (m³)</div>
                  <div className="rep-card-value">
                    {sustainabilityRecords
                      .reduce((s, r) => s + Number(r.water_consumption_m3), 0)
                      .toLocaleString()}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Total electricity (kWh)</div>
                  <div className="rep-card-value">
                    {sustainabilityRecords
                      .reduce((s, r) => s + Number(r.electricity_kwh), 0)
                      .toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ height: 180, minHeight: 180, marginTop: "10px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sustainabilityRecords.map((r) => ({
                      month: formatMonth(r.period),
                      Scope1: +calcScope1(r, emissionFactors).toFixed(2),
                      Scope2: +calcScope2(r, emissionFactors).toFixed(2),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Scope1" fill="#c0392b" />
                    <Bar dataKey="Scope2" fill="#1a5276" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Action tracker
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total</div>
                  <div className="rep-card-value">
                    {actionTrackerData.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Completed</div>
                  <div className="rep-card-value green">
                    {
                      actionTrackerData.filter((a) => a.status === "Completed")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">In Progress</div>
                  <div className="rep-card-value amber">
                    {
                      actionTrackerData.filter(
                        (a) => a.status === "In Progress",
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Pending</div>
                  <div className="rep-card-value red">
                    {
                      actionTrackerData.filter((a) => a.status === "Pending")
                        .length
                    }
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: "Pending",
                        value: actionTrackerData.filter(
                          (a) => a.status === "Pending",
                        ).length,
                      },
                      {
                        name: "In Progress",
                        value: actionTrackerData.filter(
                          (a) => a.status === "In Progress",
                        ).length,
                      },
                      {
                        name: "Completed",
                        value: actionTrackerData.filter(
                          (a) => a.status === "Completed",
                        ).length,
                      },
                    ]}
                    dataKey="value"
                    outerRadius={100}
                    label
                  >
                    <Cell fill="#e67e22" />
                    <Cell fill="#3498db" />
                    <Cell fill="#27ae60" />
                  </Pie>

                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                EHSS calendar
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total activities</div>
                  <div className="rep-card-value">
                    {calendarActivities.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Completed</div>
                  <div className="rep-card-value green">
                    {
                      calendarActivities.filter((a) => a.status === "completed")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Scheduled</div>
                  <div className="rep-card-value">
                    {
                      calendarActivities.filter((a) => a.status === "scheduled")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Not conducted</div>
                  <div className="rep-card-value red">
                    {
                      calendarActivities.filter(
                        (a) => a.status === "not_conducted",
                      ).length
                    }
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: "Scheduled",
                        value: calendarActivities.filter(
                          (a) => a.status === "scheduled",
                        ).length,
                      },
                      {
                        name: "Completed",
                        value: calendarActivities.filter(
                          (a) => a.status === "completed",
                        ).length,
                      },
                      {
                        name: "Rescheduled",
                        value: calendarActivities.filter(
                          (a) => a.status === "rescheduled",
                        ).length,
                      },
                      {
                        name: "Not Conducted",
                        value: calendarActivities.filter(
                          (a) => a.status === "not_conducted",
                        ).length,
                      },
                    ]}
                    dataKey="value"
                    outerRadius={100}
                    label
                  >
                    <Cell fill="#3498db" />
                    <Cell fill="#27ae60" />
                    <Cell fill="#f39c12" />
                    <Cell fill="#e74c3c" />
                  </Pie>

                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Equipment register
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total equipment</div>
                  <div className="rep-card-value">{equipmentData.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Available</div>
                  <div className="rep-card-value green">
                    {
                      equipmentData.filter((e) => e.status === "Available")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">In use</div>
                  <div className="rep-card-value">
                    {equipmentData.filter((e) => e.status === "In Use").length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Maintenance</div>
                  <div className="rep-card-value red">
                    {
                      equipmentData.filter((e) => e.status === "Maintenance")
                        .length
                    }
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Next Inspection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentData
                      .filter((e) => {
                        const due = e.next_inspection
                          ? new Date(e.next_inspection)
                          : null;
                        const daysLeft = due
                          ? Math.floor(
                              (due - new Date()) / (1000 * 60 * 60 * 24),
                            )
                          : null;
                        return daysLeft !== null && daysLeft <= 60;
                      })
                      .map((e, i) => {
                        const due = new Date(e.next_inspection);
                        const daysLeft = Math.floor(
                          (due - new Date()) / (1000 * 60 * 60 * 24),
                        );
                        return (
                          <tr
                            key={i}
                            className={daysLeft < 0 ? "row-incident" : ""}
                          >
                            <td>{e.name}</td>
                            <td>{e.description}</td>
                            <td>{e.status}</td>
                            <td>
                              {e.next_inspection}{" "}
                              <span
                                className={`rep-badge ${daysLeft < 0 ? "badge-expired" : "badge-expiring"}`}
                              >
                                {daysLeft < 0 ? "Overdue" : "Due soon"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "safety" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">Safety Metrics Report</div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total incidents</div>
                  <div className="rep-card-value red">
                    {safetyRecords.reduce(
                      (s, r) =>
                        s +
                        Number(r.medical_treatment_incidents) +
                        Number(r.lost_time_incidents),
                      0,
                    )}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Training hours</div>
                  <div className="rep-card-value">
                    {safetyRecords.reduce(
                      (s, r) => s + Number(r.hse_training_hours),
                      0,
                    )}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Fatalities</div>
                  <div className="rep-card-value green">
                    {safetyRecords.reduce(
                      (s, r) => s + Number(r.fatalities),
                      0,
                    )}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Inspections</div>
                  <div className="rep-card-value">
                    {safetyRecords.reduce(
                      (s, r) => s + Number(r.hse_inspections),
                      0,
                    )}
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Staff</th>
                      <th>MTI</th>
                      <th>LTI</th>
                      <th>Days Away</th>
                      <th>Training Hrs</th>
                      <th>TRIFR</th>
                      <th>LTIFR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safetyRecords.map((r, i) => {
                      const wh = Number(r.worked_hours);
                      const mti = Number(r.medical_treatment_incidents);
                      const lti = Number(r.lost_time_incidents);
                      const fat = Number(r.fatalities);
                      const trifr = wh
                        ? (((mti + lti + fat) * 1000000) / wh).toFixed(2)
                        : "0.00";
                      const ltifr = wh
                        ? ((lti * 1000000) / wh).toFixed(2)
                        : "0.00";
                      return (
                        <tr
                          key={i}
                          className={mti > 0 || lti > 0 ? "row-incident" : ""}
                        >
                          <td>{formatMonth(r.period)}</td>
                          <td>{r.staff_numbers}</td>
                          <td>{mti}</td>
                          <td>{lti}</td>
                          <td>{r.days_away_from_work}</td>
                          <td>{r.hse_training_hours}</td>
                          <td className={Number(trifr) > 0 ? "calc-alert" : ""}>
                            {trifr}
                          </td>
                          <td className={Number(ltifr) > 0 ? "calc-alert" : ""}>
                            {ltifr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "compliance" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">
                    Compliance Status Report
                  </div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total items</div>
                  <div className="rep-card-value">
                    {complianceWithStatus.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Valid</div>
                  <div className="rep-card-value green">
                    {
                      complianceWithStatus.filter((c) => c.status === "Valid")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Expiring soon</div>
                  <div className="rep-card-value amber">
                    {
                      complianceWithStatus.filter(
                        (c) => c.status === "Expiring soon",
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Expired</div>
                  <div className="rep-card-value red">
                    {
                      complianceWithStatus.filter((c) => c.status === "Expired")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Pending</div>
                  <div className="rep-card-value">
                    {
                      complianceWithStatus.filter((c) => c.status === "Pending")
                        .length
                    }
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Legal / Requirement Ref.</th>
                      <th>Organisation</th>
                      <th>Reference</th>
                      <th>Expiry</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceWithStatus.map((c, i) => (
                      <tr key={i}>
                        <td>{c.requirement}</td>
                        <td>{c.requirement_reference || "—"}</td>
                        <td>{c.expert_organisation}</td>
                        <td>{c.reference_number || "—"}</td>
                        <td>{c.date_of_expiry || "—"}</td>
                        <td>
                          <span
                            className={`rep-badge ${c.status === "Expired" ? "badge-expired" : c.status === "Expiring soon" ? "badge-expiring" : c.status === "Valid" ? "badge-valid" : "badge-pending"}`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "costs" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">Cost Analysis Report</div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total Spend</div>
                  <div className="rep-card-value">{formatKES(totalCost)}</div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">Highest Cost Type</div>

                  <div style={{ marginTop: "8px" }}>
                    <span
                      className={`costs-badge ${getCostTypeBadgeClass(highestCostType)}`}
                    >
                      {friendlyCostType(highestCostType)}
                    </span>
                  </div>

                  <div className="costs-card-sub">
                    {formatKES(highestCostValue)}
                  </div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">2nd Highest Cost Type</div>

                  <div style={{ marginTop: "8px" }}>
                    <span
                      className={`costs-badge ${getCostTypeBadgeClass(secondCostType)}`}
                    >
                      {friendlyCostType(secondCostType)}
                    </span>
                  </div>

                  <div className="costs-card-sub">
                    {formatKES(secondCostValue)}
                  </div>
                </div>

                <div className="rep-card">
                  <div className="rep-card-label">Outside Budget</div>

                  <div
                    className={`rep-card-value ${outsideBudget > 0 ? "red" : "green"}`}
                  >
                    {formatKES(outsideBudget)}
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>PO</th>
                      <th>Date</th>
                      <th>Cost</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costRecords.map((r, i) => (
                      <tr key={i}>
                        <td>{r.item_description}</td>
                        <td
                          style={{ fontFamily: "monospace", fontSize: "11px" }}
                        >
                          {r.po_number}
                        </td>
                        <td>{r.date}</td>
                        <td style={{ fontWeight: 600 }}>
                          {formatKES(r.cost_excl_vat)}
                        </td>
                        <td>{r.cost_type}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f0f6fc", fontWeight: 600 }}>
                      <td colSpan="3">Total</td>
                      <td>{formatKES(totalCost)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Cost per month bar chart */}
              <div className="dash-panel" style={{ marginBottom: "16px" }}>
                <div className="dash-panel-title">
                  📊 Cost per month by type (KES)
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={costByMonth}
                    margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />

                    {/* X-axis = MONTHS */}
                    <XAxis dataKey="month" />

                    {/* Y-axis = AMOUNT */}
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />

                    <Tooltip
                      formatter={(value) =>
                        `KES ${Number(value).toLocaleString()}`
                      }
                      filterNull
                      content={({ active, payload, label }) => {
                        if (!active || !payload) return null;

                        const visible = payload.filter(
                          (item) => item.value > 0,
                        );

                        return (
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #ccc",
                              padding: "10px",
                              borderRadius: "6px",
                            }}
                          >
                            <strong>{label}</strong>

                            {visible.map((item) => (
                              <div
                                key={item.dataKey}
                                style={{ color: item.color }}
                              >
                                {item.name}: KES{" "}
                                {Number(item.value).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={60}
                      wrapperStyle={{ fontSize: "12px" }}
                    />

                    <Bar
                      dataKey="statutory"
                      name="Statutory Requirement"
                      stackId="a"
                      fill={COST_COLORS.statutory}
                    />

                    <Bar
                      dataKey="staff_welfare"
                      name="Staff Welfare"
                      stackId="a"
                      fill={COST_COLORS.staff_welfare}
                    />

                    <Bar
                      dataKey="ppe"
                      name="PPE Provision"
                      stackId="a"
                      fill={COST_COLORS.ppe}
                    />

                    <Bar
                      dataKey="improvement"
                      name="Improvement Initiative"
                      stackId="a"
                      fill={COST_COLORS.improvement}
                    />

                    <Bar
                      dataKey="waste"
                      name="Waste Management"
                      stackId="a"
                      fill={COST_COLORS.waste}
                    />

                    <Bar
                      dataKey="training_best"
                      name="Training Best Practice"
                      stackId="a"
                      fill={COST_COLORS.training_best}
                    />

                    <Bar
                      dataKey="training_standard"
                      name="Training Standard Requirement"
                      stackId="a"
                      fill={COST_COLORS.training_standard}
                    />

                    <Bar
                      dataKey="training_statutory"
                      name="Training Statutory Requirement"
                      stackId="a"
                      fill={COST_COLORS.training_statutory}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {reportType === "calendar" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">
                    Calendar / Activities Report
                  </div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total activities</div>
                  <div className="rep-card-value">
                    {calendarActivities.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Completed</div>
                  <div className="rep-card-value green">
                    {
                      calendarActivities.filter((a) => a.status === "completed")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Scheduled</div>
                  <div className="rep-card-value">
                    {
                      calendarActivities.filter((a) => a.status === "scheduled")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Not conducted</div>
                  <div className="rep-card-value red">
                    {
                      calendarActivities.filter(
                        (a) => a.status === "not_conducted",
                      ).length
                    }
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Category</th>
                      <th>Audience</th>
                      <th>Month</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarActivities.map((a, i) => (
                      <tr key={i}>
                        <td>{a.activity_name}</td>
                        <td>{a.category}</td>
                        <td>{a.target_audience}</td>
                        <td>{formatMonth(a.scheduled_month)}</td>
                        <td>{a.internal_external}</td>
                        <td>
                          <span
                            className={`rep-badge ${a.status === "completed" ? "badge-valid" : a.status === "not_conducted" ? "badge-expired" : "badge-expiring"}`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td>{a.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "equipment" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">
                    Equipment Register Report
                  </div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total equipment</div>
                  <div className="rep-card-value">{equipmentData.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Available</div>
                  <div className="rep-card-value green">
                    {
                      equipmentData.filter((e) => e.status === "Available")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">In use</div>
                  <div className="rep-card-value">
                    {equipmentData.filter((e) => e.status === "In Use").length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Maintenance</div>
                  <div className="rep-card-value red">
                    {
                      equipmentData.filter((e) => e.status === "Maintenance")
                        .length
                    }
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Capacity</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Last Inspection</th>
                      <th>Next Inspection</th>
                      <th>Inspection Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentData.map((e, i) => {
                      const today = new Date();
                      const due = e.next_inspection
                        ? new Date(e.next_inspection)
                        : null;
                      const daysLeft = due
                        ? Math.floor((due - today) / (1000 * 60 * 60 * 24))
                        : null;
                      const inspStatus =
                        daysLeft === null
                          ? "—"
                          : daysLeft < 0
                            ? "Overdue"
                            : daysLeft <= 60
                              ? "Due soon"
                              : "OK";
                      return (
                        <tr
                          key={i}
                          className={
                            inspStatus === "Overdue" ? "row-incident" : ""
                          }
                        >
                          <td>{e.name}</td>
                          <td>{e.description}</td>
                          <td>{e.capacity}</td>
                          <td>{e.status}</td>
                          <td>{e.location}</td>
                          <td>{e.last_inspection || "—"}</td>
                          <td>{e.next_inspection || "—"}</td>
                          <td>
                            <span
                              className={`rep-badge ${daysLeft < 0 ? "badge-expired" : daysLeft <= 60 ? "badge-expiring" : "badge-valid"}`}
                            >
                              {inspStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "ppe" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">PPE Stock Report</div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div
                className="rep-summary-cards"
                style={{ marginBottom: "16px" }}
              >
                <div className="rep-card">
                  <div className="rep-card-label">Total items</div>
                  <div className="rep-card-value">{ppeItems.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">OK</div>
                  <div className="rep-card-value green">
                    {
                      ppeItems.filter((p) => p.current_stock > p.reorder_level)
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Low stock</div>
                  <div className="rep-card-value amber">
                    {
                      ppeItems.filter(
                        (p) =>
                          p.current_stock > 0 &&
                          p.current_stock <= p.reorder_level,
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Out of stock</div>
                  <div className="rep-card-value red">
                    {ppeItems.filter((p) => p.current_stock === 0).length}
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Size</th>
                      <th>Stock</th>
                      <th>Reorder</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppeItems.map((p, i) => (
                      <tr key={i}>
                        <td>{p.item_name}</td>
                        <td>{p.size_spec}</td>
                        <td>{p.current_stock}</td>
                        <td>{p.reorder_level}</td>
                        <td>
                          <span
                            className={`rep-badge ${p.current_stock === 0 ? "badge-expired" : p.current_stock <= p.reorder_level ? "badge-expiring" : "badge-valid"}`}
                          >
                            {p.current_stock === 0
                              ? "Out of stock"
                              : p.current_stock <= p.reorder_level
                                ? "Low stock"
                                : "OK"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rep-section-title" style={{ marginTop: 20 }}>
                PPE Request Summary
              </div>
              <div className="rep-summary-cards" style={{ marginBottom: 16 }}>
                <div className="rep-card">
                  <div className="rep-card-label">Total Requests</div>
                  <div className="rep-card-value">{ppeRequests.length}</div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Approved</div>
                  <div className="rep-card-value green">
                    {ppeRequests.filter((r) => r.status === "approved").length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Pending</div>
                  <div className="rep-card-value amber">
                    {ppeRequests.filter((r) => r.status === "pending").length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Rejected</div>
                  <div className="rep-card-value red">
                    {ppeRequests.filter((r) => r.status === "rejected").length}
                  </div>
                </div>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Requested By</th>
                      <th>Worker</th>
                      <th>Department</th>
                      <th>Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppeRequests.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ textAlign: "center", color: "#aaa" }}
                        >
                          No requests found.
                        </td>
                      </tr>
                    ) : (
                      ppeRequests.map((r, i) => (
                        <tr key={i}>
                          <td>
                            {r.item_name
                              ? `${r.item_name} (${r.size_spec})`
                              : "—"}
                          </td>
                          <td>{r.requested_by_name || "—"}</td>
                          <td>{r.worker_name || "—"}</td>
                          <td>{r.department || "—"}</td>
                          <td>{r.quantity}</td>
                          <td>
                            <span
                              className={`rep-badge ${r.status === "approved" ? "badge-valid" : r.status === "rejected" ? "badge-expired" : "badge-expiring"}`}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "ppe_trend" && selectedItem && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">
                    PPE Fast-Moving Items — {selectedItem.item_name} (
                    {selectedItem.size_spec})
                  </div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Stock level</th>
                      <th>Restocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppeMonthlyData.map((d, i) => (
                      <tr
                        key={i}
                        className={d.restocked > 0 ? "row-incident" : ""}
                      >
                        <td>{d.month}</td>
                        <td>{d.stock}</td>
                        <td>
                          {d.restocked > 0 ? `+${d.restocked} received` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ height: 160, minHeight: 160, marginTop: "10px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ppeMonthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="stock" name="Stock level" fill="#1a5276" />
                    <Bar dataKey="restocked" name="Restocked" fill="#27ae60" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p style={{ fontSize: "11px", color: "#888", marginTop: "8px" }}>
                Note: Monthly trend connects to full transaction history once
                the PPE module's transaction log is shared system-wide.
              </p>
            </>
          )}

          {reportType === "sustainability" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">Sustainability Report</div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Water (m³)</th>
                      <th>Electricity (kWh)</th>
                      <th>Scope 1</th>
                      <th>Scope 2</th>
                      <th>Total emissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sustainabilityRecords.map((r, i) => {
                      const s1 = calcScope1(r, emissionFactors),
                        s2 = calcScope2(r, emissionFactors);
                      return (
                        <tr key={i}>
                          <td>{formatMonth(r.period)}</td>
                          <td>{r.water_consumption_m3}</td>
                          <td>{r.electricity_kwh.toLocaleString()}</td>
                          <td>{s1.toFixed(2)}</td>
                          <td>{s2.toFixed(2)}</td>
                          <td>
                            <strong>{(s1 + s2).toFixed(2)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Emissions (Scope 1 & 2)
              </div>
              <div style={{ height: 160, minHeight: 160, marginTop: "10px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sustainabilityRecords.map((r) => ({
                      month: formatMonth(r.period),
                      Scope1: +calcScope1(r, emissionFactors).toFixed(2),
                      Scope2: +calcScope2(r, emissionFactors).toFixed(2),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Scope1" fill="#c0392b" />
                    <Bar dataKey="Scope2" fill="#1a5276" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Water consumption
              </div>
              <div style={{ height: 160, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sustainabilityRecords.map((r) => ({
                      month: formatMonth(r.period),
                      Consumed: Number(r.water_consumption_m3),
                      Recycled: Number(r.water_recycled_m3),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Consumed" fill="#1a5276" />
                    <Bar dataKey="Recycled" fill="#27ae60" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Waste breakdown
              </div>
              <div style={{ height: 160, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sustainabilityRecords.map((r) => ({
                      month: formatMonth(r.period),
                      Paper: Number(r.paper_waste_kg),
                      Plastic: Number(r.plastic_packaging_kg),
                      Hazardous: Number(r.hazardous_waste_kg),
                      Recyclable: Number(r.recyclable_plastic_kg),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Paper" fill="#1a5276" />
                    <Bar dataKey="Plastic" fill="#e67e22" />
                    <Bar dataKey="Hazardous" fill="#c0392b" />
                    <Bar dataKey="Recyclable" fill="#27ae60" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rep-section-title" style={{ marginTop: "20px" }}>
                Energy consumption
              </div>
              <div style={{ height: 160, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sustainabilityRecords.map((r) => ({
                      month: formatMonth(r.period),
                      Electricity: Number(r.electricity_kwh),
                      Solar: Number(r.solar_kwh),
                    }))}
                    margin={{ top: 10, right: 20, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      formatter={(v) => `${Number(v).toLocaleString()} kWh`}
                    />
                    <Legend />
                    <Bar dataKey="Electricity" fill="#1a5276" />
                    <Bar dataKey="Solar" fill="#27ae60" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {reportType === "action_tracker" && (
            <>
              <div className="rep-preview-header">
                <div>
                  <div className="rep-preview-title">Action Tracker Report</div>
                  <div className="rep-preview-meta">
                    Generated: {new Date().toLocaleDateString("en-GB")}
                  </div>
                </div>
                <button
                  id="hide-on-export"
                  className="rep-btn-export"
                  onClick={async () => {
                    const btn = document.getElementById("hide-on-export");
                    btn.style.display = "none";

                    const element = document.querySelector(".rep-preview");
                    const canvas = await html2canvas(element, {
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    });

                    btn.style.display = "";

                    const imgData = canvas.toDataURL("image/png");
                    const pdf = new jsPDF("p", "mm", "a4");
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth - 20;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    const totalPages = Math.ceil(imgHeight / (pageHeight - 20));
                    for (let i = 0; i < totalPages; i++) {
                      if (i > 0) pdf.addPage();
                      const yOffset = -(i * (pageHeight - 20)) + 10;
                      pdf.addImage(
                        imgData,
                        "PNG",
                        10,
                        yOffset,
                        imgWidth,
                        imgHeight,
                      );
                    }

                    pdf.save(
                      `EHSS_Report_${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}.pdf`,
                    );
                  }}
                >
                  🖨 Print / Save as PDF
                </button>
              </div>
              <div className="rep-summary-cards">
                <div className="rep-card">
                  <div className="rep-card-label">Total</div>
                  <div className="rep-card-value">
                    {actionTrackerData.length}
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Completed</div>
                  <div className="rep-card-value green">
                    {
                      actionTrackerData.filter((a) => a.status === "Completed")
                        .length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">In Progress</div>
                  <div className="rep-card-value amber">
                    {
                      actionTrackerData.filter(
                        (a) => a.status === "In Progress",
                      ).length
                    }
                  </div>
                </div>
                <div className="rep-card">
                  <div className="rep-card-label">Pending</div>
                  <div className="rep-card-value red">
                    {
                      actionTrackerData.filter((a) => a.status === "Pending")
                        .length
                    }
                  </div>
                </div>
              </div>
              <div
                style={{ height: 220, minHeight: 220, marginBottom: "14px" }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: "Completed",
                          value: actionTrackerData.filter(
                            (a) => a.status === "Completed",
                          ).length,
                        },
                        {
                          name: "In Progress",
                          value: actionTrackerData.filter(
                            (a) => a.status === "In Progress",
                          ).length,
                        },
                        {
                          name: "Pending",
                          value: actionTrackerData.filter(
                            (a) => a.status === "Pending",
                          ).length,
                        },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {PIE_COLORS.map((c, i) => (
                        <Cell key={i} fill={c} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div
                style={{ height: 200, minHeight: 200, marginBottom: "14px" }}
              >
                <div className="rep-section-title">Actions by Priority</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={["High", "Medium", "Low"].map((p) => ({
                      name: p,
                      count: actionTrackerData.filter((a) => a.priority === p)
                        .length,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1a5276" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>Concern</th>
                      <th>Department</th>
                      <th>Priority</th>
                      <th>Action</th>
                      <th>Responsible</th>
                      <th>Target Date</th>
                      <th>Progress</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionTrackerData.map((a, i) => (
                      <tr key={i}>
                        <td>{a.concern}</td>
                        <td>{a.department || "—"}</td>
                        <td
                          style={{
                            fontWeight: 600,
                            color:
                              a.priority === "High"
                                ? "#e74c3c"
                                : a.priority === "Low"
                                  ? "#27ae60"
                                  : "#e67e22",
                          }}
                        >
                          {a.priority || "—"}
                        </td>
                        <td>{a.action}</td>
                        <td>{a.responsible}</td>
                        <td>{a.targetDate}</td>
                        <td>{a.progress}%</td>
                        <td>
                          <span
                            className={`rep-badge ${a.status === "Completed" ? "badge-valid" : a.status === "In Progress" ? "badge-expiring" : "badge-expired"}`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
