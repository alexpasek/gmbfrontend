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

/** Resolve a URL we can actually <img src> */
function resolveMediaPreviewUrl(mediaUrl, backendBase) {
  if (!mediaUrl) return "";
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  if (mediaUrl.startsWith("/")) {
    if (backendBase) {
      return backendBase.replace(/\/+$/, "") + mediaUrl;
    }
    return mediaUrl;
  }
  return "";
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
      let url = String(raw || "");
      if (!/^https?:\/\//i.test(url)) {
        if (url.startsWith("/")) {
          url = backendBase
            ? backendBase.replace(/\/+$/, "") + url
            : url;
        } else if (backendBase) {
          url = backendBase.replace(/\/+$/, "") + "/media/" + encodeURIComponent(key);
        }
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

  function toggle(key) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

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

  function normalizeValue(raw) {
    if (!raw) return;
    const m = String(raw).match(/(\/(?:uploads|media)\/[^?#]+)/i);
    const value = m ? m[1] : String(raw);
    return value;
  }

  function handleSelect(raw) {
    const value = normalizeValue(raw);
    if (value) onSelect(value);
  }

  function handleUseSelected() {
    if (onSelectMultiple && selected.length) {
      const normalized = selected
        .map((k) => {
          const found = items.find((it) => it.key === k);
          return found ? normalizeValue(found.url) : null;
        })
        .filter(Boolean);
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
      const { urls = [], failed = [] } = await uploadPhotos(fileList, backendBase, meta, {
        folder: normalizeFolder(currentFolder),
      });
      if (urls.length) {
        const normalized = urls.map(buildItem);
        setItems((prev) => [...normalized, ...prev]);
        setSelected([]);
        if (onUploadComplete) onUploadComplete(urls);
        notifySafe(
          `Uploaded ${urls.length} file(s)` +
            (failed.length ? `, failed: ${failed.map((f) => f.name || f).join(", ")}` : "")
        );
      } else if (failed.length) {
        notifySafe(`Failed to upload: ${failed.map((f) => f.name || f).join(", ")}`);
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
              Organise uploads into folders and select single or multiple photos.
              If a folder is selected, new uploads will be saved there.
            </p>
          </div>
          <button className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="action-row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
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
              <span style={{ color: "#ff7a7a", marginLeft: 8 }}>{uploadError}</span>
            ) : null}
          </div>
        </div>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <label className="btn btn--ghost btn--small">
            {uploading ? "Uploading..." : currentFolder ? `Upload to ${currentFolder}` : "Upload to gallery"}
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
                        onPreview(resolveMediaPreviewUrl(item.url, backendBase));
                      }
                    }}
                  >
                    <img src={resolveMediaPreviewUrl(item.url, backendBase)} alt={label} loading="lazy" />
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
            <div className="media-preview-thumb" style={{ width: 120, height: 120 }}>
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
  { id: "photo-scheduler", label: "Photo scheduler" },
  { id: "history", label: "Post history" },
  { id: "diagnostics", label: "Diagnostics" },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

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
    data
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
    north: +(lat + delta).toFixed(5)
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
    body: `data=${encodeURIComponent(body)}`
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
      lng: lngVal != null ? +lngVal : null
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
    neighbourhood || ""
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" • ");
  const label = pieces || "Popcorn ceiling removal";
  return name ? `${label} — ${name}` : label;
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
  const [editingPhotoJobId, setEditingPhotoJobId] = useState("");

  const [schedStatus, setSchedStatus] = useState(null);
  const [schedConfig, setSchedConfig] = useState(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [backendBase, setBackendBase] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState("");

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
  const [latestPhotosDebugLoading, setLatestPhotosDebugLoading] = useState(false);
  const [photoSelectionPreview, setPhotoSelectionPreview] = useState([]);
  const [overlayUrl, setOverlayUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEYS.overlayUrl) || "";
  });
  const [composedMediaUrl, setComposedMediaUrl] = useState("");
  const schedulingBusy =
    photoSchedulerStatus === "saving" ||
    photoSchedulerStatus === "stamping" ||
    photoSchedulerStatus === "posting";
  const mapBoundsRef = useRef(null);
  const cityCenterRef = useRef({ lat: null, lng: null });
  const cityLookupTimer = useRef(null);
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.profileId === selectedId),
    [profiles, selectedId]
  );

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
  const activeDraftHref = resolveCtaLink(activeDraftCta, activeDraftLink);
  const photoNeighbourhoodOptions = useMemo(
    () => parseNeighbourhoodInput(photoNeighbourhoodsInput),
    [photoNeighbourhoodsInput]
  );
  const neighbourhoodOptionsDetailed = useMemo(() => {
    if (neighbourhoodResults.length) return neighbourhoodResults;
    return parseNeighbourhoodInput(photoNeighbourhoodsInput).map((name) => ({
      name,
      lat: null,
      lng: null
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
        (Array.isArray(selectedProfile?.neighbourhoods) ? selectedProfile.neighbourhoods[0] : "") ||
        ""
    };
    return photoSchedCaption || buildAutoCaption(selectedProfile, meta, photoKeywords);
  }, [
    photoSchedCaption,
    selectedProfile,
    photoCity,
    photoNeighbourhood,
    photoNeighbourhoodOptions,
    photoKeywords
  ]);
  const logGeo = (msg, data = null) => addGeoLogHelper(setGeoLogs, msg, data);
  const mapBoundsEffective = mapBounds || mapBoundsRef.current;
  const mapCenter = useMemo(() => {
    const candidates = [
      {
        lat: parseFloat(photoLat),
        lng: parseFloat(photoLng)
      },
      {
        lat: cityCenterRef.current.lat,
        lng: cityCenterRef.current.lng
      },
      neighbourhoodResults.find((n) => n.lat != null && n.lng != null),
      { lat: 43.6532, lng: -79.3832 } // Toronto fallback
    ];
    const pick = candidates.find(
      (c) => c && !isNaN(parseFloat(c.lat)) && !isNaN(parseFloat(c.lng))
    );
    return pick ? { lat: parseFloat(pick.lat), lng: parseFloat(pick.lng) } : null;
  }, [photoLat, photoLng, neighbourhoodResults]);

  const mapPreviewUrl = useMemo(() => {
    if (!mapCenter) return "";
    return buildStaticMapUrl(mapCenter.lat, mapCenter.lng, 14, "900x420");
  }, [mapCenter]);

  const mapEmbedUrl = useMemo(() => {
    if (mapBoundsEffective) return buildEmbedMapUrl(mapBoundsEffective);
    if (mapCenter) return buildEmbedMapUrl(computeMapBounds(mapCenter.lat, mapCenter.lng, 2000));
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
    setLinkOptions(
      Array.isArray(d.linkOptions)
        ? d.linkOptions
        : []
    );
    setReviewLink(d.reviewLink || "");
    setServiceAreaLink(d.serviceAreaLink || "");
    setAreaMapLink(d.areaMapLink || "");
    setDefaultPhone(d.phone || p?.phone || "");
    setMediaUrl(d.mediaUrl || "");
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
  }, [cta, phoneCandidate, selectedProfile?.defaults?.linkUrl, selectedProfile?.landingUrl]);

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
    linkUrl
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
      const caption = photoSchedCaption || buildAutoCaption(selectedProfile, meta, photoKeywords);
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
    selectedProfile
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
      const b = computeMapBounds(firstWithCoords.lat, firstWithCoords.lng, 2000);
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
      if (quickLinksSaveTimer.current) clearTimeout(quickLinksSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewLink, serviceAreaLink, areaMapLink, selectedProfile?.profileId]);

  async function doPreview() {
    if (!selectedId) return notify("Select a profile first");
    setPreview("");
    setPreviewing(true);
    setPreviewDetails(null);
    try {
      const r = await api.generatePost(selectedId);
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
        : parseNeighbourhoodInput(photoNeighbourhoodsInput).map((name) => ({ name }));
    const chosen =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
    const chosenDetailed =
      photoNeighbourhood && neighbourhoodOptionsDetailed.length
        ? neighbourhoodOptionsDetailed.find(
            (n) =>
              String(n.name || "").trim().toLowerCase() ===
              String(photoNeighbourhood || "").trim().toLowerCase()
          )
        : null;
    const neighbourhood =
      (chosen && chosen.name) ||
      photoNeighbourhood ||
      (Array.isArray(profile.neighbourhoods) ? profile.neighbourhoods[0] : "") ||
      "";
    const baseLat =
      (chosenDetailed && chosenDetailed.lat != null && chosenDetailed.lat) ||
      (chosen && chosen.lat != null && chosen.lng != null && !photoLat && !photoLng
        ? chosen.lat
        : photoLat || cityCenterRef.current.lat || "");
    const baseLng =
      (chosenDetailed && chosenDetailed.lng != null && chosenDetailed.lng) ||
      (chosen && chosen.lat != null && chosen.lng != null && !photoLng && !photoLat
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
        chosenService || (Array.isArray(profile.keywords) ? profile.keywords.join(", ") : ""),
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
        lng: hasBaseCoords ? baseLngNum : null
      });
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=40&extratags=1&q=" +
        encodeURIComponent(q);
      const res = await fetch(url, {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "gmb-automation/1.0"
        }
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
          addr.state
        ]
          .map(normalizeCityName)
          .filter(Boolean);
        return cityCandidates.includes(targetCityNorm);
      });
      const cityCenter = cityHit && cityHit.lat && cityHit.lon
        ? { lat: parseFloat(cityHit.lat), lng: parseFloat(cityHit.lon) }
        : { lat: null, lng: null };
      const radiusMeters = Math.max(1000, Number(photoSearchRadius || 20) * 1000);
      if (!hasBaseCoords && cityCenter.lat != null && cityCenter.lng != null) {
        setPhotoLat(String(cityCenter.lat));
        setPhotoLng(String(cityCenter.lng));
        cityCenterRef.current = cityCenter;
        const b = computeMapBounds(cityCenter.lat, cityCenter.lng, radiusMeters);
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
            lng: isNaN(lng) ? null : +lng
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
          addr.state
        ]
          .map(normalizeCityName)
          .filter(Boolean);
        const cityMatch = targetCityNorm
          ? cityCandidates.some(
              (c) => c === targetCityNorm || c.includes(targetCityNorm)
            )
          : true;
        const centerLat = hasBaseCoords ? baseLatNum : cityCenterRef.current.lat;
        const centerLng = hasBaseCoords ? baseLngNum : cityCenterRef.current.lng;
        const centerReady = !isNaN(centerLat) && !isNaN(centerLng);
        const withinRadius =
          centerReady && !isNaN(entryLat) && !isNaN(entryLng)
            ? haversineKm(centerLat, centerLng, entryLat, entryLng) <= Math.max(5, Number(photoSearchRadius || 20))
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
          addr.commercial
        ]
          .forEach((n) => addName(n, entryLat, entryLng));
      });
      let list = Array.from(byName.values());
      if (cityCenterRef.current.lat != null && cityCenterRef.current.lng != null) {
        list = list
          .map((it) => {
            if (it.lat == null || it.lng == null) {
              return { ...it, lat: cityCenterRef.current.lat, lng: cityCenterRef.current.lng };
            }
            return it;
          })
          .slice(0, 25);
      }
      if (q && !byName.has(q)) {
        list.unshift({
          name: q,
          lat:
            cityCenterRef.current.lat != null ? cityCenterRef.current.lat : hasBaseCoords ? baseLatNum : null,
          lng:
            cityCenterRef.current.lng != null ? cityCenterRef.current.lng : hasBaseCoords ? baseLngNum : null
        });
      }
      if (!list.length) {
        throw new Error("No neighbourhoods found for this city/coords. Try another city or add manually.");
      }
      // Fallback: bounded search around city center if too few results
      if (list.length < 5 && cityCenterRef.current.lat != null && cityCenterRef.current.lng != null) {
        try {
          const lat = cityCenterRef.current.lat;
          const lng = cityCenterRef.current.lng;
          const delta = 0.2; // ~20km
          const viewbox = [
            lng - delta,
            lat + delta,
            lng + delta,
            lat - delta
          ].join(",");
          const boundedUrl =
            "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=40&extratags=1&bounded=1&viewbox=" +
            viewbox +
            "&q=" +
            encodeURIComponent(q + " neighbourhood");
          const boundedRes = await fetch(boundedUrl, {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "gmb-automation/1.0"
            }
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
                addr.commercial
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
        const radiusMeters = Math.max(1000, Number(photoSearchRadius || 20) * 1000);
        const overpassList = await fetchOverpassPlaces(
          q,
          cityCenterRef.current.lat != null ? cityCenterRef.current.lat : baseLatNum,
          cityCenterRef.current.lng != null ? cityCenterRef.current.lng : baseLngNum,
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
        radiusKm: photoSearchRadius
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
        (phoneCandidate && /(\+?[0-9][0-9\-\s\(\)]{5,})/.test(phoneCandidate)) ||
        /^tel:\+?[0-9]/i.test(linkUrl || "");
      if (!phoneOk) {
        notify("Call now requires a phone number (set a tel:+ link or default phone).");
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
      const isUploads = /^\/(uploads|media)\/.+\.(png|jpe?g|webp)$/i.test(mediaUrl);
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
    if (cta !== "CALL_NOW" && isValidHttpLink(effectiveLink) && !isValidHttpLink(linkUrl)) {
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
        topicType: postType,
        eventTitle,
        eventStart,
        eventEnd,
        offerTitle,
        offerCoupon,
        offerRedeemUrl
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
      filtered.sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
      const queued = filtered.filter((it) => (it.status || "QUEUED") === "QUEUED");
      const history = filtered.filter((it) => (it.status || "QUEUED") !== "QUEUED");
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
    if (!mediaList.length) return notify("Pick at least one photo for scheduling");
    const baseDt = new Date(`${photoSchedDate}T${photoSchedTime || "00:00"}:00`);
    if (isNaN(baseDt.getTime())) return notify("Set a valid start date/time");
    const makeId = () =>
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2));
    const requestedCount = Math.max(1, Math.min(100, parseInt(photoSchedCount, 10) || mediaList.length || 1));
    const dayStep = photoSchedCadence === "DAILY2" ? 2 : photoSchedCadence === "DAILY3" ? 3 : 1;
    const items = [];
    setPhotoSchedulerStatus("stamping");
    for (let i = 0; i < requestedCount; i++) {
      const meta = buildPhotoMeta(); // build fresh meta per photo for randomized GPS/neighbourhood
      const runAt = new Date(baseDt.getTime() + i * dayStep * 86400000).toISOString();
      meta.dateTime = runAt;
      const captionText = photoSchedCaption || buildAutoCaption(selectedProfile, meta, photoKeywords);
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
    if (!editingPhotoJobId) return notify("Pick a scheduled photo from the calendar first.");
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
        caption: photoSchedCaption || buildAutoCaption(selectedProfile, meta, photoKeywords),
        meta,
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
    const captionText = photoSchedCaption || buildAutoCaption(selectedProfile, meta, photoKeywords);
    try {
      setPhotoSchedulerStatus("posting");
      await api.postPhotoNow({
        profileId: selectedId,
        mediaUrl: stampedUrl || mediaUrlRaw,
        caption: captionText
      });
      notify("Photo posted to GBP library");
      setPhotoSchedulerStatus("posted");
      await loadPhotoJobs();
    } catch (e) {
      notify(e.message || "Post failed");
      setPhotoSchedulerStatus("error");
    } finally {
      setTimeout(() => setPhotoSchedulerStatus(""), 2000);
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
      const res = await api.getLatestPhotos(selectedId, 10);
      const items = Array.isArray(res?.items) ? res.items : [];
      setLatestPhotos(items);
      notify(items.length ? "Fetched latest GBP photos" : "No photos returned from GBP");
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
      notify(items.length ? "Fetched GBP photos (debug, multi-page)" : "No photos returned from GBP");
    } catch (e) {
      notify(e.message || "Failed to load GBP photos (debug)");
    } finally {
      setLatestPhotosDebugLoading(false);
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
      const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
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

  async function autoScheduleWithAi() {
    if (!selectedId) return notify("Select a profile first");
    const images =
      bulkImages.length > 0
        ? bulkImages
        : mediaUrl
        ? [mediaUrl]
        : [];
    if (!images.length) return notify("Select at least one image (gallery or photo URL).");
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
    const useImages = images.slice(0, slotsLimit);
    const start = `${scheduleDate || new Date().toISOString().slice(0, 10)}T${
      scheduleTime || "10:00"
    }:00`;
    try {
      setBulkBusy(true);
      const payload = {
        profileId: selectedId,
        images: useImages,
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
    if (!bulkImages.length) return notify("Select images from the gallery first.");
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
    const images = bulkImages.slice(0, slotsLimit);
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
    if (!media) return notify("Add a media URL to this draft before regenerating.");
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
        phone: defaultPhone,
        linkOptions: linkOptions
          .map((u) => String(u || "").trim())
          .filter(Boolean),
        reviewLink: String(reviewLink || "").trim(),
        serviceAreaLink: String(serviceAreaLink || "").trim(),
        areaMapLink: String(areaMapLink || "").trim(),
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
      const { urls = [], failed = [] } = await uploadPhotos(files, backendBase, null);
      if (urls.length) {
        setBulkImages((prev) => [...prev, ...urls].slice(-50));
        if (!mediaUrl) setMediaUrl(urls[0]);
        if (activeDraftIndex >= 0) {
          updateBulkDraftBody(activeDraftIndex, { mediaUrl: urls[0] });
        }
        notify(
          `Uploaded ${urls.length} photo(s) and added to bulk selection.` +
            (failed.length ? ` Failed: ${failed.map((f) => f.name || f).join(", ")}` : "")
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
      const { urls = [], failed = [] } = await uploadPhotos(files, backendBase, buildPhotoMeta());
      if (urls.length) {
        setPhotoSchedMedia(urls[0]);
        setPhotoSchedMediaList((prev) => [...urls, ...prev].slice(0, 100));
        notify(
          `Uploaded ${urls.length} photo(s) with EXIF geo for scheduler.` +
            (failed.length ? ` Failed: ${failed.map((f) => f.name || f).join(", ")}` : "")
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
                "Profiles, CTAs, media defaults, and quick composer."}
              {tab === "bulk" &&
                "Toggle bulk inclusion and manage posting access."}
              {tab === "photo-scheduler" &&
                "Schedule photo-only uploads with geo-tag metadata."}
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
              <section className="panel">
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
                              setLinkOptions((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="link-options">
                    <div className="link-options__header">
                      <div className="quick-links-title">
                        <span className="field-label">Quick links</span>
                        <button
                          type="button"
                          className="quick-links-info-btn"
                          onClick={() => setQuickLinksHelpOpen((open) => !open)}
                          aria-expanded={quickLinksHelpOpen}
                          aria-label="Show quick link instructions"
                        >
                          ?
                        </button>
                      </div>
                      <span className="muted small">
                        {quickLinksSaving ? "Saving..." : "Auto-saved"}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => {
                          const targetValue =
                            linkUrl ||
                            getFallbackLink(selectedProfile) ||
                            "https://";
                          if (!reviewLink) {
                            setReviewLink(targetValue);
                          } else if (!serviceAreaLink) {
                            setServiceAreaLink(targetValue);
                          } else if (!areaMapLink) {
                            setAreaMapLink(targetValue);
                          }
                        }}
                        disabled={!!reviewLink && !!serviceAreaLink && !!areaMapLink}
                      >
                        + Add link
                      </button>
                    </div>
                    {quickLinksHelpOpen && (
                      <div className="quick-links-tip">
                        <div className="quick-links-tip__title">How to grab each link</div>
                        <ul className="quick-links-tip__list">
                          <li>
                            <strong>Reviews:</strong> Open your business in Google Maps → Reviews → Share → Copy link.
                            <span className="muted small"> Example: https://maps.app.goo.gl/noNsstq3bHik398i7</span>
                          </li>
                          <li>
                            <strong>Service Area:</strong> Search your company in Google Maps, open the business card, tap Share → Copy link.
                            <span className="muted small"> Example: https://maps.app.goo.gl/BhWfAacsEfrMTFY96</span>
                          </li>
                          <li>
                            <strong>Last Post:</strong> Use the auto-generated share.google link from your posting tool.
                            <span className="muted small"> Example: https://share.google/XYK4LIzLQSI0KhwYO</span>
                          </li>
                          <li>
                            <strong>Area Map (City):</strong> Search the city in Google Maps, open the city view, tap Share → Copy link.
                            <span className="muted small"> Example: https://maps.app.goo.gl/EpZ2gJuTXBH8nd2E7</span>
                          </li>
                        </ul>
                      </div>
                    )}
                    <div className="quick-links-grid">
                      {[
                        { label: "Reviews", value: reviewLink, setter: setReviewLink },
                        { label: "Service Area", value: serviceAreaLink, setter: setServiceAreaLink },
                        { label: "Area Map", value: areaMapLink, setter: setAreaMapLink },
                      ].map((item, idx) => (
                        <div className="link-option-row" key={`quick-${idx}`}>
                          <div className="quick-link-label" style={{ minWidth: 140 }}>
                            <span className="quick-link-icon" aria-hidden="true">
                              🔗
                            </span>
                            <span>{item.label}</span>
                          </div>
                          <input
                            value={item.value}
                            onChange={(e) => item.setter(e.target.value)}
                            placeholder="https://your-site/page"
                            style={{ flex: 1, minWidth: 280 }}
                          />
                          <div className="link-option-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              onClick={() => item.setter("")}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
                    EXIF geo settings now live in Photo scheduler → Photo metadata. Regular posts don’t need geo tagging.
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
                          src={resolveMediaPreviewUrl(composedMediaUrl || mediaUrl, backendBase)}
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
                        <div className="media-preview-url small">
                          {mediaUrl || "—"}
                        </div>
                        <div className="media-preview-hint muted small">
                          This is the image that will be attached when you post from
                          this profile (unless you override it per-post).
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
                    disabled={!selectedProfile}
                  >
                    Save as profile defaults
                  </button>
                </div>
              </section>

              <section className="panel" ref={generateRef}>
                <div className="panel-title">Generate & post</div>
                <div className="panel-section action-row">
                  <button className="btn btn--blue" onClick={doPreview} disabled={previewing}>
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
                  <button
                    className="btn btn--green"
                    onClick={doPostNow}
                    disabled={busy || posting}
                  >
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
                  <button
                    className="btn btn--warning"
                    onClick={doPostNowAll}
                    disabled={busy}
                  >
                    Post all profiles
                  </button>
                  <button
                    className="btn btn--danger"
                    type="button"
                    onClick={clearPostComposer}
                    disabled={busy || posting}
                  >
                    Clear all
                  </button>
                </div>
                <div className="panel-section">
                  <label className="field-label">Schedule date/time</label>
                  <div className="section-grid">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={schedulePost}
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
                    Pick a future date/time to queue this post for the selected profile. Click a scheduled row to load it for editing.
                  </p>
                  <div className="section-grid" style={{ alignItems: "end" }}>
                    <div>
                      <label className="field-label">Auto cadence</label>
                      <select
                        value={autoCadenceDays}
                        onChange={(e) => setAutoCadenceDays(Number(e.target.value))}
                      >
                        <option value={1}>1 per day</option>
                        <option value={2}>1 per 2 days</option>
                        <option value={3}>1 per 3 days</option>
                      </select>
                    </div>
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={autoScheduleWithAi}
                      disabled={bulkBusy || busy}
                    >
                      Auto schedule with AI
                    </button>
                  </div>
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
              </section>

              <section className="panel">
                <div className="panel-title">Last generated preview</div>
                <div className="panel-section preview-shell">
                  {postText || preview ? (
                    <div className="post-preview">
                      {previewDetails?.profileId &&
                        selectedId &&
                        previewDetails.profileId !== selectedId && (
                          <div className="preview-warning">
                            <strong>Heads up:</strong> preview was generated for{" "}
                            {previewDetails.profileName || previewDetails.profileId}.
                            Select the right profile and click Generate preview again to refresh.
                          </div>
                        )}

                      <div className="post-preview__header">
                        <div>
                          <div className="post-preview__eyebrow">Posting to</div>
                          <div className="post-preview__profile">
                            {previewDetails?.profileName ||
                              selectedProfile?.businessName ||
                              selectedId ||
                              "—"}
                            {selectedProfile?.city
                              ? " · " + selectedProfile.city
                              : ""}
                          </div>
                          {previewDetails?.neighbourhood ? (
                            <div className="muted small">
                              Focus area: {previewDetails.neighbourhood}
                            </div>
                          ) : null}
                        </div>
                        <div className="post-preview__badge">
                          {getPostTypeLabel(postType)}
                        </div>
                      </div>

                      <div className="post-preview__copy">
                        {(postText || preview || "").trim() || "—"}
                      </div>

                      <div className="post-preview__cta-row">
                        <a
                          className={
                            "preview-cta-btn" +
                            (resolveCtaLink(cta, linkUrl) ? "" : " is-disabled")
                          }
                          href={resolveCtaLink(cta, linkUrl) || undefined}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            if (!resolveCtaLink(cta, linkUrl)) e.preventDefault();
                          }}
                        >
                          {CTA_LABELS[cta] || "CTA button"}
                        </a>
                        <div className="post-preview__meta">
                          <div>
                            Link:{" "}
                            {linkUrl ? (
                              resolveCtaLink(cta, linkUrl) ? (
                                <a
                                  href={resolveCtaLink(cta, linkUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {linkUrl}
                                </a>
                              ) : (
                                <span className="error-text">
                                  {cta === "CALL_NOW"
                                    ? "Use tel:+1... or https://"
                                    : "Needs https:// link"}
                                </span>
                              )
                            ) : (
                              <span className="muted small">No link provided</span>
                            )}
                          </div>
                          <div>
                            Photo:{" "}
                            {mediaUrl ? (
                              <span className="muted small">{mediaUrl}</span>
                            ) : (
                              <span className="muted small">None attached</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {resolveMediaPreviewUrl(mediaUrl, backendBase) ? (
                        <div className="post-preview__media">
                          <div className="overlay-wrapper">
                            <img
                              src={resolveMediaPreviewUrl(composedMediaUrl || mediaUrl, backendBase)}
                              alt="Post media preview"
                              onClick={() =>
                                setLightboxSrc(
                                  resolveMediaPreviewUrl(composedMediaUrl || mediaUrl, backendBase)
                                )
                              }
                              style={{ cursor: "pointer" }}
                            />
                            {resolveMediaPreviewUrl(overlayUrl, backendBase) ? (
                              <img
                                className="media-overlay-img"
                                src={resolveMediaPreviewUrl(overlayUrl, backendBase)}
                                alt="Overlay"
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="post-preview__footer muted small">
                        {previewDetails?.generatedAt ? (
                          <>
                            Generated{" "}
                            {new Date(previewDetails.generatedAt).toLocaleString()}
                          </>
                        ) : (
                          "Live preview reflects the text and CTA above."
                        )}
                      </div>
                    </div>
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

          {tab === "photo-scheduler" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Schedule photo uploads</div>
                <div className="panel-section">
                  <label className="field-label">Photo URL</label>
                  <input
                    value={photoSchedMedia}
                    onChange={(e) => setPhotoSchedMedia(e.target.value)}
                    placeholder="/uploads/photo.jpg or https://..."
                  />
                  <p className="muted small">
                    You can add up to 100 photos: pick multiple in the gallery or paste them below.
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
                          prev.includes(val) ? prev : [...prev, val].slice(0, 100)
                        );
                        setPhotoSchedMedia("");
                      }}
                    >
                      Add to list
                    </button>
                    <span className="muted small">{photoSchedMediaList.length} in list</span>
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
                  <div className="panel-subsection__header">
                    <span className="field-label">Photo metadata (used for EXIF & scheduling)</span>
                    <span className="muted small">
                      Auto-randomizes neighbourhood + coordinates per photo if enabled below.
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
                      <label className="field-label">Neighbourhood (fallback)</label>
                      <input
                        value={photoNeighbourhood}
                        onChange={(e) => setPhotoNeighbourhood(e.target.value)}
                        placeholder="Kensington"
                      />
                    </div>
                    <div className="section">
                      <label className="field-label">Neighbourhood list (random pick)</label>
                      <textarea
                        value={photoNeighbourhoodsInput}
                        onChange={(e) => setPhotoNeighbourhoodsInput(e.target.value)}
                        placeholder="Kensington\nMount Pleasant\nDowntown"
                        rows={3}
                      />
                      <div className="action-row" style={{ marginTop: 4 }}>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() => {
                            const city = photoCity || selectedProfile?.city || "";
                            if (!city) {
                              notify("Set a city first.");
                              return;
                            }
                            generateNeighbourhoods(city);
                          }}
                        >
                          {neighbourhoodsLoading ? "Loading..." : "Generate from map"}
                        </button>
                        <span className="muted small">
                          Pulls neighbourhoods/streets near the city and your lat/lng (30km filter).
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
                      <label className="checkbox-inline" style={{ marginTop: 6 }}>
                        <input
                          type="checkbox"
                          checked={photoRandomizeKeywords}
                          onChange={(e) => setPhotoRandomizeKeywords(e.target.checked)}
                        />
                        Randomize keywords per photo
                      </label>
                    </div>
                    <div className="section">
                      <label className="field-label">Jitter radius (meters)</label>
                      <input
                        type="number"
                        min="0"
                        value={photoRandomizeRadius}
                        onChange={(e) => setPhotoRandomizeRadius(Number(e.target.value))}
                        placeholder="200"
                      />
                      <label className="checkbox-inline" style={{ marginTop: 6 }}>
                        <input
                          type="checkbox"
                          checked={photoRandomizeCoords}
                          onChange={(e) => setPhotoRandomizeCoords(e.target.checked)}
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
                        onChange={(e) => setPhotoSearchRadius(Number(e.target.value) || 20)}
                        placeholder="20"
                      />
                      <div className="muted small">
                        Higher radius pulls more GTA areas; lower radius keeps it local.
                      </div>
                    </div>
                  </div>
                  <div className="section-grid" style={{ alignItems: "start" }}>
                    <div>
                      <div className="muted small">City</div>
                      <strong>{photoMetaSample?.city || photoCity || selectedProfile?.city || "—"}</strong>
                    </div>
                    <div>
                      <div className="muted small">Neighbourhood (next)</div>
                      <strong>
                        {photoMetaSample?.neighbourhood ||
                          photoNeighbourhood ||
                          (photoNeighbourhoodOptions[0] || "—")}
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
                          ? `${photoMetaSample.lat || "—"}, ${photoMetaSample.lng || "—"}`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <div className="muted small">Neighbourhood pool</div>
                      <div className="muted small" style={{ maxWidth: 220 }}>
                        {neighbourhoodOptionsDetailed.length
                          ? neighbourhoodOptionsDetailed.map((n) => n.name).join(", ")
                          : "None set. Using fallback above."}
                      </div>
                    </div>
                  </div>
                  <div className="section-grid">
                    <div className="section">
                      <label className="field-label">Pick neighbourhood (sets coords)</label>
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const found = neighbourhoodOptionsDetailed.find((n) => n.name === v);
                          setPhotoNeighbourhood(v);
                          if (found && found.lat != null && found.lng != null) {
                            setPhotoLat(String(found.lat));
                            setPhotoLng(String(found.lng));
                            setPhotoRandomizeCoords(true);
                            logGeo("Neighbourhood selected", found);
                          } else {
                            logGeo("Neighbourhood selected (no coords)", { name: v });
                          }
                          refreshPhotoMetaSample();
                        }}
                      >
                        <option value="">Select...</option>
                        {neighbourhoodOptionsDetailed.map((opt, idx) => (
                          <option key={idx} value={opt.name}>
                            {opt.name}
                            {opt.lat != null && opt.lng != null
                              ? ` (${opt.lat.toFixed(4)}, ${opt.lng.toFixed(4)})`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <div className="muted small">
                        Selecting applies the neighbourhood and sets base coords (if present), ready for posting.
                      </div>
                    </div>
                  </div>
                  <div className="panel-subsection" style={{ marginTop: 12 }}>
                    <div className="panel-subsection__header">
                      <span className="field-label">Jitter preview (next 3)</span>
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
                          cursor: "crosshair"
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
                            style={{ width: "100%", height: 420, border: "none" }}
                            loading="lazy"
                          />
                        ) : mapPreviewUrl ? (
                          <img
                            src={mapPreviewUrl}
                            alt="Map preview"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                        Map centers on the current base coords; click on the map to set lat/lng. Jitter will vary around this point.
                      </div>
                    </div>
                    {geoTestSamples.length ? (
                      <div className="muted small" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                        {geoTestSamples.map((s, idx) => (
                          <div key={idx} className="diag-card">
                            <div><strong>{s.city || "—"}</strong></div>
                            <div>{s.neighbourhood || "—"}</div>
                            <div>{s.lat || "—"}, {s.lng || "—"}</div>
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
                          samples.push(randomizeCoords(photoLat, photoLng, photoRandomizeRadius));
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
                          randomNeighbourhood(photoNeighbourhoodOptions, photoNeighbourhood)
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
                    City/lat/lng, neighbourhoods, and keywords live here. Save defaults to keep them tied to the profile; scheduler will stamp EXIF automatically.
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
                    <span className="muted small">Up to 30 entries; also in console with [geo].</span>
                  </div>
                  {geoLogs.length ? (
                    <ul className="muted small" style={{ maxHeight: 220, overflowY: "auto" }}>
                      {geoLogs.map((l, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <div>
                            <strong>{new Date(l.ts).toLocaleTimeString()}</strong> — {l.msg}
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
                      {photoSchedulerStatus === "saving" || photoSchedulerStatus === "stamping"
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
                      {photoSchedulerStatus === "posting" ? "Posting..." : "Post photo now"}
                    </button>
                  {editingPhotoJobId ? (
                    <button
                      className="btn btn--indigo"
                      type="button"
                      onClick={updateSelectedPhotoJob}
                      disabled={!selectedProfile || photoSchedulerStatus === "saving"}
                      style={{ marginLeft: 8 }}
                    >
                      {photoSchedulerStatus === "saving" ? "Updating..." : "Update selected photo"}
                    </button>
                  ) : null}
                  <p className="muted small">
                    Uses the photo metadata defaults (lat/lng, neighbourhood, keywords) for EXIF stamping already embedded when the photo was uploaded.
                  </p>
                </div>
                {photoPreviewMedia ? (
                  <div className="panel-section">
                    <div className="panel-subtitle">Preview (next scheduled photo)</div>
                    <div className="post-preview__media" style={{ maxWidth: 360 }}>
                      <img src={photoPreviewMedia} alt="Photo preview" />
                    </div>
                    <div className="muted small" style={{ marginTop: 6 }}>
                      <div><strong>Caption:</strong> {photoPreviewCaption}</div>
                      <div>
                        <strong>Coords:</strong> {(photoLat || "—") + ", " + (photoLng || "—")}
                      </div>
                      <div>
                        <strong>Neighbourhood:</strong> {photoNeighbourhood || photoNeighbourhoodOptions[0] || "—"}
                      </div>
                    </div>
                    <div className="action-row" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={fetchLatestPhotos}
                        disabled={!selectedProfile || latestPhotosLoading}
                      >
                        {latestPhotosLoading ? "Loading GBP photos..." : "View latest GBP photos"}
                      </button>
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={fetchLatestPhotosDebug}
                        disabled={!selectedProfile || latestPhotosDebugLoading}
                      >
                        {latestPhotosDebugLoading ? "Diagnostics: loading..." : "Diagnostics: multi-page fetch"}
                      </button>
                    </div>
                    {latestPhotos.length > 0 ? (
                      <div className="media-strip">
                        {latestPhotos.map((item, idx) => (
                          <div key={item.name || idx} className="media-strip__item">
                            <img
                              src={(item.mediaFormat === "PHOTO" && item.sourceUrl) || item.thumbnailUrl || item.googleUrl || ""}
                              alt={item.description || item.name || ""}
                              style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 6 }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <div className="muted small" style={{ marginTop: 4 }}>
                              {item.description || "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {latestPhotosDebug.length > 0 ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="muted small">Diagnostics (raw Google media, multi-page)</div>
                        <div className="media-strip">
                          {latestPhotosDebug.map((item, idx) => (
                            <div key={item.name || idx} className="media-strip__item">
                              <img
                                src={item.googleUrl || item.thumbnailUrl || item.sourceUrl || ""}
                                alt={item.description || item.name || ""}
                                style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 6 }}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                              <div className="muted small" style={{ marginTop: 4 }}>
                                {item.description || "—"}
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
                      <div className="panel-subtitle">Selected photos (with randomized coords)</div>
                      <div className="media-strip">
                        {photoSelectionPreview.map((item, idx) => (
                          <div key={idx} className="media-strip__item">
                            <img
                              src={resolveMediaPreviewUrl(item.media, backendBase)}
                              alt={item.meta?.neighbourhood || ""}
                              style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 6 }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <div className="muted small" style={{ marginTop: 4 }}>
                            {item.caption}
                          </div>
                          <div className="muted small">
                            {item.meta?.neighbourhood || "—"} · {item.meta?.city || "—"}
                          </div>
                          <div className="muted small">
                            {item.meta?.lat || "—"}, {item.meta?.lng || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="muted small">
                      Coords/neighbourhoods are randomized per photo; scheduling will use these values when stamping EXIF.
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
                            <td>{selectedProfile?.businessName || it.profileId}</td>
                            <td className="muted small">{it.body?.mediaUrl || "—"}</td>
                            <td className="muted small">
                              {it.body?.meta?.city || it.body?.meta?.neighbourhood
                                ? `${it.body?.meta?.city || ""}${
                                    it.body?.meta?.city && it.body?.meta?.neighbourhood ? " · " : ""
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
                                <div className="error-text small" title={it.lastError}>
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
                                <div className="error-text small" title={it.lastError}>
                                  {String(it.lastError).slice(0, 60)}
                                  {String(it.lastError).length > 60 ? "…" : ""}
                                </div>
                              ) : null}
                            </td>
                            <td>{selectedProfile?.businessName || it.profileId}</td>
                            <td className="muted small">
                              {it.body?.meta?.city || it.body?.meta?.neighbourhood
                                ? `${it.body?.meta?.city || ""}${
                                    it.body?.meta?.city && it.body?.meta?.neighbourhood ? " · " : ""
                                  }${it.body?.meta?.neighbourhood || ""}`
                                : "—"}
                            </td>
                            <td className="muted small">{it.body?.mediaUrl || "—"}</td>
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
                        setPhotoSchedMediaList(job.body?.mediaUrl ? [job.body.mediaUrl] : []);
                        setPhotoSchedCaption(job.body?.caption || "");
                        setPhotoSchedDate(job.runAt.slice(0, 10));
                        setPhotoSchedTime(job.runAt.slice(11, 16));
                        const meta = job.body?.meta || {};
                        if (meta.lat) setPhotoLat(String(meta.lat));
                        if (meta.lng) setPhotoLng(String(meta.lng));
                        if (meta.city) setPhotoCity(String(meta.city));
                        if (meta.neighbourhood) setPhotoNeighbourhood(String(meta.neighbourhood));
                        notify("Loaded scheduled photo. Adjust fields and click Update selected photo.");
                      }}
                    />
                  </div>
                )}
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
                      <a href={cycleInfo.lastUrl} target="_blank" rel="noreferrer">
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
                          <tr
                            key={it.id}
                          >
                            <td>{new Date(it.runAt).toLocaleString()}</td>
                            <td>{selectedProfile?.businessName || it.profileId}</td>
                            <td>{it.body?.cta || "—"}</td>
                            <td>{editingScheduledId === it.id ? "Editing" : "Queued"}</td>
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
                                    }
                                    if (generateRef.current) {
                                      generateRef.current.scrollIntoView({ behavior: "smooth" });
                                    }
                                    notify("Loaded scheduled post into composer. Save by updating date/time and clicking Schedule or Post now.");
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
                                  {deletingScheduledId === it.id ? "Deleting..." : "Delete"}
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
                      {bulkImages.slice(0, 12).map((src, idx) => (
                        <div key={idx} className="bulk-thumb">
                          <img
                            src={resolveMediaPreviewUrl(src, backendBase)}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                            onClick={() =>
                              setLightboxSrc(resolveMediaPreviewUrl(src, backendBase))
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
                  <label className="field-label">Auto-generate text per image</label>
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
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>CTA</th>
                          <th>Link</th>
                          <th>Media</th>
                          <th>Copy</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkDrafts.map((d, idx) => (
                          <tr key={d.id || idx}>
                            <td>
                              <input
                                type="datetime-local"
                                value={d.runAt?.slice(0, 16) || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const dt = new Date(v);
                                  updateBulkDraft(idx, {
                                    runAt: isNaN(dt.getTime()) ? d.runAt : dt.toISOString(),
                                  });
                                  setActiveDraftIndex(idx);
                                }}
                              />
                            </td>
                            <td>
                              <select
                                value={d.body?.cta || "CALL_NOW"}
                                onChange={(e) => {
                                  updateBulkDraftBody(idx, { cta: e.target.value });
                                  setActiveDraftIndex(idx);
                                }}
                              >
                                {CTA_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                value={d.body?.linkUrl || ""}
                                onChange={(e) => {
                                  updateBulkDraftBody(idx, { linkUrl: e.target.value });
                                  setActiveDraftIndex(idx);
                                }}
                                placeholder="https://..."
                              />
                            </td>
                            <td>
                              <input
                                value={d.body?.mediaUrl || ""}
                                onChange={(e) => {
                                  updateBulkDraftBody(idx, { mediaUrl: e.target.value });
                                  setActiveDraftIndex(idx);
                                }}
                                placeholder="/uploads/..."
                              />
                            </td>
                            <td>
                              <div className="bulk-snippet">
                                {(d.body?.postText || "").trim() || "—"}
                              </div>
                            </td>
                            <td>
                              <div className="action-row">
                                <button
                                  className="btn btn--ghost btn--small"
                                  type="button"
                                  onClick={() => setActiveDraftIndex(idx)}
                                  disabled={activeDraftIndex === idx}
                                >
                                  {activeDraftIndex === idx ? "Previewing" : "Preview"}
                                </button>
                                <button
                                  className="btn btn--ghost btn--small"
                                  type="button"
                                  onClick={() =>
                                    setBulkDrafts((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {activeBulkDraft ? (
                  <div className="panel-section bulk-draft-shell">
                    <div className="bulk-draft-header">
                      <div>
                        <div className="muted small">
                          Draft {activeDraftIndex + 1} of {bulkDrafts.length} ·{" "}
                          {activeBulkDraft.runAt
                            ? new Date(activeBulkDraft.runAt).toLocaleString()
                            : "No time set"}
                        </div>
                        <div className="bulk-draft-meta">
                          <span>CTA: {CTA_LABELS[activeDraftBody.cta] || activeDraftBody.cta || "—"}</span>
                          <span>Media: {activeDraftBody.mediaUrl || "None"}</span>
                        </div>
                      </div>
                      <div className="action-row">
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() => setActiveDraftIndex((i) => Math.max(0, i - 1))}
                          disabled={activeDraftIndex <= 0}
                        >
                          Previous
                        </button>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() =>
                            setActiveDraftIndex((i) =>
                              Math.min(bulkDrafts.length - 1, i + 1)
                            )
                          }
                          disabled={activeDraftIndex >= bulkDrafts.length - 1}
                        >
                          Next
                        </button>
                        <button
                          className="btn btn--indigo btn--small"
                          type="button"
                          onClick={() => regenerateBulkDraft(activeDraftIndex)}
                          disabled={
                            bulkBusy ||
                            regeneratingDraftIndex === activeDraftIndex
                          }
                        >
                          {regeneratingDraftIndex === activeDraftIndex
                            ? "Regenerating..."
                            : "Regenerate text"}
                        </button>
                      </div>
                    </div>
                    <div className="bulk-draft-grid">
                      <div className="post-preview">
                        <div className="post-preview__header">
                          <div>
                            <div className="post-preview__eyebrow">Posting to</div>
                            <div className="post-preview__profile">
                              {selectedProfile?.businessName ||
                                activeBulkDraft.profileId ||
                                selectedId ||
                                "—"}
                              {selectedProfile?.city ? " · " + selectedProfile.city : ""}
                            </div>
                          </div>
                          <div className="post-preview__badge">
                            {getPostTypeLabel(activeDraftBody.topicType || "STANDARD")}
                          </div>
                        </div>
                        <div className="post-preview__copy">
                          {(activeDraftBody.postText || "").trim() || "—"}
                        </div>
                        <div className="post-preview__cta-row">
                          <a
                            className={
                              "preview-cta-btn" + (activeDraftHref ? "" : " is-disabled")
                            }
                            href={activeDraftHref || undefined}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              if (!activeDraftHref) e.preventDefault();
                            }}
                          >
                            {CTA_LABELS[activeDraftCta] || "CTA button"}
                          </a>
                          <div className="post-preview__meta">
                            <div>
                              Link:{" "}
                              {activeDraftLink ? (
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
                              )}
                            </div>
                            <div>
                              Photo:{" "}
                              {activeDraftBody.mediaUrl ? (
                                <span className="muted small">{activeDraftBody.mediaUrl}</span>
                              ) : (
                                <span className="muted small">None attached</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {resolveMediaPreviewUrl(activeDraftMedia, backendBase) ? (
                          <div className="post-preview__media">
                            <img
                              src={resolveMediaPreviewUrl(activeDraftMedia, backendBase)}
                              alt="Post media preview"
                            />
                          </div>
                        ) : null}
                        <div className="post-preview__footer muted small">
                          Live preview of the selected draft.
                        </div>
                      </div>
                      <div className="bulk-draft-editor">
                        <label className="field-label">Post copy</label>
                        <textarea
                          value={activeDraftBody.postText || ""}
                          onChange={(e) => {
                            updateBulkDraftBody(activeDraftIndex, { postText: e.target.value });
                          }}
                          placeholder="Edit the generated text before scheduling."
                        />
                        <label className="field-label">CTA</label>
                        <select
                          value={activeDraftBody.cta || "CALL_NOW"}
                          onChange={(e) => {
                            updateBulkDraftBody(activeDraftIndex, { cta: e.target.value });
                          }}
                        >
                          {CTA_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <label className="field-label">Link</label>
                        <input
                          value={activeDraftBody.linkUrl || ""}
                          onChange={(e) =>
                            updateBulkDraftBody(activeDraftIndex, { linkUrl: e.target.value })
                          }
                          placeholder="https://..."
                          disabled={activeDraftCta === "CALL_NOW"}
                        />
                        {linkOptions.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v) {
                                updateBulkDraftBody(activeDraftIndex, { linkUrl: v });
                              }
                            }}
                            disabled={activeDraftCta === "CALL_NOW"}
                          >
                            <option value="">Pick saved link</option>
                            {linkOptions.map((u, idx) => (
                              <option key={idx} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        )}
                        <label className="field-label">Media URL</label>
                        <input
                          value={activeDraftBody.mediaUrl || ""}
                          onChange={(e) =>
                            updateBulkDraftBody(activeDraftIndex, { mediaUrl: e.target.value })
                          }
                          placeholder="/uploads/..."
                        />
                        <label className="field-label">Runs at</label>
                        <input
                          type="datetime-local"
                          value={activeBulkDraft.runAt?.slice(0, 16) || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const dt = new Date(v);
                            updateBulkDraft(activeDraftIndex, {
                              runAt: isNaN(dt.getTime())
                                ? activeBulkDraft.runAt
                                : dt.toISOString(),
                            });
                          }}
                        />
                        </div>
                        {overlayUrl ? (
                          <div className="media-preview-url small">
                            Overlay: {overlayUrl}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
              </div>
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

        <MediaGalleryModal
          open={mediaGalleryOpen}
          onClose={() => setMediaGalleryOpen(false)}
          uploadsInfo={uploadsInfo}
          backendBase={backendBase}
          photoMeta={mediaGalleryContext === "photo-scheduler" ? buildPhotoMeta : null}
          notify={notify}
          onSelect={(value) => {
            if (mediaGalleryContext === "overlay") {
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
            if (mediaGalleryContext === "overlay") {
              const first = list[0] || "";
              if (first) setOverlayUrl(first);
              notify("Overlay selected from gallery.");
            } else {
              setBulkImages(list.slice(0, 50));
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
              const nextUrls = (prev.urls || []).filter((u) => normalize(u) !== key);
              const nextFiles = (prev.files || []).filter((f) => normalize(f) !== key);
              const nextCount = Math.max(
                0,
                prev.count != null
                  ? prev.count - 1
                  : Math.max(nextUrls.length, nextFiles.length)
              );
              return { ...prev, urls: nextUrls, files: nextFiles, count: nextCount };
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
