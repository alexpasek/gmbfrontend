import React, { useMemo, useState } from "react";

const STATUS_OPTIONS = ["QUEUED", "PAUSED", "POSTED", "FAILED"];

function getStatusTone(status) {
  const value = String(status || "QUEUED").toUpperCase();
  if (value === "QUEUED") return "green";
  if (value === "PAUSED") return "amber";
  if (value === "FAILED") return "red";
  return "slate";
}

function formatTime(value) {
  const dt = value ? new Date(value) : null;
  if (!dt || isNaN(dt.getTime())) return "--:--";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  const dt = value ? new Date(`${value}T00:00:00`) : null;
  if (!dt || isNaN(dt.getTime())) return value || "";
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function dayKey(value) {
  const dt = value ? new Date(value) : null;
  if (!dt || isNaN(dt.getTime())) return null;
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${month}-${day}`;
}

export default function PhotoScheduleCalendar({
  jobs = [],
  onSelectJob,
  onChangeStatus,
  onDeleteJob,
}) {
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const filteredJobs = useMemo(() => {
    if (!Array.isArray(jobs)) return [];
    return jobs.filter((job) => {
      const status = String(job?.status || "QUEUED").toUpperCase();
      if (statusFilter === "ACTIVE") return status === "QUEUED" || status === "PAUSED";
      if (statusFilter === "ALL") return true;
      return status === statusFilter;
    });
  }, [jobs, statusFilter]);

  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  const days = Array.from(
    new Set(
      filteredJobs
        .map((it) => {
          return dayKey(it?.runAt);
        })
        .filter(Boolean)
    )
  ).sort();

  const jobsForDay = (day) =>
    filteredJobs
      .filter((it) => dayKey(it.runAt) === day)
      .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());

  return (
    <div className="photo-calendar">
      <div className="photo-calendar-toolbar">
        <div className="photo-calendar-summary">
          <strong>{filteredJobs.length}</strong>
          <span>{filteredJobs.length === 1 ? "job shown" : "jobs shown"}</span>
        </div>
        <select
          className="photo-calendar-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter photo schedule status"
        >
          <option value="ACTIVE">Active</option>
          <option value="QUEUED">Queued</option>
          <option value="PAUSED">Paused</option>
          <option value="POSTED">Posted</option>
          <option value="FAILED">Failed</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {days.length === 0 ? (
        <div className="muted small">No jobs match this status.</div>
      ) : (
        <div className="photo-calendar-grid">
          {days.map((day) => {
            const dayJobs = jobsForDay(day);
            return (
              <div key={day} className="photo-calendar-day">
                <div className="photo-calendar-day__header">
                  <strong>{formatDate(day)}</strong>
                  <span>{dayJobs.length}</span>
                </div>
                <div className="photo-calendar-day__jobs">
                  {dayJobs.map((it) => {
                    const status = String(it.status || "QUEUED").toUpperCase();
                    const mediaUrl = it.body?.mediaUrl || "";
                    const location =
                      it.body?.meta?.city || it.body?.meta?.neighbourhood
                        ? `${it.body?.meta?.city || ""}${
                            it.body?.meta?.city && it.body?.meta?.neighbourhood ? " / " : ""
                          }${it.body?.meta?.neighbourhood || ""}`
                        : "No location";
                    return (
                      <article
                        key={it.id}
                        className={`photo-calendar-job photo-calendar-job--${getStatusTone(status)}`}
                      >
                        <button
                          className="photo-calendar-job__main"
                          type="button"
                          onClick={() => onSelectJob && onSelectJob(it)}
                        >
                          <span className="photo-calendar-job__time">{formatTime(it.runAt)}</span>
                          <span className={`status-pill status-pill--${getStatusTone(status)}`}>
                            {status}
                          </span>
                          <span className="photo-calendar-job__location">{location}</span>
                          <span className="photo-calendar-job__media" title={mediaUrl}>
                            {mediaUrl || "No media"}
                          </span>
                        </button>
                        <div className="photo-calendar-job__actions">
                          <select
                            value={status}
                            onChange={(e) => onChangeStatus && onChangeStatus(it, e.target.value)}
                            aria-label="Change photo job status"
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn btn--ghost btn--small"
                            type="button"
                            onClick={() => onDeleteJob && onDeleteJob(it.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
