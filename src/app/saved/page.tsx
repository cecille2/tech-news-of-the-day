import { getCurrentUser } from "@/lib/currentUser";
import { getSavedTopics } from "@/lib/topics";
import { TopicCard } from "@/components/TopicCard";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await getCurrentUser();
  const topics = await getSavedTopics(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Saved</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Your personal library — separate from Following. Saving doesn&apos;t mean you want updates.
      </p>
      {topics.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing saved yet.</p>
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
