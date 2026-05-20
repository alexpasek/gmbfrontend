import React, { useEffect, useMemo, useState } from "react";
import api, { getApiBase } from "../lib/api";

const SERVICES = [
  "Popcorn ceiling removal",
  "Drywall installation",
  "Drywall repair",
  "Baseboard installation",
  "Wallpaper removal",
  "Ceiling skim coating",
  "Interior painting",
];

const VIDEO_TYPES = [
  "Shorts",
  "Project walkthrough",
  "Before and after",
  "Service explainer",
  "FAQ video",
  "Local landing page video",
];

function profileLabel(profile) {
  return `${profile.businessName || profile.profileId}${profile.city ? ` - ${profile.city}` : ""}`;
}

function cleanNeighbourhoods(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function YouTubePoster({ profiles = [], selectedProfileId = "" }) {
  const [apiBase, setApiBase] = useState("");
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [profileId, setProfileId] = useState(selectedProfileId || "");
  const [service, setService] = useState(SERVICES[0]);
  const [city, setCity] = useState("");
  const [neighbourhoods, setNeighbourhoods] = useState("");
  const [videoType, setVideoType] = useState(VIDEO_TYPES[0]);
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState("unlisted");
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [crossPostGbp, setCrossPostGbp] = useState(true);
  const [seo, setSeo] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.profileId === profileId) || null,
    [profiles, profileId]
  );

  useEffect(() => {
    getApiBase().then(setApiBase).catch(() => {});
    api
      .getYoutubeChannels()
      .then((data) => {
        const list = data.channels || [];
        setChannels(list);
        if (!channelId && list[0]) setChannelId(list[0].id);
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => {
    if (!profileId && selectedProfileId) setProfileId(selectedProfileId);
  }, [selectedProfileId, profileId]);

  useEffect(() => {
    if (!selectedProfile) return;
    setCity((current) => current || selectedProfile.city || "");
    const defaultTopic =
      (selectedProfile.serviceTopics || []).find((topic) => topic.isDefault) ||
      (selectedProfile.serviceTopics || [])[0];
    if (defaultTopic) {
      setService((current) => current || defaultTopic.serviceType || defaultTopic.label || SERVICES[0]);
      setLandingPageUrl((current) => current || defaultTopic.landingUrl || selectedProfile.landingUrl || "");
    } else {
      setLandingPageUrl((current) => current || selectedProfile.landingUrl || "");
    }
    const areas =
      selectedProfile.defaults?.photoNeighbourhoods ||
      selectedProfile.neighbourhoods ||
      [];
    if (Array.isArray(areas) && areas.length) {
      setNeighbourhoods((current) => current || areas.slice(0, 6).join(", "));
    }
  }, [selectedProfile]);

  async function refreshChannels() {
    setError("");
    const data = await api.getYoutubeChannels();
    setChannels(data.channels || []);
    if (!channelId && data.channels?.[0]) setChannelId(data.channels[0].id);
  }

  async function generateSeo() {
    setBusy(true);
    setError("");
    setStatus("Generating YouTube SEO text...");
    try {
      const data = await api.generateYoutubeSeo({
        service,
        city,
        neighbourhoods: cleanNeighbourhoods(neighbourhoods),
        videoType,
        landingPageUrl,
      });
      setSeo(data.seo);
      setStatus("SEO draft ready.");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideo() {
    setBusy(true);
    setError("");
    setStatus("Uploading video to YouTube...");
    setUploadResult(null);
    try {
      const finalSeo =
        seo ||
        (
          await api.generateYoutubeSeo({
            service,
            city,
            neighbourhoods: cleanNeighbourhoods(neighbourhoods),
            videoType,
            landingPageUrl,
          })
        ).seo;
      setSeo(finalSeo);

      const form = new FormData();
      form.append("channelId", channelId);
      form.append("profileId", profileId);
      form.append("service", service);
      form.append("city", city);
      form.append("neighbourhoods", neighbourhoods);
      form.append("videoType", videoType);
      form.append("landingPageUrl", landingPageUrl);
      form.append("privacyStatus", privacyStatus);
      form.append("crossPostGbp", String(crossPostGbp));
      form.append("seoJson", JSON.stringify(finalSeo));
      form.append("video", videoFile);
      if (thumbnailFile) form.append("thumbnail", thumbnailFile);

      const result = await api.uploadYoutubeVideo(form);
      setUploadResult(result);
      setStatus(
        result.gbpCrossPostStatus
          ? `YouTube upload complete. GBP: ${result.gbpCrossPostStatus}`
          : "YouTube upload complete."
      );
    } catch (e) {
      setError(e.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const connectUrl = apiBase ? `${apiBase}/api/google/connect-youtube` : "";

  return (
    <section className="youtube-poster">
      <div className="panel-card youtube-poster__header">
        <div>
          <h2>YouTube Poster</h2>
          <p className="muted">
            Upload one local service video, generate YouTube SEO, add UTM links, and optionally post the video link to Google Business Profile.
          </p>
        </div>
        <div className="youtube-poster__actions">
          <a className="btn btn--blue" href={connectUrl || "#"} target="_blank" rel="noreferrer">
            Connect YouTube
          </a>
          <button className="btn" type="button" onClick={refreshChannels}>
            Refresh channels
          </button>
        </div>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {status && <div className="notice">{status}</div>}

      <div className="youtube-poster__grid">
        <div className="panel-card form-grid">
          <label>
            <span className="field-label">YouTube channel</span>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.channel_title || channel.channel_id}
                  {channel.reconnect_required ? " (reconnect)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">GBP profile for cross-post</span>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Select profile</option>
              {profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profileLabel(profile)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Service</span>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              {SERVICES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Calgary" />
          </label>

          <label className="form-grid__wide">
            <span className="field-label">Neighbourhoods</span>
            <input value={neighbourhoods} onChange={(e) => setNeighbourhoods(e.target.value)} placeholder="Beltline, Bowness, Kensington" />
          </label>

          <label>
            <span className="field-label">Video type</span>
            <select value={videoType} onChange={(e) => setVideoType(e.target.value)}>
              {VIDEO_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Privacy</span>
            <select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value)}>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>

          <label className="form-grid__wide">
            <span className="field-label">Landing page URL</span>
            <input value={landingPageUrl} onChange={(e) => setLandingPageUrl(e.target.value)} placeholder="https://epfproservices.ca/..." />
          </label>

          <label>
            <span className="field-label">Video file</span>
            <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
          </label>

          <label>
            <span className="field-label">Thumbnail file</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
          </label>

          <label className="checkbox-row form-grid__wide">
            <input type="checkbox" checked={crossPostGbp} onChange={(e) => setCrossPostGbp(e.target.checked)} />
            <span>Cross-post the YouTube video link to Google Business Profile after upload</span>
          </label>

          <div className="form-grid__wide youtube-poster__actions">
            <button className="btn" type="button" onClick={generateSeo} disabled={busy || !service || !city || !landingPageUrl}>
              Generate SEO
            </button>
            <button className="btn btn--blue" type="button" onClick={uploadVideo} disabled={busy || !channelId || !videoFile || !service || !city || !landingPageUrl}>
              Upload to YouTube
            </button>
          </div>
        </div>

        <div className="panel-card youtube-preview">
          <h3>SEO Draft</h3>
          {seo ? (
            <>
              <label>
                <span className="field-label">Title</span>
                <input value={seo.title || ""} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
              </label>
              <label>
                <span className="field-label">Description</span>
                <textarea rows={12} value={seo.description || ""} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
              </label>
              <label>
                <span className="field-label">Tags</span>
                <input value={(seo.tags || []).join(", ")} onChange={(e) => setSeo({ ...seo, tags: cleanNeighbourhoods(e.target.value) })} />
              </label>
              <div className="youtube-preview__meta">
                <strong>Thumbnail text idea</strong>
                <span>{seo.thumbnailTextIdea}</span>
              </div>
              <div className="youtube-preview__meta">
                <strong>UTM URL</strong>
                <a href={seo.utmUrl} target="_blank" rel="noreferrer">{seo.utmUrl}</a>
              </div>
              <label>
                <span className="field-label">GBP cross-post text</span>
                <textarea rows={6} value={seo.gbpCrossPostText || ""} onChange={(e) => setSeo({ ...seo, gbpCrossPostText: e.target.value })} />
              </label>
            </>
          ) : (
            <p className="muted">Generate SEO to preview and edit the YouTube title, description, tags, hashtags, thumbnail idea, and GBP cross-post text.</p>
          )}

          {uploadResult?.video?.youtubeUrl && (
            <div className="youtube-result">
              <strong>Uploaded video</strong>
              <a href={uploadResult.video.youtubeUrl} target="_blank" rel="noreferrer">
                {uploadResult.video.youtubeUrl}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
