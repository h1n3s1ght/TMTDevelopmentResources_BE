// routes/grammarRoute.js
const express = require("express");
const router = express.Router();
const { crawlAndGenerateReport, getCrawlProgress } = require("../shared/grammarScanner");

router.post("/", async (req, res) => {
  const {
    baseDomain,
    findWord = "",
    findBrokenLinks = false,
    maxPages = 10,
    requiredPrecursor = "",
    phraseToCheck = "",
    ignoreWords = []
  } = req.body;

  if (!baseDomain) return res.status(400).send("Missing baseDomain");

  try {
    const { crawlId, report } = await crawlAndGenerateReport({
      baseDomain,
      findWord,
      findBrokenLinks,
      maxPages,
      requiredPrecursor,
      phraseToCheck,
      ignoreWords
    });

    res.setHeader("Content-Type", "text/plain");
    res.send(JSON.stringify({ crawlId, report }));
  } catch (err) {
    console.error("❌ Error during scan:", err.message);
    res.status(500).send("Server error during crawl");
  }
});

router.get("/progress/:crawlId", (req, res) => {
  const crawlId = req.params.crawlId;
  const progress = getCrawlProgress(crawlId);
  res.json(progress);
});

module.exports = router;