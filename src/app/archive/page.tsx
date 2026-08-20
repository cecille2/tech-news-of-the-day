import { getCurrentUser } from "@/lib/currentUser";
import { searchArchive } from "@/lib/topics";
import { TopicCard } from "@/components/TopicCard";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await getCurrentUser();
  const topics = await searchArchive(user.id, q ?? "");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Archive</h1>
      <p className="text-sm text-neutral-500 mb-4">
        Everything ever surfaced, whether or not you saved it — full-text searchable.
      </p>

      <form className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search past topics…"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
      </form>

      {topics.length === 0 ? (
        <p className="text-sm text-neutral-500">No topics found.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}
