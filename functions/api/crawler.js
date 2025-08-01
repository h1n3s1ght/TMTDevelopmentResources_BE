import { crawlAndGenerateReport } from '../../shared/crawler.js';

export async function onRequest({ request }) {
  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // Auth
  const auth = request.headers.get("Authorization");
  if (auth !== "Bearer Y0u_W1$h!") {
    return new Response("Unauthorized", { status: 403 });
  }

  // Parse JSON payload
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const {
    baseDomain,
    findWord = "",
    findBrokenLinks = false,
    maxPages = 10,
    requiredPrecursor = "",
    phraseToCheck = "",
    ignoreWords = [],
  } = body;

  if (!baseDomain) {
    return new Response("Missing required 'baseDomain' parameter.", { status: 400 });
  }

  try {
    const report = await crawlAndGenerateReport({
      baseDomain,
      findWord,
      findBrokenLinks,
      maxPages,
      requiredPrecursor,
      phraseToCheck,
      ignoreWords,
    });

    return new Response(report, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  } catch (err) {
    return new Response("Crawler error: " + err.message, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  }
}
