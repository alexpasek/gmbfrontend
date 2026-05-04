import React, { useEffect, useMemo, useRef, useState } from "react";
import api, {
  getApiBase,
  uploadPhoto,
  uploadPhotos,
  updateProfileBulkAccess,
} from "./lib/api";
import "./App.css";
import BackendBadge from "./components/BackendBadge";
import PostsHistoryPanel from "./components/PostsHistoryPanel";
import PhotoScheduleCalendar from "./components/PhotoScheduleCalendar";
import PostPreview from "./components/PostPreview";
import ProfilesLinksPanel from "./components/ProfilesLinksPanel";
import SchedulePanel from "./components/SchedulePanel";
import BulkDraftsTable from "./components/BulkDraftsTable";
import BulkDraftEditor from "./components/BulkDraftEditor";
import DiagnosticsPanels from "./components/DiagnosticsPanels";

const DEFAULT_BACKEND_BASE = "https://gmb-automation-backend.webtoronto22.workers.dev";

const SERVICE_TOPIC_PRESETS = [
  {
    key: "popcorn",
    label: "Popcorn ceiling removal",
    serviceType: "Popcorn ceiling removal",
    summary:
      "We scrape, resurface, and repaint popcorn ceilings so Calgary homes feel brighter, cleaner, and ready for resale.",
    hashtags: ["#PopcornRemoval", "#CeilingRefresh", "#CalgaryRenovations"],
  },
  {
    key: "drywall-install",
    label: "Drywall installation",
    serviceType: "Drywall installation",
    summary:
      "Precision drywall installation for basements, additions, and tenant improvements with clean lines and fast finishing.",
    hashtags: ["#DrywallInstallation", "#FramingToFinish", "#YYCContractor"],
  },
  {
    key: "drywall-repair",
    label: "Drywall repair",
    serviceType: "Drywall repair",
    summary:
      "Patch holes, re-tape seams, and retexture walls so the repair disappears and paint lays down perfectly.",
    hashtags: ["#DrywallRepair", "#WallRescue", "#CalgaryHomes"],
  },
  {
    key: "baseboard-install",
    label: "Baseboard installation",
    serviceType: "Baseboard installation",
    summary:
      "Trim carpenters install new baseboards and casing with tight corners, custom caulking, and pro paint-ready prep.",
    hashtags: ["#BaseboardInstall", "#TrimCarpentry", "#FinishingCarpenter"],
  },
  {
    key: "wallpaper-removal",
    label: "Wallpaper removal",
    serviceType: "Wallpaper removal",
    summary:
      "Steaming, stripping, and skim-coating wallpapered rooms so new paint or paper goes on a smooth surface.",
    hashtags: ["#WallpaperRemoval", "#PrepAndPaint", "#CalgaryRenovation"],
  },
];

function generateClientId(prefix = "svc") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function buildPresetTopic(preset) {
  return {
    id: generateClientId("svc"),
    label: preset.label,
    serviceType: preset.serviceType,
    summary: preset.summary,
    hashtags: preset.hashtags || [],
    isDefault: false,
    notes: "",
  };
}

function createEmptyServiceTopic() {
  return {
    id: generateClientId("svc"),
    label: "New service",
    serviceType: "",
    summary: "",
    hashtags: [],
    isDefault: false,
    notes: "",
  };
}

/** Resolve a URL we can actually <img src> */
function resolveMediaPreviewUrl(mediaUrl, backendBase) {
  if (!mediaUrl) return "";
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;

  const base = String(backendBase || "").replace(/\/+$/, "");
  const path = mediaUrl.startsWith("/") ? mediaUrl : `/${mediaUrl}`;

  if (!base) {
    return path;
  }

  if (path.startsWith("/uploads/") || path.startsWith("/media/")) {
    return `${base}${path}`;
  }

  return path;
}

