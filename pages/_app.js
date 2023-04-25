import Head from 'next/head'
import { Analytics } from '@vercel/analytics/react'
import 'nextra-theme-blog/style.css'

export default function Nextra({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page)
  return (
    <>
      <Head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="RSS"
          href="/feed.xml"
        />
      </Head>
      {getLayout(<Component {...pageProps} />)}
      <Analytics />
    </>
  )
}
