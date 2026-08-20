import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import {
  addCreator,
  addCreatorPlatformAccount,
  followCreator,
  unfollowCreator,
  setCreatorPlatformPref,
} from "@/lib/actions";
import type { Platform } from "@/generated/prisma/client";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

const PLATFORMS: Platform[] = ["YOUTUBE", "TIKTOK", "INSTAGRAM", "X", "SUBSTACK"];
const AUTOMATED: Platform[] = ["YOUTUBE", "SUBSTACK"];

export default async function CreatorsSettingsPage() {
  const user = await getCurrentUser();
  const creators = await prisma.creator.findMany({
    include: {
      platformAccounts: true,
      follows: { where: { userId: user.id }, include: { platformPrefs: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Creators</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Nobody is pre-loaded — add the people you actually want monitored. YouTube and Substack accounts poll for
        free via RSS; TikTok/Instagram/X stay manual-link until a compliant API exists.
      </p>

      <form
        action={async (formData: FormData) => {
          "use server";
          const name = String(formData.get("name"));
          if (name) await addCreator(name);
        }}
        className="flex gap-2 mb-8"
      >
        <input name="name" placeholder="Creator name" required className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm flex-1" />
        <button className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Add creator
        </button>
      </form>

      <div className="flex flex-col gap-4">
        {creators.length === 0 && <p className="text-sm text-neutral-500">No creators added yet.</p>}
        {creators.map((creator) => {
          const follow = creator.follows[0];
          const prefMap = new Map(follow?.platformPrefs.map((p) => [p.platform, p.enabled]) ?? []);

          return (
            <div key={creator.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{creator.displayName}</div>
                <form action={(follow ? unfollowCreator : followCreator).bind(null, creator.id)}>
                  <button className={`text-xs px-3 py-1.5 rounded-lg border ${follow ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300" : "border-neutral-300 dark:border-neutral-700"}`}>
                    {follow ? "Following" : "Follow"}
                  </button>
                </form>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {creator.platformAccounts.map((account) => {
                  const enabled = prefMap.get(account.platform) ?? true;
                  return (
                    <div key={account.id} className="flex items-center gap-2 text-xs rounded-full border border-neutral-300 dark:border-neutral-700 pl-3 pr-1 py-1">
                      <span>
                        {account.platform.toLowerCase()}
                        {account.ingestionMethod === "MANUAL" ? " (manual)" : ""}
                      </span>
                      {follow && (
                        <form action={setCreatorPlatformPref.bind(null, follow.id, account.platform, !enabled)}>
                          <button className={`px-2 py-0.5 rounded-full ${enabled ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"}`}>
                            {enabled ? "on" : "off"}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>

              <form
                action={async (formData: FormData) => {
                  "use server";
                  const platform = String(formData.get("platform")) as Platform;
                  const handle = String(formData.get("handle"));
                  const url = String(formData.get("url"));
                  if (platform && handle && url) await addCreatorPlatformAccount(creator.id, platform, handle, url);
                }}
                className="mt-3 flex flex-wrap gap-2"
              >
                <select name="platform" className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p.toLowerCase()} {AUTOMATED.includes(p) ? "(auto)" : "(manual)"}
                    </option>
                  ))}
                </select>
                <input name="handle" placeholder="@handle" required className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs w-28" />
                <input name="url" placeholder="Profile/channel URL" required className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs flex-1 min-w-[160px]" />
                <button className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  Add platform
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
