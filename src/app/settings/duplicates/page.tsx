import { prisma } from "@/lib/db";
import { resolveDuplicateFlag } from "@/lib/actions";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function DuplicatesSettingsPage() {
  const flags = await prisma.topicDuplicateFlag.findMany({
    where: { resolved: false },
    include: { topicA: true, topicB: true },
    orderBy: { confidence: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Possible duplicates</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Clustering wasn&apos;t confident enough to auto-merge these — a false split costs one click here; a false
        merge would have silently corrupted a topic&apos;s history, so it errs toward asking.
      </p>

      {flags.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing flagged right now.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {flags.map((flag) => (
            <div key={flag.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
              <div className="text-xs text-neutral-500 mb-2">confidence {flag.confidence.toFixed(2)}</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="font-medium">{flag.topicA.title}</div>
                <div className="font-medium">{flag.topicB.title}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <form action={resolveDuplicateFlag.bind(null, flag.id, "merge")}>
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    Merge (keep left)
                  </button>
                </form>
                <form action={resolveDuplicateFlag.bind(null, flag.id, "dismiss")}>
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                    These are different — dismiss
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
