// shared/grammarScanner.js
const axios = require("axios");
const cheerio = require("cheerio");
const { performance } = require("perf_hooks");
const { v4: uuidv4 } = require("uuid");

const octanePassword = "takealook";
const progressMap = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getCrawlProgress(crawlId) {
  return progressMap.get(crawlId) || { status: 'not_found', percent: 0 };
}

function createCrawler(fetchPage) {
  return async function crawl(options) {
    const {
      baseDomain: rawBaseDomain,
      findWord = "",
      findBrokenLinks = false,
      maxPages = 10,
      requiredPrecursor = "",
      phraseToCheck = "",
      ignoreWords: rawIgnoreWords = [],
      delayMs = 500,
      crawlId
    } = options;

    const baseDomain = rawBaseDomain.replace(/\/+$|\s+$/g, "");
    const ignoreWords = Array.isArray(rawIgnoreWords) ? rawIgnoreWords : [];

    const visited = new Set();
    const toVisit = new Set([baseDomain]);
    const allIssues = [];
    const groupedIssues = {};

    const start = performance.now();
    progressMap.set(crawlId, { status: "running", visited: 0, total: maxPages, percent: 0 });

    while (toVisit.size > 0 && visited.size < maxPages) {
      const url = Array.from(toVisit)[0];
      toVisit.delete(url);
      await crawl(url);
      await delay(delayMs);
    }

    const duration = ((performance.now() - start) / 1000).toFixed(1);

    progressMap.set(crawlId, { status: "done", visited: visited.size, total: visited.size, percent: 100 });
    return formatReport(duration);

    async function crawl(url) {
      url = url.replace(/\/+$|\s+$/g, "");
      if (visited.has(url) || visited.size >= maxPages || url.includes("/cdn-cgi/")) return;

      visited.add(url);

      progressMap.set(crawlId, {
        status: "running",
        visited: visited.size,
        total: visited.size + toVisit.size,
        percent: Math.floor((visited.size / Math.max(1, maxPages)) * 100)
      });

      try {
        const response = await fetchPage(url);
        const $ = cheerio.load(response.data);
        $("script, style, noscript").remove();
        let fullText = `${$("body").text()} ${$("img[alt]")
          .map((_, el) => $(el).attr("alt"))
          .get()
          .join(" ")}`.replace(/\s+/g, " ").trim();

        if (findWord && fullText.toLowerCase().includes(findWord.toLowerCase())) {
          const matchSnippet = fullText
            .split(".")
            .find((s) => s.toLowerCase().includes(findWord.toLowerCase()));
          recordIssue(url, "grammar", `Custom term match found: \"${findWord}\"`, "Possible typo or incorrect brand name", matchSnippet);
        }

        if (requiredPrecursor && phraseToCheck) {
          const regex = new RegExp(`(?<!${requiredPrecursor})${phraseToCheck}`, "gi");
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            const context = fullText.substring(Math.max(0, match.index - 40), match.index + 40).trim();
            recordIssue(url, "grammar", `Missing precursor \"${requiredPrecursor}\" before \"${phraseToCheck}\"`, `Consider rewriting as \"${requiredPrecursor}${phraseToCheck}\"`, context);
          }
        }

        if (!findWord) {
          for (let i = 0; i < fullText.length; i += 4000) {
            await checkGrammar(url, fullText.slice(i, i + 4000));
          }
        }

        if (findBrokenLinks) {
          const links = $("a[href]")
            .map((_, el) => $(el).attr("href"))
            .get()
            .filter(href => href && !/^(mailto:|tel:|javascript:|#|\/+$)/i.test(href) && !/\.(jpg|jpeg|png|svg|gif|webp)$/i.test(href))
            .map(href => new URL(href, baseDomain).toString().replace(/\/+$|\s+$/g, ""));

          for (const link of links) {
            try {
              await axios.head(link);
            } catch {
              recordIssue(url, "broken", "Broken link", "N/A", link);
            }
          }
        }

        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href || href.startsWith("mailto:") || href.startsWith("javascript:") || href.startsWith("#") || /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(href)) return;
          const fullUrl = new URL(href, baseDomain).toString().replace(/\/+$|\s+$/g, "");
          if (!visited.has(fullUrl) && !toVisit.has(fullUrl)) toVisit.add(fullUrl);
        });
      } catch {}
    }

    async function checkGrammar(url, text) {
      try {
        const res = await axios.post(
          "https://api.languagetoolplus.com/v2/check",
          new URLSearchParams({ text, language: "en-US" }).toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        res.data.matches.forEach((match) => {
          const context = match.context.text.toLowerCase();
          const skip = [/javascript/, /cdn-cgi/].some((r) => r.test(context)) || ignoreWords.some((w) => context.includes(w.toLowerCase()));
          if (!skip) {
            const type = /spelling/i.test(match.rule.id) ? "spelling" : "grammar";
            recordIssue(url, type, match.message, match.replacements.map((r) => r.value).join(", ") || "N/A", match.context.text);
          }
        });
      } catch (err) {
        console.error(`❌ Grammar check failed for ${url}:`, err.message);
      }
    }

    function recordIssue(url, type, message, suggestions, context) {
      const issue = { type, url, message, suggestions, context };
      allIssues.push(issue);
      groupedIssues[url] = groupedIssues[url] || [];
      groupedIssues[url].push(issue);
    }

    function formatReport(duration) {
      const grammar = allIssues.filter((i) => i.type === "grammar");
      const spelling = allIssues.filter((i) => i.type === "spelling");
      const broken = allIssues.filter((i) => i.type === "broken");

      let output = `Grammar Crawler Results\n===========================\n\nDomain: ${baseDomain}\nPages Analyzed: ${visited.size}\nScan Duration: ${duration} seconds\n\n`;
      if (grammar.length) output += grammar.map((i, idx) => `${idx + 1}. Page: ${new URL(i.url).pathname}\n   Issue: ${i.message}\n   Line: \"${i.context}\"\n\n`).join("");
      if (spelling.length) output += spelling.map((i, idx) => `${idx + 1}. Page: ${new URL(i.url).pathname}\n   Error: ${i.message}\n\n`).join("");
      if (broken.length) output += broken.map((i, idx) => `${idx + 1}. Page: ${new URL(i.url).pathname}\n   Link: ${i.context}\n   Status: ${i.message}\n\n`).join("");

      output += `SUMMARY:\n--------\nTotal Issues: ${allIssues.length}\nGrammar: ${grammar.length}\nSpelling: ${spelling.length}\nBroken Links: ${broken.length}\n\nRecommendations:\n- Review possessive vs. contraction usage\n- Add commas in compound sentences\n- Run spell check on blog content\n- Update broken external links\n`;
      return output;
    }
  };
}

const crawlStandard = createCrawler((url) => axios.get(url));
const crawlOctane = createCrawler((url) => axios.post(url, new URLSearchParams({ password: octanePassword }).toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 5 }));

async function crawlAndGenerateReport(options) {
  const crawlId = uuidv4();
  const isPreview = options.baseDomain.includes("preview.octanesites");
  const report = await (isPreview ? crawlOctane : crawlStandard)({ ...options, crawlId });
  return { crawlId, report };
}

module.exports = {
  crawlAndGenerateReport,
  getCrawlProgress,
};
