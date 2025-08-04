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
    const report = await crawlAndGenerateReport({
      baseDomain,
      findWord,
      findBrokenLinks,
      maxPages,
      requiredPrecursor,
      phraseToCheck,
      ignoreWords
    });

    res.setHeader("Content-Type", "text/plain");
    res.send(report);
  } catch (err) {
    console.error("❌ Error during scan:", err.message);
    res.status(500).send("Server error during crawl");
  }
});

router.get("/progress", (req, res) => {
  const progress = getCrawlProgress();
  res.json(progress);
});

module.exports = router;
