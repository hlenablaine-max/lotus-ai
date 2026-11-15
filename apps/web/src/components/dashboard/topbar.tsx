"use client";

import { Bell, ChevronDown } from "lucide-react";

export function TopBar() {
  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">LOTUS AI Enterprise</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">CEO Workspace</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* User */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">I</span>
          </div>
          <span className="text-sm font-medium">Ícaro</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
