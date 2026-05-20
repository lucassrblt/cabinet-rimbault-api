import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cabinet Rimbault API",
  description: "API publique du Cabinet Rimbault",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
