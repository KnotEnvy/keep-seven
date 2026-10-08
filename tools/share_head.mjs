// The share tags of index.html for a known site address (ruling R15; passes i1 and i3).
//
// index.html names its share picture by a relative address (./share.jpg) so the page works under any sub-path. The
// crawlers that draw a link's preview in a chat or a post do not resolve a relative address: they want an absolute one.
// The Pages workflow tells the build where the site will live (SITE_URL); vite.config.mts passes the page through here.
// With no address, or one that is not http(s), the page is returned as written (a local build, the dev server).
//
// For an address the page gains: og:url, an absolute og:image, og:image:secure_url (https only), twitter:image and a
// canonical link. Everything the page itself loads stays relative.

/** the site address with exactly one trailing slash and no query or fragment, or '' when it is not an http(s) address */
export function siteBase(site) {
  const s = String(site ?? '').trim();
  if (!/^https?:\/\/[^\s"<>]+$/i.test(s)) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  // GitHub serves user pages from a lower-case host; the path keeps the repository's own case
  return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}/`;
}

const RELATIVE = '<meta property="og:image" content="./share.jpg">';

/** index.html with absolute share tags for `site`; unchanged when `site` is empty or not http(s) */
export function shareHead(html, site) {
  const base = siteBase(site);
  if (!base) return html;
  if (!html.includes(RELATIVE)) throw new Error('share_head: index.html no longer has ' + RELATIVE);
  const img = base + 'share.jpg';
  const tags = [
    `<link rel="canonical" href="${base}">`,
    `<meta property="og:url" content="${base}">`,
    `<meta property="og:image" content="${img}">`,
    ...(img.startsWith('https://') ? [`<meta property="og:image:secure_url" content="${img}">`] : []),
    '<meta property="og:image:type" content="image/jpeg">',
    `<meta name="twitter:image" content="${img}">`,
  ];
  return html.replace(RELATIVE, tags.join('\n'));
}
