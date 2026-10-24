import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import "./globals.css";

const font = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "Easycard HR",
  description: "ระบบบริหารงานบุคคลและเงินเดือน",
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${font.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
