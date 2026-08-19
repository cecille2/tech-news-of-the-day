import {
  markRead,
  toggleFollow,
  remindLater,
  toggleSave,
  giveFeedback,
  boostTopic,
  markIrrelevant,
} from "@/lib/actions";

export interface TopicCardData {
  id: string;
  title: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
  synthesisMethod: string;
  rankScore: number;
  whatHappened: string | null;
  whatChangedToday: string | null;
  howWeGotHere: string | null;
  whyItMatters: string | null;
  whyPeopleAreTalking: string | null;
  whatToWatchNext: string | null;
  sources: { id: string; publication: string; url: string; isPrimary: boolean }[];
  socialMentions: { id: string; platform: string; url: string; accountName: string | null }[];
  isRead: boolean;
  isFollowed: boolean;
  isSaved: boolean;
}

function Section({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <p className="mt-1 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">{text}</p>
    </div>
  );
}

export function TopicCard({ topic }: { topic: TopicCardData }) {
  return (
    <article className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold leading-snug">{topic.title}</h2>
        {topic.verificationStatus === "UNVERIFIED" && (
          <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-medium px-2 py-1">
            surfaced, not yet independently reported
          </span>
        )}
      </div>

      <Section label="What happened" text={topic.whatHappened} />
      <Section label="What changed today" text={topic.whatChangedToday} />
      <Section label="How we got here" text={topic.howWeGotHere} />
      <Section label="Why it matters" text={topic.whyItMatters} />
      <Section label="Why people are talking about it" text={topic.whyPeopleAreTalking} />
      <Section label="What to watch next" text={topic.whatToWatchNext} />

      {topic.sources.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sources</div>
          <ul className="mt-1 flex flex-wrap gap-2">
            {topic.sources.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs rounded-full border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {s.publication}
                  {s.isPrimary ? " · primary" : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.socialMentions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Social coverage</div>
          <ul className="mt-1 flex flex-wrap gap-2">
            {topic.socialMentions.map((m) => (
              <li key={m.id}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs rounded-full border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {m.accountName ?? "unknown"} · {m.platform.toLowerCase()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
        <form action={markRead.bind(null, topic.id)}>
          <button className={`text-xs px-3 py-1.5 rounded-lg border ${topic.isRead ? "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700" : "border-neutral-300 dark:border-neutral-700"}`}>
            {topic.isRead ? "Read" : "Mark read"}
          </button>
        </form>
        <form action={toggleFollow.bind(null, topic.id, !topic.isFollowed)}>
          <button className={`text-xs px-3 py-1.5 rounded-lg border ${topic.isFollowed ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300" : "border-neutral-300 dark:border-neutral-700"}`}>
            {topic.isFollowed ? "Following" : "Follow topic"}
          </button>
        </form>
        <form action={remindLater.bind(null, topic.id, 4)}>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700">
            Remind me later
          </button>
        </form>
        <form action={toggleSave.bind(null, topic.id, !topic.isSaved, undefined)}>
          <button className={`text-xs px-3 py-1.5 rounded-lg border ${topic.isSaved ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "border-neutral-300 dark:border-neutral-700"}`}>
            {topic.isSaved ? "Saved" : "Save"}
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1">
          <form action={giveFeedback.bind(null, topic.id, "MORE_LIKE_THIS")}>
            <button title="More like this" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700">
              More like this
            </button>
          </form>
          <form action={giveFeedback.bind(null, topic.id, "LESS_LIKE_THIS")}>
            <button title="Less like this" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700">
              Less like this
            </button>
          </form>
          <form action={giveFeedback.bind(null, topic.id, "NOT_RELEVANT")}>
            <button title="Not relevant" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500">
              Not relevant
            </button>
          </form>
          <form action={boostTopic.bind(null, topic.id, 1)}>
            <button title="Boost" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700">
              ↑ Boost
            </button>
          </form>
          <form action={markIrrelevant.bind(null, topic.id)}>
            <button title="Hide from feed" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-400">
              Hide
            </button>
          </form>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-neutral-400">
        rank {topic.rankScore.toFixed(2)} · synthesis: {topic.synthesisMethod.toLowerCase()}
      </div>
    </article>
  );
}
