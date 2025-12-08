import React, { useEffect, useState } from "react";
import { getApiBase } from "../lib/api";

export default function BackendBadge() {
  const [base, setBase] = useState("");
  const [ok, setOk] = useState(null);
  const [authExpired, setAuthExpired] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await getApiBase();
        if (alive) setBase(b);
        const r = await fetch(b + "/health").catch(() => null);
        if (alive) setOk(!!(r && r.ok));
        // Quick auth sanity check: if accounts endpoint is unauthorized, flag token expiry
        const accRes = await fetch(b + "/accounts").catch(() => null);
        if (alive && accRes) {
          if (accRes.status === 401) {
            setAuthExpired(true);
          } else if (!accRes.ok) {
            const txt = await accRes.text().catch(() => "");
            if (/invalid_grant/i.test(txt) || /expired/i.test(txt)) {
              setAuthExpired(true);
            }
          }
        }
      } catch (_) {
        if (alive) setOk(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const txt = ok === null ? "Checking…" : ok ? "Backend OK" : "Backend DOWN";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span className="badge" title={base}>
        <span
          className="badge-dot"
          data-ok={ok === null ? "pending" : ok ? "true" : "false"}
        />
        {txt}
      </span>
      {authExpired ? (
        <div className="muted small" style={{ lineHeight: 1.3 }}>
          Token expired. Re-authorize:
          <div>
            <a
              className="btn btn--ghost btn--small"
              href={base ? base + "/auth" : "/auth"}
              target="_blank"
              rel="noreferrer"
            >
              Re-authorize
            </a>
          </div>
        </div>
      ) : (
        base && (
          <a
            className="muted small"
            href={base + "/auth"}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Re-authorize
          </a>
        )
      )}
    </div>
  );
}
