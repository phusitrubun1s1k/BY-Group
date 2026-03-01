import type { Metadata } from "next";
import { Outfit, Prompt } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ConfirmProvider } from "@/src/components/ConfirmProvider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Badminton Group | จัดก๊วนแบดมินตัน",
  description:
    "ระบบจัดการก๊วนแบดมินตัน จัดคิว จับคู่ บันทึกผล และคำนวณค่าใช้จ่ายอัตโนมัติ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${outfit.variable} ${prompt.variable} antialiased`}>
        <ConfirmProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "12px",
                padding: "14px 20px",
                fontSize: "14px",
                fontFamily: "var(--font-outfit), var(--font-prompt), sans-serif",
              },
            }}
          />
        </ConfirmProvider>
      </body>
    </html>
  );
}
