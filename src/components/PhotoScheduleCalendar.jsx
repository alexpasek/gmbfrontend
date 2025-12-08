import React from "react";

export default function PhotoScheduleCalendar({ jobs = [], onSelectJob }) {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  const days = Array.from(
    new Set(
      jobs
        .map((it) => {
          const dt = it && it.runAt ? new Date(it.runAt) : null;
          return dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
        })
        .filter(Boolean)
    )
  ).sort();

  const jobsForDay = (day) =>
    jobs.filter((it) => it.runAt && it.runAt.startsWith(day));

  return (
    <div
      className="muted small"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8
      }}
    >
      {days.map((day) => (
        <div key={day} className="diag-card">
          <div>
            <strong>{new Date(day).toLocaleDateString()}</strong>
          </div>
          <div className="muted small" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {jobsForDay(day).map((it) => {
              const label = new Date(it.runAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              });
              return (
                <button
                  key={it.id}
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => onSelectJob && onSelectJob(it)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
