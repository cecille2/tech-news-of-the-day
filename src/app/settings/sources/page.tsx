import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { toggleCatalogSource, addCustomSource, removeCustomSource } from "@/lib/actions";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function SourcesSettingsPage() {
  const user = await getCurrentUser();
  const [catalog, prefs, custom] = await Promise.all([
    prisma.sourceCatalogEntry.findMany({ orderBy: { name: "asc" } }),
    prisma.userSourcePreference.findMany({ where: { userId: user.id } }),
    prisma.userCustomSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const prefMap = new Map(prefs.map((p) => [p.catalogEntryId, p.enabled]));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Sources</h1>
      <p className="text-sm text-neutral-500 mb-6">
        The default catalog is enabled for every user out of the box. Turn any of it off, or add your own feeds below.
      </p>

      <section className="mb-8">
        <h2 className="font-semibold mb-3">Default catalog</h2>
        <div className="flex flex-col gap-2">
          {catalog.map((entry) => {
            const enabled = prefMap.get(entry.id) ?? true;
            return (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="text-xs text-neutral-500">
                    {entry.tier.replace("_", " ").toLowerCase()} · {entry.category.join(", ")}
                    {!entry.active && <span className="text-amber-600 dark:text-amber-400"> · auto-disabled ({entry.consecutiveFailures} failures)</span>}
                  </div>
                </div>
                <form action={toggleCatalogSource.bind(null, entry.id, !enabled)}>
                  <button className={`text-xs px-3 py-1.5 rounded-lg border ${enabled ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}>
                    {enabled ? "Enabled" : "Disabled"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Your custom sources</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            const label = String(formData.get("label"));
            const feedUrl = String(formData.get("feedUrl"));
            if (label && feedUrl) await addCustomSource(label, feedUrl);
          }}
          className="flex flex-wrap gap-2 mb-4"
        >
          <input name="label" placeholder="Label (e.g. a Substack name)" required className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm flex-1 min-w-[160px]" />
          <input name="feedUrl" placeholder="RSS feed URL" required className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm flex-[2] min-w-[240px]" />
          <button className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">Add</button>
        </form>

        <div className="flex flex-col gap-2">
          {custom.length === 0 && <p className="text-sm text-neutral-500">No custom sources yet.</p>}
          {custom.map((source) => (
            <div key={source.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{source.label}</div>
                <div className="text-xs text-neutral-500 break-all">{source.feedUrl}</div>
              </div>
              <form action={removeCustomSource.bind(null, source.id)}>
                <button className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500">Remove</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
