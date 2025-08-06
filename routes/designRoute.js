const express = require("express");
const router = express.Router();

router.post("/accessibility", (req, res) => {
  res.send("Design accessibility scan started");
});

router.get("/accessibility/progress/:scanId", (req, res) => {
  res.send(`Progress for accessibility scan ${req.params.scanId}`);
});

router.post("/fileSize", (req, res) => {
  res.send("Design file size scan started");
});

router.get("/fileSize/progress/:scanId", (req, res) => {
  res.send(`Progress for file size scan ${req.params.scanId}`);
});

router.post("/resizeTesting", (req, res) => {
  res.send("Design resize test started");
});

router.get("/resizeTesting/progress/:scanId", (req, res) => {
  res.send(`Progress for resize test ${req.params.scanId}`);
});

module.exports = router;
