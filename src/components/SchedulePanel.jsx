import React from "react";

export default function SchedulePanel({
  panelRef,
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
}) {
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-title">Generate & post</div>
      <div className="panel-section action-row">
        <button className="btn btn--blue" onClick={onPreview} disabled={previewing}>
          {previewing ? (
            <span className="loading-dots">
              <span />
              <span />
              <span />
            </span>
          ) : (
            "Generate preview"
          )}
        </button>
        <button className="btn btn--green" onClick={onPostNow} disabled={busy || posting}>
          {posting ? (
            <span className="loading-dots">
              <span />
              <span />
              <span />
            </span>
          ) : postNowStatus === "posted" ? (
            "Posted!"
          ) : (
            "Post now"
          )}
        </button>
        <button className="btn btn--warning" onClick={onPostAll} disabled={busy}>
          Post all profiles
        </button>
        <button
          className="btn btn--danger"
          type="button"
          onClick={onClear}
          disabled={busy || posting}
        >
          Clear all
        </button>
      </div>
      <div className="panel-section">
        <label className="field-label">Schedule date/time</label>
        <div className="section-grid">
          <input type="date" value={scheduleDate} onChange={(e) => onChangeScheduleDate(e.target.value)} />
          <input type="time" value={scheduleTime} onChange={(e) => onChangeScheduleTime(e.target.value)} />
          <button
            className="btn btn--indigo"
            type="button"
            onClick={onSchedule}
            disabled={busy || posting || previewing}
          >
            {scheduleStatus === "scheduled"
              ? "Scheduled"
              : scheduleStatus === "updated"
              ? "Updated"
              : scheduleStatus === "error"
              ? "Retry"
              : "Schedule"}
          </button>
        </div>
        <p className="muted small">
          Pick a future date/time to queue this post for the selected profile. Click a scheduled row to
          load it for editing.
        </p>
        <div className="section-grid" style={{ alignItems: "end" }}>
          <div>
            <label className="field-label">Auto cadence</label>
            <select value={autoCadenceDays} onChange={(e) => onChangeAutoCadence(Number(e.target.value))}>
              <option value={1}>1 per day</option>
              <option value={2}>1 per 2 days</option>
              <option value={3}>1 per 3 days</option>
            </select>
          </div>
          <button
            className="btn btn--indigo"
            type="button"
            onClick={onAutoScheduleWithAi}
            disabled={bulkBusy || busy}
          >
            Auto schedule with AI
          </button>
        </div>
      </div>
      <div className="panel-section">
        <div className="section">
          <label className="field-label">Post type</label>
          <select value={postType} onChange={(e) => onChangePostType(e.target.value)}>
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
                placeholder="2025-04-01"
              />
              <label className="field-label">Event end (YYYY-MM-DD)</label>
              <input
                value={eventEnd}
                onChange={(e) => onChangeEventEnd(e.target.value)}
                placeholder="2025-04-07"
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
        <label className="field-label">Post copy</label>
        <textarea
          value={postText}
          onChange={(e) => onChangePostText(e.target.value)}
          placeholder="Generated post will appear here. Edit freely before posting."
        />
        <p className="muted small">
          {preview
            ? "Preview generated. Edits here will be published."
            : "Tip: click Generate preview for AI assistance, or write your own copy."}
        </p>
      </div>
    </section>
  );
}
