import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get('host') ?? 'localhost:3000';
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(requestHost)
    ? requestHost
    : 'localhost:3000';
  const metadataBase = new URL(
    `${safeHost.startsWith('localhost') ? 'http' : 'https'}://${safeHost}`,
  );
  const title = 'The Daily Wall — News, pinned in public';
  const description =
    'A WebGPU-powered wall for writing, pasting, arranging, and curating news Post-its with WebMCP.';

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'The Daily Wall — News, pinned in public.' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
