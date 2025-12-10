import React from "react";

export default function BulkDraftsTable({
  drafts,
  ctaOptions,
  activeIndex,
  overlayUrl,
  onRunAtChange,
  onCtaChange,
  onLinkChange,
  onMediaChange,
  onOverlayApply,
  onOverlayClear,
  onPreview,
  onRemove,
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>CTA</th>
          <th>Link</th>
          <th>Media</th>
          <th>Overlay</th>
          <th>Copy</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {drafts.map((draft, idx) => (
          <tr key={draft.id || idx}>
            <td>
              <input
                type="datetime-local"
                value={draft.runAt?.slice(0, 16) || ""}
                onChange={(e) => onRunAtChange(idx, e.target.value)}
              />
            </td>
            <td>
              <select
                value={draft.body?.cta || "CALL_NOW"}
                onChange={(e) => onCtaChange(idx, e.target.value)}
              >
                {ctaOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                value={draft.body?.linkUrl || ""}
                onChange={(e) => onLinkChange(idx, e.target.value)}
                placeholder="https://..."
              />
            </td>
            <td>
              <input
                value={draft.body?.mediaUrl || ""}
                onChange={(e) => onMediaChange(idx, e.target.value)}
                placeholder="/uploads/..."
              />
            </td>
            <td>
              <div className="action-row">
                <span className="muted small">
                  {draft.body?.overlayUrl ? "Enabled" : "Disabled"}
                </span>
                {draft.body?.overlayUrl ? (
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => onOverlayClear(idx)}
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => onOverlayApply(idx)}
                    disabled={!overlayUrl}
                  >
                    Use overlay
                  </button>
                )}
              </div>
            </td>
            <td>
              <div className="bulk-snippet">
                {(draft.body?.postText || "").trim() || "—"}
              </div>
            </td>
            <td>
              <div className="action-row">
                <button
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => onPreview(idx)}
                  disabled={activeIndex === idx}
                >
                  {activeIndex === idx ? "Previewing" : "Preview"}
                </button>
                <button
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => onRemove(idx)}
                >
                  Remove
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
