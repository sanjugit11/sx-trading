import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/context/Web3Context";

export const metadata: Metadata = {
  title: "SX DeFi Trading Suite",
  description: "Advanced Perpetual, Leveraged Spot, Lending, and Hidden ZK-sim Orders Dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
