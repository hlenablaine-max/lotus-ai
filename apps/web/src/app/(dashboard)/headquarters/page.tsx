"use client";

import { useState } from "react";
import { LotusHQ3D } from "@/components/hq/lotus-hq-3d";
import { CeoChat } from "@/components/chat/ceo-chat";
import { MessageSquare, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HeadquartersPage() {
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* 3D HQ — main view */}
      <div className={cn(
        "flex-1 min-w-0 h-full relative transition-all duration-300",
        chatOpen ? "" : "w-full"
      )}>
        <LotusHQ3D />

        {/* Toggle chat button — only shown when chat is closed */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl
              bg-black/60 border border-white/15 backdrop-blur-md text-white/80 hover:text-white
              hover:border-purple-500/40 transition-all duration-200 text-xs font-medium"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Root Master
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Chat sidebar */}
      <div className={cn(
        "h-full flex flex-col border-l border-white/10 bg-background/95 backdrop-blur-xl transition-all duration-300 overflow-hidden shrink-0",
        chatOpen ? "w-[380px]" : "w-0"
      )}>
        {chatOpen && (
          <>
            {/* Close button overlay */}
            <div className="absolute right-[380px] top-4 z-30">
              <button
                onClick={() => setChatOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded-lg
                  bg-black/60 border border-white/15 backdrop-blur-md
                  text-white/50 hover:text-white hover:border-white/30 transition-all duration-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <CeoChat mini />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
