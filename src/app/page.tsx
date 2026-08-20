import { getCurrentUser } from "@/lib/currentUser";
import { getTodaysTopics } from "@/lib/topics";
import { TopicCard } from "@/components/TopicCard";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await getCurrentUser();
  const topics = await getTodaysTopics(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Today</h1>
      <p className="text-sm text-neutral-500 mb-6">
        {topics.length} topic{topics.length === 1 ? "" : "s"} new or updated in the last 24 hours.
      </p>

      {topics.length === 0 ? (
        <div className="text-sm text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center">
          Nothing yet. Run <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">npm run pipeline</code> to
          ingest today&apos;s sources, or wait for the scheduled GitHub Action.
        </div>
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
