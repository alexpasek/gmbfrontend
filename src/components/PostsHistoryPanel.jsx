import React, { useEffect, useState } from "react";
import api from "../lib/api";

export default function PostsHistoryPanel({ selectedProfileId, refreshToken }) {
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [hist, pr] = await Promise.all([
          api.getPostsHistory(selectedProfileId || null, 100),
          api.getProfiles().catch(() => null),
        ]);
        if (cancelled) return;
        const list = hist && hist.items
          ? hist.items
          : Array.isArray(hist)
          ? hist
          : [];
        setItems(list.slice().reverse());
        const map = {};
        const arr = pr && pr.profiles ? pr.profiles : [];
        arr.forEach((p) => {
          map[p.profileId] = p.businessName || p.profileId;
        });
        setProfiles(map);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedProfileId, refreshToken]);

  return (
    <div className="panel-section table-shell">
      {loading && <div className="muted small">Loading…</div>}
      {error && (
        <div className="muted small error-text">
          {error}
        </div>
      )}
      {!loading && !items.length && !error && (
        <div className="muted small">No posts yet.</div>
      )}
      {items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Profile</th>
              <th>Status</th>
              <th>CTA</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id || it.createdAt}>
                <td>
                  {it.createdAt
                    ? String(it.createdAt).replace("T", " ").slice(0, 16)
                    : "—"}
                </td>
                <td>{profiles[it.profileId] || it.profileId || "—"}</td>
                <td>{it.status || "—"}</td>
                <td>{it.cta || "—"}</td>
                <td>
                  {it.usedImage || Number(it.mediaCount || 0) > 0 ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}