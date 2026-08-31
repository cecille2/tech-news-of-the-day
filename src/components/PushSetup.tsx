"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Status = "idle" | "subscribed" | "keyMismatch" | "unsupported" | "denied" | "error";

function initialStatus(): Status {
  if (typeof window === "undefined") return "idle";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "idle";
}

export function PushSetup() {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "idle") return;
    navigator.serviceWorker.register("/sw.js").then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (!sub) return;
        // A subscription created against an older VAPID key (e.g. from
        // earlier troubleshooting) will be silently rejected by the push
        // service forever — compare against what's actually deployed now
        // rather than trusting "a subscription exists" as "it'll work."
        const currentKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const subKeyBuffer = sub.options.applicationServerKey;
        if (currentKey && subKeyBuffer) {
          const subKey = arrayBufferToBase64Url(subKeyBuffer);
          const normalizedCurrentKey = currentKey.replace(/=+$/, "");
          if (subKey !== normalizedCurrentKey) {
            setStatus("keyMismatch");
            return;
          }
        }
        setStatus("subscribed");
      }),
    );
  }, [status]);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setErrorDetail("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing from this build.");
      setStatus("error");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        setErrorDetail(`/api/push/subscribe returned ${res.status}`);
        setStatus("error");
        return;
      }
      setStatus("subscribed");
    } catch (err) {
      // Show the real error instead of guessing — a NotAllowedError here
      // usually means the page isn't running as an installed home-screen
      // PWA, but other errors (bad key, network) look different.
      const e = err as { name?: string; message?: string };
      setErrorDetail(`${e?.name ?? "Error"}: ${e?.message ?? String(err)}`);
      setStatus("error");
    }
  }

  async function resubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      setStatus("idle");
      await subscribe();
    } catch (err) {
      const e = err as { name?: string; message?: string };
      setErrorDetail(`${e?.name ?? "Error"}: ${e?.message ?? String(err)}`);
      setStatus("error");
    }
  }

  if (status === "unsupported") {
    return <p className="text-sm text-neutral-500">Push isn&apos;t supported in this browser.</p>;
  }
  if (status === "subscribed") {
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">Push notifications are on.</p>;
  }
  if (status === "keyMismatch") {
    return (
      <div>
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Your subscription was created with an older key and won&apos;t receive pushes.
        </p>
        <button
          onClick={resubscribe}
          className="mt-2 text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Refresh subscription
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={subscribe}
        className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        Enable morning push notifications
      </button>
      {status === "denied" && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Notification permission was denied — enable it in your browser/OS settings and try again.
        </p>
      )}
      {status === "error" && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Couldn&apos;t enable push: {errorDetail ?? "unknown error"}
        </p>
      )}
      <p className="text-xs text-neutral-500 mt-2">
        On iPhone, add this app to your home screen first (Share → Add to Home Screen) — iOS only delivers web push to
        installed PWAs, not to Safari tabs.
      </p>
    </div>
  );
}
