import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "OjaRun Ops",
  description: "Orders, dispatch, shoppers and settings for OjaRun.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg font-sans text-ink">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#15803D",
              colorDanger: "#B42318",
              borderRadius: "12px",
              fontFamily: "var(--font-jakarta)",
            },
          }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
