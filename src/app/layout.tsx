import type { Metadata } from "next";
import "./globals.css";

const LOGO_RAW = "https://res.cloudinary.com/dlu07cuqx/image/upload/v1784704049/ChatGPT_Image_Jul_21_2026_09_09_29_PM_e0hc2q.png";
const LOGO_OG = "https://res.cloudinary.com/dlu07cuqx/image/upload/f_auto,q_auto:eco,w_1200,h_630,c_fill/v1784704049/ChatGPT_Image_Jul_21_2026_09_09_29_PM_e0hc2q.png";

export const metadata: Metadata = {
  title: "Technical Department Shift Handover Form",
  description: "Enterprise-grade Broadcast Engineering Shift Handover & Operations Dashboard.",
  icons: {
    icon: LOGO_RAW,
    shortcut: LOGO_RAW,
    apple: LOGO_RAW,
  },
  openGraph: {
    title: "Technical Department Shift Handover Form",
    description: "Enterprise-grade Broadcast Engineering Shift Handover & Operations Dashboard.",
    url: "https://sonicstream-radio-2026.web.app",
    siteName: "Tech Dept Shift Handover",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: LOGO_OG,
        secureUrl: LOGO_OG,
        width: 1200,
        height: 630,
        alt: "NOC Broadcast Engineering Logo",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NOC Broadcast Engineering Handover System",
    description: "Enterprise-grade Broadcast Engineering Shift Handover & Operations Dashboard.",
    images: [LOGO_OG],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090b" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              // Until React hydrates, forms have no live onSubmit handler and a
              // click would trigger a native GET submit (full reload, input
              // cleared) — which feels like "the button does nothing". Block
              // native submits; React's own handlers still fire (preventDefault
              // does not stop propagation).
              document.addEventListener("submit",function(e){
                if(!e.defaultPrevented){e.preventDefault();}
              },true);
            }catch(_){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
