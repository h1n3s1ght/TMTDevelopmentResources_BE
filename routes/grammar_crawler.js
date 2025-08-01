// routes/crawler.js
const express = require("express");
const router = express.Router();

const axios = require("axios");
const cheerio = require("cheerio");
const { performance } = require("perf_hooks");

let visited, toVisit, totalPages, processedPages, allIssues, groupedIssues, baseDomain, findWord, findBrokenLinks, maxPages, precursorRequired, phraseToCheck, ignoreWords;

const octanePassword = "takealook";

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

  if (!baseDomain) {
    return res.status(400).send("Missing required 'baseDomain' parameter.");
  }

  visited = new Set();
  toVisit = new Set([baseDomain]);
  totalPages = 0;
  processedPages = 0;
  allIssues = [];
  groupedIssues = {};

  const start = performance.now();
  await crawlDomain();
  const duration = ((performance.now() - start) / 1000).toFixed(1);

  const result = formatReport(duration);
  res.setHeader("Content-Type", "text/plain");
  res.send(result);
});


module.exports = router;

async function crawlDomain() {
  while (toVisit.size > 0 && visited.size < maxPages) {
    const url = Array.from(toVisit)[0];
    toVisit.delete(url);
    await crawl(url);
  }
}

async function crawl(url) {
  if (visited.has(url) || visited.size >= maxPages || url.includes("/cdn-cgi/")) return;

  visited.add(url);
  processedPages++;

  try {
    const isPreview = baseDomain.includes("preview.octanesites");
    let data;

    if (isPreview) {
      const postResponse = await axios.post(url, new URLSearchParams({ password: octanePassword }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        maxRedirects: 5,
      });
      data = postResponse.data;
    } else {
      const getResponse = await axios.get(url);
      data = getResponse.data;
    }

    const $ = cheerio.load(data);
    $("script, style, noscript").remove();

    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const altTexts = $("img[alt]")
      .map((_, el) => $(el).attr("alt"))
      .get()
      .filter(Boolean)
      .join(" ");

    const fullText = `${bodyText} ${altTexts}`.trim();
    const clippedText = fullText.length > 18000 ? fullText.slice(0, 18000) : fullText;

    if (findWord && fullText.toLowerCase().includes(findWord.toLowerCase())) {
      const matchSnippet = fullText
        .split(".")
        .find(sentence => sentence.toLowerCase().includes(findWord.toLowerCase()));

      const issue = {
        type: "grammar",
        url,
        message: `Custom term match found: \"${findWord}\"`,
        suggestions: "Possible typo or incorrect brand name",
        context: matchSnippet ? matchSnippet.trim() : "Context not found",
      };
      allIssues.push(issue);
      groupedIssues[url] = groupedIssues[url] || [];
      groupedIssues[url].push(issue);
    }

    if (precursorRequired && phraseToCheck) {
      const regex = new RegExp(`(?<!${precursorRequired})${phraseToCheck}`, "gi");
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        const contextSnippet = fullText.substring(Math.max(0, match.index - 40), match.index + 40).trim();
        const issue = {
          type: "grammar",
          url,
          message: `Missing precursor \"${precursorRequired}\" before \"${phraseToCheck}\"`,
          suggestions: `Consider rewriting as \"${precursorRequired}${phraseToCheck}\"`,
          context: contextSnippet,
        };
        allIssues.push(issue);
        groupedIssues[url] = groupedIssues[url] || [];
        groupedIssues[url].push(issue);
      }
    }

    if (!findWord) await checkGrammar(url, clippedText);

    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(href => href && !href.match(/^(mailto:|tel:|javascript:|#|\/)$/i))
      .map(href => (href.startsWith("/") ? baseDomain + href : href));

    links.forEach(link => {
      if (!visited.has(link)) toVisit.add(link);
    });

    totalPages = visited.size + toVisit.size;
  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  }
}

async function checkGrammar(url, text) {
  try {
    const safeText = text.length > 18000 ? text.slice(0, 18000) : text;
    const response = await axios.post("https://api.languagetoolplus.com/v2/check", new URLSearchParams({
      text: safeText,
      language: "en-US",
    }).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    response.data.matches.forEach(match => {
      const context = match.context.text.toLowerCase();
      const isBoilerplate = [/javascript/, /cdn-cgi/].some(r => r.test(context));
      const hasIgnoreWord = ignoreWords.some(w => context.includes(w.toLowerCase()));
      if (!isBoilerplate && !hasIgnoreWord) {
        const issueType = /spelling/i.test(match.rule.id) ? "spelling" : "grammar";
        allIssues.push({
          type: issueType,
          url,
          message: match.message,
          suggestions: match.replacements.map(r => r.value).join(", ") || "N/A",
          context: match.context.text,
        });
      }
    });
  } catch (err) {
    console.error(`Grammar check failed for ${url}:`, err.message);
  }
}

function formatReport(duration) {
  const grammar = allIssues.filter(i => i.type === "grammar");
  const spelling = allIssues.filter(i => i.type === "spelling");
  const broken = allIssues.filter(i => i.type === "broken");

  let output = "Grammar Crawler Results\n";
  output += "===========================\n\n";
  output += `Domain: ${baseDomain}\n`;
  output += `Pages Analyzed: ${visited.size}\n`;
  output += `Scan Duration: ${duration} seconds\n\n`;

  if (grammar.length > 0) {
    output += "GRAMMAR ISSUES FOUND:\n---------------------\n";
    grammar.forEach((issue, i) => {
      output += `${i + 1}. Page: ${new URL(issue.url).pathname}\n   Issue: ${issue.message}\n   Line: \"${issue.context}\"\n\n`;
    });
  }

  if (spelling.length > 0) {
    output += "SPELLING ERRORS:\n----------------\n";
    spelling.forEach((issue, i) => {
      output += `${i + 1}. Page: ${new URL(issue.url).pathname}\n   Error: ${issue.message}\n\n`;
    });
  }

  if (broken.length > 0) {
    output += "BROKEN LINKS:\n-------------\n";
    broken.forEach((issue, i) => {
      output += `${i + 1}. Page: ${new URL(issue.url).pathname}\n   Link: ${issue.context}\n   Status: ${issue.message}\n\n`;
    });
  }

  output += "SUMMARY:\n--------\n";
  output += `Total Issues: ${allIssues.length}\n`;
  output += `Grammar: ${grammar.length}\n`;
  output += `Spelling: ${spelling.length}\n`;
  output += `Broken Links: ${broken.length}\n\n`;
  output += "Recommendations:\n";
  output += "- Review possessive vs. contraction usage\n";
  output += "- Add commas in compound sentences\n";
  output += "- Run spell check on blog content\n";
  output += "- Update broken external links\n";

  return output;
}
