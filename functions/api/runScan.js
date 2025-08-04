export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const json = await request.json();
  const baseDomain = json.baseDomain;

  if (!baseDomain) {
    return new Response("Missing baseDomain", {
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  }

  try {
    const report = await crawlAndGenerateReport({
      baseDomain,
      findWord: json.findWord || "",
      findBrokenLinks: json.findBrokenLinks || false,
      maxPages: parseInt(json.maxPages || "10"),
      requiredPrecursor: json.requiredPrecursor || "",
      phraseToCheck: json.phraseToCheck || "",
      ignoreWords: Array.isArray(json.ignoreWords) ? json.ignoreWords : [],
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
