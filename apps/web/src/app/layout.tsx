import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Oswald } from "next/font/google";
import PlausiblePageviewTracker from "./lib/PlausiblePageviewTracker";
import { isPlausibleEnabled, plausibleScriptSrc } from "./lib/analytics";

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
        {isPlausibleEnabled ? (
          <>
            <Script id="plausible-bootstrap" strategy="afterInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init();`}
            </Script>
            <Script
              src={plausibleScriptSrc}
              strategy="afterInteractive"
              async
            />
            <PlausiblePageviewTracker />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
