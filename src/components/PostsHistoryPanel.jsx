import React, { useEffect, useState } from "react";
import api from "../lib/api";

export default function PostsHistoryPanel({ selectedProfileId, refreshToken }) {
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [compositeMap, setCompositeMap] = useState({});
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
        const comp = {};
        list.forEach((it) => {
          if (it.overlayUrl && it.usedImageUrl) {
            comp[it.id || it.createdAt] = it.usedImageUrl;
          }
        });
        setCompositeMap(comp);
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
              <th>Link</th>
              <th>GBP URL</th>
              <th>Photo</th>
              <th>Overlay</th>
              <th>Composite</th>
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
                  {it.linkUrl ? (
                    <a href={it.linkUrl} target="_blank" rel="noreferrer">
                      {it.linkUrl}
                    </a>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td>
                  {it.postedUrl ? (
                    <a href={it.postedUrl} target="_blank" rel="noreferrer">
                      {it.postedUrl}
                    </a>
                  ) : it.gmbPostId ? (
                    <span className="muted small">{it.gmbPostId}</span>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td>
                  {it.usedImage || Number(it.mediaCount || 0) > 0 ? "Yes" : "No"}
                </td>
                <td>
                  {it.overlayUrl ? (
                    <a href={it.overlayUrl} target="_blank" rel="noreferrer">
                      Overlay
                    </a>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td>
                  {compositeMap[it.id || it.createdAt] ? (
                    <a href={compositeMap[it.id || it.createdAt]} target="_blank" rel="noreferrer">
                      Composite
                    </a>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
