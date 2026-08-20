// Minimal service worker: receives a push payload and shows one notification
// with two actions — Open and Remind me later — matching the "keep it
// simple" notification design (Follow/Save/per-topic-remind all live inside
// the app once opened, not crammed into the notification itself).

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Today's briefing is ready", {
      body: payload.body ?? "",
      data: { url: payload.url ?? "/" },
      actions: [
        { action: "open", title: "Open" },
        { action: "remind", title: "Remind me later" },
      ],
      tag: "daily-briefing", // one notification per morning, not a stack
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  if (event.action === "remind") {
    // Server-driven snooze — see /api/digest/snooze and
    // getAndClearUsersDueForSnoozedReminder() in webpush.ts. A setTimeout
    // here would not survive the browser terminating this service worker,
    // which happens well before a multi-hour snooze window elapses.
    event.waitUntil(fetch("/api/digest/snooze", { method: "POST" }));
    return;
  }

  event.waitUntil(self.clients.openWindow(url));
});
