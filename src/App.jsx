import React, { useEffect, useMemo, useState } from "react";
import api, {
  getApiBase,
  uploadPhoto,
  updateProfileBulkAccess,
} from "./lib/api";
import "./App.css";
import BackendBadge from "./components/BackendBadge";
import PostsHistoryPanel from "./components/PostsHistoryPanel";

const CTA_OPTIONS = [
  { value: "CALL_NOW", label: "Call now (tel:+)" },
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "BOOK", label: "Book" },
  { value: "ORDER", label: "Order" },
  { value: "SHOP", label: "Shop" },
  { value: "SIGN_UP", label: "Sign up" },
];

const POST_TYPES = [
  { value: "STANDARD", label: "Standard update" },
  { value: "OFFER", label: "Offer / promotion" },
  { value: "EVENT", label: "Event" },
  { value: "ALERT", label: "Alert / important update" },
];

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "profiles", label: "Profiles & media" },
  { id: "composer", label: "Composer" },
  { id: "scheduler", label: "Scheduler" },
  { id: "history", label: "Post history" },
  { id: "diagnostics", label: "Diagnostics" },
];

export default function App() {
  const [health, setHealth] = useState(null);
  const [version, setVersion] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  const [preview, setPreview] = useState("");
  const [postText, setPostText] = useState("");

  const [postType, setPostType] = useState("STANDARD");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerCoupon, setOfferCoupon] = useState("");
  const [offerRedeemUrl, setOfferRedeemUrl] = useState("");

  const [cta, setCta] = useState("CALL_NOW");
  const [linkUrl, setLinkUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");

  const [schedStatus, setSchedStatus] = useState(null);
  const [schedConfig, setSchedConfig] = useState(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [backendBase, setBackendBase] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState("");

  const [tab, setTab] = useState("dashboard");

  const [accounts, setAccounts] = useState(null);
  const [locationsByAccount, setLocationsByAccount] = useState({});
  const [uploadsInfo, setUploadsInfo] = useState(null);
  const [uploadsCheck, setUploadsCheck] = useState(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.profileId === selectedId),
    [profiles, selectedId]
  );

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
    console.log(msg);
  }

  async function bootstrap() {
    try {
      const [h, v, pr, sc, ss] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getVersion().catch(() => null),
        api.getProfiles(),
        api.getSchedulerConfig().catch(() => null),
        api.getSchedulerStatus().catch(() => null),
      ]);
      setHealth(h);
      setVersion(v);
      const list = Array.isArray(pr?.profiles) ? pr.profiles : [];
      setProfiles(list);
      if (list[0]?.profileId) setSelectedId(list[0].profileId);
      setSchedConfig(sc);
      setSchedStatus(ss);
    } catch (e) {
      notify(e.message || "Failed to load");
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = await getApiBase();
        if (alive) setBackendBase(base || "");
      } catch (_e) {
        if (alive) setBackendBase("http://127.0.0.1:8787");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const p = selectedProfile;
    const d = (p && p.defaults) || {};
    setCta(d.cta || "CALL_NOW");
    setLinkUrl(d.linkUrl || p?.landingUrl || "");
    setMediaUrl(d.mediaUrl || "");
    if (selectedId) refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedProfile?.defaults]);

  async function doPreview() {
    if (!selectedId) return notify("Select a profile first");
    setPreview("");
    try {
      const r = await api.generatePost(selectedId);
      if (r && r.post) {
        setPreview(r.post);
        setPostText(r.post);
      } else {
        setPreview(JSON.stringify(r, null, 2));
      }
    } catch (e) {
      notify(e.message || "Preview failed");
    }
  }

  function validateBeforePost() {
    if (cta !== "CALL_NOW") {
      if (!/^https?:\/\//i.test(linkUrl || "")) {
        notify("For this CTA, please provide a valid https:// link.");
        return false;
      }
    } else {
      if (
        linkUrl &&
        !/^tel:/i.test(linkUrl) &&
        !/^https?:\/\//i.test(linkUrl)
      ) {
        notify("For Call now, leave link empty OR use tel:+1...");
        return false;
      }
    }
    if (mediaUrl) {
      const isHttps = /^https:\/\/.+\.(png|jpe?g|webp)$/i.test(mediaUrl);
      const isUploads = /^\/uploads\/.+\.(png|jpe?g|webp)$/i.test(mediaUrl);
      if (!isHttps && !isUploads) {
        notify(
          "Media must be https://... OR /uploads/your-file(.png/.jpg/.jpeg/.webp)."
        );
        return false;
      }
    }
    return true;
  }

  async function doPostNow() {
    if (!selectedId) return notify("Select a profile first");
    if (!validateBeforePost()) return;
    setBusy(true);
    try {
      await api.postNow({
        profileId: selectedId,
        postText,
        cta,
        linkUrl,
        mediaUrl,
        topicType: postType,
        eventTitle,
        eventStart,
        eventEnd,
        offerTitle,
        offerCoupon,
        offerRedeemUrl
      });
      notify("Posted!");
      await refreshHistory();
    } catch (e) {
      notify(e.message || "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function doPostNowAll() {
    setBusy(true);
    try {
      const r = await api.postNowAll();
      notify(`Posted for ${r.count || 0} profile(s)`);
      await refreshHistory();
    } catch (e) {
      notify(e.message || "Post-all failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    try {
      setSchedStatus(await api.getSchedulerStatus());
    } catch (e) {
      notify(e.message || "Load status failed");
    }
  }

  async function refreshConfig() {
    try {
      setSchedConfig(await api.getSchedulerConfig());
    } catch (e) {
      notify(e.message || "Load config failed");
    }
  }

  function refreshHistory() {
    setHistoryRefreshToken((token) => token + 1);
    return Promise.resolve();
  }

  async function saveConfig(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const enabled = fd.get("enabled") === "on";
    const defaultTime = String(fd.get("defaultTime") || "10:00");
    const tickSeconds = Number(fd.get("tickSeconds") || 30);

    const perProfileTimes = {};
    profiles.forEach((p) => {
      const v = String(fd.get(`ppt_${p.profileId}`) || "");
      if (/^\d{2}:\d{2}$/.test(v)) perProfileTimes[p.profileId] = v;
    });

    setBusy(true);
    try {
      const cfg = await api.setSchedulerConfig({
        enabled,
        defaultTime,
        tickSeconds,
        perProfileTimes,
      });
      setSchedConfig(cfg.config || cfg);
      notify("Saved config");
      await refreshStatus();
    } catch (e2) {
      notify(e2.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAllNow() {
    setBusy(true);
    try {
      await api.runSchedulerOnce();
      notify("Manual run for all profiles");
      await refreshHistory();
    } catch (e) {
      notify(e.message || "Manual run failed");
    } finally {
      setBusy(false);
    }
  }

  async function runOneNow() {
    if (!selectedId) return notify("Select a profile first");
    setBusy(true);
    try {
      await api.runSchedulerNow(selectedId);
      notify("Manual run for selected");
      await refreshHistory();
    } catch (e) {
      notify(e.message || "Manual run failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileDefaults() {
    if (!selectedProfile) return;
    try {
      await api.updateProfileDefaults(selectedProfile.profileId, {
        cta,
        linkUrl,
        mediaUrl,
      });
      notify("Defaults saved");
      const pr = await api.getProfiles();
      const list = Array.isArray(pr?.profiles) ? pr.profiles : [];
      setProfiles(list);
    } catch (e) {
      notify(e.message || "Save defaults failed");
    }
  }

  async function handlePhotoUpload(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!backendBase) {
      notify("Backend not ready yet. Try again in a moment.");
      if (e?.target) e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const result = await uploadPhoto(file, backendBase);
      if (result && result.url) {
        setMediaUrl(result.url);
        notify("Photo uploaded from your computer.");
      } else {
        notify("Upload succeeded but no URL was returned.");
      }
    } catch (err) {
      notify(err.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
      if (e?.target) e.target.value = "";
    }
  }

  async function toggleProfilePosting(profile, enabled) {
    if (!profile || !profile.profileId) return;
    setToggleBusyId(profile.profileId);
    try {
      await updateProfileBulkAccess(profile.profileId, enabled);
      setProfiles((prev) =>
        prev.map((p) =>
          p.profileId === profile.profileId ? { ...p, disabled: !enabled } : p
        )
      );
      notify(
        `${profile.businessName || profile.profileId} ${
          enabled ? "included" : "paused"
        } for bulk posting`
      );
    } catch (err) {
      notify(err.message || "Failed to update profile");
    } finally {
      setToggleBusyId("");
    }
  }

  async function loadAccountsAndLocations() {
    try {
      const acc = await api.getAccounts();
      setAccounts(acc);
      if (acc && Array.isArray(acc.accounts)) {
        const allLocs = {};
        for (const a of acc.accounts) {
          if (!a.name) continue;
          const id = String(a.name).split("/").pop();
          try {
            const locs = await api.getLocations(id);
            allLocs[id] = locs;
          } catch (_e) {
            allLocs[id] = { error: true };
          }
        }
        setLocationsByAccount(allLocs);
      }
      notify("Loaded accounts & locations");
    } catch (e) {
      notify(e.message || "Failed to load accounts");
    }
  }

  async function loadUploadsInfo() {
    try {
      const list = await api.getUploadsList();
      const check = await api.checkUploads().catch(() => null);
      setUploadsInfo(list);
      setUploadsCheck(check);
      notify("Checked uploads");
    } catch (e) {
      notify(e.message || "Uploads check failed");
    }
  }

  const totalProfiles = profiles.length;
  const enabledProfiles = profiles.filter((p) => !p.disabled).length;
  const disabledProfiles = totalProfiles - enabledProfiles;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">GV</div>
          <div>
            <div className="logo-title">GMB Viking</div>
            <div className="logo-subtitle">GBP autoposter</div>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={
                "nav-item" + (tab === t.id ? " nav-item--active" : "")
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <BackendBadge />
          <div className="sidebar-version">
            v{(version && version.version) || "0.0.0"}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <div>
            <h1 className="main-title">
              {TABS.find((t) => t.id === tab)?.label || "Dashboard"}
            </h1>
            <p className="main-subtitle">
              {tab === "dashboard" &&
                "High-level overview of your GBP automation."}
              {tab === "profiles" &&
                "Profiles, CTAs, landing URLs, and media defaults."}
              {tab === "composer" &&
                "Generate AI posts and publish them to Google."}
              {tab === "scheduler" &&
                "Configure daily times and monitor the scheduler."}
              {tab === "history" &&
                "Review what was sent and how it performed."}
              {tab === "diagnostics" &&
                "Debug accounts, locations, and media reachability."}
            </p>
          </div>

          <div className="profile-switcher">
            <label className="field-label">Active profile</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {(p.businessName || p.profileId) +
                    (p.city ? " — " + p.city : "") +
                    (p.disabled ? " (paused)" : "")}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="main-body">
          {tab === "dashboard" && (
            <section className="panel-grid">
              <div className="panel">
                <div className="panel-title">Profiles</div>
                <div className="stats-grid">
                  <div>
                    <div className="muted small">Total</div>
                    <strong>{totalProfiles}</strong>
                  </div>
                  <div>
                    <div className="muted small">Enabled</div>
                    <strong>{enabledProfiles}</strong>
                  </div>
                  <div>
                    <div className="muted small">Paused</div>
                    <strong>{disabledProfiles}</strong>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-title">Scheduler</div>
                {schedStatus ? (
                  <div className="stats-grid">
                    <div>
                      <div className="muted small">Enabled</div>
                      <strong>{schedStatus.enabled ? "Yes" : "No"}</strong>
                    </div>
                    <div>
                      <div className="muted small">Default time</div>
                      <strong>{schedStatus.defaultTime || "—"}</strong>
                    </div>
                    <div>
                      <div className="muted small">Tick</div>
                      <strong>{(schedStatus.tickSeconds || 30) + "s"}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="muted small">No scheduler status yet.</div>
                )}
              </div>
              <div className="panel">
                <div className="panel-title">Quick actions</div>
                <div className="action-row">
                  <button
                    className="btn btn--blue"
                    onClick={doPreview}
                    disabled={!selectedId}
                  >
                    Generate preview
                  </button>
                  <button
                    className="btn btn--green"
                    onClick={doPostNow}
                    disabled={!selectedId || busy}
                  >
                    Post now
                  </button>
                  <button
                    className="btn btn--indigo"
                    onClick={runAllNow}
                    disabled={busy}
                  >
                    Run scheduler once
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "profiles" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">CTA & links</div>
                <div className="panel-section">
                  <label className="field-label">Action button</label>
                  <select
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                  >
                    {CTA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="panel-section">
                  <label className="field-label">Link</label>
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://your-site/page  — or tel:+1..."
                  />
                  <p className="muted small">
                    CALL_NOW can leave the link blank. All other CTAs need a valid https link.
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
                    <span className="muted small">
                      {uploadingPhoto
                        ? "Uploading..."
                        : backendBase
                        ? "Saved to /uploads and auto-filled."
                        : "Resolving backend..."}
                    </span>
                  </div>
                </div>
                <div className="panel-section">
                  <button
                    className="btn btn--green full-width"
                    onClick={saveProfileDefaults}
                    disabled={!selectedProfile}
                  >
                    Save as profile defaults
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Bulk posting access</div>
                <p className="muted small">
                  Toggle inclusion for “Post all” and scheduler runs.
                </p>
                <div className="bulk-grid">
                  {profiles.length === 0 ? (
                    <div className="muted small">No profiles loaded.</div>
                  ) : (
                    profiles.map((p) => (
                      <div
                        key={p.profileId}
                        className={
                          "bulk-card" +
                          (p.disabled
                            ? " bulk-card--disabled"
                            : " bulk-card--active")
                        }
                      >
                        <div className="bulk-card__body">
                          <div className="bulk-card__title">
                            {p.businessName || p.profileId}
                          </div>
                          <div className="muted small">
                            {p.city || "No city"} · {p.profileId}
                          </div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={!p.disabled}
                            disabled={toggleBusyId === p.profileId || busy}
                            onChange={(e) =>
                              toggleProfilePosting(p, e.target.checked)
                            }
                          />
                          <span className="slider" />
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "composer" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Generate & post</div>
                <div className="panel-section action-row">
                  <button className="btn btn--blue" onClick={doPreview}>
                    Generate preview
                  </button>
                  <button
                    className="btn btn--green"
                    onClick={doPostNow}
                    disabled={busy}
                  >
                    Post now
                  </button>
                  <button
                    className="btn btn--warning"
                    onClick={doPostNowAll}
                    disabled={busy}
                  >
                    Post all profiles
                  </button>
                </div>
                <div className="panel-section">
                  <div className="section">
                    <label className="field-label">Post type</label>
                    <select
                      value={postType}
                      onChange={(e) => setPostType(e.target.value)}
                    >
                      {POST_TYPES.map((t) => (
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
                          onChange={(e) => setEventTitle(e.target.value)}
                          placeholder="Spring Painting Promo Day"
                        />
                      </div>
                      <div className="section">
                        <label className="field-label">Event start (YYYY-MM-DD)</label>
                        <input
                          value={eventStart}
                          onChange={(e) => setEventStart(e.target.value)}
                          placeholder="2025-04-01"
                        />
                        <label className="field-label">Event end (YYYY-MM-DD)</label>
                        <input
                          value={eventEnd}
                          onChange={(e) => setEventEnd(e.target.value)}
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
                          onChange={(e) => setOfferTitle(e.target.value)}
                          placeholder="10% off popcorn ceiling removal"
                        />
                      </div>
                      <div className="section">
                        <label className="field-label">Coupon code</label>
                        <input
                          value={offerCoupon}
                          onChange={(e) => setOfferCoupon(e.target.value)}
                          placeholder="SPRING10"
                        />
                      </div>
                      <div className="section">
                        <label className="field-label">Redeem URL (optional)</label>
                        <input
                          value={offerRedeemUrl}
                          onChange={(e) => setOfferRedeemUrl(e.target.value)}
                          placeholder="https://epfproservices.com/popcorn-ceiling-removal/mississauga/"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="panel-section">
                  <label className="field-label">Post copy</label>
                  <textarea
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="Generated post will appear here. Edit freely before posting."
                  />
                  <p className="muted small">
                    {preview
                      ? "Preview generated. Edits here will be published."
                      : "Tip: click Generate preview for AI assistance, or write your own copy."}
                  </p>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Last generated preview</div>
                <div className="panel-section preview-shell">
                  {preview ? (
                    <pre>{preview}</pre>
                  ) : (
                    <div className="muted small">
                      No preview yet. Click "Generate preview" to see AI output.
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "scheduler" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Scheduler status</div>
                <div className="panel-section stats-grid">
                  <div>
                    <div className="muted small">Enabled</div>
                    <strong>{schedStatus && schedStatus.enabled ? "Yes" : "No"}</strong>
                  </div>
                  <div>
                    <div className="muted small">Default time</div>
                    <strong>{(schedStatus && schedStatus.defaultTime) || "10:00"}</strong>
                  </div>
                  <div>
                    <div className="muted small">Tick</div>
                    <strong>{(schedStatus && schedStatus.tickSeconds) || 30}s</strong>
                  </div>
                </div>

                <div className="panel-section action-row">
                  <button className="btn btn--ghost" onClick={refreshStatus}>
                    Refresh status
                  </button>
                  <button
                    className="btn btn--indigo"
                    onClick={runAllNow}
                    disabled={busy}
                  >
                    Run all now
                  </button>
                  <button
                    className="btn btn--indigo"
                    onClick={runOneNow}
                    disabled={!selectedId || busy}
                  >
                    Run selected
                  </button>
                </div>

                <div className="panel-section table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Profile</th>
                        <th>Time</th>
                        <th>Last run</th>
                        <th>Today?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedStatus && schedStatus.profiles
                        ? schedStatus.profiles.map((p) => (
                            <tr key={p.profileId}>
                              <td>{p.businessName || p.profileId}</td>
                              <td>{p.scheduledTime}</td>
                              <td>{p.lastRunISODate || "—"}</td>
                              <td>{p.willRunToday ? "Yes" : "No"}</td>
                            </tr>
                          ))
                        : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Scheduler config</div>
                <form onSubmit={saveConfig} className="config-form">
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={!!(schedConfig && schedConfig.enabled)}
                    />
                    Enable scheduler
                  </label>

                  <div className="form-grid">
                    <div>
                      <label className="field-label">Default time (HH:MM)</label>
                      <input
                        name="defaultTime"
                        defaultValue={
                          (schedConfig && schedConfig.defaultTime) || "10:00"
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">Tick seconds</label>
                      <input
                        name="tickSeconds"
                        defaultValue={
                          (schedConfig && schedConfig.tickSeconds) || 30
                        }
                      />
                    </div>
                  </div>

                  <div className="per-profile-times">
                    <div className="panel-subtitle">Per-profile times</div>
                    {profiles.map((p) => (
                      <div key={p.profileId} className="per-profile-row">
                        <label>{p.businessName || p.profileId}</label>
                        <input
                          name={`ppt_${p.profileId}`}
                          placeholder="HH:MM"
                          defaultValue={
                            (schedConfig &&
                              schedConfig.perProfileTimes &&
                              schedConfig.perProfileTimes[p.profileId]) ||
                            ""
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="action-row">
                    <button className="btn btn--green" disabled={busy} type="submit">
                      Save config
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={refreshConfig}
                    >
                      Reload
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="panel">
              <div className="panel-title">Post history</div>
              <PostsHistoryPanel
                selectedProfileId={selectedId}
                refreshToken={historyRefreshToken}
              />
            </section>
          )}

          {tab === "diagnostics" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Accounts & locations</div>
                <div className="panel-section action-row">
                  <button className="btn btn--ghost" onClick={loadAccountsAndLocations}>
                    Load accounts & locations
                  </button>
                </div>
                <div className="panel-section diag-shell">
                  {accounts ? (
                    <>
                      <div className="muted small">
                        {Array.isArray(accounts.accounts)
                          ? `${accounts.accounts.length} account(s)`
                          : "No accounts array"}
                      </div>
                      {Array.isArray(accounts.accounts) &&
                        accounts.accounts.map((a) => {
                          const id = String(a.name || "").split("/").pop();
                          const locBlock = locationsByAccount[id];
                          const count =
                            locBlock && Array.isArray(locBlock.locations)
                              ? locBlock.locations.length
                              : 0;
                          return (
                            <div key={a.name} className="diag-card">
                              <div className="diag-title">
                                {a.accountName || a.name}
                              </div>
                              <div className="muted small">ID: {id}</div>
                              <div className="muted small">
                                Locations: {count}
                                {locBlock && locBlock.error && " (error fetching)"}
                              </div>
                            </div>
                          );
                        })}
                    </>
                  ) : (
                    <div className="muted small">
                      Click “Load accounts & locations” to fetch live data.
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">Media / uploads check</div>
                <div className="panel-section action-row">
                  <button className="btn btn--ghost" onClick={loadUploadsInfo}>
                    Check uploads
                  </button>
                </div>
                <div className="panel-section diag-shell">
                  {uploadsInfo ? (
                    <>
                      <div className="muted small">
                        Files: {uploadsInfo.count ?? uploadsInfo.files?.length ?? 0}
                      </div>
                      {uploadsInfo.urls && uploadsInfo.urls.length > 0 && (
                        <ul className="muted small">
                          {uploadsInfo.urls.slice(0, 5).map((u) => (
                            <li key={u}>{u}</li>
                          ))}
                        </ul>
                      )}
                      {uploadsCheck && (
                        <div className="muted small">
                          Last check: {uploadsCheck.ok ? "OK" : "NOT OK"} ·{" "}
                          {uploadsCheck.url || ""} (
                          {uploadsCheck.status || "no status"})
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="muted small">
                      Click “Check uploads” to verify PUBLIC_BASE_URL + /uploads.
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </div>
  );
}
