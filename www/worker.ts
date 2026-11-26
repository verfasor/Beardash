// www.beardash.dev (any path, http or https) → https://beardash.dev, same path and query.
export default {
  fetch(req: Request) {
    const url = new URL(req.url)
    return new Response(null, {
      status: 301,
      headers: {
        Location: `https://beardash.dev${url.pathname}${url.search}`,
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  },
}
