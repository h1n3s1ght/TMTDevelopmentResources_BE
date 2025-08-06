const express = require("express");
const router = express.Router();

router.post("/performance", (req, res) => {
  res.send("SEO performance scan started");
});

router.get("/performance/progress/:scanId", (req, res) => {
  res.send(`Progress for SEO performance scan ${req.params.scanId}`);
});

router.post("/keytags", (req, res) => {
  res.send("SEO keytags scan started");
});

router.get("/keytags/progress/:scanId", (req, res) => {
  res.send(`Progress for SEO keytags scan ${req.params.scanId}`);
});

module.exports = router;
