import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const font = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "Easycard HR",
  description: "ระบบบริหารงานบุคคลและเงินเดือน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${font.variable} antialiased`}>{children}</body>
    </html>
  );
}
