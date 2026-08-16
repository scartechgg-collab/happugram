"use client";

import { useEffect } from "react";
import { useAuth, type SessionUser } from "@/components/AuthProvider";
import { LockScreen } from "@/components/LockScreen";
import { AuthScreen } from "@/components/AuthScreen";
import { ChatApp } from "@/components/ChatApp";

export default function HomePage() {
  const { state, unlock } = useAuth();

  // Show a loading spinner during initial check
  if (state.phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#7c5cff] border-t-transparent" />
          <div className="text-sm text-hg-muted">Loading HappuGram…</div>
        </div>
      </div>
    );
  }

  if (state.phase === "locked") {
    return <LockScreen onUnlocked={unlock} />;
  }

  if (state.phase === "unauthenticated") {
    return (
      <AuthScreen
        onAuthenticated={(_user: SessionUser) => {
          // AuthProvider auto-refreshes
        }}
      />
    );
  }

  return <ChatApp />;
}
