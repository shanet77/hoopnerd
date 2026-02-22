import "./globals.css";
import Script from "next/script";
import PlausiblePageviewTracker from "./lib/PlausiblePageviewTracker";
import { isPlausibleEnabled, plausibleScriptSrc } from "./lib/analytics";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
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
