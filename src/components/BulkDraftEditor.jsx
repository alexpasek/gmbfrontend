import React from "react";
import PostPreview from "./PostPreview";

export default function BulkDraftEditor({
  draft,
  draftIndex,
  totalDrafts,
  profileName,
  profileCity,
  topicLabel,
  ctaLabel,
  ctaOptions,
  linkOptions,
  activeDraftBody,
  activeDraftCta,
  linkDisabled,
  activeDraftHref,
  metaRows,
  mediaPreviewUrl,
  overlayPreviewUrl,
  overlayValue,
  overlayGlobal,
  runAtValue,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  onRegenerate,
  regenerating,
  bulkBusy,
  onBodyChange,
  onRunAtChange,
  onUseSavedLink,
  onUseDefaultOverlay,
  onPickOverlay,
  onClearOverlay,
}) {
  return (
    <div className="panel-section bulk-draft-shell">
      <div className="bulk-draft-header">
        <div>
          <div className="muted small">
            Draft {draftIndex + 1} of {totalDrafts} ·{" "}
            {draft.runAt
              ? new Date(draft.runAt).toLocaleString()
              : "No time set"}
          </div>
          <div className="bulk-draft-meta">
            <span>
              CTA: {activeDraftBody.cta || "—"}
            </span>
            <span>Media: {activeDraftBody.mediaUrl || "None"}</span>
          </div>
        </div>
        <div className="action-row">
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={onPrev}
            disabled={disablePrev}
          >
            Previous
          </button>
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={onNext}
            disabled={disableNext}
          >
            Next
          </button>
          <button
            className="btn btn--indigo btn--small"
            type="button"
            onClick={onRegenerate}
            disabled={bulkBusy || regenerating}
          >
            {regenerating ? "Regenerating..." : "Regenerate text"}
          </button>
        </div>
      </div>
      <div className="bulk-draft-grid">
        <PostPreview
          profileName={profileName}
          profileCity={profileCity}
          badgeLabel={topicLabel}
          bodyText={(activeDraftBody.postText || "").trim() || "—"}
          ctaLabel={ctaLabel}
          ctaHref={activeDraftHref}
          ctaDisabled={!activeDraftHref}
          metaRows={metaRows}
          mediaUrl={mediaPreviewUrl}
          overlayUrl={overlayPreviewUrl}
          footerText="Live preview of the selected draft."
        />
        <div className="bulk-draft-editor">
          <label className="field-label">Post copy</label>
          <textarea
            value={activeDraftBody.postText || ""}
            onChange={(e) => onBodyChange({ postText: e.target.value })}
            placeholder="Edit the generated text before scheduling."
          />

          <label className="field-label">CTA</label>
          <select
            value={activeDraftBody.cta || "CALL_NOW"}
            onChange={(e) => onBodyChange({ cta: e.target.value })}
          >
            {ctaOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className="field-label">Link</label>
          <input
            value={activeDraftBody.linkUrl || ""}
            onChange={(e) => onBodyChange({ linkUrl: e.target.value })}
            placeholder="https://..."
            disabled={linkDisabled}
          />
          {linkOptions.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => onUseSavedLink(e.target.value)}
              disabled={linkDisabled}
            >
              <option value="">Pick saved link</option>
              {linkOptions.map((link, idx) => (
                <option key={idx} value={link}>
                  {link}
                </option>
              ))}
            </select>
          )}

          <label className="field-label">Media URL</label>
          <input
            value={activeDraftBody.mediaUrl || ""}
            onChange={(e) => onBodyChange({ mediaUrl: e.target.value })}
            placeholder="/uploads/..."
          />

          <label className="field-label">Overlay (optional)</label>
          <input
            value={overlayValue}
            onChange={(e) => onBodyChange({ overlayUrl: e.target.value })}
            placeholder="/uploads/overlay.png"
          />
          <div className="action-row">
            <button
              className="btn btn--ghost btn--small"
              type="button"
              onClick={onUseDefaultOverlay}
              disabled={!overlayGlobal}
            >
              Use default overlay
            </button>
            <button
              className="btn btn--ghost btn--small"
              type="button"
              onClick={onPickOverlay}
            >
              Pick from gallery
            </button>
            <button
              className="btn btn--ghost btn--small"
              type="button"
              onClick={onClearOverlay}
              disabled={!overlayValue}
            >
              Clear
            </button>
          </div>

          {overlayPreviewUrl ? (
            <div className="media-preview small-thumb">
              <div className="media-preview-thumb overlay-wrapper">
                {mediaPreviewUrl ? (
                  <img src={mediaPreviewUrl} alt="Base preview" />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#f0f0f0",
                    }}
                  />
                )}
                <img
                  className="media-overlay-img"
                  src={overlayPreviewUrl}
                  alt="Overlay preview"
                />
              </div>
              <div className="media-preview-meta">
                <div className="media-preview-title">Overlay preview</div>
                <div className="media-preview-url small">{overlayValue}</div>
              </div>
            </div>
          ) : null}

          <label className="field-label">Runs at</label>
          <input
            type="datetime-local"
            value={runAtValue}
            onChange={(e) => onRunAtChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
