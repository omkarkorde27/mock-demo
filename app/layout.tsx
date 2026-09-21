import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intake → Work Order",
  description:
    "A prototype: free-text maintenance intake turned into a structured, dispatchable work order.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
