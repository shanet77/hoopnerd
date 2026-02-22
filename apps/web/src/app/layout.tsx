import "./globals.css";
import Script from "next/script";
import PlausiblePageviewTracker from "./lib/PlausiblePageviewTracker";
import {
  isPlausibleEnabled,
  plausibleDomain,
  plausibleScriptSrc,
} from "./lib/analytics";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {isPlausibleEnabled && plausibleDomain ? (
          <>
            <Script
              defer
              data-domain={plausibleDomain}
              src={plausibleScriptSrc}
            />
            <PlausiblePageviewTracker />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
