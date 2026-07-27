// ─────────────────────────────────────────────────────────────
// CompliancePage.jsx
// The Compliance Matrix module.
// Per Phase 2 FR-06:
// - Status tabs: All | Valid | Expiring Soon | Expired | Pending
// - Summary count cards per status
// - Table with auto-calculated status badges
// - Add new compliance item form
// - Edit existing items
// Status is NEVER typed manually — always calculated from
// the expiry date compared to today's date.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import "./CompliancePage.css";
import apiFetch from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

const API_URL = `/compliance`;

// ── Status calculation ────────────────────────────────────────
// Status is determined automatically — never entered manually.
function getStatus(item) {
  if (!item.date_of_expiry) return "pending";

  const today = new Date();
  const expiry = new Date(item.date_of_expiry);
  const daysLeft = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return "expired"; // past expiry date
  if (daysLeft <= 60) return "expiring"; // within 60 days
  return "valid"; // more than 60 days away
}

function getDaysLeft(item) {
  if (!item.date_of_expiry) return null;
  const today = new Date();
  const expiry = new Date(item.date_of_expiry);
  return Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Status badge config — text, CSS class, and row class
const statusConfig = {
  valid: { text: "Valid", badgeCls: "badge-valid", rowCls: "" },
  expiring: {
    text: "Expiring soon",
    badgeCls: "badge-expiring",
    rowCls: "row-expiring",
  },
  expired: {
    text: "Expired",
    badgeCls: "badge-expired",
    rowCls: "row-expired",
  },
  pending: {
    text: "Pending",
    badgeCls: "badge-pending",
    rowCls: "row-pending",
  },
};

// ── Empty form template ───────────────────────────────────────
const emptyForm = {
  requirement: "",
  expert_organisation: "",
  reference_number: "",
  requirement_reference: "",
  date_of_issuance: "",
  validity_period: "Annual",
  date_of_expiry: "",
  remarks: "",
};

// ── Main component ────────────────────────────────────────────
function CompliancePage() {
  const { user } = useAuth();
  const role = user?.role_name;

  const canEdit = () => ["ehss_officer", "it_admin", "qa"].includes(role);
  const canDelete = () => ["ehss_officer", "it_admin"].includes(role);
  const canAdd = () => ["ehss_officer", "it_admin", "qa"].includes(role);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalType, setModalType] = useState(null); // null | "add" | "edit"
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    apiFetch(API_URL)
      .then((res) => res.json())
      .then((data) =>
        setItems(
          data.map((i) => ({
            ...i,
            date_of_issuance: i.date_of_issuance?.split("T")[0] || "",
            date_of_expiry: i.date_of_expiry?.split("T")[0] || "",
          })),
        ),
      )
      .catch((err) => console.error("Failed to fetch compliance items:", err));
  }, []);

  // ── Summary counts ────────────────────────────────────────
  const counts = {
    all: items.length,
    valid: items.filter((i) => getStatus(i) === "valid").length,
    expiring: items.filter((i) => getStatus(i) === "expiring").length,
    expired: items.filter((i) => getStatus(i) === "expired").length,
    pending: items.filter((i) => getStatus(i) === "pending").length,
  };

  // ── Filtered items ────────────────────────────────────────
  const filteredItems = items
    .filter((i) => activeTab === "all" || getStatus(i) === activeTab)
    .filter((i) => {
      const search = searchTerm.toLowerCase();

      return (
        (i.requirement || "").toLowerCase().includes(search) ||
        (i.expert_organisation || "").toLowerCase().includes(search) ||
        (i.reference_number || "").toLowerCase().includes(search)
      );
    });

  // ── Success banner ────────────────────────────────────────
  function showBanner(msg) {
    setSuccessMessage(msg);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  // ── Form handlers ─────────────────────────────────────────
  function handleFormChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  }

  function validateForm() {
    const e = {};
    if (!form.requirement.trim())
      e.requirement = "Requirement name is required.";
    if (!form.requirement_reference.trim())
      e.requirement_reference = "Legal reference is required.";
    if (!form.validity_period)
      e.validity_period = "Validity period is required.";

    // Reference number uniqueness check (only if filled in)
    if (form.reference_number.trim()) {
      const dup = items.find(
        (i) =>
          i.reference_number?.toLowerCase() ===
            form.reference_number.toLowerCase() && i.id !== editingId,
      );
      if (dup)
        e.reference_number =
          "This reference number already exists. Reference numbers must be unique.";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function openAdd() {
    setForm(emptyForm);
    setErrors({});
    setEditingId(null);
    setModalType("add");
  }

  function openEdit(item) {
    setForm({
      requirement: item.requirement,
      expert_organisation: item.expert_organisation,
      reference_number: item.reference_number,
      requirement_reference: item.requirement_reference,
      date_of_issuance: item.date_of_issuance,
      validity_period: item.validity_period,
      date_of_expiry: item.date_of_expiry,
      remarks: item.remarks,
    });
    setErrors({});
    setEditingId(item.id);
    setModalType("edit");
  }

  async function handleSave() {
    if (!validateForm()) return;

    try {
      if (modalType === "add") {
        const res = await apiFetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const newItem = await res.json();
        const formatted = {
          ...newItem,
          date_of_issuance: newItem.date_of_issuance?.split("T")[0] || "",
          date_of_expiry: newItem.date_of_expiry?.split("T")[0] || "",
        };
        setItems([...items, formatted]);
        showBanner("Compliance item added successfully.");
      } else {
        const res = await apiFetch(`${API_URL}/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const updated = await res.json();
        const formatted = {
          ...updated,
          date_of_issuance: updated.date_of_issuance?.split("T")[0] || "",
          date_of_expiry: updated.date_of_expiry?.split("T")[0] || "",
        };
        setItems(items.map((i) => (i.id === editingId ? formatted : i)));
        showBanner("Compliance item updated successfully.");
      }

      setModalType(null);
      setEditingId(null);
      setForm(emptyForm);
      setErrors({});
    } catch (err) {
      console.error("Failed to save compliance item:", err);
    }
  }

  function handleCloseModal() {
    setModalType(null);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  }

  function handleDeleteOpen(item) {
    setDeleteReason("");
    setDeleteModal(item);
  }

  async function handleDeleteConfirm() {
    if (!deleteReason.trim()) {
      showBanner("Please enter a reason for deletion.");
      return;
    }
    if (!deleteModal) return;

    try {
      await apiFetch(`${API_URL}/${deleteModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason }),
      });
      setItems(items.filter((i) => i.id !== deleteModal.id));
      showBanner(`"${deleteModal.requirement}" deleted successfully.`);
      setDeleteModal(null);
      setDeleteReason("");
    } catch (err) {
      console.error("Failed to delete compliance item:", err);
    }
  }

  // ── JSX ───────────────────────────────────────────────────
  return (
    <div className="comp-page">
      {/* Success banner */}
      {showSuccess && (
        <div className="comp-success-banner">✓ {successMessage}</div>
      )}

      {/* Header */}
      <div className="comp-header">
        <div>
          <h1 className="comp-title">Compliance matrix</h1>
          <p className="comp-subtitle">
            Status is calculated automatically from expiry dates — never entered
            manually.
          </p>
        </div>
        {canAdd() && (
          <button className="comp-btn-primary" onClick={openAdd}>
            + Add item
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="comp-cards">
        <div
          className="comp-card"
          onClick={() => setActiveTab("all")}
          style={{ cursor: "pointer" }}
        >
          <div className="comp-card-label">Total</div>
          <div className="comp-card-value">{counts.all}</div>
        </div>
        <div
          className="comp-card card-valid"
          onClick={() => setActiveTab("valid")}
          style={{ cursor: "pointer" }}
        >
          <div className="comp-card-label">Valid</div>
          <div className="comp-card-value green">{counts.valid}</div>
        </div>
        <div
          className="comp-card card-expiring"
          onClick={() => setActiveTab("expiring")}
          style={{ cursor: "pointer" }}
        >
          <div className="comp-card-label">Expiring soon</div>
          <div className="comp-card-value amber">{counts.expiring}</div>
        </div>
        <div
          className="comp-card card-expired"
          onClick={() => setActiveTab("expired")}
          style={{ cursor: "pointer" }}
        >
          <div className="comp-card-label">Expired</div>
          <div className="comp-card-value red">{counts.expired}</div>
        </div>
        <div
          className="comp-card card-pending"
          onClick={() => setActiveTab("pending")}
          style={{ cursor: "pointer" }}
        >
          <div className="comp-card-label">Pending</div>
          <div className="comp-card-value grey">{counts.pending}</div>
        </div>
      </div>

      {/* Filter row */}
      <div className="comp-filter-row">
        {/* Status tabs */}
        <div className="comp-tabs">
          {["all", "valid", "expiring", "expired", "pending"].map((tab) => (
            <button
              key={tab}
              className={`comp-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "all"
                ? `All (${counts.all})`
                : tab === "valid"
                  ? `Valid (${counts.valid})`
                  : tab === "expiring"
                    ? `Expiring (${counts.expiring})`
                    : tab === "expired"
                      ? `Expired (${counts.expired})`
                      : `Pending (${counts.pending})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          className="comp-search"
          type="text"
          placeholder="Search by requirement, organisation, or reference..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="comp-table-wrap">
        <table className="comp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Requirement</th>
              <th>Legal / Requirement Ref.</th>
              <th>Organisation</th>
              <th>Reference no.</th>
              <th>Issued</th>
              <th>Expires</th>
              <th>Validity</th>
              <th>Days left</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan="11"
                  style={{
                    textAlign: "center",
                    padding: "32px",
                    color: "#888",
                    fontStyle: "italic",
                  }}
                >
                  No compliance items match the current filter.
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index) => {
                const status = getStatus(item);
                const config = statusConfig[status];
                const daysLeft = getDaysLeft(item);
                return (
                  <tr key={item.id} className={config.rowCls}>
                    <td>{index + 1}</td>
                    <td className="comp-req-name">{item.requirement}</td>
                    <td>{item.requirement_reference || "—"}</td>
                    <td>{item.expert_organisation || "—"}</td>
                    <td className="comp-ref">{item.reference_number || "—"}</td>
                    <td>{formatDate(item.date_of_issuance)}</td>
                    <td>{formatDate(item.date_of_expiry)}</td>
                    <td>{item.validity_period}</td>
                    <td>
                      {daysLeft === null
                        ? "—"
                        : daysLeft < 0
                          ? `${Math.abs(daysLeft)}d overdue`
                          : `${daysLeft}d`}
                    </td>
                    <td>
                      <span className={`comp-badge ${config.badgeCls}`}>
                        {config.text}
                      </span>
                    </td>
                    <td className="comp-remarks">{item.remarks || "—"}</td>
                    <td>
                      {canEdit() && (
                        <button
                          className="ehss-btn-sm ehss-edit-btn"
                          onClick={() => openEdit(item)}
                        >
                          ✎ Edit
                        </button>
                      )}
                      {canDelete() && (
                        <button
                          className="ehss-btn-sm ehss-delete-btn"
                          onClick={() => handleDeleteOpen(item)}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="comp-legend">
        <span>
          <span className="comp-badge badge-valid" style={{ fontSize: "10px" }}>
            Valid
          </span>{" "}
          More than 60 days to expiry
        </span>
        <span>
          <span
            className="comp-badge badge-expiring"
            style={{ fontSize: "10px" }}
          >
            Expiring soon
          </span>{" "}
          Within 60 days
        </span>
        <span>
          <span
            className="comp-badge badge-expired"
            style={{ fontSize: "10px" }}
          >
            Expired
          </span>{" "}
          Past expiry date
        </span>
        <span>
          <span
            className="comp-badge badge-pending"
            style={{ fontSize: "10px" }}
          >
            Pending
          </span>{" "}
          No reference number entered yet
        </span>
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {modalType && (
        <div className="comp-modal-overlay">
          <div className="comp-modal">
            <h2 className="comp-modal-title">
              {modalType === "add"
                ? "Add compliance item"
                : "✎ Edit compliance item"}
            </h2>

            {/* Auto status preview */}
            {form.reference_number && form.date_of_expiry && (
              <div className="comp-status-preview">
                Auto-calculated status:{" "}
                <span
                  className={`comp-badge ${statusConfig[getStatus(form)].badgeCls}`}
                >
                  {statusConfig[getStatus(form)].text}
                </span>
              </div>
            )}

            <div className="comp-form-grid">
              <div className="comp-form-group full">
                <label className="comp-form-label">
                  Requirement name <span className="required">*</span>
                </label>
                <input
                  className="comp-form-input"
                  name="requirement"
                  value={form.requirement}
                  onChange={handleFormChange}
                  placeholder="e.g. Business licence — Unit 4"
                />
                {errors.requirement && (
                  <div className="comp-field-error">{errors.requirement}</div>
                )}
              </div>

              <div className="comp-form-group">
                <label className="comp-form-label">Expert / organisation</label>
                <input
                  className="comp-form-input"
                  name="expert_organisation"
                  value={form.expert_organisation}
                  onChange={handleFormChange}
                  placeholder="e.g. Kiambu County"
                />
              </div>

              <div className="comp-form-group">
                <label className="comp-form-label">Reference number</label>
                <input
                  className="comp-form-input"
                  name="reference_number"
                  value={form.reference_number}
                  onChange={handleFormChange}
                  placeholder="e.g. 2026/SD/B9957554"
                />
              </div>

              <div className="comp-form-group full">
                <label className="comp-form-label">
                  Legal / requirement reference{" "}
                  <span className="required">*</span>
                </label>
                <input
                  className="comp-form-input"
                  name="requirement_reference"
                  value={form.requirement_reference}
                  onChange={handleFormChange}
                  placeholder="e.g. County laws, OSHA 2007, EMCA 1999"
                />
                {errors.requirement_reference && (
                  <div className="comp-field-error">
                    {errors.requirement_reference}
                  </div>
                )}
              </div>

              <div className="comp-form-group">
                <label className="comp-form-label">Date of issuance</label>
                <input
                  className="comp-form-input"
                  type="date"
                  name="date_of_issuance"
                  value={form.date_of_issuance}
                  onChange={handleFormChange}
                />
              </div>

              <div className="comp-form-group">
                <label className="comp-form-label">
                  Validity period <span className="required">*</span>
                </label>
                <select
                  className="comp-form-select"
                  name="validity_period"
                  value={form.validity_period}
                  onChange={handleFormChange}
                >
                  <option value="3 months">3 months</option>
                  <option value="6 months">6 months</option>
                  <option value="Annual">Annual</option>
                  <option value="2 years">2 years</option>
                  <option value="3 years">3 years</option>
                  <option value="5 years">5 years</option>
                  <option value="Permanent">Permanent</option>
                </select>
                {errors.validity_period && (
                  <div className="comp-field-error">
                    {errors.validity_period}
                  </div>
                )}
              </div>

              <div className="comp-form-group">
                <label className="comp-form-label">Date of expiry</label>
                <input
                  className="comp-form-input"
                  type="date"
                  name="date_of_expiry"
                  value={form.date_of_expiry}
                  onChange={handleFormChange}
                />
                <div
                  style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}
                >
                  Status updates automatically based on this date.
                </div>
              </div>

              <div className="comp-form-group full">
                <label className="comp-form-label">Remarks</label>
                <input
                  className="comp-form-input"
                  name="remarks"
                  value={form.remarks}
                  onChange={handleFormChange}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="comp-modal-buttons">
              <button className="comp-btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button className="comp-btn-primary" onClick={handleSave}>
                {modalType === "add" ? "Add item" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteModal && (
        <div className="comp-modal-overlay">
          <div className="comp-modal" style={{ maxWidth: "420px" }}>
            <h2 className="comp-modal-title" style={{ color: "#c0392b" }}>
              Delete compliance item
            </h2>
            <p
              style={{ fontSize: "13px", color: "#444", marginBottom: "12px" }}
            >
              You are about to delete:{" "}
              <strong>{deleteModal.requirement}</strong>
            </p>
            <div className="comp-form-group full">
              <label className="comp-form-label">
                Reason for deletion <span className="required">*</span>
              </label>
              <p
                style={{
                  fontSize: "13px",
                  color: "#c0392b",
                  marginBottom: "10px",
                }}
              >
                ⚠ You must provide a reason before deleting this compliance
                record.
              </p>
              <input
                className="comp-form-input"
                type="text"
                placeholder="e.g. Licence replaced by new reference number"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </div>
            <div className="comp-modal-buttons">
              <button
                className="comp-btn-secondary"
                onClick={() => setDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                className="comp-btn-primary"
                style={{ background: "#c0392b", borderColor: "#c0392b" }}
                onClick={handleDeleteConfirm}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompliancePage;
