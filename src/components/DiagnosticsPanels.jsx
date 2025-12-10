import React from "react";

export default function DiagnosticsPanels({
  accounts,
  locationsByAccount,
  onLoadAccounts,
  uploadsInfo,
  uploadsCheck,
  onCheckUploads,
}) {
  return (
    <section className="panel-grid panel-grid--two">
      <div className="panel">
        <div className="panel-title">Accounts & locations</div>
        <div className="panel-section action-row">
          <button className="btn btn--ghost" onClick={onLoadAccounts}>
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
                      <div className="diag-title">{a.accountName || a.name}</div>
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
          <button className="btn btn--ghost" onClick={onCheckUploads}>
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
                  Last check: {uploadsCheck.ok ? "OK" : "NOT OK"} · {uploadsCheck.url || ""} (
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
  );
}
