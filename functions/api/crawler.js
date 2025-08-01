import { crawlAndGenerateReport } from '../../shared/crawler.js';

export async function onRequest({ request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "text/plain",
  };

  // Handle preflight request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Auth
  const auth = request.headers.get("Authorization");
  if (auth !== "Bearer Y0u_W1$h!") {
    return new Response("Unauthorized", {
      status: 403,
      headers: corsHeaders,
    });
  }

  let json;
  try {
    json = await request.json();
  } catch (err) {
    return new Response("Invalid JSON", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const {
    baseDomain,
    findWord = "",
    findBrokenLinks = false,
    maxPages = 10,
    requiredPrecursor = "",
    phraseToCheck = "",
    ignoreWords = [],
  } = json;

  if (!baseDomain) {
    return new Response("Missing baseDomain", {
      status: 400,
      headers: corsHeaders,
    });
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
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response("Crawler error: " + err.message, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
