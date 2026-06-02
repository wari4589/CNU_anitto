import "@fontsource/pretendard/300.css";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/500.css";
import "@fontsource/pretendard/600.css";
import "@fontsource/pretendard/700.css";
import "@fontsource/pretendard/800.css";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./globals.css";

export const metadata = {
  title: "MANITTO",
  description: "ANA 마니또"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
