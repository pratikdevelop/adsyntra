function page() {
  {
    workspaceView === "assets" && (
      <section className="mt-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Asset Library</h2>
          <p className="mt-1 text-sm text-slate-500">
            A shared library for visual media and Google text-asset packs. Each
            item exposes only the platform / campaign-type uses that make sense;
            assets are kept in page state and are not uploaded to Google or
            Meta.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="font-bold text-slate-900">Add an asset</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <TextField
                label="Asset Name *"
                value={newAssetName}
                onChange={(e) => {
                  setNewAssetName(e.target.value);
                  setAssetNotice("");
                }}
                placeholder="Summer campaign image"
                size="small"
                fullWidth
                sx={muiFieldSx}
              />
            </div>
            <div>
              <label className={labelClass}>Asset Type</label>
              <select
                value={newAssetKind}
                onChange={(e) => setNewAssetKind(e.target.value as AssetKind)}
                className={inputClass}
              >
                <option value="IMAGE">Image</option>
                <option value="LOGO">Logo</option>
                <option value="VIDEO">Video</option>
              </select>
            </div>
            <div>
              <TextField
                type="url"
                label="Asset URL *"
                value={newAssetUrl}
                onChange={(e) => {
                  setNewAssetUrl(e.target.value);
                  setAssetNotice("");
                }}
                placeholder="https://.../asset.jpg"
                size="small"
                fullWidth
                sx={muiFieldSx}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={addAssetToLibrary}
            variant="contained"
            disableElevation
            sx={{
              mt: 2,
              borderRadius: 2.5,
              px: 2.5,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Add to library
          </Button>
          {assetNotice && (
            <p className="mt-3 text-sm text-blue-700">{assetNotice}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900">
              Saved assets ({assetLibrary.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWorkspaceView("creative")}
                className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
              >
                Open Creative Studio
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceView("builder")}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Builder
              </button>
            </div>
          </div>
          {assetLibrary.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold text-slate-700">
                Your Asset Library is empty
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add a URL above to start building your reusable media
                collection.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {assetLibrary.map((asset) => (
                <div
                  key={asset.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {asset.name}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                        {asset.kind}
                      </span>
                      {asset.origin === "AI_STUDIO" && (
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">
                          AI Studio demo
                        </span>
                      )}
                      {attachedCreativeAssetIds.includes(asset.id) && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                          Attached to draft
                        </span>
                      )}
                    </div>
                    {asset.kind === "TEXT" && asset.googlePack ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Google {asset.googlePack.formatLabel} ·{" "}
                        {asset.googlePack.headlines.length} headlines ·{" "}
                        {asset.googlePack.descriptions.length} descriptions ·{" "}
                        {asset.googlePack.campaignType}
                      </p>
                    ) : (
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {asset.url}
                      </p>
                    )}
                    {asset.aspectRatio && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Visual ratio: {asset.aspectRatio}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      Added {asset.addedAt}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("metaAds") && (
                        <button
                          type="button"
                          onClick={() => useLibraryAsset(asset, "meta")}
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use for Meta
                        </button>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      googleCampaignType === "PERFORMANCE_MAX" && (
                        <>
                          {(!asset.aspectRatio ||
                            asset.aspectRatio === "1.91:1") && (
                            <button
                              type="button"
                              onClick={() =>
                                useLibraryAsset(asset, "pmax-landscape")
                              }
                              className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                            >
                              Use as PMax landscape (1.91:1)
                              {!asset.aspectRatio ? " · verify crop" : ""}
                            </button>
                          )}
                          {(!asset.aspectRatio ||
                            asset.aspectRatio === "1:1") && (
                            <button
                              type="button"
                              onClick={() =>
                                useLibraryAsset(asset, "pmax-square")
                              }
                              className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                            >
                              Use as PMax square (1:1)
                              {!asset.aspectRatio ? " · verify crop" : ""}
                            </button>
                          )}
                          {(!asset.aspectRatio ||
                            asset.aspectRatio === "4:5") && (
                            <button
                              type="button"
                              onClick={() =>
                                useLibraryAsset(asset, "pmax-portrait")
                              }
                              className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                            >
                              Use as PMax portrait (4:5)
                              {!asset.aspectRatio ? " · verify crop" : ""}
                            </button>
                          )}
                        </>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      ["DISPLAY", "DEMAND_GEN"].includes(googleCampaignType) &&
                      (!asset.aspectRatio ||
                        ["1.91:1", "16:9"].includes(asset.aspectRatio)) && (
                        <button
                          type="button"
                          onClick={() =>
                            useLibraryAsset(asset, "google-display")
                          }
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use for Google landscape image
                        </button>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      ["DISPLAY", "DEMAND_GEN"].includes(googleCampaignType) &&
                      (!asset.aspectRatio || asset.aspectRatio === "1:1") && (
                        <button
                          type="button"
                          onClick={() =>
                            useLibraryAsset(asset, "google-display-square")
                          }
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use as Google square image
                        </button>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      googleCampaignType === "DEMAND_GEN" && (
                        <button
                          type="button"
                          onClick={() => useLibraryAsset(asset, "demand-gen")}
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use in Demand Gen format
                        </button>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      googleCampaignType === "APP" && (
                        <button
                          type="button"
                          onClick={() => useLibraryAsset(asset, "app-image")}
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use in App campaign
                        </button>
                      )}
                    {asset.kind === "TEXT" &&
                      asset.googlePack &&
                      selectedPlatforms.includes("googleAds") && (
                        <button
                          type="button"
                          onClick={() => useGoogleCopyAsset(asset)}
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use for Google {asset.googlePack.campaignType}
                        </button>
                      )}
                    {asset.kind === "IMAGE" &&
                      selectedPlatforms.includes("googleAds") &&
                      googleCampaignType === "SEARCH" && (
                        <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] text-slate-600">
                          Search uses text assets; use a Google RSA copy pack
                        </span>
                      )}
                    {asset.kind === "VIDEO" &&
                      selectedPlatforms.includes("googleAds") &&
                      ["PERFORMANCE_MAX", "DEMAND_GEN", "APP"].includes(
                        googleCampaignType,
                      ) && (
                        <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                          Requires YouTube-hosted video ID
                        </span>
                      )}
                    {["IMAGE", "LOGO"].includes(asset.kind) &&
                      selectedPlatforms.includes("googleAds") &&
                      googleCampaignType === "PERFORMANCE_MAX" && (
                        <button
                          type="button"
                          onClick={() => useLibraryAsset(asset, "pmax-logo")}
                          className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                        >
                          Use as PMax logo (1:1)
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => deleteLibraryAsset(asset.id)}
                      className="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          Prototype limitation: this library stores URL references in React
          state only. Real uploads, file validation, thumbnails, storage,
          provider-specific asset uploads and permissions will be implemented
          with the backend and object storage.
        </p>
      </section>
    );
  }
}
