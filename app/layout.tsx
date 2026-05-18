export const metadata = { title: 'Licenser', description: 'License + update delivery for the Gloo plugin ecosystem.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh',
        background: 'radial-gradient(at 30% 20%, #1e1b4b 0%, #0a0a0f 60%), #0a0a0f',
        color: '#f1f5f9',
        font: '15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>{children}</body>
    </html>
  );
}
