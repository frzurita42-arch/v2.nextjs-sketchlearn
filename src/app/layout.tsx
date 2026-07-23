import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthContext";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SketchLearn — AI lesson paths & slide presentations",
  description:
    "Turn any lesson plan, menu, catalog or portfolio into a repository of AI-generated slide presentations that build on each other.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
