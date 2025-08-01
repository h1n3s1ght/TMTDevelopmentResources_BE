// functions/api/crawler.js

import { crawlAndGenerateReport } from '../../shared/crawler.js';

export async function onRequest(context) {
  const { request } = context;
  const { searchParams } = new URL(request.url);

  const baseDomain = searchParams.get('baseDomain');
  if (!baseDomain) {
    return new Response("Missing required 'baseDomain' parameter.", { status: 400 });
  }

  try {
    const report = await crawlAndGenerateReport({
      baseDomain,
      findWord: searchParams.get('findWord') || '',
      findBrokenLinks: searchParams.get('findBrokenLinks') === 'true',
      maxPages: parseInt(searchParams.get('maxPages') || '10'),
      requiredPrecursor: searchParams.get('requiredPrecursor') || '',
      phraseToCheck: searchParams.get('phraseToCheck') || '',
      ignoreWords: (searchParams.get('ignoreWords') || '')
        .split(',')
        .map(w => w.trim())
        .filter(Boolean),
    });

    return new Response(report, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    return new Response('Crawler error: ' + err.message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
