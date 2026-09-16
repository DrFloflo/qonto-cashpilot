import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qonto Prévi - Dashboard de pilotage de trésorerie",
  description: "Pilotage et prévision de trésorerie en temps réel basé sur vos données Qonto",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
