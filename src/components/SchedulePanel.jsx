import React from "react";

export default function SchedulePanel({
  panelRef,
  hasProfile = true,
  profileName = "",
  onPreview,
  previewing,
  onPostNow,
  posting,
  postNowStatus,
  busy,
  onPostAll,
  onClear,
  scheduleDate,
  onChangeScheduleDate,
  scheduleTime,
  onChangeScheduleTime,
  onSchedule,
  scheduleStatus,
  autoCadenceDays,
  onChangeAutoCadence,
  onAutoScheduleWithAi,
  bulkBusy,
  postType,
  onChangePostType,
  postTypes,
  eventTitle,
  onChangeEventTitle,
  eventStart,
  onChangeEventStart,
  eventEnd,
  onChangeEventEnd,
  offerTitle,
  onChangeOfferTitle,
  offerCoupon,
  onChangeOfferCoupon,
  offerRedeemUrl,
  onChangeOfferRedeemUrl,
  postText,
  onChangePostText,
  preview,
  serviceTopics,
  serviceTopicId,
  defaultServiceTopicId,
  onChangeServiceTopicId,
}) {
  const defaultTopic =
    defaultServiceTopicId &&
    serviceTopics.find((topic) => topic.id === defaultServiceTopicId);
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-title">1. Write your update</div>
      <p className="muted small">Start with your service and city. Add useful details, then review the photo and customer button.</p>
      <div className="panel-section">
        <label className="field-label" htmlFor="composer-service">Service topic</label>
        <select id="composer-service" value={serviceTopicId || ""} onChange={(e) => onChangeServiceTopicId(e.target.value)}>
          <option value="">
            Use default topic{" "}
            {defaultTopic ? `(${defaultTopic.label})` : ""}
          </option>
          {serviceTopics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.label}
            </option>
          ))}
        </select>
        <p className="muted small">
          Choose the service for your AI draft, or keep this business’s default.
        </p>
      </div>
      <div className="panel-section">
        <div className="section">
          <label className="field-label" htmlFor="composer-type">Post type</label>
          <select id="composer-type" value={postType} onChange={(e) => onChangePostType(e.target.value)}>
            {postTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {postType === "EVENT" && (
        <div className="panel-section">
          <div className="section-grid">
            <div className="section">
              <label className="field-label">Event title</label>
              <input
                value={eventTitle}
                onChange={(e) => onChangeEventTitle(e.target.value)}
                placeholder="Spring Painting Promo Day"
              />
            </div>
            <div className="section">
              <label className="field-label">Event start (YYYY-MM-DD)</label>
              <input
                value={eventStart}
                onChange={(e) => onChangeEventStart(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
              <label className="field-label">Event end (YYYY-MM-DD)</label>
              <input
                value={eventEnd}
                onChange={(e) => onChangeEventEnd(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
        </div>
      )}
      {postType === "OFFER" && (
        <div className="panel-section">
          <div className="section-grid">
            <div className="section">
              <label className="field-label">Offer title</label>
              <input
                value={offerTitle}
                onChange={(e) => onChangeOfferTitle(e.target.value)}
                placeholder="10% off popcorn ceiling removal"
              />
            </div>
            <div className="section">
              <label className="field-label">Coupon code</label>
              <input
                value={offerCoupon}
                onChange={(e) => onChangeOfferCoupon(e.target.value)}
                placeholder="SPRING10"
              />
            </div>
            <div className="section">
              <label className="field-label">Redeem URL (optional)</label>
              <input
                value={offerRedeemUrl}
                onChange={(e) => onChangeOfferRedeemUrl(e.target.value)}
                placeholder="https://example.com/offer"
              />
            </div>
          </div>
        </div>
      )}
      <div className="panel-section">
        <div className="action-row">
        <button className="btn btn--blue" onClick={onPreview} disabled={!hasProfile || busy || previewing}>
          {previewing ? (
            <span className="loading-dots" role="status" aria-label="Working">
              <span />
              <span />
              <span />
            </span>
          ) : (
            "Draft with AI"
          )}
        </button>
        </div>
        <label className="field-label" htmlFor="post-copy">Post text</label>
        <textarea
          id="post-copy"
          rows={9}
          value={postText}
          onChange={(e) => onChangePostText(e.target.value)}
          placeholder="Generated post will appear here. Edit freely before posting."
        />
        <p className="muted small">
          {preview
            ? "Preview generated. Edits here will be published."
            : "Write your own update or choose “Draft with AI”. Extra business links may be added when publishing."}
        </p>
      </div>
      <div className="publish-section">
        <div className="panel-title">Publish or schedule</div>
        <p className="muted small">{profileName ? `Destination: ${profileName}` : "Choose a business at the top of the page to continue."}</p>
      <div className="panel-section action-row">
        <button className="btn btn--green" onClick={onPostNow} disabled={!hasProfile || busy || posting}>
          {posting ? (
            <span className="loading-dots" role="status" aria-label="Working">
              <span />
              <span />
              <span />
            </span>
          ) : postNowStatus === "posted" ? (
            "Sent to Google"
          ) : (
            "Publish now"
          )}
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={onClear}
          disabled={!hasProfile || busy || posting}
        >
          Clear this draft
        </button>
      </div>
      <div className="panel-section">
        <label className="field-label">Or publish later</label>
        <div className="section-grid">
          <input type="date" aria-label="Publish date" value={scheduleDate} onChange={(e) => onChangeScheduleDate(e.target.value)} />
          <input type="time" aria-label="Publish time" value={scheduleTime} onChange={(e) => onChangeScheduleTime(e.target.value)} />
          <button
            className="btn btn--indigo"
            type="button"
            onClick={onSchedule}
            disabled={!hasProfile || busy || posting || previewing}
          >
            {scheduleStatus === "scheduled"
              ? "Scheduled"
              : scheduleStatus === "updated"
              ? "Updated"
              : scheduleStatus === "error"
              ? "Retry scheduling"
              : "Schedule post"}
          </button>
      </div>
      <p className="muted small">
        Choose a future date and time. Manage scheduled posts in Posts & drafts.
      </p>
      </div>
      </div>
      <details className="workspace-disclosure workspace-disclosure--compact">
        <summary>Multiple posts & automation</summary>
        <p className="muted small">AI scheduling uses the selected photos and frequency. Publishing to included profiles creates posts from each business’s saved settings, rather than copying this draft.</p>
        <div className="section-grid" style={{ alignItems: "end" }}>
          <div>
            <label className="field-label" htmlFor="composer-frequency">Posting frequency</label>
            <select id="composer-frequency" value={autoCadenceDays} onChange={(e) => onChangeAutoCadence(Number(e.target.value))}>
              <option value={1}>1 per day</option>
              <option value={2}>1 per 2 days</option>
              <option value={3}>1 per 3 days</option>
            </select>
          </div>
          <button
            className="btn btn--indigo"
            type="button"
            onClick={onAutoScheduleWithAi}
            disabled={!hasProfile || bulkBusy || busy}
          >
            Create an AI posting schedule
          </button>
        </div>
        <button className="btn btn--warning" onClick={onPostAll} disabled={busy}>
          Publish to included profiles
        </button>
      </details>
    </section>
  );
}