/** Simple modal gallery for /uploads with folder support */
function MediaGalleryModal({
  open,
  onClose,
  uploadsInfo,
  backendBase,
  photoMeta,
  onSelect,
  onSelectMultiple,
  onPreview,
  onDeleteUpload,
  onUploadComplete,
  notify: notifyProp,
}) {
  if (!open) return null;

  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState([]);
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [deletingKey, setDeletingKey] = React.useState("");
  const [deletingMany, setDeletingMany] = React.useState(false);
  const [deletingAll, setDeletingAll] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const [currentFolder, setCurrentFolder] = React.useState("");
  const [folderInput, setFolderInput] = React.useState("");
  const [showAllFolders, setShowAllFolders] = React.useState(true);
  const fileInputRef = React.useRef(null);
  const notifySafe = notifyProp || (() => {});
  const lastSelectedRef = React.useRef(null);

  const normalizeKey = React.useCallback((raw) => {
    const str = String(raw || "");
    const m = str.match(/\/(media|uploads)\/([^?#]+)/i);
    if (m) {
      try {
        return decodeURIComponent(m[2]);
      } catch (_e) {
        return m[2];
      }
    }
    return str.replace(/^\/+/, "");
  }, []);

  const normalizeFolder = React.useCallback((raw) => {
    return String(raw || "")
      .trim()
      .replace(/[^a-zA-Z0-9/_-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .replace(/(\.\.|\.)/g, "");
  }, []);

  const buildItem = React.useCallback(
    (raw) => {
      const key = normalizeKey(raw);
      const withoutRoot = key.replace(/^gmb\//, "");
      const idx = withoutRoot.lastIndexOf("/");
      const folder = idx === -1 ? "" : withoutRoot.slice(0, idx);

      const baseCandidate = backendBase || DEFAULT_BACKEND_BASE;
      const base = baseCandidate ? baseCandidate.replace(/\/+$/, "") : "";
      let url = String(raw || "");

      // Always rebuild a clean media URL from the decoded key.
      if (base) {
        url = base + "/media/" + encodeURI(key);
      } else {
        url = url.startsWith("/") ? url : "/media/" + encodeURI(key);
      }

      return { key, url, folder };
    },
    [backendBase, normalizeKey]
  );

  React.useEffect(() => {
    const list = (uploadsInfo && (uploadsInfo.urls || uploadsInfo.files)) || [];
    const normalized = list.map(buildItem);
    setItems(normalized);
    setSelected([]);
    setPreviewUrl("");
    setUploadError("");
    setShowAllFolders(true);
  }, [uploadsInfo, buildItem]);

  const folders = React.useMemo(() => {
    const set = new Set();
    (uploadsInfo?.folders || []).forEach((f) => {
      if (!f) return;
      if (typeof f === "string") set.add(f);
      else if (f.name != null) set.add(String(f.name));
    });
    items.forEach((it) => set.add(it.folder || ""));
    const out = Array.from(set);
    out.sort((a, b) => {
      if (a === b) return 0;
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    });
    return out;
  }, [items, uploadsInfo]);

  const visibleItems = React.useMemo(() => {
    if (showAllFolders) return items;
    return items.filter((it) => (it.folder || "") === (currentFolder || ""));
  }, [items, showAllFolders, currentFolder]);
  const visibleKeys = React.useMemo(
    () => visibleItems.map((it) => it.key),
    [visibleItems]
  );
  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((it) => selected.includes(it.key));

  function toggle(key) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }
  const handleSelectAllVisible = () => {
    if (!visibleItems.length) return;
    if (allVisibleSelected) {
      setSelected((prev) => prev.filter((key) => !visibleKeys.includes(key)));
    } else {
      setSelected((prev) => {
        const set = new Set(prev);
        visibleItems.forEach((item) => set.add(item.key));
        return Array.from(set);
      });
    }
  };

  function toggleWithRange(key, index, event) {
    if (event?.shiftKey && lastSelectedRef.current != null) {
      const start = Math.min(lastSelectedRef.current, index);
      const end = Math.max(lastSelectedRef.current, index);
      const rangeKeys = visibleItems.slice(start, end + 1).map((it) => it.key);
      setSelected((prev) => {
        const set = new Set(prev);
        rangeKeys.forEach((k) => set.add(k));
        return Array.from(set);
      });
    } else {
      toggle(key);
    }
    lastSelectedRef.current = index;
  }

  function handleUseSelected() {
    if (onSelectMultiple && selected.length) {
      const normalized = selected
        .map((k) => {
          const found = items.find((it) => it.key === k);
          return found ? found.url : null;
        })
        .filter(Boolean);
      console.log("[MediaGalleryModal] Selected items", normalized);
      onSelectMultiple(normalized);
      setSelected([]);
      if (onClose) onClose();
    }
  }

  async function handleUploadFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (!backendBase) {
      setUploadError("Backend not ready; please try again.");
      return;
    }
    setUploading(true);
    setUploadError("");
    const meta = typeof photoMeta === "function" ? photoMeta() : photoMeta;
    try {
      const { urls = [], failed = [] } = await uploadPhotos(
        fileList,
        backendBase,
        meta,
        {
          folder: normalizeFolder(currentFolder),
        }
      );
      if (urls.length) {
        const normalized = urls.map(buildItem);
        setItems((prev) => [...normalized, ...prev]);
        setSelected([]);
        if (onUploadComplete) onUploadComplete(urls);
        notifySafe(
          `Uploaded ${urls.length} file(s)` +
            (failed.length
              ? `, failed: ${failed.map((f) => f.name || f).join(", ")}`
              : "")
        );
      } else if (failed.length) {
        notifySafe(
          `Failed to upload: ${failed.map((f) => f.name || f).join(", ")}`
        );
      }
    } catch (e) {
      setUploadError(e.message || "Upload failed");
    }
    setUploading(false);
  }

  async function deleteSelected() {
    if (!selected.length) return;
    setDeletingMany(true);
    for (const key of selected) {
      // handleDelete updates state and onDeleteUpload
      // eslint-disable-next-line no-await-in-loop
      await handleDelete(key);
    }
    setDeletingMany(false);
  }

  async function deleteAll() {
    if (!visibleItems.length) return;
    setDeletingAll(true);
    for (const item of visibleItems) {
      // eslint-disable-next-line no-await-in-loop
      await handleDelete(item.key);
    }
    setDeletingAll(false);
  }

  function onDropFiles(e) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      handleUploadFiles(files);
    }
  }

  async function handleDelete(raw) {
    if (!raw) return;
    const toClear = items.find((it) => it.key === raw);
    try {
      setDeletingKey(raw);
      await api.deleteUpload(raw);
      setItems((prev) => prev.filter((it) => it.key !== raw && it !== raw));
      setSelected((prev) => prev.filter((it) => it !== raw));
      if (toClear && previewUrl === toClear.url) setPreviewUrl("");
      if (onDeleteUpload) onDeleteUpload(raw);
    } catch (e) {
      console.error(e);
      alert(e.message || "Delete failed");
    } finally {
      setDeletingKey("");
    }
  }

  return (
    <div className="media-modal-backdrop" onClick={onClose}>
      <div
        className="media-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropFiles}
      >
        <div className="media-modal-header">
          <div>
            <h2>Media gallery</h2>
            <p className="muted small">
              Organise uploads into folders and select single or multiple
              photos. If a folder is selected, new uploads will be saved there.
            </p>
          </div>
          <button className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div
          className="action-row"
          style={{ justifyContent: "space-between", alignItems: "flex-end" }}
        >
          <div className="action-row" style={{ alignItems: "flex-end" }}>
            <div>
              <label className="field-label">Folder</label>
              <select
                value={currentFolder}
                onChange={(e) => {
                  setCurrentFolder(e.target.value);
                  setShowAllFolders(false);
                }}
              >
                <option value="">Main</option>
                {folders
                  .filter((f) => f)
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                {currentFolder && !folders.includes(currentFolder) ? (
                  <option value={currentFolder}>{currentFolder}</option>
                ) : null}
              </select>
            </div>
            <div>
              <label className="field-label">Add / switch folder</label>
              <div className="action-row">
                <input
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="ex: clients/hotel"
                />
                <button
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => {
                    const clean = normalizeFolder(folderInput);
                    setCurrentFolder(clean);
                    setShowAllFolders(false);
                  }}
                >
                  Use folder
                </button>
              </div>
            </div>
            <label className="checkbox-inline" style={{ marginLeft: 12 }}>
              <input
                type="checkbox"
                checked={showAllFolders}
                onChange={(e) => setShowAllFolders(e.target.checked)}
              />{" "}
              Show all folders
            </label>
          </div>
          <div className="muted small">
            Selected {selected.length} item{selected.length === 1 ? "" : "s"}
            {uploadError ? (
              <span style={{ color: "#ff7a7a", marginLeft: 8 }}>
                {uploadError}
              </span>
            ) : null}
          </div>
        </div>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <label className="btn btn--ghost btn--small">
            {uploading
              ? "Uploading..."
              : currentFolder
              ? `Upload to ${currentFolder}`
              : "Upload to gallery"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = e.target?.files;
                handleUploadFiles(files);
                if (e.target) e.target.value = "";
              }}
              disabled={uploading || !backendBase}
            />
          </label>
          <button
            className="btn btn--ghost btn--small"
            onClick={handleUseSelected}
            disabled={!selected.length}
          >
            Use selected
          </button>
          <button
            className="btn btn--ghost btn--small"
            onClick={handleSelectAllVisible}
            disabled={!visibleItems.length}
          >
            {allVisibleSelected ? "Clear shown" : "Select shown"}
          </button>
          <button
            className="btn btn--ghost btn--small"
            onClick={deleteSelected}
            disabled={!selected.length || deletingMany}
          >
            {deletingMany ? "Deleting..." : "Delete selected"}
          </button>
          <button
            className="btn btn--ghost btn--small"
            onClick={deleteAll}
            disabled={!visibleItems.length || deletingAll}
          >
            {deletingAll ? "Deleting all..." : "Delete shown"}
          </button>
          <button className="btn btn--ghost btn--small" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!visibleItems.length ? (
          <div className="muted small">
            No uploads in this view. Switch to “Show all folders” or upload into
            {currentFolder ? ` ${currentFolder}.` : " the main folder."}
          </div>
        ) : (
          <div className="media-gallery-grid">
            {visibleItems.map((item, idx) => {
              const key = item.key;
              const labelMatch = key.match(/\/([^\/?#]+)$/);
              const label = labelMatch?.[1] || key;
              const isSelected = selected.includes(key);
              return (
                <div
                  key={key}
                  className={
                    "media-gallery-item" +
                    (isSelected ? " media-gallery-item--selected" : "")
                  }
                  title={key}
                >
                  <div className="media-gallery-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(key)}
                    />
                  </div>
                  <button
                    type="button"
                    className="media-gallery-thumb"
                    onClick={(e) => {
                      setPreviewUrl(item.url);
                      toggleWithRange(key, idx, e);
                      if (onPreview) {
                        onPreview(
                          resolveMediaPreviewUrl(item.url, backendBase)
                        );
                      }
                    }}
                  >
                    <img
                      src={resolveMediaPreviewUrl(item.url, backendBase)}
                      alt={label}
                      loading="lazy"
                    />
                  </button>
                  <button
                    type="button"
                    className="media-gallery-select"
                    onClick={(e) => toggleWithRange(key, idx, e)}
                  >
                    <div className="media-gallery-label">{label}</div>
                    <div className="muted small">
                      Folder: {item.folder || "Main"}
                    </div>
                    <div className="muted small">
                      {isSelected ? "Selected" : "Click to select"}
                    </div>
                  </button>
                  <div className="action-row">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => handleDelete(key)}
                      disabled={deletingKey === key}
                    >
                      {deletingKey === key ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {previewUrl && (
          <div className="media-preview">
            <div
              className="media-preview-thumb"
              style={{ width: 120, height: 120 }}
            >
              <img
                src={resolveMediaPreviewUrl(previewUrl, backendBase)}
                alt="Preview"
              />
            </div>
            <div className="media-preview-meta">
              <div className="media-preview-title">Preview</div>
              <div className="media-preview-url small">{previewUrl}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

const CTA_LABELS = CTA_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "profiles", label: "Profiles & media" },
  { id: "bulk", label: "Bulk access" },
  { id: "photo-scheduler", label: "Photo scheduler" },
  { id: "scheduler", label: "Scheduler" },
  { id: "performance", label: "Performance" },
  { id: "history", label: "Post history" },
  { id: "api-coverage", label: "GBP API" },
  { id: "diagnostics", label: "Diagnostics" },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

const GBP_API_CAPABILITIES = [
  {
    name: "Business Information",
    status: "Live in app",
    statusTone: "green",
    appCoverage: "Accounts, locations, profile sync, titles, phones, categories, addresses, metadata.",
    apiCoverage:
      "Modern v1 location endpoints, attributes, categories, chains, Google updates, service-area data.",
    nextStep: "Add editable attributes and Google-updated diff review before profile writes.",
  },
  {
    name: "Local Posts",
    status: "Live in app",
    statusTone: "green",
    appCoverage: "AI drafts, CTA posts, events, offers, queueing, posting now, post history.",
    apiCoverage:
      "Create, list, patch, delete, report insights, and new recurrence info for recurring posts.",
    nextStep: "Map native RecurrenceInfo into the scheduler so GBP owns recurrence when available.",
  },
  {
    name: "Media",
    status: "Live in app",
    statusTone: "green",
    appCoverage: "R2 upload gallery, photo pool, photo-only uploads, scheduled photo posting.",
    apiCoverage:
      "Start upload, create, list, get, patch, delete, plus customer media listing.",
    nextStep: "Expose GBP media library cleanup and customer media review in the app.",
  },
  {
    name: "Reviews",
    status: "Ready to add",
    statusTone: "amber",
    appCoverage: "Review links are stored for posts; review inbox is not implemented yet.",
    apiCoverage:
      "List/get reviews, update/delete replies, new review media items, and review reply state.",
    nextStep: "Add a review inbox with reply status, media thumbnails, and AI reply drafts.",
  },
  {
    name: "Q&A",
    status: "Ready to add",
    statusTone: "amber",
    appCoverage: "No Q&A workflow yet.",
    apiCoverage: "Create/list/patch/delete questions and list/upsert/delete answers.",
    nextStep: "Add Q&A monitor and canned answer workflow for service questions.",
  },
  {
    name: "Performance",
    status: "Live in app",
    statusTone: "green",
    appCoverage: "Selected-profile daily metrics dashboard for impressions, calls, website clicks, directions, and conversations.",
    apiCoverage:
      "Daily metrics, multi-metric time series, and monthly search keyword impressions.",
    nextStep: "Add monthly search keyword impressions and profile comparison views.",
  },
  {
    name: "Place Actions",
    status: "Ready to add",
    statusTone: "amber",
    appCoverage: "Quick links are stored locally; native place action links are not managed.",
    apiCoverage: "Create, list, patch, get, and delete booking/order/appointment links.",
    nextStep: "Promote service-area and booking links into native place action link management.",
  },
  {
    name: "Business Calls",
    status: "Ready to add",
    statusTone: "amber",
    appCoverage: "No call insights workflow yet.",
    apiCoverage: "Manage call settings and list business call insights such as missed calls.",
    nextStep: "Add missed-call cards when call history is enabled on eligible profiles.",
  },
  {
    name: "Notifications",
    status: "Not wired",
    statusTone: "slate",
    appCoverage: "Scheduler polls manually/cron; no Pub/Sub or notification settings UI.",
    apiCoverage: "Get and update account notification settings.",
    nextStep: "Use notifications for review and Q&A alerts instead of relying only on polling.",
  },
  {
    name: "Verifications",
    status: "Not wired",
    statusTone: "slate",
    appCoverage: "Diagnostics can list locations; verification workflows are not implemented.",
    apiCoverage: "Fetch verification options, verify, complete, list verifications, voice of merchant state.",
    nextStep: "Add read-only voice-of-merchant state to diagnostics before adding write flows.",
  },
  {
    name: "Lodging",
    status: "Specialized",
    statusTone: "slate",
    appCoverage: "Not needed for current contractor/service profiles unless hotel clients are added.",
    apiCoverage: "Get/update lodging data and inspect Google-updated lodging values.",
    nextStep: "Keep out of the main UI unless lodging profiles enter the account.",
  },
  {
    name: "Food Menus",
    status: "Specialized",
    statusTone: "slate",
    appCoverage: "Not needed for current service profile workflow.",
    apiCoverage: "Food menu retrieval/update, including expanded dish photo support.",
    nextStep: "Keep as a future module for restaurant profiles only.",
  },
];

const DASHBOARD_WORKFLOWS = [
  {
    title: "Create one post",
    detail: "Choose a profile, generate a post, attach media, preview it, then post or queue it.",
    action: "Open composer",
    tab: "profiles",
  },
  {
    title: "Schedule photos",
    detail: "Select gallery photos, apply geo metadata, and queue photo-only uploads.",
    action: "Open photo scheduler",
    tab: "photo-scheduler",
  },
  {
    title: "Control automation",
    detail: "Set cadence, run the scheduler once, and pause profiles that should not post.",
    action: "Open scheduler",
    tab: "scheduler",
  },
  {
    title: "Check API coverage",
    detail: "See which current GBP APIs are live, ready to add, or intentionally out of scope.",
    action: "Open GBP API",
    tab: "api-coverage",
  },
];

const STORAGE_KEYS = {
  tab: "gmbviking_tab",
  selectedProfileId: "gmbviking_selected_profile",
  overlayUrl: "gmbviking_overlay",
};

function getPostTypeLabel(type) {
  return POST_TYPES.find((t) => t.value === type)?.label || "Standard update";
}

function isValidHttpLink(url) {
  return /^https?:\/\//i.test(url || "");
}

function getFallbackLink(profile) {
  if (!profile) return "";
  const candidates = [
    profile.defaults?.linkUrl,
    profile.landingUrl,
    profile.mapsUri,
    profile.placeReviewUri,
  ];
  return candidates.find(isValidHttpLink) || "";
}

function resolveCtaLink(cta, link) {
  if (!link) return "";
  if (cta === "CALL_NOW") {
    if (/^tel:/i.test(link)) return link;
    if (/^https?:\/\//i.test(link)) return link;
    return "";
  }
  return /^https?:\/\//i.test(link) ? link : "";
}

function parseNeighbourhoodInput(input) {
  if (!input) return [];
  return String(input)
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function randomNeighbourhood(list, fallback = "") {
  if (Array.isArray(list) && list.length) {
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }
  return fallback || "";
}

function randomizeCoords(lat, lng, radiusMeters = 0) {
  const baseLat = parseFloat(lat);
  const baseLng = parseFloat(lng);
  const radius = Math.max(0, Number(radiusMeters) || 0);
  if (isNaN(baseLat) || isNaN(baseLng) || radius <= 0) {
    return { lat: lat || "", lng: lng || "" };
  }
  const metersPerDegLat = 111111;
  const metersPerDegLng =
    Math.cos((baseLat * Math.PI) / 180) * metersPerDegLat || metersPerDegLat;
  const r = Math.sqrt(Math.random()) * radius;
  const theta = Math.random() * Math.PI * 2;
  const dx = (r * Math.cos(theta)) / metersPerDegLng;
  const dy = (r * Math.sin(theta)) / metersPerDegLat;
  const nextLat = +(baseLat + dy).toFixed(6);
  const nextLng = +(baseLng + dx).toFixed(6);
  return { lat: nextLat, lng: nextLng };
}

function normalizeCityName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function addGeoLogHelper(setter, msg, data = null) {
  const entry = {
    ts: new Date().toISOString(),
    msg,
    data,
  };
  console.log("[geo]", msg, data || "");
  setter((prev) => [entry, ...prev].slice(0, 30));
}

function buildStaticMapUrl(lat, lng, zoom = 14, size = "800x380") {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return "";
  return (
    "https://staticmap.openstreetmap.de/staticmap.php" +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${size}` +
    `&markers=${lat},${lng},red`
  );
}

function buildEmbedMapUrl(bounds) {
  if (!bounds) return "";
  const { west, south, east, north } = bounds;
  if (
    west == null ||
    south == null ||
    east == null ||
    north == null ||
    [west, south, east, north].some((v) => isNaN(v))
  )
    return "";
  const lat = (north + south) / 2;
  const lng = (east + west) / 2;
  return (
    "https://www.openstreetmap.org/export/embed.html" +
    `?bbox=${west},${south},${east},${north}` +
    "&layer=mapnik" +
    `&marker=${lat},${lng}`
  );
}

function computeMapBounds(lat, lng, radiusMeters = 2000) {
  if (isNaN(lat) || isNaN(lng)) return null;
  const delta = Math.max(0.01, radiusMeters / 111000);
  return {
    west: +(lng - delta).toFixed(5),
    south: +(lat - delta).toFixed(5),
    east: +(lng + delta).toFixed(5),
    north: +(lat + delta).toFixed(5),
  };
}

async function fetchOverpassPlaces(city, lat, lng, radiusMeters = 15000) {
  const centerOk = !isNaN(lat) && !isNaN(lng);
  if (!city && !centerOk) return [];
  const query = centerOk
    ? `
      [out:json][timeout:25];
      (
        node["place"](around:${radiusMeters},${lat},${lng});
        way["place"](around:${radiusMeters},${lat},${lng});
        relation["place"](around:${radiusMeters},${lat},${lng});
      );
      out center 60;
    `
    : `
      [out:json][timeout:25];
      area["name"="${city}"];
      (
        node(area)["place"];
        way(area)["place"];
        relation(area)["place"];
      );
      out center 60;
    `;
  const body = query.replace(/\s+/g, " ").trim();
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(body)}`,
  });
  if (!res.ok) throw new Error("Overpass lookup failed");
  const data = await res.json();
  const out = [];
  (data.elements || []).forEach((el) => {
    const name = el.tags && (el.tags.name || el.tags["name:en"]);
    if (!name) return;
    const latVal = el.lat || (el.center && el.center.lat);
    const lngVal = el.lon || (el.center && el.center.lon);
    out.push({
      name: String(name).trim(),
      lat: latVal != null ? +latVal : null,
      lng: lngVal != null ? +lngVal : null,
    });
  });
  return out;
}

function buildAutoCaption(profile, meta = {}, fallbackKeywords = "") {
  const name = (profile && profile.businessName) || "";
  const city = meta.city || profile?.city || "";
  const neighbourhood = meta.neighbourhood || "";
  const keywords = String(fallbackKeywords || "").trim();
  const pieces = [
    keywords || "Popcorn ceiling removal",
    city || "",
    neighbourhood || "",
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" • ");
  const label = pieces || "Popcorn ceiling removal";
  return name ? `${label} — ${name}` : label;
}

const PERFORMANCE_LABELS = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Desktop Maps",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Desktop Search",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Mobile Maps",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Mobile Search",
  CALL_CLICKS: "Calls",
  WEBSITE_CLICKS: "Website clicks",
  BUSINESS_DIRECTION_REQUESTS: "Directions",
  BUSINESS_CONVERSATIONS: "Messages",
};

function formatMetricName(metric) {
  return (
    PERFORMANCE_LABELS[metric] ||
    String(metric || "")
      .replace(/^BUSINESS_/, "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function metricTotal(performance, metric) {
  const found = performance?.metrics?.find((item) => item.metric === metric);
  return found ? Number(found.total || 0) : 0;
}

const VISIBILITY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
];

const SEARCH_VISIBILITY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
];

const MAPS_VISIBILITY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
];

const MOBILE_VISIBILITY_METRICS = [
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
];

const DESKTOP_VISIBILITY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
];

const ACTION_METRICS = [
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
];

const PHOTO_CATEGORY_OPTIONS = [
  { value: "ADDITIONAL", label: "Additional" },
  { value: "AT_WORK", label: "At work" },
  { value: "EXTERIOR", label: "Exterior" },
  { value: "INTERIOR", label: "Interior" },
  { value: "PRODUCT", label: "Product" },
  { value: "TEAMS", label: "Team" },
  { value: "COVER", label: "Cover photo" },
  { value: "PROFILE", label: "Profile photo" },
  { value: "LOGO", label: "Logo" },
];

function metricGroupTotal(performance, metrics) {
  return metrics.reduce((sum, metric) => sum + metricTotal(performance, metric), 0);
}

function performanceValueMap(performance) {
  const map = new Map();
  (performance?.metrics || []).forEach((item) => {
    (item.values || []).forEach((point) => {
      const date = point.date || "";
      if (!date) return;
      if (!map.has(date)) map.set(date, {});
      map.get(date)[item.metric] = Number(point.value || 0);
    });
  });
  return Array.from(map.entries())
    .map(([date, values]) => ({
      date,
      views: VISIBILITY_METRICS.reduce(
        (sum, metric) => sum + Number(values[metric] || 0),
        0
      ),
      actions: ACTION_METRICS.reduce(
        (sum, metric) => sum + Number(values[metric] || 0),
        0
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function percentOf(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function trendSummary(rows, key) {
  if (!rows.length) return { first: 0, second: 0, change: 0 };
  const split = Math.floor(rows.length / 2);
  const firstRows = rows.slice(0, split || 1);
  const secondRows = rows.slice(split || 1);
  const first = firstRows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  const second = secondRows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  const change = first ? ((second - first) / first) * 100 : second ? 100 : 0;
  return { first, second, change };
}

function defaultMonthRange() {
  const end = new Date();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - 1);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 5);
  const fmt = (date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

function buildPerformanceSuggestions({
  views,
  searchViews,
  mapsViews,
  mobileViews,
  desktopViews,
  actions,
  calls,
  website,
  directions,
  messages,
  keywords,
  viewTrend,
  actionTrend,
}) {
  const suggestions = [];
  const actionRate = views ? actions / views : 0;
  if (views > 0 && actionRate < 0.03) {
    suggestions.push({
      title: "Low conversion from profile views",
      detail:
        "Calls, website clicks, directions, and messages are low compared with visibility. Tighten service copy, add stronger photos, and make the primary CTA match the service intent.",
      priority: "High",
    });
  }
  if (searchViews > mapsViews * 1.5 && directions < calls + website) {
    suggestions.push({
      title: "Search visibility is stronger than map intent",
      detail:
        "Search views lead Maps views. Add service-area posts, location photos, neighbourhood wording, and keep service-area/map links in every post.",
      priority: "High",
    });
  }
  if (mapsViews > searchViews && directions === 0) {
    suggestions.push({
      title: "Map discovery is not turning into direction requests",
      detail:
        "Check address/service-area presentation, categories, hours, and whether the business should push calls instead of directions.",
      priority: "Medium",
    });
  }
  if (mobileViews > desktopViews * 2 && calls === 0) {
    suggestions.push({
      title: "Mobile visitors need an easier call path",
      detail:
        "Mobile visibility is dominant but calls are missing. Confirm the GBP phone number, Call now defaults, and phone formatting.",
      priority: "High",
    });
  }
  if (website > calls * 3 && website > directions) {
    suggestions.push({
      title: "Website clicks are carrying demand",
      detail:
        "Use tracked service landing pages, add quote forms above the fold, and mirror top search terms in page headings.",
      priority: "Medium",
    });
  }
  if (viewTrend.change < -15) {
    suggestions.push({
      title: "Visibility is declining",
      detail:
        "Increase posting cadence, refresh photos, check category relevance, and compare top search terms against current services.",
      priority: "High",
    });
  }
  if (actionTrend.change > viewTrend.change + 20) {
    suggestions.push({
      title: "Engagement quality is improving",
      detail:
        "Actions are growing faster than views. Repeat the recent post/photo topics and use those services in landing pages.",
      priority: "Medium",
    });
  }
  if (keywords?.length) {
    const top = keywords[0]?.keyword || "";
    suggestions.push({
      title: "Use top search terms in content",
      detail: top
        ? `Top term: "${top}". Add it to service topics, captions, and related landing pages.`
        : "Use top terms in service topics, captions, and related landing pages.",
      priority: "Medium",
    });
  }
  if (!suggestions.length) {
    suggestions.push({
      title: "Keep building signal",
      detail:
        "Metrics are balanced. Keep a steady mix of service posts, fresh photos, review links, and neighbourhood coverage.",
      priority: "Normal",
    });
  }
  return suggestions.slice(0, 6);
}

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
  const [linkOptions, setLinkOptions] = useState([]);
  const [reviewLink, setReviewLink] = useState("");
  const [serviceAreaLink, setServiceAreaLink] = useState("");
  const [areaMapLink, setAreaMapLink] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [serviceTopics, setServiceTopics] = useState([]);
  const [defaultServiceTopicId, setDefaultServiceTopicId] = useState("");
  const [mediaTopics, setMediaTopics] = useState({});
  const [composerServiceTopicId, setComposerServiceTopicId] = useState("");
  const [defaultPhone, setDefaultPhone] = useState("");
  const [photoLat, setPhotoLat] = useState("");
  const [photoLng, setPhotoLng] = useState("");
  const [photoCity, setPhotoCity] = useState("");
  const [photoNeighbourhood, setPhotoNeighbourhood] = useState("");
  const [photoNeighbourhoodsInput, setPhotoNeighbourhoodsInput] = useState("");
  const [photoRandomizeCoords, setPhotoRandomizeCoords] = useState(false);
  const [photoRandomizeRadius, setPhotoRandomizeRadius] = useState(200);
  const [photoRandomizeKeywords, setPhotoRandomizeKeywords] = useState(false);
  const [photoSearchRadius, setPhotoSearchRadius] = useState(10); // km
  const [photoKeywords, setPhotoKeywords] = useState("");
  const [photoCategories, setPhotoCategories] = useState("");
  const [neighbourhoodsLoading, setNeighbourhoodsLoading] = useState(false);
  const [savingPhotoMeta, setSavingPhotoMeta] = useState(false);
  const [neighbourhoodResults, setNeighbourhoodResults] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [photoJobs, setPhotoJobs] = useState([]);
  const [photoJobsHistory, setPhotoJobsHistory] = useState([]);
  const [photoJobsLoading, setPhotoJobsLoading] = useState(false);
  const [photoSchedulerStatus, setPhotoSchedulerStatus] = useState("");
  const [photoSchedMedia, setPhotoSchedMedia] = useState("");
  const [photoSchedMediaList, setPhotoSchedMediaList] = useState([]);
  const [photoSchedCaption, setPhotoSchedCaption] = useState("");
  const [photoSchedDate, setPhotoSchedDate] = useState("");
  const [photoSchedTime, setPhotoSchedTime] = useState("");
  const [photoSchedCadence, setPhotoSchedCadence] = useState("DAILY1");
  const [photoSchedCount, setPhotoSchedCount] = useState(3);
  const [photoCategory, setPhotoCategory] = useState("ADDITIONAL");
  const [editingPhotoJobId, setEditingPhotoJobId] = useState("");

  const [schedStatus, setSchedStatus] = useState(null);
  const [schedConfig, setSchedConfig] = useState(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [backendBase, setBackendBase] = useState(DEFAULT_BACKEND_BASE);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState("");
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    const stored = localStorage.getItem(STORAGE_KEYS.tab);
    return TAB_IDS.has(stored) ? stored : "dashboard";
  });
  const [previewDetails, setPreviewDetails] = useState(null);
  const [posting, setPosting] = useState(false);
  const [postNowStatus, setPostNowStatus] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const [accounts, setAccounts] = useState(null);
  const [locationsByAccount, setLocationsByAccount] = useState({});
  const [uploadsInfo, setUploadsInfo] = useState(null);
  const [uploadsCheck, setUploadsCheck] = useState(null);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const linkSaveTimer = useRef(null);
  const linkInitRef = useRef(false);
  const [linkOptionsSaving, setLinkOptionsSaving] = useState(false);
  const quickLinksSaveTimer = useRef(null);
  const quickLinksInitRef = useRef(false);
  const [quickLinksSaving, setQuickLinksSaving] = useState(false);
  const [quickLinksHelpOpen, setQuickLinksHelpOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [scheduleStatus, setScheduleStatus] = useState("");
  const [editingScheduledId, setEditingScheduledId] = useState("");
  const generateRef = useRef(null);
  const [cycleInfo, setCycleInfo] = useState(null);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [bulkImages, setBulkImages] = useState([]);
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState(-1);
  const [regeneratingDraftIndex, setRegeneratingDraftIndex] = useState(-1);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCadenceDays, setBulkCadenceDays] = useState(1);
  const [bulkAutoGenerate, setBulkAutoGenerate] = useState(false);
  const [bulkDurationPreset, setBulkDurationPreset] = useState("7");
  const [bulkDurationCustom, setBulkDurationCustom] = useState("");
  const [autoCadenceDays, setAutoCadenceDays] = useState(1);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [deletingScheduledId, setDeletingScheduledId] = useState("");
  const [photoMetaSample, setPhotoMetaSample] = useState(null);
  const [mediaGalleryContext, setMediaGalleryContext] = useState("profile");
  const [geoTestSamples, setGeoTestSamples] = useState([]);
  const [geoLogs, setGeoLogs] = useState([]);
  const [latestPhotos, setLatestPhotos] = useState([]);
  const [latestPhotosLoading, setLatestPhotosLoading] = useState(false);
  const [latestPhotosDebug, setLatestPhotosDebug] = useState([]);
  const [latestPhotosDebugLoading, setLatestPhotosDebugLoading] =
    useState(false);
  const [lastPhotoPostResult, setLastPhotoPostResult] = useState(null);
  const [photoGenTheme, setPhotoGenTheme] = useState("finished popcorn ceiling removal");
  const [photoGenCount, setPhotoGenCount] = useState(3);
  const [photoGenBusy, setPhotoGenBusy] = useState(false);
  const [photoGenResults, setPhotoGenResults] = useState([]);
  const [photoGenTarget, setPhotoGenTarget] = useState("profile");
  const [photoGenQuality, setPhotoGenQuality] = useState("high");
  const [photoGenSize, setPhotoGenSize] = useState("1536x1024");
  const [photoSelectionPreview, setPhotoSelectionPreview] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [performanceDays, setPerformanceDays] = useState(30);
  const [performanceMonthStart, setPerformanceMonthStart] = useState(
    () => defaultMonthRange().start
  );
  const [performanceMonthEnd, setPerformanceMonthEnd] = useState(
    () => defaultMonthRange().end
  );
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEYS.overlayUrl) || "";
  });
  const [composedMediaUrl, setComposedMediaUrl] = useState("");
  const closeSidebar = React.useCallback(() => setSidebarOpen(false), []);
  const openSidebar = React.useCallback(() => setSidebarOpen(true), []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const schedulingBusy =
    photoSchedulerStatus === "saving" ||
    photoSchedulerStatus === "stamping" ||
    photoSchedulerStatus === "posting" ||
    photoSchedulerStatus === "running";
  const mapBoundsRef = useRef(null);
  const cityCenterRef = useRef({ lat: null, lng: null });
  const cityLookupTimer = useRef(null);
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.profileId === selectedId),
    [profiles, selectedId]
  );
  const serviceTopicMap = useMemo(() => {
    const map = {};
    serviceTopics.forEach((topic) => {
      if (topic && topic.id) {
        map[topic.id] = topic;
      }
    });
    return map;
  }, [serviceTopics]);

  const activeBulkDraft = useMemo(
    () => (activeDraftIndex >= 0 ? bulkDrafts[activeDraftIndex] : null),
    [activeDraftIndex, bulkDrafts]
  );

  const activeDraftBody = activeBulkDraft?.body || {};
  const activeDraftCta = activeDraftBody.cta || "CALL_NOW";
  const activeDraftLink =
    activeDraftCta === "CALL_NOW"
      ? activeDraftBody.linkUrl ||
        (activeDraftBody.phone ? `tel:${activeDraftBody.phone}` : "")
      : activeDraftBody.linkUrl || "";
  const activeDraftMedia = activeDraftBody.mediaUrl || "";
  const activeDraftOverlay = activeDraftBody.overlayUrl || "";
  const quickLinksAddDisabled =
    !!reviewLink && !!serviceAreaLink && !!areaMapLink;
  const handleQuickLinksAdd = () => {
    if (quickLinksAddDisabled) return;
    const targetValue =
      linkUrl || getFallbackLink(selectedProfile) || "https://";
    if (!reviewLink) {
      setReviewLink(targetValue);
    } else if (!serviceAreaLink) {
      setServiceAreaLink(targetValue);
    } else if (!areaMapLink) {
      setAreaMapLink(targetValue);
    }
  };
  const addServiceTopic = (preset) => {
    setServiceTopics((prev) => [
      ...prev,
      preset ? buildPresetTopic(preset) : createEmptyServiceTopic(),
    ]);
  };
  const updateServiceTopic = (id, patch) => {
    setServiceTopics((prev) =>
      prev.map((topic) =>
        topic.id === id ? { ...topic, ...patch } : topic
      )
    );
  };
  const removeServiceTopic = (id) => {
    setServiceTopics((prev) => prev.filter((topic) => topic.id !== id));
    if (defaultServiceTopicId === id) {
      const nextDefault =
        serviceTopics.find((topic) => topic.id !== id)?.id || "";
      setDefaultServiceTopicId(nextDefault);
    }
    if (composerServiceTopicId === id) {
      setComposerServiceTopicId("");
    }
  };
  const handleDefaultServiceTopicChange = (id) => {
    setDefaultServiceTopicId(id || "");
    setServiceTopics((prev) =>
      prev.map((topic) => ({ ...topic, isDefault: topic.id === id }))
    );
  };
  const handleMediaTopicChange = (url, topicId) => {
    if (!url) return;
    setMediaTopics((prev) => {
      const next = { ...prev };
      if (topicId) {
        next[String(url)] = topicId;
      } else {
        delete next[String(url)];
      }
      return next;
    });
  };
  const getTopicIdForMedia = (url) => {
    const key = String(url || "");
    return (
      mediaTopics[key] ||
      defaultServiceTopicId ||
      serviceTopics[0]?.id ||
      ""
    );
  };
  const buildBulkImageEntry = (url) => ({
    url,
    serviceTopicId: getTopicIdForMedia(url),
  });
  const handleBulkImageTopicChange = (idx, topicId) => {
    setBulkImages((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, serviceTopicId: topicId } : item
      )
    );
  };
  const activeDraftHref = resolveCtaLink(activeDraftCta, activeDraftLink);
  const effectiveComposerTopicId =
    composerServiceTopicId || defaultServiceTopicId || "";
  const composerTopic =
    (effectiveComposerTopicId && serviceTopicMap[effectiveComposerTopicId]) ||
    null;
  const previewProfileName =
    previewDetails?.profileName ||
    selectedProfile?.businessName ||
    selectedId ||
    "—";
  const previewProfileCity = selectedProfile?.city || "";
  const previewFocusArea = previewDetails?.neighbourhood || "";
  const previewBodyText = (postText || preview || "").trim() || "—";
  const previewCtaHref = resolveCtaLink(cta, linkUrl);
  const previewLinkContent = linkUrl ? (
    previewCtaHref ? (
      <a
        href={previewCtaHref}
        target="_blank"
        rel="noreferrer"
      >
        {linkUrl}
      </a>
    ) : (
      <span className="error-text">
        {cta === "CALL_NOW" ? "Use tel:+1... or https://" : "Needs https:// link"}
      </span>
    )
  ) : (
    <span className="muted small">No link provided</span>
  );
  const previewPhotoContent = mediaUrl ? (
    <span className="muted small">{mediaUrl}</span>
  ) : (
    <span className="muted small">None attached</span>
  );
  const previewMetaRows = [
    { label: "Link", content: previewLinkContent },
    { label: "Photo", content: previewPhotoContent },
  ];
  const previewMediaPreviewUrl = resolveMediaPreviewUrl(
    composedMediaUrl || mediaUrl,
    backendBase
  );
  const previewOverlayPreviewUrl = resolveMediaPreviewUrl(
    overlayUrl,
    backendBase
  );
  const handlePreviewMediaClick = previewMediaPreviewUrl
    ? () => setLightboxSrc(previewMediaPreviewUrl)
    : null;
  const previewFooterText = previewDetails?.generatedAt
    ? `Generated ${new Date(previewDetails.generatedAt).toLocaleString()}`
    : "Live preview reflects the text and CTA above.";
  const previewWarning =
    previewDetails?.profileId &&
    selectedId &&
    previewDetails.profileId !== selectedId ? (
      <>
        <strong>Heads up:</strong> preview was generated for{" "}
        {previewDetails.profileName || previewDetails.profileId}. Select the
        right profile and click Generate preview again to refresh.
      </>
    ) : null;
  const activeDraftLinkContent = activeDraftLink ? (
    activeDraftHref ? (
      <a href={activeDraftHref} target="_blank" rel="noreferrer">
        {activeDraftLink}
      </a>
    ) : (
      <span className="error-text">
        {activeDraftCta === "CALL_NOW"
          ? "Use tel:+1... or https://"
          : "Needs https:// link"}
      </span>
    )
  ) : (
    <span className="muted small">No link provided</span>
  );
  const activeDraftPhotoContent = activeDraftBody.mediaUrl ? (
    <span className="muted small">{activeDraftBody.mediaUrl}</span>
  ) : (
    <span className="muted small">None attached</span>
  );
  const activeDraftMetaRows = [
    { label: "Link", content: activeDraftLinkContent },
    { label: "Photo", content: activeDraftPhotoContent },
  ];
  const activeDraftMediaPreviewUrl = resolveMediaPreviewUrl(
    activeDraftMedia,
    backendBase
  );
  const activeDraftOverlayPreviewUrl = resolveMediaPreviewUrl(
    activeDraftOverlay,
    backendBase
  );
  const activeDraftProfileName =
    selectedProfile?.businessName ||
    activeBulkDraft?.profileId ||
    selectedId ||
    "—";
  const activeDraftCity = selectedProfile?.city || "";
  const activeDraftTopicLabel =
    (activeDraftBody.serviceTopicId &&
      serviceTopicMap[activeDraftBody.serviceTopicId]?.label) ||
    activeDraftBody.serviceTopicLabel ||
    (defaultServiceTopicId &&
    serviceTopicMap[defaultServiceTopicId]
      ? serviceTopicMap[defaultServiceTopicId].label
      : null) ||
    getPostTypeLabel(activeDraftBody.topicType || "STANDARD");
  const activeDraftRunAtValue =
    (activeBulkDraft?.runAt && activeBulkDraft.runAt.slice(0, 16)) || "";
  const isRegeneratingActive = regeneratingDraftIndex === activeDraftIndex;
  const photoNeighbourhoodOptions = useMemo(
    () => parseNeighbourhoodInput(photoNeighbourhoodsInput),
    [photoNeighbourhoodsInput]
  );
  const neighbourhoodOptionsDetailed = useMemo(() => {
    if (neighbourhoodResults.length) return neighbourhoodResults;
    return parseNeighbourhoodInput(photoNeighbourhoodsInput).map((name) => ({
      name,
      lat: null,
      lng: null,
    }));
  }, [neighbourhoodResults, photoNeighbourhoodsInput]);
  const photoPreviewMedia = useMemo(() => {
    const src = photoSchedMediaList[0] || photoSchedMedia || "";
    return resolveMediaPreviewUrl(src, backendBase);
  }, [photoSchedMediaList, photoSchedMedia, backendBase]);
  const photoPreviewCaption = useMemo(() => {
    const meta = {
      city: photoCity || selectedProfile?.city || "",
      neighbourhood:
        photoNeighbourhood ||
        photoNeighbourhoodOptions[0] ||
        (Array.isArray(selectedProfile?.neighbourhoods)
          ? selectedProfile.neighbourhoods[0]
          : "") ||
        "",
    };
    return (
      photoSchedCaption ||
      buildAutoCaption(selectedProfile, meta, photoKeywords)
    );
  }, [
    photoSchedCaption,
    selectedProfile,
    photoCity,
    photoNeighbourhood,
    photoNeighbourhoodOptions,
    photoKeywords,
  ]);
  const logGeo = (msg, data = null) => addGeoLogHelper(setGeoLogs, msg, data);
  const mapBoundsEffective = mapBounds || mapBoundsRef.current;
  const mapCenter = useMemo(() => {
    const candidates = [
      {
        lat: parseFloat(photoLat),
        lng: parseFloat(photoLng),
      },
      {
        lat: cityCenterRef.current.lat,
        lng: cityCenterRef.current.lng,
      },
      neighbourhoodResults.find((n) => n.lat != null && n.lng != null),
      { lat: 43.6532, lng: -79.3832 }, // Toronto fallback
    ];
    const pick = candidates.find(
      (c) => c && !isNaN(parseFloat(c.lat)) && !isNaN(parseFloat(c.lng))
    );
    return pick
      ? { lat: parseFloat(pick.lat), lng: parseFloat(pick.lng) }
      : null;
  }, [photoLat, photoLng, neighbourhoodResults]);

  const mapPreviewUrl = useMemo(() => {
    if (!mapCenter) return "";
    return buildStaticMapUrl(mapCenter.lat, mapCenter.lng, 14, "900x420");
  }, [mapCenter]);

  const mapEmbedUrl = useMemo(() => {
    if (mapBoundsEffective) return buildEmbedMapUrl(mapBoundsEffective);
    if (mapCenter)
      return buildEmbedMapUrl(
        computeMapBounds(mapCenter.lat, mapCenter.lng, 2000)
      );
    return "";
  }, [mapBoundsEffective, mapCenter]);

  const phoneCandidate = useMemo(() => {
    const raw =
      defaultPhone ||
      selectedProfile?.defaults?.phone ||
      selectedProfile?.phone ||
      "";
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return trimmed.startsWith("tel:")
      ? trimmed
      : "tel:" + trimmed.replace(/^tel:/i, "");
  }, [defaultPhone, selectedProfile]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
    console.log(msg);
  }

  function resolveAbsoluteMedia(url) {
    if (!url) return "";
    const direct = resolveMediaPreviewUrl(url, backendBase);
    if (direct) return direct;
    return url;
  }

  async function composeOverlayIfNeeded(baseUrl, overlay) {
    if (!overlay || !baseUrl) return { url: baseUrl, overlayUsed: "" };
    try {
      const [baseRes, overlayRes] = await Promise.all([
        fetch(resolveAbsoluteMedia(baseUrl)),
        fetch(resolveAbsoluteMedia(overlay)),
      ]);
      if (!baseRes.ok) throw new Error("Failed to load base image");
      if (!overlayRes.ok) throw new Error("Failed to load overlay image");
      const [baseBlob, overlayBlob] = await Promise.all([
        baseRes.blob(),
        overlayRes.blob(),
      ]);
      const loadImageFromBlob = (blob) =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
          };
          img.src = url;
        });
      const [baseImg, overlayImg] = await Promise.all([
        loadImageFromBlob(baseBlob),
        loadImageFromBlob(overlayBlob),
      ]);
      const srcW = baseImg.naturalWidth || baseImg.width;
      const srcH = baseImg.naturalHeight || baseImg.height;
      if (!srcW || !srcH) throw new Error("Base image has no dimensions");
      // Normalize to a 4:3 canvas so Google’s feed crop shows the overlay
      const targetW = 1200;
      const targetH = 900; //look for const targetH = 900; (and targetW = 1200). Lower targetH to reduce the composed image’s height (keeping 4:3).
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      // cover-fit the base image to 4:3
      const scaleBase = Math.max(targetW / srcW, targetH / srcH);
      const drawBaseW = srcW * scaleBase;
      const drawBaseH = srcH * scaleBase;
      const baseDx = (targetW - drawBaseW) / 2;
      const baseDy = (targetH - drawBaseH) / 2;
      ctx.drawImage(baseImg, baseDx, baseDy, drawBaseW, drawBaseH);
      // Anchor overlay near bottom, sized to ~85% of canvas width
      const oW = overlayImg.naturalWidth || overlayImg.width || 1;
      const oH = overlayImg.naturalHeight || overlayImg.height || 1;
      const overlayTargetW = targetW * 1; //overlay control
      const overlayScale = overlayTargetW / oW;
      const overlayDrawW = overlayTargetW;
      const overlayDrawH = oH * overlayScale;
      const paddingY = Math.max(6, targetH * 0.01); //overlay controll
      const overlayDx = (targetW - overlayDrawW) / 2;
      const overlayDy = targetH - overlayDrawH - paddingY;
      ctx.drawImage(
        overlayImg,
        overlayDx,
        overlayDy,
        overlayDrawW,
        overlayDrawH
      );
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Failed to render overlay")),
          "image/jpeg",
          0.92
        )
      );
      const file = new File([blob], `overlay-${Date.now()}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const uploaded = await uploadPhoto(file, backendBase, null, {
        folder: "composite",
      });
      const urls = Array.isArray(uploaded?.uploaded)
        ? uploaded.uploaded
        : uploaded?.url
        ? [uploaded.url]
        : [];
      const composedUrlRaw = urls[0] || baseUrl;
      // Prefer unencoded path for downstream fetchers (GBP)
      const composedUrl = composedUrlRaw.replace(/%2F/gi, "/");
      return { url: composedUrl, overlayUsed: overlay };
    } catch (e) {
      console.warn("Overlay compose failed", e);
      notify(e.message || "Overlay failed; posting without overlay.");
      return { url: baseUrl, overlayUsed: "" };
    }
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
      const storedId =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEYS.selectedProfileId)
          : "";
      const initialId =
        (storedId && list.find((p) => p.profileId === storedId)?.profileId) ||
        list[0]?.profileId ||
        "";
      if (initialId) setSelectedId(initialId);
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
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.overlayUrl, overlayUrl || "");
  }, [overlayUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = await getApiBase();
        if (!alive) return;
        if (base) {
          setBackendBase(base.replace(/\/+$/, ""));
        } else {
          setBackendBase(DEFAULT_BACKEND_BASE);
        }
      } catch (_e) {
        if (alive) setBackendBase(DEFAULT_BACKEND_BASE);
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
    setLinkOptions(Array.isArray(d.linkOptions) ? d.linkOptions : []);
    setReviewLink(d.reviewLink || "");
    setServiceAreaLink(d.serviceAreaLink || "");
    setAreaMapLink(d.areaMapLink || "");
    setDefaultPhone(d.phone || p?.phone || "");
    setMediaUrl(d.mediaUrl || "");
    setOverlayUrl(d.overlayUrl || "");
    setPhotoLat(d.photoLat || "");
    setPhotoLng(d.photoLng || "");
    // Always start from the profile’s city; overrides can be re-set manually
    setPhotoCity(p?.city || d.photoCityOverride || "");
    setPhotoNeighbourhood(d.photoNeighbourhood || "");
    const neighbourhoodList = Array.isArray(d.photoNeighbourhoods)
      ? d.photoNeighbourhoods
      : Array.isArray(p?.neighbourhoods)
      ? p.neighbourhoods
      : [];
    setPhotoNeighbourhoodsInput(neighbourhoodList.join("\n"));
    setPhotoRandomizeCoords(!!d.photoRandomizeCoords);
    setPhotoRandomizeRadius(
      d.photoRandomizeRadius != null ? d.photoRandomizeRadius : 200
    );
    setPhotoKeywords(d.photoKeywords || "");
    setPhotoCategories(d.photoCategories || "");
    setNeighbourhoodResults([]);
    mapBoundsRef.current = null;
    setMapBounds(null);
    setQuickLinksHelpOpen(false);
    if (selectedId) refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedProfile?.defaults]);

  useEffect(() => {
    if (!selectedProfile) {
      setServiceTopics([]);
      setDefaultServiceTopicId("");
      setMediaTopics({});
      setComposerServiceTopicId("");
      return;
    }
    const sourceList =
      Array.isArray(selectedProfile.serviceTopics) &&
      selectedProfile.serviceTopics.length
        ? selectedProfile.serviceTopics
        : SERVICE_TOPIC_PRESETS.map((preset) => buildPresetTopic(preset));
    const cloned = sourceList.map((topic) => ({
      ...topic,
      hashtags: Array.isArray(topic?.hashtags) ? topic.hashtags : [],
    }));
    const nextDefaultId =
      selectedProfile.defaultServiceTopicId ||
      cloned.find((topic) => topic && topic.isDefault)?.id ||
      cloned[0]?.id ||
      "";
    setServiceTopics(cloned);
    setDefaultServiceTopicId(nextDefaultId);
    setMediaTopics({ ...(selectedProfile.mediaTopics || {}) });
    setComposerServiceTopicId(nextDefaultId);
  }, [
    selectedProfile?.profileId,
    selectedProfile?.serviceTopics,
    selectedProfile?.defaultServiceTopicId,
    selectedProfile?.mediaTopics,
  ]);

  useEffect(() => {
    if (!composerServiceTopicId) return;
    if (!serviceTopicMap[composerServiceTopicId]) {
      setComposerServiceTopicId(defaultServiceTopicId || "");
    }
  }, [composerServiceTopicId, defaultServiceTopicId, serviceTopicMap]);

  useEffect(() => {
    // Reset composed preview when base media or overlay selection changes.
    setComposedMediaUrl("");
  }, [mediaUrl, overlayUrl]);

  useEffect(() => {
    if (cta === "CALL_NOW") {
      const tel = phoneCandidate || "";
      setLinkUrl(tel);
    } else {
      const currentIsHttp = /^https?:\/\//i.test(linkUrl || "");
      const currentIsTel = /^tel:/i.test(linkUrl || "");
      if (!currentIsHttp || currentIsTel) {
        const fallback =
          selectedProfile?.defaults?.linkUrl ||
          selectedProfile?.landingUrl ||
          "";
        setLinkUrl(fallback || "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cta,
    phoneCandidate,
    selectedProfile?.defaults?.linkUrl,
    selectedProfile?.landingUrl,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.tab, tab);
  }, [tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedId) {
      localStorage.setItem(STORAGE_KEYS.selectedProfileId, selectedId);
    }
    loadCycleState(selectedId);
  }, [selectedId]);

  useEffect(() => {
    loadScheduledPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (tab === "performance" && selectedId) {
      loadPerformance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedId, performanceDays, performanceMonthStart, performanceMonthEnd]);

  useEffect(() => {
    refreshPhotoMetaSample();
    refreshGeoSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProfile,
    photoLat,
    photoLng,
    photoCity,
    photoNeighbourhood,
    photoNeighbourhoodsInput,
    photoRandomizeCoords,
    photoRandomizeRadius,
    photoKeywords,
    photoCategories,
    linkUrl,
  ]);

  // Build a preview meta list for all selected photos so the user can see coords/neighbourhoods
  useEffect(() => {
    const list = photoSchedMediaList.length
      ? photoSchedMediaList
      : photoSchedMedia
      ? [photoSchedMedia]
      : [];
    const previews = list.slice(0, 100).map((media) => {
      const meta = buildPhotoMeta();
      const caption =
        photoSchedCaption ||
        buildAutoCaption(selectedProfile, meta, photoKeywords);
      return { media, meta, caption };
    });
    setPhotoSelectionPreview(previews);
  }, [
    photoSchedMediaList,
    photoSchedMedia,
    photoSchedCaption,
    photoCity,
    photoNeighbourhood,
    photoNeighbourhoodsInput,
    photoRandomizeCoords,
    photoRandomizeRadius,
    photoKeywords,
    photoCategories,
    selectedProfile,
  ]);

  useEffect(() => {
    if (tab === "photo-scheduler") {
      loadPhotoJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedId]);

  useEffect(() => {
    if (cityLookupTimer.current) clearTimeout(cityLookupTimer.current);
    const city = String(photoCity || "").trim();
    if (!city || city.length < 3) return;
    cityLookupTimer.current = setTimeout(() => {
      generateNeighbourhoods(city);
    }, 600);
    return () => {
      if (cityLookupTimer.current) clearTimeout(cityLookupTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoCity]);

  useEffect(() => {
    if (photoLat || photoLng) return;
    const firstWithCoords = neighbourhoodResults.find(
      (n) => n.lat != null && n.lng != null
    );
    if (firstWithCoords) {
      setPhotoLat(String(firstWithCoords.lat));
      setPhotoLng(String(firstWithCoords.lng));
      setPhotoRandomizeCoords(true);
      const b = computeMapBounds(
        firstWithCoords.lat,
        firstWithCoords.lng,
        2000
      );
      mapBoundsRef.current = b;
      setMapBounds(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbourhoodResults]);

  useEffect(() => {
    if (!bulkDrafts.length) {
      if (activeDraftIndex !== -1) setActiveDraftIndex(-1);
      return;
    }
    if (activeDraftIndex < 0) {
      setActiveDraftIndex(0);
    } else if (activeDraftIndex >= bulkDrafts.length) {
      setActiveDraftIndex(bulkDrafts.length - 1);
    }
  }, [activeDraftIndex, bulkDrafts]);

  useEffect(() => {
    if (!selectedProfile || !selectedProfile.profileId) return;
    const normalizedLinks = linkOptions
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    if (!linkInitRef.current) {
      linkInitRef.current = true;
      return;
    }
    if (linkSaveTimer.current) clearTimeout(linkSaveTimer.current);
    linkSaveTimer.current = setTimeout(async () => {
      setLinkOptionsSaving(true);
      try {
        await api.updateProfileDefaults(selectedProfile.profileId, {
          linkOptions: normalizedLinks,
        });
      } catch (e) {
        notify(e.message || "Failed to save links");
      } finally {
        setLinkOptionsSaving(false);
      }
    }, 500);
    return () => {
      if (linkSaveTimer.current) clearTimeout(linkSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkOptions, selectedProfile?.profileId]);

  useEffect(() => {
    if (!selectedProfile || !selectedProfile.profileId) return;
    if (!quickLinksInitRef.current) {
      quickLinksInitRef.current = true;
      return;
    }
    if (quickLinksSaveTimer.current) clearTimeout(quickLinksSaveTimer.current);
    quickLinksSaveTimer.current = setTimeout(async () => {
      setQuickLinksSaving(true);
      try {
        await api.updateProfileDefaults(selectedProfile.profileId, {
          reviewLink: String(reviewLink || "").trim(),
          serviceAreaLink: String(serviceAreaLink || "").trim(),
          areaMapLink: String(areaMapLink || "").trim(),
        });
      } catch (e) {
        notify(e.message || "Failed to save quick links");
      } finally {
        setQuickLinksSaving(false);
      }
    }, 500);
    return () => {
      if (quickLinksSaveTimer.current)
        clearTimeout(quickLinksSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewLink, serviceAreaLink, areaMapLink, selectedProfile?.profileId]);

  async function doPreview() {
    if (!selectedId) return notify("Select a profile first");
    setPreview("");
    setPreviewing(true);
    setPreviewDetails(null);
    try {
      const r = await api.generatePost(selectedId, effectiveComposerTopicId, {
        city: photoCity || selectedProfile?.city || "",
        neighbourhood: photoNeighbourhood || "",
        photoKeywords,
        photoCategories,
      });
      if (r && r.post) {
        setPreview(r.post);
        setPostText(r.post);
        setPreviewDetails({
          profileId: selectedId,
          profileName: selectedProfile?.businessName || selectedId,
          city: selectedProfile?.city || "",
          neighbourhood: r.neighbourhood || "",
          generatedAt: new Date().toISOString(),
        });
      } else {
        setPreview(JSON.stringify(r, null, 2));
      }
    } catch (e) {
      notify(e.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  function buildPhotoMeta() {
    const profile = selectedProfile || {};
    const city = photoCity || profile.city || "";
    const candidates =
      neighbourhoodOptionsDetailed.length > 0
        ? neighbourhoodOptionsDetailed
        : parseNeighbourhoodInput(photoNeighbourhoodsInput).map((name) => ({
            name,
          }));
    const chosen =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
    const chosenDetailed =
      photoNeighbourhood && neighbourhoodOptionsDetailed.length
        ? neighbourhoodOptionsDetailed.find(
            (n) =>
              String(n.name || "")
                .trim()
                .toLowerCase() ===
              String(photoNeighbourhood || "")
                .trim()
                .toLowerCase()
          )
        : null;
    const neighbourhood =
      (chosen && chosen.name) ||
      photoNeighbourhood ||
      (Array.isArray(profile.neighbourhoods)
        ? profile.neighbourhoods[0]
        : "") ||
      "";
    const baseLat =
      (chosenDetailed && chosenDetailed.lat != null && chosenDetailed.lat) ||
      (chosen &&
      chosen.lat != null &&
      chosen.lng != null &&
      !photoLat &&
      !photoLng
        ? chosen.lat
        : photoLat || cityCenterRef.current.lat || "");
    const baseLng =
      (chosenDetailed && chosenDetailed.lng != null && chosenDetailed.lng) ||
      (chosen &&
      chosen.lat != null &&
      chosen.lng != null &&
      !photoLng &&
      !photoLat
        ? chosen.lng
        : photoLng || cityCenterRef.current.lng || "");
    const coords =
      photoRandomizeCoords && baseLat && baseLng
        ? randomizeCoords(baseLat, baseLng, photoRandomizeRadius)
        : { lat: baseLat, lng: baseLng };

    const serviceList = String(photoKeywords || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const categoryList = String(photoCategories || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const chosenService =
      photoRandomizeKeywords && serviceList.length
        ? serviceList[Math.floor(Math.random() * serviceList.length)]
        : photoKeywords;
    const chosenCategory =
      photoRandomizeKeywords && categoryList.length
        ? categoryList[Math.floor(Math.random() * categoryList.length)]
        : photoCategories;

    return {
      lat: coords.lat || "",
      lng: coords.lng || "",
      city,
      neighbourhood,
      serviceKeywords:
        chosenService ||
        (Array.isArray(profile.keywords) ? profile.keywords.join(", ") : ""),
      categoryKeywords: chosenCategory || "",
      businessName: profile.businessName || "",
      website: profile.landingUrl || profile.defaults?.linkUrl || linkUrl || "",
      seoSlug: [city, neighbourhood, photoKeywords, photoCategories]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join(" | "),
    };
  }

  function shufflePhotoLocation() {
    const list = parseNeighbourhoodInput(photoNeighbourhoodsInput);
    if (list.length) {
      setPhotoNeighbourhood(randomNeighbourhood(list, photoNeighbourhood));
    }
    const radius = Number(photoRandomizeRadius) || 0;
    if (photoLat && photoLng && radius > 0) {
      const coords = randomizeCoords(photoLat, photoLng, radius);
      if (coords.lat) setPhotoLat(String(coords.lat));
      if (coords.lng) setPhotoLng(String(coords.lng));
    } else if (!photoLat || !photoLng) {
      notify("Set base latitude/longitude to shuffle coordinates.");
    }
  }

  function refreshPhotoMetaSample() {
    const meta = buildPhotoMeta();
    setPhotoMetaSample(meta);
    logGeo("Sample meta refreshed", meta);
  }

  function refreshGeoSamples(count = 3) {
    const samples = [];
    for (let i = 0; i < count; i++) {
      samples.push(buildPhotoMeta());
    }
    setGeoTestSamples(samples);
    if (samples[0]) setPhotoMetaSample(samples[0]);
    logGeo("Jitter preview refreshed", samples);
  }

  async function generateNeighbourhoods(city) {
    const q = String(city || "").trim();
    if (!q) return;
    setNeighbourhoodsLoading(true);
    try {
      const baseLatNum = parseFloat(photoLat);
      const baseLngNum = parseFloat(photoLng);
      const hasBaseCoords = !isNaN(baseLatNum) && !isNaN(baseLngNum);
      const targetCityNorm = normalizeCityName(q);
      logGeo("Neighbourhood lookup start", {
        city: q,
        lat: hasBaseCoords ? baseLatNum : null,
        lng: hasBaseCoords ? baseLngNum : null,
      });
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=40&extratags=1&q=" +
        encodeURIComponent(q);
      const res = await fetch(url, {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "gmb-automation/1.0",
        },
      });
      if (!res.ok) {
        throw new Error(`Lookup failed (${res.status})`);
      }
      const data = await res.json();
      // Find a city center from the first result that matches the city name
      const cityHit = data.find((item) => {
        const addr = item?.address || {};
        const cityCandidates = [
          addr.city,
          addr.town,
          addr.village,
          addr.hamlet,
          addr.municipality,
          addr.county,
          addr.state,
        ]
          .map(normalizeCityName)
          .filter(Boolean);
        return cityCandidates.includes(targetCityNorm);
      });
      const cityCenter =
        cityHit && cityHit.lat && cityHit.lon
          ? { lat: parseFloat(cityHit.lat), lng: parseFloat(cityHit.lon) }
          : { lat: null, lng: null };
      const radiusMeters = Math.max(
        1000,
        Number(photoSearchRadius || 20) * 1000
      );
      if (!hasBaseCoords && cityCenter.lat != null && cityCenter.lng != null) {
        setPhotoLat(String(cityCenter.lat));
        setPhotoLng(String(cityCenter.lng));
        cityCenterRef.current = cityCenter;
        const b = computeMapBounds(
          cityCenter.lat,
          cityCenter.lng,
          radiusMeters
        );
        mapBoundsRef.current = b;
        setMapBounds(b);
      } else if (hasBaseCoords) {
        cityCenterRef.current = { lat: baseLatNum, lng: baseLngNum };
        const b = computeMapBounds(baseLatNum, baseLngNum, radiusMeters);
        mapBoundsRef.current = b;
        setMapBounds(b);
      } else {
        cityCenterRef.current = { lat: null, lng: null };
      }

      const byName = new Map();
      const addName = (s, lat, lng) => {
        const v = String(s || "").trim();
        if (!v) return;
        if (!byName.has(v)) {
          byName.set(v, {
            name: v,
            lat: isNaN(lat) ? null : +lat,
            lng: isNaN(lng) ? null : +lng,
          });
        }
      };
      data.forEach((item) => {
        const addr = item?.address || {};
        const entryLat = parseFloat(item.lat);
        const entryLng = parseFloat(item.lon);
        const cityCandidates = [
          addr.city,
          addr.town,
          addr.village,
          addr.hamlet,
          addr.municipality,
          addr.county,
          addr.state,
        ]
          .map(normalizeCityName)
          .filter(Boolean);
        const cityMatch = targetCityNorm
          ? cityCandidates.some(
              (c) => c === targetCityNorm || c.includes(targetCityNorm)
            )
          : true;
        const centerLat = hasBaseCoords
          ? baseLatNum
          : cityCenterRef.current.lat;
        const centerLng = hasBaseCoords
          ? baseLngNum
          : cityCenterRef.current.lng;
        const centerReady = !isNaN(centerLat) && !isNaN(centerLng);
        const withinRadius =
          centerReady && !isNaN(entryLat) && !isNaN(entryLng)
            ? haversineKm(centerLat, centerLng, entryLat, entryLng) <=
              Math.max(5, Number(photoSearchRadius || 20))
            : false;
        // Keep only if city matches, or (city not matched but within radius of a known center)
        if (!cityMatch && !withinRadius) return;
        [
          addr.neighbourhood,
          addr.suburb,
          addr.city_district,
          addr.quarter,
          addr.village,
          addr.town,
          addr.hamlet,
          addr.road,
          addr.pedestrian,
          addr.industrial,
          addr.commercial,
        ].forEach((n) => addName(n, entryLat, entryLng));
      });
      let list = Array.from(byName.values());
      if (
        cityCenterRef.current.lat != null &&
        cityCenterRef.current.lng != null
      ) {
        list = list
          .map((it) => {
            if (it.lat == null || it.lng == null) {
              return {
                ...it,
                lat: cityCenterRef.current.lat,
                lng: cityCenterRef.current.lng,
              };
            }
            return it;
          })
          .slice(0, 25);
      }
      if (q && !byName.has(q)) {
        list.unshift({
          name: q,
          lat:
            cityCenterRef.current.lat != null
              ? cityCenterRef.current.lat
              : hasBaseCoords
              ? baseLatNum
              : null,
          lng:
            cityCenterRef.current.lng != null
              ? cityCenterRef.current.lng
              : hasBaseCoords
              ? baseLngNum
              : null,
        });
      }
      if (!list.length) {
        throw new Error(
          "No neighbourhoods found for this city/coords. Try another city or add manually."
        );
      }
      // Fallback: bounded search around city center if too few results
      if (
        list.length < 5 &&
        cityCenterRef.current.lat != null &&
        cityCenterRef.current.lng != null
      ) {
        try {
          const lat = cityCenterRef.current.lat;
          const lng = cityCenterRef.current.lng;
          const delta = 0.2; // ~20km
          const viewbox = [
            lng - delta,
            lat + delta,
            lng + delta,
            lat - delta,
          ].join(",");
          const boundedUrl =
            "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=40&extratags=1&bounded=1&viewbox=" +
            viewbox +
            "&q=" +
            encodeURIComponent(q + " neighbourhood");
          const boundedRes = await fetch(boundedUrl, {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "gmb-automation/1.0",
            },
          });
          if (boundedRes.ok) {
            const boundedData = await boundedRes.json();
            boundedData.forEach((item) => {
              const addr = item?.address || {};
              const entryLat = parseFloat(item.lat);
              const entryLng = parseFloat(item.lon);
              [
                addr.neighbourhood,
                addr.suburb,
                addr.city_district,
                addr.quarter,
                addr.village,
                addr.town,
                addr.hamlet,
                addr.road,
                addr.pedestrian,
                addr.industrial,
                addr.commercial,
              ].forEach((n) => addName(n, entryLat, entryLng));
            });
            list = Array.from(byName.values());
          }
        } catch (fallbackErr) {
          console.warn("bounded lookup failed", fallbackErr);
        }
      }
      // Overpass enrichment to pick up more neighbourhoods/streets
      try {
        const radiusMeters = Math.max(
          1000,
          Number(photoSearchRadius || 20) * 1000
        );
        const overpassList = await fetchOverpassPlaces(
          q,
          cityCenterRef.current.lat != null
            ? cityCenterRef.current.lat
            : baseLatNum,
          cityCenterRef.current.lng != null
            ? cityCenterRef.current.lng
            : baseLngNum,
          radiusMeters
        );
        overpassList.forEach((item) => {
          if (!byName.has(item.name)) {
            byName.set(item.name, item);
          }
        });
        list = Array.from(byName.values());
      } catch (overErr) {
        console.warn("Overpass enrichment failed", overErr);
      }
      list = Array.from(byName.values());
      setNeighbourhoodResults(list);
      setPhotoNeighbourhoodsInput(list.map((i) => i.name).join("\n"));
      notify(`Loaded ${list.length} areas from maps`);
      logGeo("Neighbourhood lookup success", {
        count: list.length,
        sample: list.slice(0, 5),
        city: q,
        baseLat: hasBaseCoords ? baseLatNum : cityCenterRef.current.lat,
        baseLng: hasBaseCoords ? baseLngNum : cityCenterRef.current.lng,
        radiusKm: photoSearchRadius,
      });
      refreshPhotoMetaSample();
      refreshGeoSamples();
    } catch (e) {
      notify(e.message || "Neighbourhood lookup failed");
      logGeo("Neighbourhood lookup failed", { error: e.message || String(e) });
    } finally {
      setNeighbourhoodsLoading(false);
    }
  }

  async function savePhotoMetaDefaults() {
    if (!selectedProfile) return notify("Select a profile first");
    setSavingPhotoMeta(true);
    try {
      await api.updateProfileDefaults(selectedProfile.profileId, {
        photoCityOverride: String(photoCity || "").trim(),
        photoLat: String(photoLat || "").trim(),
        photoLng: String(photoLng || "").trim(),
        photoNeighbourhood: String(photoNeighbourhood || "").trim(),
        photoNeighbourhoods: photoNeighbourhoodOptions,
        photoRandomizeCoords,
        photoRandomizeRadius,
        photoKeywords: String(photoKeywords || "").trim(),
        photoCategories: String(photoCategories || "").trim(),
      });
      notify("Photo EXIF defaults saved");
    } catch (e) {
      notify(e.message || "Save failed");
    } finally {
      setSavingPhotoMeta(false);
    }
  }

  function validateBeforePost(effectiveLink) {
    if (cta === "CALL_NOW") {
      const phoneOk =
        (phoneCandidate &&
          /(\+?[0-9][0-9\-\s\(\)]{5,})/.test(phoneCandidate)) ||
        /^tel:\+?[0-9]/i.test(linkUrl || "");
      if (!phoneOk) {
        notify(
          "Call now requires a phone number (set a tel:+ link or default phone)."
        );
        return false;
      }
    } else {
      if (!isValidHttpLink(effectiveLink)) {
        notify("For this CTA, please provide a valid https:// link.");
        return false;
      }
    }
    if (mediaUrl) {
      const isHttps = /^https:\/\/.+\.(png|jpe?g|webp)$/i.test(mediaUrl);
      const isUploads = /^\/(uploads|media)\/.+\.(png|jpe?g|webp)$/i.test(
        mediaUrl
      );
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
    const effectiveLink =
      cta === "CALL_NOW"
        ? linkUrl
        : isValidHttpLink(linkUrl)
        ? linkUrl
        : getFallbackLink(selectedProfile);
    if (
      cta !== "CALL_NOW" &&
      isValidHttpLink(effectiveLink) &&
      !isValidHttpLink(linkUrl)
    ) {
      setLinkUrl(effectiveLink);
    }
    if (!validateBeforePost(effectiveLink)) return;
    setBusy(true);
    setPosting(true);
    setPostNowStatus("posting");
    try {
      let mediaForPost = mediaUrl;
      let overlayUsed = "";
      if (overlayUrl && mediaUrl) {
        const composed = await composeOverlayIfNeeded(mediaUrl, overlayUrl);
        mediaForPost = composed.url;
        overlayUsed = composed.overlayUsed;
        setComposedMediaUrl(mediaForPost);
      }
      await api.postNow({
        profileId: selectedId,
        postText,
        cta,
        linkUrl: cta === "CALL_NOW" ? "" : effectiveLink,
        phone: phoneCandidate.replace(/^tel:/i, ""),
        mediaUrl: mediaForPost,
        overlayUrl: overlayUsed,
        serviceTopicId: effectiveComposerTopicId,
        serviceType:
          composerTopic?.serviceType || composerTopic?.label || "",
        topicType: postType,
        eventTitle,
        eventStart,
        eventEnd,
        offerTitle,
        offerCoupon,
        offerRedeemUrl,
      });
      notify("Posted!");
      setPostNowStatus("posted");
      await refreshHistory();
    } catch (e) {
      notify(e.message || "Post failed");
      setPostNowStatus("");
    } finally {
      setBusy(false);
      setPosting(false);
      setTimeout(() => setPostNowStatus(""), 2000);
    }
  }

  async function loadScheduledPosts() {
    try {
      const res = await api.getScheduledPosts();
      const items = Array.isArray(res?.items) ? res.items : [];
      const filtered = selectedId
        ? items.filter((it) => it.profileId === selectedId)
        : items;
      filtered.sort(
        (a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime()
      );
      setScheduledPosts(filtered);
    } catch (e) {
      notify(e.message || "Failed to load scheduled posts");
    }
  }

  async function schedulePost() {
    if (!selectedId) return notify("Select a profile first");
    const dtString = `${scheduleDate}T${scheduleTime || "00:00"}:00`;
    const when = new Date(dtString);
    if (!scheduleDate || isNaN(when.getTime())) {
      return notify("Pick a valid date/time.");
    }
    const effectiveLink =
      cta === "CALL_NOW"
        ? ""
        : isValidHttpLink(linkUrl)
        ? linkUrl
        : getFallbackLink(selectedProfile);
    const body = {
      profileId: selectedId,
      postText,
      cta,
      linkUrl: effectiveLink,
      phone: phoneCandidate.replace(/^tel:/i, ""),
      mediaUrl,
      overlayUrl,
       serviceTopicId: effectiveComposerTopicId,
       serviceType:
         composerTopic?.serviceType || composerTopic?.label || "",
      topicType: postType,
      eventTitle,
      eventStart,
      eventEnd,
      offerTitle,
      offerCoupon,
      offerRedeemUrl,
    };
    try {
      setBusy(true);
      let mediaForPost = mediaUrl;
      let overlayUsed = overlayUrl;
      if (overlayUrl && mediaUrl) {
        const composed = await composeOverlayIfNeeded(mediaUrl, overlayUrl);
        mediaForPost = composed.url;
        overlayUsed = composed.overlayUsed;
        setComposedMediaUrl(mediaForPost);
      }
      body.mediaUrl = mediaForPost;
      body.overlayUrl = overlayUsed;
      if (editingScheduledId) {
        await api.updateScheduledPost(editingScheduledId, {
          runAt: when.toISOString(),
          body,
        });
        setScheduleStatus("updated");
      } else {
        await api.createScheduledPost({
          profileId: selectedId,
          runAt: when.toISOString(),
          body,
        });
        setScheduleStatus("scheduled");
      }
      notify(editingScheduledId ? "Updated scheduled post" : "Scheduled post");
      setEditingScheduledId("");
      await loadScheduledPosts();
    } catch (e) {
      notify(e.message || "Schedule failed");
      setScheduleStatus("error");
    } finally {
      setBusy(false);
      setTimeout(() => setScheduleStatus(""), 2000);
    }
  }

  async function loadPhotoJobs() {
    setPhotoJobsLoading(true);
    try {
      const res = await api.getScheduledPhotos(true);
      const items = Array.isArray(res?.items) ? res.items : [];
      const filtered = selectedId
        ? items.filter((it) => it.profileId === selectedId)
        : items;
      filtered.sort(
        (a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime()
      );
      const queued = filtered.filter(
        (it) => (it.status || "QUEUED") === "QUEUED"
      );
      const history = filtered.filter(
        (it) => (it.status || "QUEUED") !== "QUEUED"
      );
      setPhotoJobs(queued);
      setPhotoJobsHistory(history);
    } catch (e) {
      notify(e.message || "Failed to load photo schedules");
    } finally {
      setPhotoJobsLoading(false);
    }
  }

  async function schedulePhotosBulk() {
    if (!selectedId) return notify("Select a profile first");
    const mediaListRaw = photoSchedMediaList.length
      ? photoSchedMediaList
      : photoSchedMedia
      ? [photoSchedMedia]
      : [];
    const mediaList = Array.from(
      new Set(mediaListRaw.map((m) => String(m || "").trim()).filter(Boolean))
    );
    if (!mediaList.length)
      return notify("Pick at least one photo for scheduling");
    const baseDt = new Date(
      `${photoSchedDate}T${photoSchedTime || "00:00"}:00`
    );
    if (isNaN(baseDt.getTime())) return notify("Set a valid start date/time");
    const makeId = () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const requestedCount = Math.max(
      1,
      Math.min(100, parseInt(photoSchedCount, 10) || mediaList.length || 1)
    );
    const dayStep =
      photoSchedCadence === "DAILY2"
        ? 2
        : photoSchedCadence === "DAILY3"
        ? 3
        : 1;
    const items = [];
    setPhotoSchedulerStatus("stamping");
    for (let i = 0; i < requestedCount; i++) {
      const meta = buildPhotoMeta(); // build fresh meta per photo for randomized GPS/neighbourhood
      const runAt = new Date(
        baseDt.getTime() + i * dayStep * 86400000
      ).toISOString();
      meta.dateTime = runAt;
      const captionText =
        photoSchedCaption ||
        buildAutoCaption(selectedProfile, meta, photoKeywords);
      const mediaRaw = mediaList[i % mediaList.length];
      const mediaUrl = await ensurePhotoHasMeta(mediaRaw, meta);
      items.push({
        id: makeId(),
        profileId: selectedId,
        runAt,
        body: {
          mediaUrl,
          caption: captionText,
          meta,
          category: photoCategory,
        },
        status: "QUEUED",
      });
    }
    try {
      setPhotoSchedulerStatus("saving");
      await api.saveScheduledPhotosBulk(items);
      notify(`Scheduled ${items.length} photo(s)`);
      await loadPhotoJobs();
      setPhotoSchedulerStatus("saved");
    } catch (e) {
      notify(e.message || "Failed to save photo schedules");
      setPhotoSchedulerStatus("error");
    } finally {
      setTimeout(() => setPhotoSchedulerStatus(""), 2000);
    }
  }

  async function updateSelectedPhotoJob() {
    if (!editingPhotoJobId)
      return notify("Pick a scheduled photo from the calendar first.");
    if (!selectedId) return notify("Select a profile first");
    const mediaUrlRaw =
      photoSchedMediaList.length > 0
        ? photoSchedMediaList[0]
        : photoSchedMedia
        ? photoSchedMedia
        : "";
    if (!mediaUrlRaw) return notify("Pick a photo first");
    const when = new Date(`${photoSchedDate}T${photoSchedTime || "00:00"}:00`);
    if (isNaN(when.getTime())) return notify("Set a valid date/time");
    const meta = buildPhotoMeta();
    meta.dateTime = when.toISOString();
    const stampedUrl = await ensurePhotoHasMeta(mediaUrlRaw, meta);
    const item = {
      profileId: selectedId,
      runAt: when.toISOString(),
      body: {
        mediaUrl: stampedUrl || mediaUrlRaw,
        caption:
          photoSchedCaption ||
          buildAutoCaption(selectedProfile, meta, photoKeywords),
        meta,
        category: photoCategory,
      },
    };
    try {
      setPhotoSchedulerStatus("saving");
      await api.deleteScheduledPhoto(editingPhotoJobId);
      await api.createScheduledPhoto(item);
      setEditingPhotoJobId("");
      notify("Scheduled photo updated");
      await loadPhotoJobs();
      setPhotoSchedulerStatus("saved");
    } catch (e) {
      notify(e.message || "Update failed");
      setPhotoSchedulerStatus("error");
    } finally {
      setTimeout(() => setPhotoSchedulerStatus(""), 2000);
    }
  }

  async function postPhotoNow() {
    if (!selectedId) return notify("Select a profile first");
    const mediaUrlRaw =
      photoSchedMediaList.length > 0
        ? photoSchedMediaList[0]
        : photoSchedMedia
        ? photoSchedMedia
        : "";
    if (!mediaUrlRaw) return notify("Pick a photo first");
    const meta = buildPhotoMeta();
    meta.dateTime = new Date().toISOString();
    const stampedUrl = await ensurePhotoHasMeta(mediaUrlRaw, meta);
    const captionText =
      photoSchedCaption ||
      buildAutoCaption(selectedProfile, meta, photoKeywords);
    try {
      setPhotoSchedulerStatus("posting");
      const result = await api.postPhotoNow({
        profileId: selectedId,
        mediaUrl: stampedUrl || mediaUrlRaw,
        caption: captionText,
        category: photoCategory,
      });
      setLastPhotoPostResult(result?.result || null);
      const fallback = result?.result?.categoryFallback;
      notify(
        fallback
          ? `Photo accepted by GBP using ${fallback.used} category`
          : "Photo accepted by GBP media API"
      );
      setPhotoSchedulerStatus("posted");
      await loadPhotoJobs();
      await fetchLatestPhotos();
    } catch (e) {
      notify(e.message || "Post failed");
      setPhotoSchedulerStatus("error");
    } finally {
      setTimeout(() => setPhotoSchedulerStatus(""), 2000);
    }
  }

  async function runDuePhotoQueue() {
    try {
      setPhotoSchedulerStatus("running");
      const result = await api.runDueScheduledPhotos();
      const processed = Number(result?.processed || 0);
      const failed = Array.isArray(result?.results)
        ? result.results.filter((item) => !item.ok).length
        : 0;
      notify(
        failed
          ? `Processed ${processed} due photo(s), ${failed} failed`
          : `Processed ${processed} due photo(s)`
      );
      await loadPhotoJobs();
      setPhotoSchedulerStatus(failed ? "error" : "saved");
    } catch (e) {
      notify(e.message || "Photo queue run failed");
      setPhotoSchedulerStatus("error");
    } finally {
      setTimeout(() => setPhotoSchedulerStatus(""), 2500);
    }
  }

  async function deletePhotoJob(id) {
    if (!id) return;
    try {
      await api.deleteScheduledPhoto(id);
      notify("Deleted photo schedule");
      await loadPhotoJobs();
    } catch (e) {
      notify(e.message || "Delete failed");
    }
  }

  async function fetchLatestPhotos() {
    if (!selectedId) return notify("Select a profile first");
    setLatestPhotosLoading(true);
    try {
      const res = await api.getLatestPhotos(selectedId, 25);
      const items = Array.isArray(res?.items) ? res.items : [];
      setLatestPhotos(items);
      notify(
        items.length
          ? "Fetched latest GBP photos"
          : "No photos returned from GBP"
      );
    } catch (e) {
      notify(e.message || "Failed to load GBP photos");
    } finally {
      setLatestPhotosLoading(false);
    }
  }

  async function fetchLatestPhotosDebug() {
    if (!selectedId) return notify("Select a profile first");
    setLatestPhotosDebugLoading(true);
    try {
      const res = await api.getLatestPhotosDebug(selectedId, 20, 5);
      const items = Array.isArray(res?.items) ? res.items : [];
      setLatestPhotosDebug(items);
      notify(
        items.length
          ? "Fetched GBP photos (debug, multi-page)"
          : "No photos returned from GBP"
      );
    } catch (e) {
      notify(e.message || "Failed to load GBP photos (debug)");
    } finally {
      setLatestPhotosDebugLoading(false);
    }
  }

  async function loadPerformance() {
    if (!selectedId) return notify("Select a profile first");
    setPerformanceLoading(true);
    try {
      const result = await api.getPerformance(selectedId, performanceDays, {
        startMonth: performanceMonthStart,
        endMonth: performanceMonthEnd,
      });
      setPerformance(result);
      notify("Loaded GBP performance");
    } catch (e) {
      setPerformance(null);
      notify(e.message || "Failed to load performance");
    } finally {
      setPerformanceLoading(false);
    }
  }

  function buildThematicPhotoPrompt(index = 0) {
    const profileName = selectedProfile?.businessName || "local renovation contractor";
    const city = photoCity || selectedProfile?.city || "Mississauga";
    const neighbourhood =
      photoNeighbourhood ||
      photoNeighbourhoodOptions[index % Math.max(1, photoNeighbourhoodOptions.length)] ||
      "";
    const topic =
      serviceTopicMap[composerServiceTopicId]?.serviceType ||
      serviceTopicMap[defaultServiceTopicId]?.serviceType ||
      photoKeywords ||
      photoGenTheme ||
      "home renovation service";
    const category = photoCategories || "drywall, ceiling finishing, interior renovation";
    const serviceSignals = `${photoGenTheme} ${topic} ${category}`.toLowerCase();
    const popcornFocus =
      serviceSignals.includes("popcorn") ||
      serviceSignals.includes("ceiling removal") ||
      serviceSignals.includes("stucco ceiling") ||
      serviceSignals.includes("ceiling texture");
    const popcornScenes = [
      "A real occupied residential room prepared for popcorn ceiling removal: plastic sheeting on walls, drop cloths over floors, ladder, scraper, pole sander, shop vacuum hose, and a ceiling with visible old popcorn texture partially removed.",
      "Close realistic job-site view angled upward at a popcorn ceiling being removed: half textured ceiling and half scraped smooth surface, dust-control plastic, work light, compound bucket, and contractor tools visible.",
      "Drywall finishing stage after popcorn ceiling removal: ceiling skim coat in progress, trowel marks, sanding pole, protected furniture, masking tape, and natural window light in a normal Mississauga home.",
      "Finished popcorn ceiling removal result: smooth bright ceiling, clean edges near walls, protected room just being uncovered, ladder and paint tray in foreground, realistic phone photo perspective.",
      "Before-and-after style single photo without text: one side shows old bumpy popcorn ceiling texture, the other side shows a smooth repaired ceiling area, with tools and plastic protection making the service obvious.",
    ];
    const generalScenes = [
      "A real residential renovation job-site photo with protected floors, visible tools, and a finished interior surface.",
      "A realistic progress photo showing prep work, repair materials, and clean workmanship in a lived-in home.",
      "A close job-site detail photo showing surface preparation, dust control, and finishing tools.",
    ];
    const selectedScene = (popcornFocus ? popcornScenes : generalScenes)[
      index % (popcornFocus ? popcornScenes.length : generalScenes.length)
    ];
    return [
      "Create an ultra-realistic human-shot contractor project photo for a Google Business Profile post.",
      "The image must look like a real phone or DSLR job-site photo, not an illustration, not a 3D render, not glossy stock photography, not a staged showroom.",
      `Business: ${profileName}.`,
      `Service theme: ${photoGenTheme || topic}.`,
      `SEO service keywords: ${topic}.`,
      `Location context: ${city}${neighbourhood ? `, ${neighbourhood}` : ""}.`,
      `Related categories: ${category}.`,
      `Required scene: ${selectedScene}`,
      "Make the service instantly recognizable when someone sees it beside Google search results: ceiling surface, popcorn/stucco texture or smooth ceiling result, dust protection, ladder, scraper/sander, compound bucket, vacuum hose, masking, and cleanup details should be visible when relevant.",
      "Composition: ceiling should dominate the image, camera angled upward from normal room height, with realistic imperfections, natural shadows, slight lens perspective, and ordinary residential surroundings.",
      "Human realism: a worker's hands, arms, back, or PPE can appear, but no clear face, no posing, no fake smile, no perfect model, no customer portrait.",
      "Do not include text, logo, watermark, business card, signage, readable labels, impossible tools, warped rooms, extra fingers, distorted ladders, fake before/after labels, or overly perfect AI-looking surfaces.",
      "The photo should help a homeowner immediately understand: this company provides popcorn ceiling removal, ceiling smoothing, dust-controlled prep, and clean finished results.",
    ].join(" ");
  }

  async function generateThematicPhotos(targetOverride = "") {
    if (!selectedProfile) return notify("Select a profile first");
    const count = Math.max(1, Math.min(10, Number(photoGenCount) || 1));
    const target = targetOverride || photoGenTarget || "profile";
    setPhotoGenBusy(true);
    setPhotoGenResults([]);
    try {
      const generated = [];
      for (let i = 0; i < count; i++) {
        // eslint-disable-next-line no-await-in-loop
        const res = await api.generateImage(buildThematicPhotoPrompt(i), {
          quality: photoGenQuality,
          size: photoGenSize,
        });
        if (res?.url) {
          generated.push({
            url: res.url,
            prompt: res.prompt || buildThematicPhotoPrompt(i),
            model: res.model || "",
            quality: res.quality || photoGenQuality,
            size: res.size || photoGenSize,
          });
        }
      }
      if (!generated.length) {
        notify("No images returned");
        return;
      }
      const urls = generated.map((item) => item.url);
      setPhotoGenResults(generated);
      if (target === "profile") {
        await api.appendProfilePhotos(selectedProfile.profileId, urls);
        setProfiles((prev) =>
          prev.map((p) =>
            p.profileId === selectedProfile.profileId
              ? { ...p, photoPool: [...urls, ...(p.photoPool || [])] }
              : p
          )
        );
        setMediaUrl(urls[0]);
      } else if (target === "scheduler") {
        setPhotoSchedMediaList((prev) =>
          Array.from(new Set([...urls, ...prev])).slice(0, 100)
        );
        setPhotoSchedMedia(urls[0]);
        setTab("photo-scheduler");
      } else if (target === "bulk") {
        setBulkImages((prev) => [
          ...urls.map((url) => buildBulkImageEntry(url)),
          ...prev,
        ].slice(0, 100));
        setTab("history");
      } else if (target === "post") {
        setMediaUrl(urls[0]);
        setPhotoGenTarget("post");
      }
      notify(`Generated ${generated.length} themed photo(s)`);
      const uploads = await api.getUploadsList().catch(() => null);
      if (uploads) setUploadsInfo(uploads);
    } catch (e) {
      notify(e.message || "Photo generation failed");
    } finally {
      setPhotoGenBusy(false);
    }
  }

  async function ensurePhotoHasMeta(url, metaOverride = null) {
    const meta = metaOverride || buildPhotoMeta();
    try {
      const fullUrl = resolveMediaPreviewUrl(url, backendBase);
      const resp = await fetch(fullUrl);
      if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
      const blob = await resp.blob();
      const filename = (url.split("/").pop() || "photo.jpg").split("?")[0];
      const file = new File([blob], filename, {
        type: blob.type || "image/jpeg",
      });
      const res = await uploadPhoto(file, backendBase, meta);
      return res?.url || url;
    } catch (e) {
      console.warn("ensurePhotoHasMeta failed", e);
      notify(e.message || "Failed to stamp EXIF; using original photo");
      return url;
    }
  }

  function updateBulkDraft(idx, updater) {
    setBulkDrafts((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = typeof updater === "function" ? updater(item) : updater;
        return { ...item, ...next };
      })
    );
  }

  function updateBulkDraftBody(idx, patch) {
    setBulkDrafts((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const currentBody = item.body || {};
        const nextBody =
          typeof patch === "function"
            ? patch(currentBody)
            : { ...currentBody, ...patch };
        return { ...item, body: nextBody };
      })
    );
  }

  const handleDraftRunAtChange = (idx, value) => {
    const dt = new Date(value);
    const fallback = bulkDrafts[idx]?.runAt;
    updateBulkDraft(idx, {
      runAt: isNaN(dt.getTime()) ? fallback : dt.toISOString(),
    });
    setActiveDraftIndex(idx);
  };

  const handleDraftCtaChange = (idx, value) => {
    updateBulkDraftBody(idx, { cta: value });
    setActiveDraftIndex(idx);
  };

  const handleDraftLinkChange = (idx, value) => {
    updateBulkDraftBody(idx, { linkUrl: value });
    setActiveDraftIndex(idx);
  };

  const handleDraftMediaChange = (idx, value) => {
    updateBulkDraftBody(idx, { mediaUrl: value });
    setActiveDraftIndex(idx);
  };

  const handleDraftOverlayApply = (idx, value) => {
    const overlayValue = value || overlayUrl || "";
    if (!overlayValue) return;
    updateBulkDraftBody(idx, { overlayUrl: overlayValue });
    setActiveDraftIndex(idx);
  };

  const handleDraftOverlayClear = (idx) => {
    updateBulkDraftBody(idx, { overlayUrl: "" });
    setActiveDraftIndex(idx);
  };

  const handleDraftPreview = (idx) => setActiveDraftIndex(idx);

  const handleDraftRemove = (idx) => {
    setBulkDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActiveDraftIndex((prevIdx) => {
      if (prevIdx < 0) return prevIdx;
      if (idx < prevIdx) return prevIdx - 1;
      if (idx === prevIdx) return Math.max(0, prevIdx - 1);
      return prevIdx;
    });
  };

  const handleActiveDraftBodyChange = (patch) => {
    if (activeDraftIndex < 0) return;
    updateBulkDraftBody(activeDraftIndex, patch);
  };
  const applyServiceTopicToDraft = (idx, topicId) => {
    if (idx < 0) return;
    const topic = topicId ? serviceTopicMap[topicId] : null;
    updateBulkDraftBody(idx, {
      serviceTopicId: topicId || "",
      serviceTopicLabel: topic ? topic.label : "",
      serviceType: topic ? topic.serviceType : "",
    });
  };
  const handleActiveDraftServiceTopicChange = (value) => {
    if (activeDraftIndex < 0) return;
    applyServiceTopicToDraft(activeDraftIndex, value);
  };

  const handleActiveDraftRunAtChange = (value) => {
    if (activeDraftIndex < 0) return;
    const dt = new Date(value);
    const fallback = activeBulkDraft?.runAt;
    updateBulkDraft(activeDraftIndex, {
      runAt: isNaN(dt.getTime()) ? fallback : dt.toISOString(),
    });
  };

  const handleActiveDraftUseDefaultOverlay = () => {
    if (activeDraftIndex < 0) return;
    handleDraftOverlayApply(activeDraftIndex, overlayUrl);
  };

  const handleDraftOverlayGallery = (idx) => {
    if (idx < 0) return;
    setMediaGalleryContext(`overlay-draft-${idx}`);
    setMediaGalleryOpen(true);
  };

  const handleActiveDraftPickOverlay = () => {
    handleDraftOverlayGallery(activeDraftIndex);
  };

  const handleActiveDraftClearOverlay = () => {
    if (activeDraftIndex < 0) return;
    handleDraftOverlayClear(activeDraftIndex);
  };

  const goToPreviousDraft = () => {
    setActiveDraftIndex((idx) => Math.max(0, idx - 1));
  };

  const goToNextDraft = () => {
    setActiveDraftIndex((idx) =>
      bulkDrafts.length ? Math.min(bulkDrafts.length - 1, idx + 1) : idx
    );
  };

  const handleRegenerateActiveDraft = () => {
    if (activeDraftIndex < 0) return;
    regenerateBulkDraft(activeDraftIndex);
  };

  async function autoScheduleWithAi() {
    if (!selectedId) return notify("Select a profile first");
    const queuedImages =
      bulkImages.length > 0
        ? bulkImages
        : mediaUrl
        ? [
            {
              url: mediaUrl,
              serviceTopicId: effectiveComposerTopicId,
            },
          ]
        : [];
    if (!images.length)
      return notify("Select at least one image (gallery or photo URL).");
    const durationDays =
      bulkDurationPreset === "all"
        ? Number.MAX_SAFE_INTEGER
        : bulkDurationPreset === "custom"
        ? Number(bulkDurationCustom || 0)
        : Number(bulkDurationPreset);
    const slotsLimit =
      bulkDurationPreset === "all"
        ? images.length
        : Math.min(
            images.length,
            Math.max(1, Math.ceil(durationDays / autoCadenceDays || 1))
          );
    const useImages = queuedImages.slice(0, slotsLimit);
    const start = `${scheduleDate || new Date().toISOString().slice(0, 10)}T${
      scheduleTime || "10:00"
    }:00`;
    try {
      setBulkBusy(true);
      const payload = {
        profileId: selectedId,
        images: useImages.map((img) => ({
          mediaUrl: img.url,
          serviceTopicId: img.serviceTopicId || "",
        })),
        startAt: start,
        cadenceDays: autoCadenceDays,
        autoGenerateSummary: true,
        body: {
          cta,
          linkUrl,
          phone: phoneCandidate.replace(/^tel:/i, ""),
          topicType: postType,
          eventTitle,
          eventStart,
          eventEnd,
          offerTitle,
          offerCoupon,
          offerRedeemUrl,
          serviceTopicId: effectiveComposerTopicId,
          serviceType:
            composerTopic?.serviceType || composerTopic?.label || "",
        },
      };
      const draftsRes = await api.draftScheduledPosts(payload);
      const draftItems = Array.isArray(draftsRes?.items) ? draftsRes.items : [];
      if (!draftItems.length) {
        notify("No drafts returned. Check inputs.");
        return;
      }
      await api.commitScheduledPosts(draftItems);
      notify(`Scheduled ${draftItems.length} post(s) with AI text.`);
      setBulkDrafts([]);
      await loadScheduledPosts();
    } catch (e) {
      notify(e.message || "Auto-schedule failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function buildBulkDrafts() {
    if (!selectedId) return notify("Select a profile first");
    if (!bulkImages.length)
      return notify("Select images from the gallery first.");
    const durationDays =
      bulkDurationPreset === "all"
        ? Number.MAX_SAFE_INTEGER
        : bulkDurationPreset === "custom"
        ? Number(bulkDurationCustom || 0)
        : Number(bulkDurationPreset);
    const slotsLimit =
      bulkDurationPreset === "all"
        ? bulkImages.length
        : Math.min(
            bulkImages.length,
            Math.max(1, Math.ceil(durationDays / bulkCadenceDays || 1))
          );
    const images = bulkImages.slice(0, slotsLimit).map((img) => ({
      mediaUrl: img.url,
      serviceTopicId: img.serviceTopicId || "",
    }));
    const start = `${scheduleDate || new Date().toISOString().slice(0, 10)}T${
      scheduleTime || "10:00"
    }:00`;
    try {
      setBulkBusy(true);
      const body = {
        profileId: selectedId,
        images,
        startAt: start,
        cadenceDays: bulkCadenceDays,
        autoGenerateSummary: bulkAutoGenerate,
        body: {
          postText,
          cta,
          linkUrl,
          phone: phoneCandidate.replace(/^tel:/i, ""),
          mediaUrl,
          topicType: postType,
          eventTitle,
          eventStart,
          eventEnd,
          offerTitle,
          offerCoupon,
          offerRedeemUrl,
          serviceTopicId: effectiveComposerTopicId,
          serviceType:
            composerTopic?.serviceType || composerTopic?.label || "",
        },
      };
      const res = await api.draftScheduledPosts(body);
      const items = Array.isArray(res?.items) ? res.items : [];
      setBulkDrafts(items);
      setActiveDraftIndex(items.length ? 0 : -1);
      notify("Drafts generated. Review below.");
    } catch (e) {
      notify(e.message || "Failed to build drafts");
    } finally {
      setBulkBusy(false);
    }
  }

  async function regenerateBulkDraft(idx) {
    const draft = bulkDrafts[idx];
    if (!draft) return;
    const media = draft.body?.mediaUrl;
    if (!media)
      return notify("Add a media URL to this draft before regenerating.");
    const profileIdForDraft = draft.profileId || selectedId;
    if (!profileIdForDraft) return notify("Select a profile first");
    try {
      setRegeneratingDraftIndex(idx);
      const payload = {
        profileId: profileIdForDraft,
        images: [media],
        startAt: draft.runAt,
        cadenceDays: 1,
        autoGenerateSummary: true,
        body: {
          ...draft.body,
          mediaUrl: media,
          postText: "",
        },
      };
      const res = await api.draftScheduledPosts(payload);
      const newDraft = Array.isArray(res?.items) ? res.items[0] : null;
      if (newDraft && newDraft.body) {
        setBulkDrafts((prev) =>
          prev.map((item, i) =>
            i === idx
              ? {
                  ...item,
                  runAt: draft.runAt || newDraft.runAt,
                  body: {
                    ...item.body,
                    ...newDraft.body,
                    postText: newDraft.body.postText || "",
                  },
                }
              : item
          )
        );
        notify("Draft regenerated with AI text.");
      } else {
        notify("No draft returned for regeneration.");
      }
    } catch (e) {
      notify(e.message || "Regenerate failed");
    } finally {
      setRegeneratingDraftIndex(-1);
    }
  }

  async function commitBulkDrafts() {
    if (!bulkDrafts.length) return notify("No drafts to schedule.");
    try {
      setBulkBusy(true);
      await api.commitScheduledPosts(bulkDrafts);
      notify(`Scheduled ${bulkDrafts.length} posts`);
      setBulkDrafts([]);
      setBulkImages([]);
      await loadScheduledPosts();
    } catch (e) {
      notify(e.message || "Failed to schedule drafts");
    } finally {
      setBulkBusy(false);
    }
  }

  function clearPostComposer() {
    setPostText("");
    setPreview("");
    setPreviewDetails(null);
    setPostType("STANDARD");
    setEventTitle("");
    setEventStart("");
    setEventEnd("");
    setOfferTitle("");
    setOfferCoupon("");
    setOfferRedeemUrl("");
    setPostNowStatus("");
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

  async function loadCycleState(profileId) {
    if (!profileId) {
      setCycleInfo(null);
      return;
    }
    setCycleLoading(true);
    try {
      const res = await api.getCycleState(profileId);
      const state = res?.state || {};
      setCycleInfo({
        nextTemplate: state.nextTemplate || "STANDARD",
        lastUrl: state.lastUrl || "",
      });
    } catch (_e) {
      setCycleInfo(null);
    } finally {
      setCycleLoading(false);
    }
  }

  async function deleteScheduled(id) {
    if (!id) return;
    setDeletingScheduledId(id);
    try {
      await api.deleteScheduledPost(id);
      notify("Deleted scheduled post");
      await loadScheduledPosts();
    } catch (e) {
      notify(e.message || "Delete failed");
    } finally {
      setDeletingScheduledId("");
    }
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
        overlayUrl,
        phone: defaultPhone,
        linkOptions: linkOptions
          .map((u) => String(u || "").trim())
          .filter(Boolean),
        reviewLink: String(reviewLink || "").trim(),
        serviceAreaLink: String(serviceAreaLink || "").trim(),
        areaMapLink: String(areaMapLink || "").trim(),
        serviceTopics: serviceTopics.map((topic) => ({
          ...topic,
          hashtags: Array.isArray(topic.hashtags)
            ? topic.hashtags.filter(Boolean)
            : [],
        })),
        defaultServiceTopicId,
        mediaTopics: Object.fromEntries(
          Object.entries(mediaTopics || {}).filter(
            ([url, topicId]) =>
              url &&
              topicId &&
              serviceTopics.some((topic) => topic.id === topicId)
          )
        ),
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
      const result = await uploadPhoto(file, backendBase, null);
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

  async function handleBulkPhotoUpload(e) {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;
    if (!backendBase) {
      notify("Backend not ready yet. Try again in a moment.");
      if (e?.target) e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const { urls = [], failed = [] } = await uploadPhotos(
        files,
        backendBase,
        null
      );
      if (urls.length) {
        const entries = urls.map((u) => buildBulkImageEntry(u));
        setBulkImages((prev) => [...prev, ...entries].slice(-50));
        if (!mediaUrl) setMediaUrl(urls[0]);
        if (activeDraftIndex >= 0) {
          updateBulkDraftBody(activeDraftIndex, { mediaUrl: urls[0] });
        }
        notify(
          `Uploaded ${urls.length} photo(s) and added to bulk selection.` +
            (failed.length
              ? ` Failed: ${failed.map((f) => f.name || f).join(", ")}`
              : "")
        );
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

  async function handleSchedulerPhotoUpload(e) {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;
    if (!backendBase) {
      notify("Backend not ready yet. Try again in a moment.");
      if (e?.target) e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const { urls = [], failed = [] } = await uploadPhotos(
        files,
        backendBase,
        buildPhotoMeta()
      );
      if (urls.length) {
        setPhotoSchedMedia(urls[0]);
        setPhotoSchedMediaList((prev) => [...urls, ...prev].slice(0, 100));
        notify(
          `Uploaded ${urls.length} photo(s) with EXIF geo for scheduler.` +
            (failed.length
              ? ` Failed: ${failed.map((f) => f.name || f).join(", ")}`
              : "")
        );
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
  const performanceRows = performanceValueMap(performance);
  const performanceViews = metricGroupTotal(performance, VISIBILITY_METRICS);
  const performanceSearchViews = metricGroupTotal(
    performance,
    SEARCH_VISIBILITY_METRICS
  );
  const performanceMapsViews = metricGroupTotal(
    performance,
    MAPS_VISIBILITY_METRICS
  );
  const performanceMobileViews = metricGroupTotal(
    performance,
    MOBILE_VISIBILITY_METRICS
  );
  const performanceDesktopViews = metricGroupTotal(
    performance,
    DESKTOP_VISIBILITY_METRICS
  );
  const performanceActions = metricGroupTotal(performance, ACTION_METRICS);
  const performanceCalls = metricTotal(performance, "CALL_CLICKS");
  const performanceWebsite = metricTotal(performance, "WEBSITE_CLICKS");
  const performanceDirections = metricTotal(
    performance,
    "BUSINESS_DIRECTION_REQUESTS"
  );
  const performanceMessages = metricTotal(
    performance,
    "BUSINESS_CONVERSATIONS"
  );
  const viewTrend = trendSummary(performanceRows, "views");
  const actionTrend = trendSummary(performanceRows, "actions");
  const maxDailyViews = Math.max(
    1,
    ...performanceRows.map((row) => Number(row.views || 0))
  );
  const performanceSuggestions = buildPerformanceSuggestions({
    views: performanceViews,
    searchViews: performanceSearchViews,
    mapsViews: performanceMapsViews,
    mobileViews: performanceMobileViews,
    desktopViews: performanceDesktopViews,
    actions: performanceActions,
    calls: performanceCalls,
    website: performanceWebsite,
    directions: performanceDirections,
    messages: performanceMessages,
    keywords: performance?.keywords?.items || [],
    viewTrend,
    actionTrend,
  });

  return (
    <div className="shell">
      <aside className={`sidebar${isSidebarOpen ? " sidebar--open" : ""}`}>
        <button
          type="button"
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={closeSidebar}
        >
          <span />
          <span />
        </button>
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
              className={"nav-item" + (tab === t.id ? " nav-item--active" : "")}
              onClick={() => {
                setTab(t.id);
                closeSidebar();
              }}
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
      <div
        className={
          "sidebar-overlay" + (isSidebarOpen ? " sidebar-overlay--visible" : "")
        }
        onClick={closeSidebar}
      />

      <div className="main">
        <header className="main-header">
          <div className="main-header-text">
            <h1 className="main-title">
              {TABS.find((t) => t.id === tab)?.label || "Dashboard"}
            </h1>
            <p className="main-subtitle">
              {tab === "dashboard" &&
                "High-level overview of your GBP automation."}
              {tab === "profiles" &&
                "Profiles, CTAs, media defaults, and quick composer."}
              {tab === "bulk" &&
                "Toggle bulk inclusion and manage posting access."}
              {tab === "photo-scheduler" &&
                "Schedule photo-only uploads with geo-tag metadata."}
              {tab === "scheduler" &&
                "Configure daily times and monitor the scheduler."}
              {tab === "performance" &&
                "GBP daily metrics for the selected profile."}
              {tab === "history" &&
                "Review what was sent and how it performed."}
              {tab === "api-coverage" &&
                "Current Google Business Profile API coverage and next integration targets."}
              {tab === "diagnostics" &&
                "Debug accounts, locations, and media reachability."}
            </p>
          </div>

          <div className="main-header-right">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label="Open navigation"
              onClick={openSidebar}
            >
              <span />
              <span />
              <span />
            </button>
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
          </div>
        </header>

        <main className="main-body">
          {tab === "dashboard" && (
            <section className="dashboard-stack">
              <div className="dashboard-hero">
                <div>
                  <div className="dashboard-eyebrow">Command center</div>
                  <h2>
                    {selectedProfile?.businessName ||
                      "Select a profile to start posting"}
                  </h2>
                  <p>
                    Move through the app by task: compose posts, schedule
                    photo uploads, control automation, then verify API health.
                  </p>
                </div>
                <div className="dashboard-hero__actions">
                  <button
                    className="btn btn--blue"
                    type="button"
                    onClick={() => setTab("profiles")}
                    disabled={!selectedId}
                  >
                    Compose
                  </button>
                  <button
                    className="btn btn--green"
                    type="button"
                    onClick={() => setTab("photo-scheduler")}
                  >
                    Schedule photos
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setTab("diagnostics")}
                  >
                    Run checks
                  </button>
                </div>
              </div>

              <div className="dashboard-metrics">
                <div className="metric-card">
                  <span>Profiles</span>
                  <strong>{totalProfiles}</strong>
                  <small>{enabledProfiles} enabled</small>
                </div>
                <div className="metric-card">
                  <span>Paused</span>
                  <strong>{disabledProfiles}</strong>
                  <small>Excluded from posting</small>
                </div>
                <div className="metric-card">
                  <span>Scheduler</span>
                  <strong>{schedStatus?.enabled ? "On" : "Off"}</strong>
                  <small>{schedStatus?.defaultTime || "10:00"} default</small>
                </div>
                <div className="metric-card">
                  <span>Queued posts</span>
                  <strong>{scheduledPosts.length}</strong>
                  <small>Future post queue</small>
                </div>
              </div>

              <div className="panel-grid panel-grid--two">
                <div className="panel panel--full">
                  <div className="panel-title">Workflow shortcuts</div>
                  <div className="workflow-grid">
                    {DASHBOARD_WORKFLOWS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        className="workflow-card"
                        onClick={() => setTab(item.tab)}
                      >
                        <span>{item.title}</span>
                        <strong>{item.action}</strong>
                        <small>{item.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Scheduler snapshot</div>
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
                  <div className="action-row">
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={runAllNow}
                      disabled={busy}
                    >
                      Run once
                    </button>
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={() => setTab("scheduler")}
                    >
                      Configure
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Selected profile</div>
                  {selectedProfile ? (
                    <>
                      <div className="profile-summary">
                        <strong>{selectedProfile.businessName || selectedId}</strong>
                        <span>
                          {selectedProfile.city || "No city"} ·{" "}
                          {selectedProfile.disabled ? "Paused" : "Active"}
                        </span>
                        <small className="muted">{selectedProfile.profileId}</small>
                      </div>
                      <div className="action-row">
                        <button
                          className="btn btn--blue"
                          type="button"
                          onClick={doPreview}
                          disabled={!selectedId || previewing}
                        >
                          {previewing ? "Generating..." : "Generate preview"}
                        </button>
                        <button
                          className="btn btn--green"
                          type="button"
                          onClick={doPostNow}
                          disabled={!selectedId || busy || posting}
                        >
                          {posting ? "Posting..." : "Post now"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="muted small">No profile selected.</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "api-coverage" && (
            <section className="api-page">
              <div className="panel api-summary">
                <div>
                  <div className="panel-title">Google Business Profile API coverage</div>
                  <p className="muted small">
                    Checked against the official GBP API reference and change
                    log. Recent additions to prioritize are recurring Local
                    Posts, review media items, review reply state, and expanded
                    Food Menu dish photos.
                  </p>
                </div>
                <div className="api-summary__meta">
                  <span>Docs checked: 2026-05-04</span>
                  <span>Google docs last updated: 2025-08-28</span>
                </div>
              </div>

              <div className="api-capability-grid">
                {GBP_API_CAPABILITIES.map((capability) => (
                  <article className="api-card" key={capability.name}>
                    <div className="api-card__header">
                      <h2>{capability.name}</h2>
                      <span
                        className={`status-pill status-pill--${capability.statusTone}`}
                      >
                        {capability.status}
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>App today</dt>
                        <dd>{capability.appCoverage}</dd>
                      </div>
                      <div>
                        <dt>API supports</dt>
                        <dd>{capability.apiCoverage}</dd>
                      </div>
                      <div>
                        <dt>Recommended next step</dt>
                        <dd>{capability.nextStep}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          )}

          {tab === "bulk" && (
            <section className="panel">
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
            </section>
          )}

          {tab === "profiles" && (
            <>
              <ProfilesLinksPanel
                cta={cta}
                setCta={setCta}
                ctaOptions={CTA_OPTIONS}
                defaultPhone={defaultPhone}
                setDefaultPhone={setDefaultPhone}
                phoneCandidate={phoneCandidate}
                linkUrl={linkUrl}
                setLinkUrl={setLinkUrl}
                linkOptions={linkOptions}
                setLinkOptions={setLinkOptions}
                linkOptionsSaving={linkOptionsSaving}
                reviewLink={reviewLink}
                setReviewLink={setReviewLink}
                serviceAreaLink={serviceAreaLink}
                setServiceAreaLink={setServiceAreaLink}
                areaMapLink={areaMapLink}
                setAreaMapLink={setAreaMapLink}
                quickLinksSaving={quickLinksSaving}
                quickLinksHelpOpen={quickLinksHelpOpen}
                setQuickLinksHelpOpen={setQuickLinksHelpOpen}
                handleQuickLinksAdd={handleQuickLinksAdd}
                quickLinksAddDisabled={quickLinksAddDisabled}
                overlayUrl={overlayUrl}
                setOverlayUrl={setOverlayUrl}
                backendBase={backendBase}
                resolveMediaPreviewUrl={resolveMediaPreviewUrl}
                mediaUrl={mediaUrl}
                setMediaUrl={setMediaUrl}
                composedMediaUrl={composedMediaUrl}
                uploadsInfo={uploadsInfo}
                loadUploadsInfo={loadUploadsInfo}
                setMediaGalleryContext={setMediaGalleryContext}
                setMediaGalleryOpen={setMediaGalleryOpen}
                uploadingPhoto={uploadingPhoto}
                handlePhotoUpload={handlePhotoUpload}
                saveProfileDefaults={saveProfileDefaults}
                hasProfile={!!selectedProfile}
                serviceTopics={serviceTopics}
                onServiceTopicAdd={addServiceTopic}
                onServiceTopicFieldChange={updateServiceTopic}
                onServiceTopicRemove={removeServiceTopic}
                defaultServiceTopicId={defaultServiceTopicId}
                onDefaultServiceTopicChange={handleDefaultServiceTopicChange}
                serviceTopicPresets={SERVICE_TOPIC_PRESETS}
                mediaTopics={mediaTopics}
                onMediaTopicChange={handleMediaTopicChange}
                photoPool={selectedProfile?.photoPool || []}
              />

              <section className="panel">
                <div className="profiles-panel-header">
                  <div>
                    <div className="panel-title">Thematic photo generator</div>
                    <p className="muted small">
                      Generate SEO-themed images for this profile, then use them
                      as defaults, scheduler photos, or bulk post media.
                    </p>
                  </div>
                  <button
                    className="btn btn--blue btn--small"
                    type="button"
                    onClick={() => generateThematicPhotos()}
                    disabled={!selectedProfile || photoGenBusy}
                  >
                    {photoGenBusy ? "Generating..." : "Generate photos"}
                  </button>
                </div>
                <div className="photo-generator-grid">
                  <div>
                    <label className="field-label">Theme / service</label>
                    <input
                      value={photoGenTheme}
                      onChange={(e) => setPhotoGenTheme(e.target.value)}
                      placeholder="popcorn ceiling removal before and after"
                    />
                  </div>
                  <div>
                    <label className="field-label">How many</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={photoGenCount}
                      onChange={(e) => setPhotoGenCount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Quality</label>
                    <select
                      value={photoGenQuality}
                      onChange={(e) => setPhotoGenQuality(e.target.value)}
                    >
                      <option value="high">High detail</option>
                      <option value="medium">Balanced</option>
                      <option value="low">Fast / lower cost</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Shape</label>
                    <select
                      value={photoGenSize}
                      onChange={(e) => setPhotoGenSize(e.target.value)}
                    >
                      <option value="1536x1024">Landscape project photo</option>
                      <option value="1024x1024">Square profile photo</option>
                      <option value="1024x1536">Portrait story photo</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Send to</label>
                    <select
                      value={photoGenTarget}
                      onChange={(e) => setPhotoGenTarget(e.target.value)}
                    >
                      <option value="profile">Profile media pool + default</option>
                      <option value="scheduler">Photo scheduler list</option>
                      <option value="bulk">Bulk drafts media</option>
                    </select>
                  </div>
                </div>
                <div className="muted small">
                  Prompt uses profile name, city, neighbourhoods, service
                  topics, keywords, and categories for local SEO context.
                </div>
                {photoGenResults.length ? (
                  <div className="generated-photo-grid">
                    {photoGenResults.map((item, idx) => (
                      <button
                        type="button"
                        className="generated-photo-card"
                        key={`${item.url}-${idx}`}
                        onClick={() => setMediaUrl(item.url)}
                        title="Use as current default photo"
                      >
                        <img
                          src={resolveMediaPreviewUrl(item.url, backendBase)}
                          alt="Generated themed media"
                        />
                        <span>{item.model || "AI"} - Use as default</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="panel">
                <div className="profiles-panel-header">
                  <div>
                    <div className="panel-title">AI media for post scheduler</div>
                    <p className="muted small">
                      Generate a thematic photo for the current post, then
                      schedule or publish it with the post copy.
                    </p>
                  </div>
                  <button
                    className="btn btn--blue btn--small"
                    type="button"
                    onClick={() => generateThematicPhotos("post")}
                    disabled={!selectedProfile || photoGenBusy}
                  >
                    {photoGenBusy ? "Generating..." : "Generate for post"}
                  </button>
                </div>
                <div className="photo-generator-grid">
                  <div>
                    <label className="field-label">Theme / service</label>
                    <input
                      value={photoGenTheme}
                      onChange={(e) => setPhotoGenTheme(e.target.value)}
                      placeholder="drywall ceiling repair finished result"
                    />
                  </div>
                  <div>
                    <label className="field-label">How many</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={photoGenCount}
                      onChange={(e) => setPhotoGenCount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Quality</label>
                    <select
                      value={photoGenQuality}
                      onChange={(e) => setPhotoGenQuality(e.target.value)}
                    >
                      <option value="high">High detail</option>
                      <option value="medium">Balanced</option>
                      <option value="low">Fast / lower cost</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Shape</label>
                    <select
                      value={photoGenSize}
                      onChange={(e) => setPhotoGenSize(e.target.value)}
                    >
                      <option value="1536x1024">Landscape project photo</option>
                      <option value="1024x1024">Square profile photo</option>
                      <option value="1024x1536">Portrait story photo</option>
                    </select>
                  </div>
                </div>
                <div className="action-row" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => generateThematicPhotos("bulk")}
                    disabled={!selectedProfile || photoGenBusy}
                  >
                    Generate to bulk drafts
                  </button>
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => generateThematicPhotos("scheduler")}
                    disabled={!selectedProfile || photoGenBusy}
                  >
                    Generate to photo scheduler
                  </button>
                  <span className="muted small">
                    Current post media: {mediaUrl ? "selected" : "none"}
                  </span>
                </div>
                {photoGenResults.length ? (
                  <div className="generated-photo-grid">
                    {photoGenResults.map((item, idx) => (
                      <button
                        type="button"
                        className="generated-photo-card"
                        key={`${item.url}-${idx}`}
                        onClick={() => setMediaUrl(item.url)}
                        title="Use as current post media"
                      >
                        <img
                          src={resolveMediaPreviewUrl(item.url, backendBase)}
                          alt="Generated post scheduler media"
                        />
                        <span>{item.model || "AI"} - Use for post</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              <SchedulePanel
                panelRef={generateRef}
                onPreview={doPreview}
                previewing={previewing}
                onPostNow={doPostNow}
                posting={posting}
                postNowStatus={postNowStatus}
                busy={busy}
                onPostAll={doPostNowAll}
                onClear={clearPostComposer}
                scheduleDate={scheduleDate}
                onChangeScheduleDate={setScheduleDate}
                scheduleTime={scheduleTime}
                onChangeScheduleTime={setScheduleTime}
                onSchedule={schedulePost}
                scheduleStatus={scheduleStatus}
                autoCadenceDays={autoCadenceDays}
                onChangeAutoCadence={setAutoCadenceDays}
                onAutoScheduleWithAi={autoScheduleWithAi}
                bulkBusy={bulkBusy}
                postType={postType}
                onChangePostType={setPostType}
                postTypes={POST_TYPES}
                eventTitle={eventTitle}
                onChangeEventTitle={setEventTitle}
                eventStart={eventStart}
                onChangeEventStart={setEventStart}
                eventEnd={eventEnd}
                onChangeEventEnd={setEventEnd}
                offerTitle={offerTitle}
                onChangeOfferTitle={setOfferTitle}
                offerCoupon={offerCoupon}
                onChangeOfferCoupon={setOfferCoupon}
                offerRedeemUrl={offerRedeemUrl}
                onChangeOfferRedeemUrl={setOfferRedeemUrl}
                postText={postText}
                onChangePostText={setPostText}
                preview={preview}
                serviceTopics={serviceTopics}
                serviceTopicId={composerServiceTopicId}
                defaultServiceTopicId={defaultServiceTopicId}
                onChangeServiceTopicId={setComposerServiceTopicId}
              />

              <section className="panel">
                <div className="panel-title">Last generated preview</div>
                <div className="panel-section preview-shell">
                  {postText || preview ? (
                    <PostPreview
                      profileName={previewProfileName}
                      profileCity={previewProfileCity}
                      focusArea={previewFocusArea}
                      badgeLabel={getPostTypeLabel(postType)}
                      warning={previewWarning}
                      bodyText={previewBodyText}
                      ctaLabel={CTA_LABELS[cta] || "CTA button"}
                      ctaHref={previewCtaHref}
                      ctaDisabled={!previewCtaHref}
                      metaRows={previewMetaRows}
                      mediaUrl={previewMediaPreviewUrl}
                      overlayUrl={previewOverlayPreviewUrl}
                      onMediaClick={handlePreviewMediaClick}
                      footerText={previewFooterText}
                    />
                  ) : (
                    <div className="muted small">
                      No preview yet. Click "Generate preview" to see AI output.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {tab === "scheduler" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Scheduler status</div>
                <div className="panel-section stats-grid">
                  <div>
                    <div className="muted small">Enabled</div>
                    <strong>
                      {schedStatus && schedStatus.enabled ? "Yes" : "No"}
                    </strong>
                  </div>
                  <div>
                    <div className="muted small">Default time</div>
                    <strong>
                      {(schedStatus && schedStatus.defaultTime) || "10:00"}
                    </strong>
                  </div>
                  <div>
                    <div className="muted small">Tick</div>
                    <strong>
                      {(schedStatus && schedStatus.tickSeconds) || 30}s
                    </strong>
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
                      <label className="field-label">
                        Default time (HH:MM)
                      </label>
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
                    <button
                      className="btn btn--green"
                      disabled={busy}
                      type="submit"
                    >
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

          {tab === "photo-scheduler" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Schedule photo uploads</div>
                <div className="panel-section diag-card">
                  <div className="panel-subsection__header">
                    <div>
                      <div className="field-label">AI photo generator</div>
                      <div className="muted small">
                        Create local SEO-themed project photos and send them
                        straight into this scheduler.
                      </div>
                    </div>
                    <button
                      className="btn btn--blue btn--small"
                      type="button"
                      onClick={() => generateThematicPhotos("scheduler")}
                      disabled={!selectedProfile || photoGenBusy}
                    >
                      {photoGenBusy ? "Generating..." : "Generate for scheduler"}
                    </button>
                  </div>
                  <div className="photo-generator-grid">
                    <div>
                      <label className="field-label">Theme / service</label>
                      <input
                        value={photoGenTheme}
                        onChange={(e) => setPhotoGenTheme(e.target.value)}
                        placeholder="Mississauga popcorn ceiling removal"
                      />
                    </div>
                    <div>
                      <label className="field-label">How many</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={photoGenCount}
                        onChange={(e) => setPhotoGenCount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Quality</label>
                      <select
                        value={photoGenQuality}
                        onChange={(e) => setPhotoGenQuality(e.target.value)}
                      >
                        <option value="high">High detail</option>
                        <option value="medium">Balanced</option>
                        <option value="low">Fast / lower cost</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Shape</label>
                      <select
                        value={photoGenSize}
                        onChange={(e) => setPhotoGenSize(e.target.value)}
                      >
                        <option value="1536x1024">Landscape project photo</option>
                        <option value="1024x1024">Square profile photo</option>
                        <option value="1024x1536">Portrait story photo</option>
                      </select>
                    </div>
                  </div>
                  <div className="action-row" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => generateThematicPhotos("profile")}
                      disabled={!selectedProfile || photoGenBusy}
                    >
                      Generate to profile media
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => generateThematicPhotos("bulk")}
                      disabled={!selectedProfile || photoGenBusy}
                    >
                      Generate to bulk drafts
                    </button>
                    <span className="muted small">
                      Uses profile city, neighbourhoods, service keywords, and
                      categories.
                    </span>
                  </div>
                  {photoGenResults.length ? (
                    <div className="generated-photo-grid">
                      {photoGenResults.map((item, idx) => (
                        <button
                          type="button"
                          className="generated-photo-card"
                          key={`${item.url}-${idx}`}
                          onClick={() => {
                            setPhotoSchedMedia(item.url);
                            setPhotoSchedMediaList((prev) =>
                              Array.from(new Set([item.url, ...prev])).slice(
                                0,
                                100
                              )
                            );
                          }}
                          title="Use in photo scheduler"
                        >
                          <img
                            src={resolveMediaPreviewUrl(item.url, backendBase)}
                            alt="Generated scheduler media"
                          />
                          <span>{item.model || "AI"} - Use in scheduler</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!photoPreviewMedia ? (
                  <div className="panel-section">
                    <div className="panel-subsection__header">
                      <div>
                        <div className="field-label">Latest GBP photos</div>
                        <div className="muted small">
                          Check what Google currently returns for this profile.
                        </div>
                      </div>
                      <div className="action-row">
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={fetchLatestPhotos}
                          disabled={!selectedProfile || latestPhotosLoading}
                        >
                          {latestPhotosLoading
                            ? "Loading..."
                            : "View latest photos"}
                        </button>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={fetchLatestPhotosDebug}
                          disabled={
                            !selectedProfile || latestPhotosDebugLoading
                          }
                        >
                          {latestPhotosDebugLoading
                            ? "Loading..."
                            : "Diagnostics"}
                        </button>
                      </div>
                    </div>
                    {latestPhotos.length > 0 ? (
                      <div className="media-strip">
                        {latestPhotos.slice(0, 8).map((item, idx) => (
                          <div
                            key={item.name || idx}
                            className="media-strip__item"
                          >
                            <img
                              src={
                                item.thumbnailUrl ||
                                item.googleUrl ||
                                (item.mediaFormat === "PHOTO" &&
                                  item.sourceUrl) ||
                                ""
                              }
                              alt={item.description || item.name || ""}
                              style={{
                                width: 140,
                                height: 140,
                                objectFit: "cover",
                                borderRadius: 6,
                              }}
                            />
                            <div className="muted small">
                              {item.createTime
                                ? new Date(item.createTime).toLocaleString()
                                : "No date"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted small">
                        No latest photos loaded yet.
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="panel-section">
                  <label className="field-label">Photo URL</label>
                  <input
                    value={photoSchedMedia}
                    onChange={(e) => setPhotoSchedMedia(e.target.value)}
                    placeholder="/uploads/photo.jpg or https://..."
                  />
                  <p className="muted small">
                    You can add up to 100 photos: pick multiple in the gallery
                    or paste them below.
                  </p>
                  <div className="action-row">
                    <label className="btn btn--ghost btn--small upload-btn">
                      Upload with EXIF
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSchedulerPhotoUpload}
                        disabled={uploadingPhoto || !backendBase}
                      />
                    </label>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => {
                        const val = photoSchedMedia.trim();
                        if (!val) return;
                        setPhotoSchedMediaList((prev) =>
                          prev.includes(val)
                            ? prev
                            : [...prev, val].slice(0, 100)
                        );
                        setPhotoSchedMedia("");
                      }}
                    >
                      Add to list
                    </button>
                    <span className="muted small">
                      {photoSchedMediaList.length} in list
                    </span>
                  </div>
                  {photoSchedMediaList.length > 0 && (
                    <div className="chip-list">
                      {photoSchedMediaList.map((url, idx) => (
                        <div className="chip" key={idx}>
                          <span className="chip-label">{url}</span>
                          <button
                            type="button"
                            className="chip-remove"
                            onClick={() =>
                              setPhotoSchedMediaList((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="action-row">
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={async () => {
                        if (!uploadsInfo) {
                          await loadUploadsInfo();
                        }
                        setMediaGalleryContext("photo-scheduler");
                        setMediaGalleryOpen(true);
                      }}
                    >
                      Browse gallery
                    </button>
                    <span className="muted small">
                      Pick an uploaded image (auto geo-tagged on upload).
                    </span>
                  </div>
                </div>
                <div className="panel-section">
                  <label className="field-label">Caption (optional)</label>
                  <textarea
                    value={photoSchedCaption}
                    onChange={(e) => setPhotoSchedCaption(e.target.value)}
                    placeholder="Optional text to accompany the photo"
                  />
                </div>
                <div className="panel-section">
                  <label className="field-label">GBP photo category</label>
                  <select
                    value={photoCategory}
                    onChange={(e) => setPhotoCategory(e.target.value)}
                  >
                    {PHOTO_CATEGORY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="muted small">
                    Photo uploads appear in the Business Profile photo library,
                    not in Updates/Posts. Google may take a few minutes to
                    review and show them publicly.
                  </p>
                </div>
                <div className="panel-section">
                  <div className="panel-subsection__header">
                    <span className="field-label">
                      Photo metadata (used for EXIF & scheduling)
                    </span>
                    <span className="muted small">
                      Auto-randomizes neighbourhood + coordinates per photo if
                      enabled below.
                    </span>
                  </div>
                  <div className="section-grid">
                    <div className="section">
                      <label className="field-label">City (override)</label>
                      <input
                        value={photoCity}
                        onChange={(e) => setPhotoCity(e.target.value)}
                        placeholder={selectedProfile?.city || "Calgary"}
                      />
                    </div>
                    <div className="section">
                      <label className="field-label">Latitude</label>
                      <input
                        value={photoLat}
                        onChange={(e) => setPhotoLat(e.target.value)}
                        placeholder="51.0447"
                      />
                    </div>
                    <div className="section">
                      <label className="field-label">Longitude</label>
                      <input
                        value={photoLng}
                        onChange={(e) => setPhotoLng(e.target.value)}
                        placeholder="-114.0719"
                      />
                    </div>
                  </div>
                  <div className="section-grid">
                    <div className="section">
                      <label className="field-label">
                        Neighbourhood (fallback)
                      </label>
                      <input
                        value={photoNeighbourhood}
                        onChange={(e) => setPhotoNeighbourhood(e.target.value)}
                        placeholder="Kensington"
                      />
                    </div>
                    <div className="section">
                      <label className="field-label">
                        Neighbourhood list (random pick)
                      </label>
                      <textarea
                        value={photoNeighbourhoodsInput}
                        onChange={(e) =>
                          setPhotoNeighbourhoodsInput(e.target.value)
                        }
                        placeholder="Kensington\nMount Pleasant\nDowntown"
                        rows={3}
                      />
                      <div className="action-row" style={{ marginTop: 4 }}>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() => {
                            const city =
                              photoCity || selectedProfile?.city || "";
                            if (!city) {
                              notify("Set a city first.");
                              return;
                            }
                            generateNeighbourhoods(city);
                          }}
                        >
                          {neighbourhoodsLoading
                            ? "Loading..."
                            : "Generate from map"}
                        </button>
                        <span className="muted small">
                          Pulls neighbourhoods/streets near the city and your
                          lat/lng (30km filter).
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="section-grid">
                    <div className="section">
                      <label className="field-label">Service keywords</label>
                      <input
                        value={photoKeywords}
                        onChange={(e) => setPhotoKeywords(e.target.value)}
                        placeholder="popcorn ceiling removal, drywall repair"
                      />
                    </div>
                    <div className="section">
                      <label className="field-label">Category keywords</label>
                      <input
                        value={photoCategories}
                        onChange={(e) => setPhotoCategories(e.target.value)}
                        placeholder="painting contractor, drywall finishing"
                      />
                      <label
                        className="checkbox-inline"
                        style={{ marginTop: 6 }}
                      >
                        <input
                          type="checkbox"
                          checked={photoRandomizeKeywords}
                          onChange={(e) =>
                            setPhotoRandomizeKeywords(e.target.checked)
                          }
                        />
                        Randomize keywords per photo
                      </label>
                    </div>
                    <div className="section">
                      <label className="field-label">
                        Jitter radius (meters)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={photoRandomizeRadius}
                        onChange={(e) =>
                          setPhotoRandomizeRadius(Number(e.target.value))
                        }
                        placeholder="200"
                      />
                      <label
                        className="checkbox-inline"
                        style={{ marginTop: 6 }}
                      >
                        <input
                          type="checkbox"
                          checked={photoRandomizeCoords}
                          onChange={(e) =>
                            setPhotoRandomizeCoords(e.target.checked)
                          }
                        />
                        Auto-randomize coordinates
                      </label>
                      <label className="field-label" style={{ marginTop: 10 }}>
                        Neighbourhood search radius (km)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={photoSearchRadius}
                        onChange={(e) =>
                          setPhotoSearchRadius(Number(e.target.value) || 20)
                        }
                        placeholder="20"
                      />
                      <div className="muted small">
                        Higher radius pulls more GTA areas; lower radius keeps
                        it local.
                      </div>
                    </div>
                  </div>
                  <div className="section-grid" style={{ alignItems: "start" }}>
                    <div>
                      <div className="muted small">City</div>
                      <strong>
                        {photoMetaSample?.city ||
                          photoCity ||
                          selectedProfile?.city ||
                          "—"}
                      </strong>
                    </div>
                    <div>
                      <div className="muted small">Neighbourhood (next)</div>
                      <strong>
                        {photoMetaSample?.neighbourhood ||
                          photoNeighbourhood ||
                          photoNeighbourhoodOptions[0] ||
                          "—"}
                      </strong>
                    </div>
                    <div>
                      <div className="muted small">Base coords</div>
                      <strong>
                        {(photoLat || "—") + ", " + (photoLng || "—")}
                      </strong>
                      <div className="muted small">
                        {photoRandomizeCoords
                          ? `Jitter on (${photoRandomizeRadius}m)`
                          : "Jitter off"}
                      </div>
                    </div>
                    <div>
                      <div className="muted small">GPS (next)</div>
                      <strong>
                        {photoMetaSample
                          ? `${photoMetaSample.lat || "—"}, ${
                              photoMetaSample.lng || "—"
                            }`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <div className="muted small">Neighbourhood pool</div>
                      <div className="muted small" style={{ maxWidth: 220 }}>
                        {neighbourhoodOptionsDetailed.length
                          ? neighbourhoodOptionsDetailed
                              .map((n) => n.name)
                              .join(", ")
                          : "None set. Using fallback above."}
                      </div>
                    </div>
                  </div>
                  <div className="section-grid">
                    <div className="section">
                      <label className="field-label">
                        Pick neighbourhood (sets coords)
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const found = neighbourhoodOptionsDetailed.find(
                            (n) => n.name === v
                          );
                          setPhotoNeighbourhood(v);
                          if (found && found.lat != null && found.lng != null) {
                            setPhotoLat(String(found.lat));
                            setPhotoLng(String(found.lng));
                            setPhotoRandomizeCoords(true);
                            logGeo("Neighbourhood selected", found);
                          } else {
                            logGeo("Neighbourhood selected (no coords)", {
                              name: v,
                            });
                          }
                          refreshPhotoMetaSample();
                        }}
                      >
                        <option value="">Select...</option>
                        {neighbourhoodOptionsDetailed.map((opt, idx) => (
                          <option key={idx} value={opt.name}>
                            {opt.name}
                            {opt.lat != null && opt.lng != null
                              ? ` (${opt.lat.toFixed(4)}, ${opt.lng.toFixed(
                                  4
                                )})`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <div className="muted small">
                        Selecting applies the neighbourhood and sets base coords
                        (if present), ready for posting.
                      </div>
                    </div>
                  </div>
                  <div className="panel-subsection" style={{ marginTop: 12 }}>
                    <div className="panel-subsection__header">
                      <span className="field-label">
                        Jitter preview (next 3)
                      </span>
                      <span className="muted small">
                        Shows how coords and neighbourhood rotate for SEO.
                      </span>
                    </div>
                    <div className="media-preview" style={{ marginBottom: 12 }}>
                      <div
                        className="media-preview-thumb"
                        style={{
                          width: "100%",
                          maxWidth: 820,
                          minHeight: 320,
                          background: "#f5f5f5",
                          border: "1px solid #e0e0e0",
                          borderRadius: 6,
                          overflow: "hidden",
                          cursor: "crosshair",
                        }}
                        onClick={(e) => {
                          const bounds = mapBoundsRef.current;
                          if (!bounds) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          const lng =
                            bounds.west +
                            (x / rect.width) * (bounds.east - bounds.west);
                          const lat =
                            bounds.north -
                            (y / rect.height) * (bounds.north - bounds.south);
                          setPhotoLat(lat.toFixed(6));
                          setPhotoLng(lng.toFixed(6));
                          setPhotoRandomizeCoords(true);
                          refreshPhotoMetaSample();
                          logGeo("Set coords from map click", { lat, lng });
                        }}
                      >
                        {mapEmbedUrl ? (
                          <iframe
                            title="Map preview"
                            src={mapEmbedUrl}
                            style={{
                              width: "100%",
                              height: 420,
                              border: "none",
                            }}
                            loading="lazy"
                          />
                        ) : mapPreviewUrl ? (
                          <img
                            src={mapPreviewUrl}
                            alt="Map preview"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            className="muted small"
                            style={{ padding: 20, textAlign: "center" }}
                          >
                            Set city and coords to see map.
                          </div>
                        )}
                      </div>
                      <div className="muted small">
                        Map centers on the current base coords; click on the map
                        to set lat/lng. Jitter will vary around this point.
                      </div>
                    </div>
                    {geoTestSamples.length ? (
                      <div
                        className="muted small"
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {geoTestSamples.map((s, idx) => (
                          <div key={idx} className="diag-card">
                            <div>
                              <strong>{s.city || "—"}</strong>
                            </div>
                            <div>{s.neighbourhood || "—"}</div>
                            <div>
                              {s.lat || "—"}, {s.lng || "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted small">No samples yet.</div>
                    )}
                  </div>
                  <div className="action-row" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={refreshPhotoMetaSample}
                    >
                      Refresh random pick
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => refreshGeoSamples(3)}
                    >
                      Preview jitter
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => {
                        if (!photoLat || !photoLng) {
                          notify("Set base lat/lng before testing jitter.");
                          return;
                        }
                        const samples = [];
                        for (let i = 0; i < 5; i++) {
                          samples.push(
                            randomizeCoords(
                              photoLat,
                              photoLng,
                              photoRandomizeRadius
                            )
                          );
                        }
                        logGeo("Jitter coords test", samples);
                      }}
                    >
                      Log jitter coords
                    </button>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) {
                          setPhotoNeighbourhood(v);
                          setPhotoRandomizeCoords(false);
                          refreshPhotoMetaSample();
                        }
                      }}
                    >
                      <option value="">Manual neighbourhood</option>
                      {photoNeighbourhoodOptions.map((opt, idx) => (
                        <option key={idx} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => {
                        if (!photoNeighbourhoodOptions.length) {
                          notify("Add neighbourhoods above to pick randomly.");
                          return;
                        }
                        setPhotoNeighbourhood(
                          randomNeighbourhood(
                            photoNeighbourhoodOptions,
                            photoNeighbourhood
                          )
                        );
                        refreshPhotoMetaSample();
                      }}
                      disabled={!photoNeighbourhoodOptions.length}
                    >
                      Random from list
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={shufflePhotoLocation}
                    >
                      Shuffle coords now
                    </button>
                    <button
                      className="btn btn--indigo btn--small"
                      type="button"
                      onClick={savePhotoMetaDefaults}
                      disabled={!selectedProfile || savingPhotoMeta}
                    >
                      {savingPhotoMeta ? "Saving..." : "Save EXIF defaults"}
                    </button>
                  </div>
                  <p className="muted small">
                    City/lat/lng, neighbourhoods, and keywords live here. Save
                    defaults to keep them tied to the profile; scheduler will
                    stamp EXIF automatically.
                  </p>
                </div>
                <div className="panel-section two-col">
                  <label className="field-label">Start date</label>
                  <input
                    type="date"
                    value={photoSchedDate}
                    onChange={(e) => setPhotoSchedDate(e.target.value)}
                  />
                  <label className="field-label">Start time</label>
                  <input
                    type="time"
                    value={photoSchedTime}
                    onChange={(e) => setPhotoSchedTime(e.target.value)}
                  />
                </div>
                <div className="panel-section diag-shell">
                  <div className="panel-subsection__header">
                    <span className="field-label">Geo logs (latest first)</span>
                    <span className="muted small">
                      Up to 30 entries; also in console with [geo].
                    </span>
                  </div>
                  {geoLogs.length ? (
                    <ul
                      className="muted small"
                      style={{ maxHeight: 220, overflowY: "auto" }}
                    >
                      {geoLogs.map((l, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            <strong>
                              {new Date(l.ts).toLocaleTimeString()}
                            </strong>{" "}
                            — {l.msg}
                          </div>
                          {l.data ? (
                            <div style={{ fontSize: "0.9em", opacity: 0.8 }}>
                              {JSON.stringify(l.data)}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="muted small">No geo logs yet.</div>
                  )}
                </div>
                <div className="panel-section two-col">
                  <label className="field-label">Cadence</label>
                  <select
                    value={photoSchedCadence}
                    onChange={(e) => setPhotoSchedCadence(e.target.value)}
                  >
                    <option value="DAILY1">Daily</option>
                    <option value="DAILY2">Every 2 days</option>
                    <option value="DAILY3">Every 3 days</option>
                  </select>
                  <label className="field-label">Count</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={photoSchedCount}
                    onChange={(e) => setPhotoSchedCount(e.target.value)}
                  />
                </div>
                <div className="panel-section">
                  <button
                    className="btn btn--green"
                    type="button"
                    onClick={schedulePhotosBulk}
                    disabled={!selectedProfile || schedulingBusy}
                  >
                    {photoSchedulerStatus === "saving" ||
                    photoSchedulerStatus === "stamping"
                      ? "Working..."
                      : schedulingBusy
                      ? "Working..."
                      : "Schedule photos"}
                  </button>
                  <button
                    className="btn btn--indigo"
                    type="button"
                    onClick={postPhotoNow}
                    disabled={!selectedProfile || schedulingBusy}
                    style={{ marginLeft: 8 }}
                  >
                    {photoSchedulerStatus === "posting"
                      ? "Posting..."
                      : "Post photo now"}
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={runDuePhotoQueue}
                    disabled={schedulingBusy}
                    style={{ marginLeft: 8 }}
                  >
                    {photoSchedulerStatus === "running"
                      ? "Running queue..."
                      : "Run due photo queue"}
                  </button>
                  {editingPhotoJobId ? (
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={updateSelectedPhotoJob}
                      disabled={
                        !selectedProfile || photoSchedulerStatus === "saving"
                      }
                      style={{ marginLeft: 8 }}
                    >
                      {photoSchedulerStatus === "saving"
                        ? "Updating..."
                        : "Update selected photo"}
                    </button>
                  ) : null}
                  <p className="muted small">
                    Uses the photo metadata defaults (lat/lng, neighbourhood,
                    keywords) for EXIF stamping already embedded when the photo
                    was uploaded.
                  </p>
                </div>
                {lastPhotoPostResult ? (
                  <div className="panel-section">
                    <div className="panel-subtitle">Last accepted GBP photo</div>
                    <div className="diag-card">
                      <div className="muted small">Google media name</div>
                      <strong>{lastPhotoPostResult.name || "Accepted"}</strong>
                      {lastPhotoPostResult.categoryFallback ? (
                        <div className="muted small" style={{ marginTop: 6 }}>
                          Google rejected{" "}
                          {lastPhotoPostResult.categoryFallback.requested}; app
                          retried as {lastPhotoPostResult.categoryFallback.used}.
                        </div>
                      ) : null}
                      {lastPhotoPostResult.googleUrl ? (
                        <div style={{ marginTop: 8 }}>
                          <a
                            href={lastPhotoPostResult.googleUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Google photo URL
                          </a>
                        </div>
                      ) : null}
                      {lastPhotoPostResult.thumbnailUrl ? (
                        <div className="media-preview">
                          <div className="media-preview-thumb">
                            <img
                              src={lastPhotoPostResult.thumbnailUrl}
                              alt="Accepted GBP photo"
                            />
                          </div>
                          <div className="media-preview-meta">
                            <div className="media-preview-title">
                              Google thumbnail
                            </div>
                            <div className="muted small">
                              If this is visible here, Google accepted the media
                              item. Public listing display can lag.
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {photoPreviewMedia ? (
                  <div className="panel-section">
                    <div className="panel-subtitle">
                      Preview (next scheduled photo)
                    </div>
                    <div
                      className="post-preview__media"
                      style={{ maxWidth: 360 }}
                    >
                      <img src={photoPreviewMedia} alt="Photo preview" />
                    </div>
                    <div className="muted small" style={{ marginTop: 6 }}>
                      <div>
                        <strong>Caption:</strong> {photoPreviewCaption}
                      </div>
                      <div>
                        <strong>Coords:</strong>{" "}
                        {(photoLat || "—") + ", " + (photoLng || "—")}
                      </div>
                      <div>
                        <strong>Neighbourhood:</strong>{" "}
                        {photoNeighbourhood ||
                          photoNeighbourhoodOptions[0] ||
                          "—"}
                      </div>
                    </div>
                    <div className="action-row" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={fetchLatestPhotos}
                        disabled={!selectedProfile || latestPhotosLoading}
                      >
                        {latestPhotosLoading
                          ? "Loading GBP photos..."
                          : "View latest GBP photos"}
                      </button>
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={fetchLatestPhotosDebug}
                        disabled={!selectedProfile || latestPhotosDebugLoading}
                      >
                        {latestPhotosDebugLoading
                          ? "Diagnostics: loading..."
                          : "Diagnostics: multi-page fetch"}
                      </button>
                    </div>
                    {latestPhotos.length > 0 ? (
                      <div className="media-strip">
                        {latestPhotos.map((item, idx) => (
                          <div
                            key={item.name || idx}
                            className="media-strip__item"
                          >
                            <img
                              src={
                                item.thumbnailUrl ||
                                item.googleUrl ||
                                (item.mediaFormat === "PHOTO" &&
                                  item.sourceUrl) ||
                                ""
                              }
                              alt={item.description || item.name || ""}
                              style={{
                                width: 140,
                                height: 140,
                                objectFit: "cover",
                                borderRadius: 6,
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <div
                              className="muted small"
                              style={{ marginTop: 4 }}
                            >
                              {item.description || "—"}
                            </div>
                            <div className="muted small">
                              {item.createTime
                                ? new Date(item.createTime).toLocaleString()
                                : "No date"}
                            </div>
                            <div className="muted small">
                              {item.locationAssociation?.category || "No category"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {latestPhotosDebug.length > 0 ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="muted small">
                          Diagnostics (raw Google media, multi-page)
                        </div>
                        <div className="media-strip">
                          {latestPhotosDebug.map((item, idx) => (
                            <div
                              key={item.name || idx}
                              className="media-strip__item"
                            >
                              <img
                                src={
                                  item.thumbnailUrl ||
                                  item.googleUrl ||
                                  item.sourceUrl ||
                                  ""
                                }
                                alt={item.description || item.name || ""}
                                style={{
                                  width: 140,
                                  height: 140,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                              <div
                                className="muted small"
                                style={{ marginTop: 4 }}
                              >
                                {item.description || "—"}
                              </div>
                              <div className="muted small">
                                {item.createTime
                                  ? new Date(item.createTime).toLocaleString()
                                  : "No date"}
                              </div>
                              <div className="muted small">
                                {item.locationAssociation?.category ||
                                  "No category"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {photoSelectionPreview.length > 1 ? (
                  <div className="panel-section">
                    <div className="panel-subtitle">
                      Selected photos (with randomized coords)
                    </div>
                    <div className="media-strip">
                      {photoSelectionPreview.map((item, idx) => (
                        <div key={idx} className="media-strip__item">
                          <img
                            src={resolveMediaPreviewUrl(
                              item.media,
                              backendBase
                            )}
                            alt={item.meta?.neighbourhood || ""}
                            style={{
                              width: 140,
                              height: 140,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <div className="muted small" style={{ marginTop: 4 }}>
                            {item.caption}
                          </div>
                          <div className="muted small">
                            {item.meta?.neighbourhood || "—"} ·{" "}
                            {item.meta?.city || "—"}
                          </div>
                          <div className="muted small">
                            {item.meta?.lat || "—"}, {item.meta?.lng || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="muted small">
                      Coords/neighbourhoods are randomized per photo; scheduling
                      will use these values when stamping EXIF.
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="panel">
                <div className="panel-title">Queued photo jobs</div>
                <div className="panel-section diag-shell">
                  {photoJobsLoading ? (
                    <div className="muted small">Loading…</div>
                  ) : photoJobs.length === 0 ? (
                    <div className="muted small">No scheduled photos.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Profile</th>
                          <th>Media</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {photoJobs.map((it) => (
                          <tr key={it.id}>
                            <td>{new Date(it.runAt).toLocaleString()}</td>
                            <td>
                              {selectedProfile?.businessName || it.profileId}
                            </td>
                            <td className="muted small">
                              {it.body?.mediaUrl || "—"}
                            </td>
                            <td className="muted small">
                              {it.body?.meta?.city ||
                              it.body?.meta?.neighbourhood
                                ? `${it.body?.meta?.city || ""}${
                                    it.body?.meta?.city &&
                                    it.body?.meta?.neighbourhood
                                      ? " · "
                                      : ""
                                  }${it.body?.meta?.neighbourhood || ""}`
                                : "—"}
                            </td>
                            <td className="muted small">
                              {it.status || "QUEUED"}
                              {it.postedAt ? (
                                <div className="muted small">
                                  {new Date(it.postedAt).toLocaleString()}
                                </div>
                              ) : null}
                              {it.lastError ? (
                                <div
                                  className="error-text small"
                                  title={it.lastError}
                                >
                                  {String(it.lastError).slice(0, 60)}
                                  {String(it.lastError).length > 60 ? "…" : ""}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => deletePhotoJob(it.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {photoJobsHistory.length > 0 && (
                  <div className="panel-section diag-shell">
                    <div className="panel-subtitle">Photo history</div>
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Status</th>
                          <th>Profile</th>
                          <th>Location</th>
                          <th>Media</th>
                        </tr>
                      </thead>
                      <tbody>
                        {photoJobsHistory.map((it) => (
                          <tr key={it.id}>
                            <td>{new Date(it.runAt).toLocaleString()}</td>
                            <td className="muted small">
                              {it.status || "QUEUED"}
                              {it.postedAt ? (
                                <div className="muted small">
                                  {new Date(it.postedAt).toLocaleString()}
                                </div>
                              ) : null}
                              {it.lastError ? (
                                <div
                                  className="error-text small"
                                  title={it.lastError}
                                >
                                  {String(it.lastError).slice(0, 60)}
                                  {String(it.lastError).length > 60 ? "…" : ""}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {selectedProfile?.businessName || it.profileId}
                            </td>
                            <td className="muted small">
                              {it.body?.meta?.city ||
                              it.body?.meta?.neighbourhood
                                ? `${it.body?.meta?.city || ""}${
                                    it.body?.meta?.city &&
                                    it.body?.meta?.neighbourhood
                                      ? " · "
                                      : ""
                                  }${it.body?.meta?.neighbourhood || ""}`
                                : "—"}
                            </td>
                            <td className="muted small">
                              {it.body?.mediaUrl || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {photoJobs.length > 0 && (
                  <div className="panel-section">
                    <div className="panel-subtitle">Scheduled calendar</div>
                    <PhotoScheduleCalendar
                      jobs={photoJobs}
                      onSelectJob={(job) => {
                        if (!job) return;
                        setEditingPhotoJobId(job.id);
                        setPhotoSchedMedia(job.body?.mediaUrl || "");
                        setPhotoSchedMediaList(
                          job.body?.mediaUrl ? [job.body.mediaUrl] : []
                        );
                        setPhotoSchedCaption(job.body?.caption || "");
                        setPhotoSchedDate(job.runAt.slice(0, 10));
                        setPhotoSchedTime(job.runAt.slice(11, 16));
                        const meta = job.body?.meta || {};
                        if (meta.lat) setPhotoLat(String(meta.lat));
                        if (meta.lng) setPhotoLng(String(meta.lng));
                        if (meta.city) setPhotoCity(String(meta.city));
                        if (meta.neighbourhood)
                          setPhotoNeighbourhood(String(meta.neighbourhood));
                        notify(
                          "Loaded scheduled photo. Adjust fields and click Update selected photo."
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "performance" && (
            <section className="performance-page">
              <div className="panel performance-toolbar">
                <div>
                  <div className="panel-title">GBP performance</div>
                  <p className="muted small">
                    Daily profile metrics from Google Business Profile
                    Performance API for {selectedProfile?.businessName || "the selected profile"}.
                  </p>
                </div>
                <div className="action-row">
                  <label className="field-label">
                    Daily range
                  </label>
                  <select
                    value={performanceDays}
                    onChange={(e) => setPerformanceDays(Number(e.target.value))}
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                  <label className="field-label">
                    Keywords from
                  </label>
                  <input
                    type="month"
                    value={performanceMonthStart}
                    onChange={(e) => setPerformanceMonthStart(e.target.value)}
                  />
                  <label className="field-label">
                    to
                  </label>
                  <input
                    type="month"
                    value={performanceMonthEnd}
                    onChange={(e) => setPerformanceMonthEnd(e.target.value)}
                  />
                  <button
                    className="btn btn--blue"
                    type="button"
                    onClick={loadPerformance}
                    disabled={!selectedId || performanceLoading}
                  >
                    {performanceLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="performance-kpi-grid">
                <div className="metric-card">
                  <span>Total views</span>
                  <strong>
                    {performanceViews.toLocaleString()}
                  </strong>
                  <small>{performance?.startDate || "—"} to {performance?.endDate || "—"}</small>
                </div>
                <div className="metric-card">
                  <span>Calls</span>
                  <strong>{metricTotal(performance, "CALL_CLICKS").toLocaleString()}</strong>
                  <small>Call button clicks</small>
                </div>
                <div className="metric-card">
                  <span>Website</span>
                  <strong>{metricTotal(performance, "WEBSITE_CLICKS").toLocaleString()}</strong>
                  <small>Website clicks</small>
                </div>
                <div className="metric-card">
                  <span>Directions</span>
                  <strong>{metricTotal(performance, "BUSINESS_DIRECTION_REQUESTS").toLocaleString()}</strong>
                  <small>Direction requests</small>
                </div>
              </div>

              <section className="performance-detail-grid">
                <div className="panel">
                  <div className="panel-title">Business analysis</div>
                  <div className="analysis-grid">
                    <div>
                      <span className="muted small">Action rate</span>
                      <strong>
                        {performanceViews
                          ? ((performanceActions / performanceViews) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </strong>
                    </div>
                    <div>
                      <span className="muted small">Calls per 1k views</span>
                      <strong>
                        {performanceViews
                          ? ((performanceCalls / performanceViews) * 1000).toFixed(1)
                          : "0.0"}
                      </strong>
                    </div>
                    <div>
                      <span className="muted small">Website per 1k views</span>
                      <strong>
                        {performanceViews
                          ? ((performanceWebsite / performanceViews) * 1000).toFixed(1)
                          : "0.0"}
                      </strong>
                    </div>
                    <div>
                      <span className="muted small">Best channel</span>
                      <strong>
                        {performanceSearchViews >= performanceMapsViews
                          ? "Search"
                          : "Maps"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Action suggestions</div>
                  <div className="suggestion-list">
                    {performanceSuggestions.map((item) => (
                      <div className="suggestion-card" key={item.title}>
                        <span>{item.priority}</span>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">How people found you</div>
                  <div className="performance-bars">
                    {[
                      ["Google Search", performanceSearchViews],
                      ["Google Maps", performanceMapsViews],
                      ["Mobile", performanceMobileViews],
                      ["Desktop", performanceDesktopViews],
                    ].map(([label, value]) => (
                      <div className="performance-bar-row" key={label}>
                        <div>
                          <strong>{label}</strong>
                          <span>{Number(value || 0).toLocaleString()} views</span>
                        </div>
                        <div className="performance-bar-track">
                          <span
                            style={{
                              width: percentOf(Number(value || 0), performanceViews),
                            }}
                          />
                        </div>
                        <small>{percentOf(Number(value || 0), performanceViews)}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Customer actions</div>
                  <div className="action-metric-grid">
                    {ACTION_METRICS.map((metric) => (
                      <div className="action-metric" key={metric}>
                        <span>{formatMetricName(metric)}</span>
                        <strong>{metricTotal(performance, metric).toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="muted small">
                    Action rate: {performanceViews
                      ? ((performanceActions / performanceViews) * 100).toFixed(1)
                      : "0.0"}% of profile views.
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Trend</div>
                  <div className="trend-grid">
                    <div>
                      <span className="muted small">Views, first half</span>
                      <strong>{viewTrend.first.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="muted small">Views, second half</span>
                      <strong>{viewTrend.second.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="muted small">View change</span>
                      <strong>{viewTrend.change.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span className="muted small">Action change</span>
                      <strong>{actionTrend.change.toFixed(1)}%</strong>
                    </div>
                  </div>
                  <div className="daily-chart">
                    {performanceRows.slice(-30).map((row) => (
                      <span
                        key={row.date}
                        title={`${row.date}: ${row.views} views, ${row.actions} actions`}
                        style={{
                          height: `${Math.max(8, Math.round((row.views / maxDailyViews) * 90))}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Search terms</div>
                  <p className="muted small">
                    Monthly keywords from Google Search and Maps, {performance?.keywords?.startMonth || "—"} to {performance?.keywords?.endMonth || "—"}.
                  </p>
                  {performance?.keywordError ? (
                    <div className="error-text small">{performance.keywordError}</div>
                  ) : null}
                  {performance?.keywords?.items?.length ? (
                    <div className="keyword-list">
                      {performance.keywords.items.slice(0, 15).map((item) => (
                        <div className="keyword-row" key={item.keyword}>
                          <span>{item.keyword}</span>
                          <strong>
                            {item.threshold ? `< ${item.threshold}` : item.value.toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted small">No keyword data returned yet.</div>
                  )}
                </div>
              </section>

              <div className="panel">
                <div className="panel-title">Detailed metric breakdown</div>
                {!performance && !performanceLoading ? (
                  <div className="muted small">Click Refresh to load performance metrics.</div>
                ) : null}
                {performanceLoading ? (
                  <div className="muted small">Loading performance from Google...</div>
                ) : null}
                {performance?.metrics?.length ? (
                  <div className="performance-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Total</th>
                          <th>Recent daily values</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performance.metrics.map((item) => (
                          <tr key={item.metric}>
                            <td>{formatMetricName(item.metric)}</td>
                            <td>{Number(item.total || 0).toLocaleString()}</td>
                            <td>
                              <div className="spark-row">
                                {(item.values || []).slice(-14).map((point, idx) => (
                                  <span
                                    key={`${item.metric}-${point.date}-${idx}`}
                                    className="spark-bar"
                                    title={`${point.date}: ${point.value}`}
                                    style={{
                                      height: `${Math.max(
                                        6,
                                        Math.min(
                                          42,
                                          (Number(point.value || 0) /
                                            Math.max(1, item.total || 1)) *
                                            180
                                        )
                                      )}px`,
                                    }}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Post history</div>
                <div className="panel-section stats-grid">
                  <div>
                    <div className="muted small">Last GBP post</div>
                    {cycleLoading ? (
                      <div className="muted small">Loading…</div>
                    ) : cycleInfo?.lastUrl ? (
                      <a
                        href={cycleInfo.lastUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {cycleInfo.lastUrl}
                      </a>
                    ) : (
                      <div className="muted small">Unknown</div>
                    )}
                  </div>
                  <div>
                    <div className="muted small">Next template</div>
                    <strong>{cycleInfo?.nextTemplate || "STANDARD"}</strong>
                  </div>
                  <div>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() => loadCycleState(selectedId)}
                      disabled={!selectedId || cycleLoading}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <PostsHistoryPanel
                  selectedProfileId={selectedId}
                  refreshToken={historyRefreshToken}
                />
              </div>
              <div className="panel">
                <div className="panel-title">Scheduled posts</div>
                <div className="panel-section diag-shell">
                  {scheduledPosts.length === 0 ? (
                    <div className="muted small">
                      No future scheduled posts for this profile.
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Profile</th>
                          <th>CTA</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledPosts.map((it) => (
                          <tr key={it.id}>
                            <td>{new Date(it.runAt).toLocaleString()}</td>
                            <td>
                              {selectedProfile?.businessName || it.profileId}
                            </td>
                            <td>{it.body?.cta || "—"}</td>
                            <td>
                              {editingScheduledId === it.id
                                ? "Editing"
                                : "Queued"}
                            </td>
                            <td>
                              <div className="action-row">
                                <button
                                  className="btn btn--ghost btn--small"
                                  type="button"
                                  onClick={() => {
                                    setEditingScheduledId(it.id);
                                    setScheduleDate(it.runAt.slice(0, 10));
                                    setScheduleTime(it.runAt.slice(11, 16));
                                    if (it.body) {
                                      setPostText(it.body.postText || "");
                                      setCta(it.body.cta || "CALL_NOW");
                                      setLinkUrl(it.body.linkUrl || "");
                                      setMediaUrl(it.body.mediaUrl || "");
                                      setComposerServiceTopicId(
                                        it.body.serviceTopicId ||
                                          defaultServiceTopicId ||
                                          ""
                                      );
                                    }
                                    if (generateRef.current) {
                                      generateRef.current.scrollIntoView({
                                        behavior: "smooth",
                                      });
                                    }
                                    notify(
                                      "Loaded scheduled post into composer. Save by updating date/time and clicking Schedule or Post now."
                                    );
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn--ghost btn--small"
                                  type="button"
                                  onClick={() => deleteScheduled(it.id)}
                                  disabled={deletingScheduledId === it.id}
                                >
                                  {deletingScheduledId === it.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="panel panel--full">
                <div className="profiles-panel-header">
                  <div>
                    <div className="panel-title">Generate media for upcoming posts</div>
                    <p className="muted small">
                      Create a batch of themed photos from post history context,
                      then send them straight into bulk drafts or the photo
                      scheduler.
                    </p>
                  </div>
                  <button
                    className="btn btn--blue btn--small"
                    type="button"
                    onClick={() => generateThematicPhotos(photoGenTarget)}
                    disabled={!selectedProfile || photoGenBusy}
                  >
                    {photoGenBusy ? "Generating..." : "Generate media"}
                  </button>
                </div>
                <div className="photo-generator-grid">
                  <div>
                    <label className="field-label">Post theme</label>
                    <input
                      value={photoGenTheme}
                      onChange={(e) => setPhotoGenTheme(e.target.value)}
                      placeholder="drywall repair progress photos"
                    />
                  </div>
                  <div>
                    <label className="field-label">Count</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={photoGenCount}
                      onChange={(e) => setPhotoGenCount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Quality</label>
                    <select
                      value={photoGenQuality}
                      onChange={(e) => setPhotoGenQuality(e.target.value)}
                    >
                      <option value="high">High detail</option>
                      <option value="medium">Balanced</option>
                      <option value="low">Fast / lower cost</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Shape</label>
                    <select
                      value={photoGenSize}
                      onChange={(e) => setPhotoGenSize(e.target.value)}
                    >
                      <option value="1536x1024">Landscape project photo</option>
                      <option value="1024x1024">Square profile photo</option>
                      <option value="1024x1536">Portrait story photo</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Destination</label>
                    <select
                      value={photoGenTarget}
                      onChange={(e) => setPhotoGenTarget(e.target.value)}
                    >
                      <option value="bulk">Bulk drafts media</option>
                      <option value="scheduler">Photo scheduler list</option>
                      <option value="profile">Profile media pool + default</option>
                    </select>
                  </div>
                </div>
                {photoGenResults.length ? (
                  <div className="generated-photo-grid">
                    {photoGenResults.map((item, idx) => (
                      <button
                        type="button"
                        className="generated-photo-card"
                        key={`${item.url}-${idx}`}
                        onClick={() => {
                          setBulkImages((prev) => [
                            buildBulkImageEntry(item.url),
                            ...prev,
                          ]);
                        }}
                        title="Add to bulk draft media"
                      >
                        <img
                          src={resolveMediaPreviewUrl(item.url, backendBase)}
                          alt="Generated post media"
                        />
                        <span>{item.model || "AI"} - Add to bulk</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="panel panel--full">
                <div className="panel-title">Bulk drafts & scheduling</div>
                <div className="panel-section">
                  <label className="field-label">Selected images</label>
                  <div className="muted small">
                    {bulkImages.length
                      ? `${bulkImages.length} image(s) selected`
                      : "Use Browse gallery to multi-select up to 50 images."}
                  </div>
                  <div className="action-row">
                    <label className="btn btn--ghost upload-btn">
                      Upload from my computer
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBulkPhotoUpload}
                        disabled={uploadingPhoto || !backendBase}
                      />
                    </label>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={async () => {
                        if (!uploadsInfo) {
                          await loadUploadsInfo();
                        }
                        setMediaGalleryContext("bulk");
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
                        ? "Pick or upload and they’ll appear here."
                        : "Resolving backend..."}
                    </span>
                  </div>
                  {bulkImages.length > 0 && (
                    <div className="bulk-selected-strip">
                      {bulkImages.slice(0, 12).map((item, idx) => (
                        <div key={idx} className="bulk-thumb">
                          <img
                            src={resolveMediaPreviewUrl(item.url, backendBase)}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                            onClick={() =>
                              setLightboxSrc(
                                resolveMediaPreviewUrl(item.url, backendBase)
                              )
                            }
                            style={{ cursor: "pointer" }}
                          />
                        </div>
                      ))}
                      {bulkImages.length > 12 && (
                        <div className="bulk-thumb bulk-thumb--more">
                          +{bulkImages.length - 12}
                        </div>
                      )}
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={() => setBulkImages([])}
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                  {bulkImages.length > 0 && (
                    <div
                      className="bulk-topic-table"
                      style={{
                        marginTop: 12,
                        maxHeight: 260,
                        overflowY: "auto",
                        border: "1px solid rgba(148,163,184,0.4)",
                        borderRadius: 12,
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {bulkImages.map((item, idx) => (
                        <div
                          key={`${item.url}-${idx}`}
                          className="bulk-topic-row"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div className="muted small">
                            #{idx + 1} ·{" "}
                            {(serviceTopicMap[item.serviceTopicId]?.label ||
                              "Default")}
                          </div>
                          <select
                            value={item.serviceTopicId || ""}
                            onChange={(e) =>
                              handleBulkImageTopicChange(idx, e.target.value)
                            }
                          >
                            <option value="">
                              Use default topic{" "}
                              {defaultServiceTopicId &&
                              serviceTopicMap[defaultServiceTopicId]
                                ? `(${serviceTopicMap[defaultServiceTopicId].label})`
                                : ""}
                            </option>
                            {serviceTopics.map((topic) => (
                              <option key={topic.id} value={topic.id}>
                                {topic.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="panel-section">
                  <label className="field-label">Cadence (days)</label>
                  <select
                    value={bulkCadenceDays}
                    onChange={(e) => setBulkCadenceDays(Number(e.target.value))}
                  >
                    <option value={1}>1 per day</option>
                    <option value={2}>1 per 2 days</option>
                    <option value={3}>1 per 3 days</option>
                  </select>
                  <label className="field-label">Duration</label>
                  <div className="action-row">
                    <select
                      value={bulkDurationPreset}
                      onChange={(e) => setBulkDurationPreset(e.target.value)}
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="all">Until images run out</option>
                      <option value="custom">Custom days</option>
                    </select>
                    {bulkDurationPreset === "custom" && (
                      <input
                        type="number"
                        min="1"
                        placeholder="Days"
                        value={bulkDurationCustom}
                        onChange={(e) => setBulkDurationCustom(e.target.value)}
                        style={{ width: 100 }}
                      />
                    )}
                  </div>
                  <label className="field-label">
                    Auto-generate text per image
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={bulkAutoGenerate}
                      onChange={(e) => setBulkAutoGenerate(e.target.checked)}
                    />
                    Enable AI text for each draft
                  </label>
                  <div className="action-row">
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={buildBulkDrafts}
                      disabled={bulkBusy || !bulkImages.length}
                    >
                      {bulkBusy ? "Working..." : "Build drafts"}
                    </button>
                    <button
                      className="btn btn--green"
                      type="button"
                      onClick={commitBulkDrafts}
                      disabled={bulkBusy || !bulkDrafts.length}
                    >
                      Schedule all drafts
                    </button>
                  </div>
                </div>
                <div className="panel-section table-shell">
                  {bulkDrafts.length === 0 ? (
                    <div className="muted small">No drafts yet.</div>
                  ) : (
                    <BulkDraftsTable
                      drafts={bulkDrafts}
                      ctaOptions={CTA_OPTIONS}
                      activeIndex={activeDraftIndex}
                      overlayUrl={overlayUrl}
                      onRunAtChange={handleDraftRunAtChange}
                      onCtaChange={handleDraftCtaChange}
                      onLinkChange={handleDraftLinkChange}
                      onMediaChange={handleDraftMediaChange}
                      onOverlayApply={handleDraftOverlayApply}
                      onOverlayClear={handleDraftOverlayClear}
                      onPreview={handleDraftPreview}
                      onRemove={handleDraftRemove}
                    />
                  )}
                </div>
                {activeBulkDraft ? (
                  <BulkDraftEditor
                    draft={activeBulkDraft}
                    draftIndex={activeDraftIndex}
                    totalDrafts={bulkDrafts.length}
                    profileName={activeDraftProfileName}
                    profileCity={activeDraftCity}
                    topicLabel={activeDraftTopicLabel}
                    ctaLabel={CTA_LABELS[activeDraftCta] || "CTA button"}
                    ctaOptions={CTA_OPTIONS}
                    linkOptions={linkOptions}
                    activeDraftBody={activeDraftBody}
                    activeDraftCta={activeDraftCta}
                    linkDisabled={activeDraftCta === "CALL_NOW"}
                    activeDraftHref={activeDraftHref}
                    metaRows={activeDraftMetaRows}
                    mediaPreviewUrl={activeDraftMediaPreviewUrl}
                    overlayPreviewUrl={activeDraftOverlayPreviewUrl}
                    overlayValue={activeDraftBody.overlayUrl || ""}
                    overlayGlobal={overlayUrl}
                    runAtValue={activeDraftRunAtValue}
                    onPrev={goToPreviousDraft}
                    onNext={goToNextDraft}
                    disablePrev={activeDraftIndex <= 0}
                    disableNext={activeDraftIndex >= bulkDrafts.length - 1}
                    onRegenerate={handleRegenerateActiveDraft}
                    regenerating={isRegeneratingActive}
                    bulkBusy={bulkBusy}
                    onBodyChange={handleActiveDraftBodyChange}
                    onRunAtChange={handleActiveDraftRunAtChange}
                    onUseSavedLink={(value) =>
                      value ? handleActiveDraftBodyChange({ linkUrl: value }) : null
                    }
                    onUseDefaultOverlay={handleActiveDraftUseDefaultOverlay}
                    onPickOverlay={handleActiveDraftPickOverlay}
                    onClearOverlay={handleActiveDraftClearOverlay}
                    serviceTopics={serviceTopics}
                    onServiceTopicChange={handleActiveDraftServiceTopicChange}
                  />
                ) : null}
              </div>
            </section>
          )}

          {tab === "diagnostics" && (
            <DiagnosticsPanels
              accounts={accounts}
              locationsByAccount={locationsByAccount}
              onLoadAccounts={loadAccountsAndLocations}
              uploadsInfo={uploadsInfo}
              uploadsCheck={uploadsCheck}
              onCheckUploads={loadUploadsInfo}
            />
          )}
        </main>

        {toast ? <div className="toast">{toast}</div> : null}

        <MediaGalleryModal
          open={mediaGalleryOpen}
          onClose={() => setMediaGalleryOpen(false)}
          uploadsInfo={uploadsInfo}
          backendBase={backendBase}
          photoMeta={
            mediaGalleryContext === "photo-scheduler" ? buildPhotoMeta : null
          }
          notify={notify}
          onSelect={(value) => {
            const overlayDraftMatch =
              typeof mediaGalleryContext === "string"
                ? mediaGalleryContext.match(/^overlay-draft-(\d+)$/)
                : null;
            if (overlayDraftMatch) {
              const draftIdx = parseInt(overlayDraftMatch[1], 10);
              if (!Number.isNaN(draftIdx)) {
                updateBulkDraftBody(draftIdx, { overlayUrl: value });
                setActiveDraftIndex(draftIdx);
                notify("Overlay assigned to draft.");
              }
            } else if (mediaGalleryContext === "overlay") {
              setOverlayUrl(value);
              notify("Overlay selected from gallery.");
            } else {
              setMediaUrl(value);
              setPhotoSchedMedia(value);
              notify("Photo selected from gallery.");
            }
            setMediaGalleryOpen(false);
          }}
          onSelectMultiple={(values) => {
            const list = Array.isArray(values) ? values : [];
            const overlayDraftMatch =
              typeof mediaGalleryContext === "string"
                ? mediaGalleryContext.match(/^overlay-draft-(\d+)$/)
                : null;
            if (overlayDraftMatch) {
              const draftIdx = parseInt(overlayDraftMatch[1], 10);
              const first = list[0] || "";
              if (!Number.isNaN(draftIdx) && first) {
                updateBulkDraftBody(draftIdx, { overlayUrl: first });
                setActiveDraftIndex(draftIdx);
                notify("Overlay assigned to draft.");
              }
            } else if (mediaGalleryContext === "overlay") {
              const first = list[0] || "";
              if (first) setOverlayUrl(first);
              notify("Overlay selected from gallery.");
            } else {
              const entries = list.slice(0, 50).map((url) => buildBulkImageEntry(url));
              setBulkImages(entries);
              setMediaUrl(list[0] || "");
              setPhotoSchedMediaList(list.slice(0, 100));
              notify(`${list.length} photo(s) selected for bulk scheduling.`);
            }
          }}
          onPreview={(src) => setLightboxSrc(src || "")}
          onDeleteUpload={(raw) => {
            const normalize = (val) => {
              const m = String(val || "").match(/(\/uploads\/[^?#]+)/);
              return m ? m[1] : String(val || "");
            };
            setUploadsInfo((prev) => {
              if (!prev) return prev;
              const key = normalize(raw);
              const nextUrls = (prev.urls || []).filter(
                (u) => normalize(u) !== key
              );
              const nextFiles = (prev.files || []).filter(
                (f) => normalize(f) !== key
              );
              const nextCount = Math.max(
                0,
                prev.count != null
                  ? prev.count - 1
                  : Math.max(nextUrls.length, nextFiles.length)
              );
              return {
                ...prev,
                urls: nextUrls,
                files: nextFiles,
                count: nextCount,
              };
            });
          }}
          onUploadComplete={async () => {
            try {
              await loadUploadsInfo();
            } catch (e) {
              console.error(e);
            }
          }}
        />
        {lightboxSrc ? (
          <div className="lightbox-backdrop" onClick={() => setLightboxSrc("")}>
            <div
              className="lightbox-body"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <img src={lightboxSrc} alt="Preview" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
