import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const baseUrl = 'https://uncoshub.ai';
  const pages = [
    '',
    '/news',
    '/verify',
    '/trending',
    '/categories',
    '/saved',
    '/profile',
    '/settings',
    '/about',
    '/contact'
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
    .map(
      (page) => `
    <url>
      <loc>${baseUrl}${page}</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
      <changefreq>${page === '' || page === '/news' || page === '/verify' ? 'always' : 'daily'}</changefreq>
      <priority>${page === '' ? '1.0' : page === '/verify' || page === '/news' ? '0.9' : '0.7'}</priority>
    </url>`
    )
    .join('')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
