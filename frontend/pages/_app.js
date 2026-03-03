import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Spotify Viewer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>🎵</text></svg>"
        />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
          background: #fafafa;
          color: #111;
          -webkit-font-smoothing: antialiased;
        }
        ::selection { background: #1DB954; color: #fff; }
        @keyframes pulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
