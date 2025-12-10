import React from "react";

export default function QuickLinksSection({
  reviewLink,
  serviceAreaLink,
  areaMapLink,
  setReviewLink,
  setServiceAreaLink,
  setAreaMapLink,
  quickLinksSaving,
  quickLinksHelpOpen,
  onToggleHelp,
  onAddLink,
  addDisabled,
}) {
  const quickLinkFields = [
    { label: "Reviews", value: reviewLink, setter: setReviewLink },
    { label: "Service Area", value: serviceAreaLink, setter: setServiceAreaLink },
    { label: "Area Map", value: areaMapLink, setter: setAreaMapLink },
  ];

  return (
    <div className="link-options">
      <div className="link-options__header">
        <div className="quick-links-title">
          <span className="field-label">Quick links</span>
          <button
            type="button"
            className="quick-links-info-btn"
            onClick={onToggleHelp}
            aria-expanded={quickLinksHelpOpen}
            aria-label="Show quick link instructions"
          >
            ?
          </button>
        </div>
        <span className="muted small">
          {quickLinksSaving ? "Saving..." : "Auto-saved"}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onAddLink}
          disabled={addDisabled}
        >
          + Add link
        </button>
      </div>
      {quickLinksHelpOpen && (
        <div className="quick-links-tip">
          <div className="quick-links-tip__title">How to grab each link</div>
          <ul className="quick-links-tip__list">
            <li>
              <strong>Reviews:</strong> Open your business in Google Maps →
              Reviews → Share → Copy link.
              <span className="muted small">
                {" "}
                Example: https://maps.app.goo.gl/noNsstq3bHik398i7
              </span>
            </li>
            <li>
              <strong>Service Area:</strong> Search your company in Google Maps,
              open the business card, tap Share → Copy link.
              <span className="muted small">
                {" "}
                Example: https://maps.app.goo.gl/BhWfAacsEfrMTFY96
              </span>
            </li>
            <li>
              <strong>Last Post:</strong> Use the auto-generated share.google
              link from your posting tool.
              <span className="muted small">
                {" "}
                Example: https://share.google/XYK4LIzLQSI0KhwYO
              </span>
            </li>
            <li>
              <strong>Area Map (City):</strong> Search the city in Google Maps,
              open the city view, tap Share → Copy link.
              <span className="muted small">
                {" "}
                Example: https://maps.app.goo.gl/EpZ2gJuTXBH8nd2E7
              </span>
            </li>
          </ul>
        </div>
      )}
      <div className="quick-links-grid">
        {quickLinkFields.map((item, idx) => (
          <div className="link-option-row" key={`quick-${idx}`}>
            <div className="quick-link-label" style={{ minWidth: 140 }}>
              <span className="quick-link-icon" aria-hidden="true">
                🔗
              </span>
              <span>{item.label}</span>
            </div>
            <input
              value={item.value}
              onChange={(e) => item.setter(e.target.value)}
              placeholder="https://your-site/page"
              style={{ flex: 1, minWidth: 280 }}
            />
            <div className="link-option-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => item.setter("")}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
