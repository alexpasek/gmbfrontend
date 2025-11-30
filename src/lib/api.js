let cachedBase = null;

export async function getApiBase() {
  if (cachedBase) return cachedBase;

  const envBase = import.meta.env.VITE_BACKEND_URL;
  if (envBase) {
    cachedBase = envBase.replace(/\/+$/, "");
    return cachedBase;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes("localhost:5173") || origin.includes("127.0.0.1:5173")) {
      cachedBase = "http://127.0.0.1:8787";
    } else {
      cachedBase = origin;
    }
  } else {
    cachedBase = "http://127.0.0.1:8787";
  }
  return cachedBase;
}

async function doFetch(path, options = {}) {
  const base = await getApiBase();
  const url = base.replace(/\/+$/, "") + path;

  const init = {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  };

  const res = await fetch(url, init);
  if (!res.ok) {
    let text;
    try {
      text = await res.text();
    } catch {
      text = res.statusText;
    }
    throw new Error(`Request ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

const api = {
  async getHealth() {
    return doFetch("/health");
  },
  async getVersion() {
    return doFetch("/version");
  },
  async getProfiles() {
    return doFetch("/profiles");
  },
  async generatePost(profileId) {
    return doFetch(
      `/generate-post-by-profile?profileId=${encodeURIComponent(profileId)}`
    );
  },
  async postNow({
    profileId,
    postText,
    cta,
    linkUrl,
    mediaUrl,
    topicType,
    eventTitle,
    eventStart,
    eventEnd,
    offerTitle,
    offerCoupon,
    offerRedeemUrl,
  }) {
    return doFetch("/post-now", {
      method: "POST",
      body: JSON.stringify({
        profileId,
        postText,
        cta,
        linkUrl,
        mediaUrl,
        topicType,
        eventTitle,
        eventStart,
        eventEnd,
        offerTitle,
        offerCoupon,
        offerRedeemUrl,
      }),
    });
  },
  async postNowAll() {
    return doFetch("/post-now-all", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async getSchedulerConfig() {
    return doFetch("/scheduler/config");
  },
  async setSchedulerConfig(cfg) {
    return doFetch("/scheduler/config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
  },
  async getSchedulerStatus() {
    return doFetch("/scheduler/status");
  },
  async runSchedulerOnce() {
    return doFetch("/scheduler/run-once", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async runSchedulerNow(profileId) {
    return doFetch(`/scheduler/run-now/${encodeURIComponent(profileId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async getPostsHistory(profileId = null, limit = 50) {
    const params = new URLSearchParams();
    if (profileId) params.set("profileId", profileId);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return doFetch(`/posts/history${qs}`);
  },
  async updateProfileDefaults(profileId, payload) {
    return doFetch(`/profiles/${encodeURIComponent(profileId)}/defaults`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async getAccounts() {
    return doFetch("/accounts");
  },
  async getLocations(accountId) {
    const qs = `?accountId=${encodeURIComponent(accountId)}`;
    return doFetch(`/locations${qs}`);
  },
  async getUploadsList() {
    return doFetch("/uploads-list");
  },
  async checkUploads() {
    return doFetch("/uploads-check");
  },
};

export async function updateProfileBulkAccess(profileId, enabled) {
  return doFetch(`/profiles/${encodeURIComponent(profileId)}/bulk-access`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function uploadPhoto(file, baseOverride) {
  const base = (baseOverride || (await getApiBase())).replace(/\/+$/, "");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(base + "/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let text;
    try {
      text = await res.text();
    } catch {
      text = res.statusText;
    }
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return res.json();
}

export default api;
