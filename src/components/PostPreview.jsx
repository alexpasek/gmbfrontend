import React from "react";

export default function PostPreview({
  profileName = "—",
  profileCity = "",
  focusArea = "",
  badgeLabel = "Standard update",
  warning = null,
  bodyText = "—",
  ctaLabel = "CTA button",
  ctaHref = "",
  ctaTarget = "_blank",
  ctaRel = "noreferrer",
  ctaDisabled = false,
  onCtaClick = null,
  metaRows = [],
  mediaUrl = "",
  overlayUrl = "",
  onMediaClick = null,
  footerText = "",
}) {
  const handleCtaClick = (event) => {
    if (ctaDisabled) {
      event.preventDefault();
    }
    if (onCtaClick) {
      onCtaClick(event);
    }
  };

  const handleMediaClick = (event) => {
    if (onMediaClick) {
      onMediaClick(event);
    }
  };

  const hasMedia = Boolean(mediaUrl);
  const hasOverlay = Boolean(overlayUrl);
  const bodyValue = (bodyText || "").trim() || "—";

  return (
    <div className="post-preview">
      {warning ? <div className="preview-warning">{warning}</div> : null}

      <div className="post-preview__header">
        <div>
          <div className="post-preview__eyebrow">Posting to</div>
          <div className="post-preview__profile">
            {profileName || "—"}
            {profileCity ? " · " + profileCity : ""}
          </div>
          {focusArea ? (
            <div className="muted small">Focus area: {focusArea}</div>
          ) : null}
        </div>
        <div className="post-preview__badge">{badgeLabel || "—"}</div>
      </div>

      <div className="post-preview__copy">{bodyValue}</div>

      <div className="post-preview__cta-row">
        <a
          className={"preview-cta-btn" + (ctaDisabled ? " is-disabled" : "")}
          href={ctaHref || undefined}
          target={ctaTarget}
          rel={ctaRel}
          onClick={handleCtaClick}
        >
          {ctaLabel}
        </a>
        {Array.isArray(metaRows) && metaRows.length ? (
          <div className="post-preview__meta">
            {metaRows.map((row, idx) => (
              <div key={row?.label || idx}>
                {row?.label ? `${row.label}: ` : null}
                {row?.content}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {hasMedia ? (
        <div className="post-preview__media">
          {hasOverlay ? (
            <div className="overlay-wrapper">
              <img
                src={mediaUrl}
                alt="Post media preview"
                onClick={handleMediaClick}
                style={onMediaClick ? { cursor: "pointer" } : undefined}
              />
              <img className="media-overlay-img" src={overlayUrl} alt="Overlay" />
            </div>
          ) : (
            <img
              src={mediaUrl}
              alt="Post media preview"
              onClick={handleMediaClick}
              style={onMediaClick ? { cursor: "pointer" } : undefined}
            />
          )}
        </div>
      ) : null}

      {footerText ? (
        <div className="post-preview__footer muted small">{footerText}</div>
      ) : null}
    </div>
  );
}
