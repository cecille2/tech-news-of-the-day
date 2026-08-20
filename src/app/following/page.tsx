import { getCurrentUser } from "@/lib/currentUser";
import { getFollowedTopics } from "@/lib/topics";
import { TopicCard } from "@/components/TopicCard";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const user = await getCurrentUser();
  const topics = await getFollowedTopics(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Following</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Topics you&apos;ve asked to keep tracking. New developments land here automatically.
      </p>
      {topics.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing followed yet — follow a topic from Today or Archive.</p>
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
