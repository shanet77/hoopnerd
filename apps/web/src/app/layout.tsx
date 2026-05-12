import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Oswald } from "next/font/google";
import UmamiPageviewTracker from "./lib/UmamiPageviewTracker";
import { isUmamiEnabled, umamiWebsiteId } from "./lib/analytics";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  icons: {
    icon: "/basketball_favicon.png",
    shortcut: "/basketball_favicon.png",
    apple: "/basketball_favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={oswald.variable}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {isUmamiEnabled ? (
          <>
            <Script
              defer
              src="https://cloud.umami.is/script.js"
              data-website-id={umamiWebsiteId}
              strategy="afterInteractive"
            />
            <UmamiPageviewTracker />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
