export const metadata = { title: 'Licenser', description: 'License + update delivery for the Gloo plugin ecosystem.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; }
          input, select, textarea, button { font: inherit; }
          input, select, textarea { max-width: 100%; }

          /* Off-canvas drawer */
          .lic-drawer-backdrop {
            position: fixed; inset: 0; background: rgba(0,0,0,0.55);
            backdrop-filter: blur(2px); z-index: 90;
            animation: lic-fade 160ms ease-out;
          }
          .lic-drawer {
            position: fixed; top: 0; right: 0; bottom: 0; z-index: 91;
            width: 50vw; max-width: 760px; min-width: 380px;
            background: #14171f; border-left: 1px solid #1f2937;
            box-shadow: -24px 0 48px rgba(0,0,0,0.55);
            overflow-y: auto; padding: 24px 28px;
            animation: lic-slide-in 220ms cubic-bezier(.2,.8,.2,1);
          }
          @media (max-width: 768px) {
            .lic-drawer { width: 100vw; max-width: 100vw; min-width: 0; }
          }
          @keyframes lic-fade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes lic-slide-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
        `}</style>
      </head>
      <body style={{
        margin: 0, minHeight: '100vh',
        background: 'radial-gradient(at 30% 20%, #1e1b4b 0%, #0a0a0f 60%), #0a0a0f',
        color: '#f1f5f9',
        font: '15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>{children}</body>
    </html>
  );
}
