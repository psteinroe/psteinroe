const YEAR = new Date().getFullYear()

export default {
  darkMode: true,
  head: ({ meta }) => {
    return (
      <>
        <meta name="author" content="Philipp Steinrötter" />
        <link rel="canonical" href="https://philipp.steinroetter.com" />
        <meta name="title" content={meta.title} />
        <meta property="description" content={meta.description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content="https://philipp.steinroetter.com" />
        <meta property="twitter:card" content="summary" />
        <meta property="twitter:site" content="@psteinroe" />
        <meta property="twitter:title" content={meta.title} />
        <meta property="twitter:description" content={meta.description} />
        <meta property="twitter:url" content="https://philipp.steinroetter.com" />
        <meta property="twitter:image" content="https://philipp.steinroetter.com/logo.png" />
      </>
    )
  },
  footer: (
    <div>
      <hr />
      <a href="https://twitter.com/psteinroe" target="_blank">
        Twitter
      </a>{" "}
      ·{" "}
      <a href="https://github.com/psteinroe" target="_blank">
        GitHub
      </a>{" "}
      ·{" "}
      <a href="mailto:philipp@steinroetter.com" target="_blank">
        philipp@steinroetter.com
      </a>
      <small style={{ display: "block", marginTop: "8rem" }}>
        <time>{YEAR}</time> © Philipp Steinrötter.
        <a href="/feed.xml">RSS</a>
        <style jsx>{`
          a {
            float: right;
          }
        `}</style>
      </small>
    </div>
  ),
}
