import React from "react";
import QuickLinksSection from "./QuickLinksSection";

export default function ProfilesLinksPanel({
  cta,
  setCta,
  ctaOptions,
  defaultPhone,
  setDefaultPhone,
  phoneCandidate,
  linkUrl,
  setLinkUrl,
  linkOptions,
  setLinkOptions,
  linkOptionsSaving,
  reviewLink,
  setReviewLink,
  serviceAreaLink,
  setServiceAreaLink,
  areaMapLink,
  setAreaMapLink,
  quickLinksSaving,
  quickLinksHelpOpen,
  setQuickLinksHelpOpen,
  handleQuickLinksAdd,
  quickLinksAddDisabled,
  overlayUrl,
  setOverlayUrl,
  backendBase,
  resolveMediaPreviewUrl,
  mediaUrl,
  setMediaUrl,
  composedMediaUrl,
  uploadsInfo,
  loadUploadsInfo,
  setMediaGalleryContext,
  setMediaGalleryOpen,
  uploadingPhoto,
  handlePhotoUpload,
  saveProfileDefaults,
  hasProfile,
}) {
  return (
    <section className="panel">
      <div className="panel-title">CTA & links</div>
      <div className="panel-section">
        <label className="field-label">Action button</label>
        <select value={cta} onChange={(e) => setCta(e.target.value)}>
          {ctaOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="muted small">
          Call now will use the phone below; other CTAs use the link field.
        </p>
      </div>
      <div className="panel-section">
        <label className="field-label">Phone (used for Call now)</label>
        <input
          value={defaultPhone}
          onChange={(e) => setDefaultPhone(e.target.value)}
          placeholder="+1 555 123 4567"
        />
        <p className="muted small">
          Detected phone: {phoneCandidate || "None set"}
        </p>
      </div>
      <div className="panel-section">
        <label className="field-label">Link</label>
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://your-site/page"
          disabled={cta === "CALL_NOW"}
        />
        {linkOptions.length > 0 && (
          <div className="action-row">
            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) setLinkUrl(v);
              }}
              disabled={cta === "CALL_NOW"}
            >
              <option value="">Pick saved link</option>
              {linkOptions.map((u, idx) => (
                <option key={idx} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <span className="muted small">
              Saved links work best with “Learn more”.
            </span>
          </div>
        )}
        <p className="muted small">
          {cta === "CALL_NOW"
            ? "Link disabled for Call now; phone above will be used."
            : "Provide a valid https link for this CTA."}
        </p>
        <div className="link-options">
          <div className="link-options__header">
            <span className="field-label">
              Saved links for this profile (best with “Learn more”)
            </span>
            <span className="muted small">
              {linkOptionsSaving ? "Saving..." : "Auto-saved"}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setLinkOptions((prev) => [...prev, ""])}
            >
              + Add link
            </button>
          </div>
          {linkOptions.length === 0 && (
            <div className="muted small">No saved links yet.</div>
          )}
          {linkOptions.map((u, idx) => (
            <div className="link-option-row" key={idx}>
              <input
                value={u}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinkOptions((prev) =>
                    prev.map((item, i) => (i === idx ? v : item))
                  );
                }}
                placeholder="https://your-site/page"
              />
              <div className="link-option-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setLinkUrl(u)}
                  disabled={!u || cta === "CALL_NOW"}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() =>
                    setLinkOptions((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <QuickLinksSection
          reviewLink={reviewLink}
          serviceAreaLink={serviceAreaLink}
          areaMapLink={areaMapLink}
          setReviewLink={setReviewLink}
          setServiceAreaLink={setServiceAreaLink}
          setAreaMapLink={setAreaMapLink}
          quickLinksSaving={quickLinksSaving}
          quickLinksHelpOpen={quickLinksHelpOpen}
          onToggleHelp={() => setQuickLinksHelpOpen((open) => !open)}
          onAddLink={handleQuickLinksAdd}
          addDisabled={quickLinksAddDisabled}
        />
        <div className="panel-section">
          <div className="link-options__header" style={{ alignItems: "flex-start" }}>
            <span className="field-label">Overlay image (optional)</span>
            <span className="muted small">
              Composites this on top of the selected photo when posting.
            </span>
          </div>
          <div className="link-option-row" style={{ alignItems: "center" }}>
            <input
              value={overlayUrl}
              onChange={(e) => setOverlayUrl(e.target.value)}
              placeholder="https://.../overlay.png or /uploads/overlay.png"
              style={{ flex: 1 }}
            />
            <div className="link-option-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setOverlayUrl("")}
                disabled={!overlayUrl}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={async () => {
                  if (!uploadsInfo) await loadUploadsInfo();
                  setMediaGalleryContext("overlay");
                  setMediaGalleryOpen(true);
                }}
                disabled={!backendBase}
              >
                Pick from gallery
              </button>
            </div>
          </div>
          {resolveMediaPreviewUrl(overlayUrl, backendBase) ? (
            <div className="media-preview small-thumb">
              <div className="media-preview-thumb overlay-wrapper">
                <img
                  src={resolveMediaPreviewUrl(mediaUrl || overlayUrl, backendBase)}
                  alt="Base preview"
                />
                <img
                  className="media-overlay-img"
                  src={resolveMediaPreviewUrl(overlayUrl, backendBase)}
                  alt="Overlay preview"
                />
              </div>
              <div className="media-preview-meta">
                <div className="media-preview-title">Overlay preview</div>
                <div className="media-preview-url small">{overlayUrl}</div>
              </div>
            </div>
          ) : null}
        </div>
        <p className="muted small">
          EXIF geo settings now live in Photo scheduler → Photo metadata.
          Regular posts don’t need geo tagging.
        </p>
      </div>
      <div className="panel-section">
        <label className="field-label">Photo URL</label>
        <input
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://.../image.jpg  or  /uploads/image.jpg"
        />
        <div className="upload-row">
          <label className="btn btn--ghost upload-btn">
            Upload from my computer
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploadingPhoto || !backendBase}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={async () => {
              if (!uploadsInfo) {
                await loadUploadsInfo();
              }
              setMediaGalleryContext("profile");
              setMediaGalleryOpen(true);
            }}
            disabled={!backendBase}
          >
            Browse gallery
          </button>
          <span className="muted small">
            {uploadingPhoto
              ? "Uploading..."
              : backendBase
              ? "Uploads live on your backend at /uploads."
              : "Resolving backend..."}
          </span>
        </div>

        {resolveMediaPreviewUrl(mediaUrl, backendBase) ? (
          <div className="media-preview">
            <div className="media-preview-thumb overlay-wrapper">
              <img
                src={resolveMediaPreviewUrl(
                  composedMediaUrl || mediaUrl,
                  backendBase
                )}
                alt="Default media"
              />
              {resolveMediaPreviewUrl(overlayUrl, backendBase) ? (
                <img
                  className="media-overlay-img"
                  src={resolveMediaPreviewUrl(overlayUrl, backendBase)}
                  alt="Overlay"
                />
              ) : null}
            </div>
            <div className="media-preview-meta">
              <div className="media-preview-title">Current default photo</div>
              <div className="media-preview-url small">{mediaUrl || "—"}</div>
              <div className="media-preview-hint muted small">
                This is the image that will be attached when you post from this
                profile (unless you override it per-post).
              </div>
            </div>
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 6 }}>
            No default photo set yet. Upload a file or pick one from the
            gallery.
          </p>
        )}
      </div>
      <div className="panel-section">
        <button
          className="btn btn--green full-width"
          onClick={saveProfileDefaults}
          disabled={!hasProfile}
        >
          Save as profile defaults
        </button>
      </div>
    </section>
  );
}
