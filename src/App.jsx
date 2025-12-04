import React, { useEffect, useMemo, useRef, useState } from "react";
import api, {
  getApiBase,
  uploadPhoto,
  updateProfileBulkAccess,
} from "./lib/api";
import "./App.css";
import BackendBadge from "./components/BackendBadge";
import PostsHistoryPanel from "./components/PostsHistoryPanel";

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

/** Simple modal gallery for /uploads */
function MediaGalleryModal({
  open,
  onClose,
  uploadsInfo,
  backendBase,
  onSelect,
  onSelectMultiple,
  onPreview,
  onDeleteUpload,
}) {
  if (!open) return null;

  const [items, setItems] = React.useState(
    (uploadsInfo && (uploadsInfo.urls || uploadsInfo.files)) || []
  );
  const [selected, setSelected] = React.useState([]);
  const [previewKey, setPreviewKey] = React.useState("");
  const [deletingKey, setDeletingKey] = React.useState("");

  React.useEffect(() => {
    const list = (uploadsInfo && (uploadsInfo.urls || uploadsInfo.files)) || [];
    setItems(list);
    setSelected([]);
    setPreviewKey("");
  }, [uploadsInfo]);

  function toggle(key) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function normalizeValue(raw) {
    if (!raw) return;
    const m = String(raw).match(/(\/uploads\/[^?#]+)/);
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
        .map(normalizeValue)
        .filter(Boolean);
      onSelectMultiple(normalized);
      setSelected([]);
      if (onClose) onClose();
    }
  }

  async function handleDelete(raw) {
    if (!raw) return;
    try {
      setDeletingKey(raw);
      await api.deleteUpload(raw);
      setItems((prev) => prev.filter((it) => it !== raw));
      setSelected((prev) => prev.filter((it) => it !== raw));
      if (previewKey === raw) setPreviewKey("");
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
      >
        <div className="media-modal-header">
          <div>
            <h2>Media gallery</h2>
            <p className="muted small">
              These are files from your <code>/uploads</code> folder (R2 /
              PUBLIC_BASE_URL). Click one to use it as the default photo.
            </p>
          </div>
          <button className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="action-row" style={{ justifyContent: "space-between" }}>
          <div className="muted small">
            Selected {selected.length} item{selected.length === 1 ? "" : "s"}
          </div>
          <div className="action-row">
            <button
              className="btn btn--ghost btn--small"
              onClick={handleUseSelected}
              disabled={!selected.length}
            >
              Use selected
            </button>
            <button className="btn btn--ghost btn--small" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
        {!items.length ? (
          <div className="muted small">
            No uploads yet. Use <strong>Upload from my computer</strong> first,
            then refresh this gallery from Diagnostics → Media / uploads check.
          </div>
        ) : (
          <div className="media-gallery-grid">
            {items.map((raw) => {
              const key = String(raw);
              const href = /^https?:\/\//i.test(key)
                ? key
                : backendBase
                ? backendBase.replace(/\/+$/, "") + key
                : key;

              const labelMatch = key.match(/\/([^\/?#]+)$/);
              const label = labelMatch?.[1] || key;

              return (
                <div
                  key={key}
                  className={
                    "media-gallery-item" +
                    (selected.includes(key) ? " media-gallery-item--selected" : "")
                  }
                  title={key}
                >
                  <button
                    type="button"
                    className="media-gallery-thumb"
                    onClick={() => {
                      setPreviewKey(key);
                      if (onPreview) {
                        onPreview(resolveMediaPreviewUrl(key, backendBase));
                      }
                    }}
                  >
                    <img src={href} alt={label} loading="lazy" />
                  </button>
                  <button
                    type="button"
                    className="media-gallery-select"
                    onClick={() => toggle(key)}
                  >
                    <div className="media-gallery-label">{label}</div>
                    <div className="muted small">
                      {selected.includes(key) ? "Selected" : "Click to select"}
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
        {previewKey && (
          <div className="media-preview">
            <div className="media-preview-thumb" style={{ width: 120, height: 120 }}>
              <img
                src={resolveMediaPreviewUrl(previewKey, backendBase)}
                alt="Preview"
              />
            </div>
            <div className="media-preview-meta">
              <div className="media-preview-title">Preview</div>
              <div className="media-preview-url small">{previewKey}</div>
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
  { id: "bulk", label: "Bulk posting" },
  { id: "scheduler", label: "Scheduler" },
  { id: "history", label: "Post history" },
  { id: "diagnostics", label: "Diagnostics" },
];

const STORAGE_KEYS = {
  tab: "gmbviking_tab",
  selectedProfileId: "gmbviking_selected_profile",
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
  const [mediaUrl, setMediaUrl] = useState("");
  const [defaultPhone, setDefaultPhone] = useState("");

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
    return localStorage.getItem(STORAGE_KEYS.tab) || "dashboard";
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
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [scheduleStatus, setScheduleStatus] = useState("");
  const [editingScheduledId, setEditingScheduledId] = useState("");
  const generateRef = useRef(null);
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
    setDefaultPhone(d.phone || p?.phone || "");
    setMediaUrl(d.mediaUrl || "");
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
  }, [selectedId]);

  useEffect(() => {
    loadScheduledPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
      await api.postNow({
        profileId: selectedId,
        postText,
        cta,
        linkUrl: cta === "CALL_NOW" ? "" : effectiveLink,
        phone: phoneCandidate.replace(/^tel:/i, ""),
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

  async function handleBulkPhotoUpload(e) {
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
        setBulkImages((prev) => [...prev, result.url].slice(-50));
        if (!mediaUrl) setMediaUrl(result.url);
        if (activeDraftIndex >= 0) {
          updateBulkDraftBody(activeDraftIndex, { mediaUrl: result.url });
        }
        notify("Photo uploaded and added to bulk selection.");
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
                      <div className="media-preview-thumb">
                        <img
                          src={resolveMediaPreviewUrl(mediaUrl, backendBase)}
                          alt="Default media"
                        />
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
                          <img
                            src={resolveMediaPreviewUrl(mediaUrl, backendBase)}
                            alt="Post media preview"
                            onClick={() =>
                              setLightboxSrc(
                                resolveMediaPreviewUrl(mediaUrl, backendBase)
                              )
                            }
                            style={{ cursor: "pointer" }}
                          />
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

          {tab === "history" && (
            <section className="panel-grid panel-grid--two">
              <div className="panel">
                <div className="panel-title">Post history</div>
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
          onSelect={(value) => {
            setMediaUrl(value);
            setMediaGalleryOpen(false);
            notify("Photo selected from gallery.");
          }}
          onSelectMultiple={(values) => {
            const list = Array.isArray(values) ? values : [];
            setBulkImages(list.slice(0, 50));
            setMediaUrl(list[0] || "");
            notify(`${list.length} photo(s) selected for bulk scheduling.`);
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
