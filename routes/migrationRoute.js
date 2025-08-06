const express = require("express");
const router = express.Router();
const { getAllBlogs, getScanProgress } = require("../shared/migrationScanner");
const { getSpecificBlogs } = require("../shared/migrationScanner");
const { clearScan } = require("../shared/migrationScanner");


router.post("/getAllBlogs", async (req, res) => {
  const { baseUrl, maxPages = 100, scanId } = req.body;

  if (!baseUrl || !scanId)
    return res.status(400).json({ error: "Missing baseUrl or scanId" });

  try {
    const { summary, csv } = await getAllBlogs(baseUrl, maxPages, scanId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=blogs.csv");
    res.send(csv);
  } catch (err) {
    console.error("❌ Error: ", err);
    res.status(500).json({ error: "Server error during blog crawl" });
  }
});

router.get("/getAllBlogs/progress/:scanId", (req, res) => {
  const { scanId } = req.params;
  const progress = getScanProgress(scanId);
  res.json(progress);
});

router.post("/getSpecificBlogs", async (req, res) => {
  const { baseUrl, blogUrlList, scanId } = req.body;

  if (!baseUrl || !blogUrlList?.length || !scanId) {
    return res.status(400).json({ error: "Missing baseUrl, blogUrlList, or scanId" });
  }

  try {
    const { summary, csv } = await getSpecificBlogs(baseUrl, blogUrlList, scanId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=specific-blogs.csv");
    res.send(csv);
  } catch (err) {
    console.error("❌ Error: ", err);
    res.status(500).json({ error: "Server error during specific blog crawl" });
  }
});

router.get("/getSpecificBlogs/progress/:scanId", (req, res) => {
  const { scanId } = req.params;
  const progress = getScanProgress(scanId);
  res.json(progress);
});


router.delete("/scan/:scanId", (req, res) => {
  const { scanId } = req.params;
  const deleted = clearScan(scanId);
  if (deleted === 1) {
    res.status(200).json({ message: `Scan ${scanId} cleared.` });
  } else {
    res.status(404).json({ error: `Scan ${scanId} not found.` });
  }
});


module.exports = router;
