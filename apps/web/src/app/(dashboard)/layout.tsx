"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullscreen = pathname === "/headquarters";

  return (
    <div className="flex fixed inset-0 bg-background" style={{ overflow: 'clip' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0" style={{ height: '100%', minHeight: 0 }}>
        {!isFullscreen && <TopBar />}
        <main className="flex-1 min-h-0 overflow-y-auto relative">
          {children}
        </main>
      </div>
    </div>
  );
}
