// shared/grammarScanner.js
const axios = require("axios");
const cheerio = require("cheerio");
const { performance } = require("perf_hooks");

const octanePassword = "takealook";

let crawlProgress = {
  status: "running",
  visited: 0,
  total: 1,
  percent: 0,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getCrawlProgress() {
  return crawlProgress;
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
    } = options;

    const baseDomain = rawBaseDomain.replace(/\/+$/, "");
    const ignoreWords = Array.isArray(rawIgnoreWords) ? rawIgnoreWords : [];

    const visited = new Set();
    const toVisit = new Set([baseDomain]);
    const allIssues = [];
    const groupedIssues = {};

    const start = performance.now();
    crawlProgress.total = maxPages;

    while (toVisit.size > 0 && visited.size < maxPages) {
      const url = Array.from(toVisit)[0];
      toVisit.delete(url);
      await crawl(url);
      await delay(delayMs);
    }

    const duration = ((performance.now() - start) / 1000).toFixed(1);

    crawlProgress.status = "done";
    crawlProgress.percent = 100;
    return formatReport(duration);

    async function crawl(url) {
      url = url.replace(/\/+$/, "");
      if (
        visited.has(url) ||
        visited.size >= maxPages ||
        url.includes("/cdn-cgi/")
      )
        return;

      visited.add(url);

      crawlProgress.status = "running";
      crawlProgress.visited = visited.size;
      crawlProgress.total = visited.size + toVisit.size;
      crawlProgress.percent = Math.floor(
        (visited.size / Math.max(1, maxPages)) * 100
      );

      try {
        const response = await fetchPage(url);
        const $ = cheerio.load(response.data);
        $("script, style, noscript").remove();
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const altText = $("img[alt]")
          .map((_, el) => $(el).attr("alt"))
          .get()
          .join(" ");
        let fullText = `${bodyText} ${altText}`.trim();

        fullText =
          fullText.length > 40000 ? fullText.slice(0, 40000) : fullText;

        if (
          findWord &&
          fullText.toLowerCase().includes(findWord.toLowerCase())
        ) {
          const matchSnippet = fullText
            .split(".")
            .find((s) => s.toLowerCase().includes(findWord.toLowerCase()));
          recordIssue(
            url,
            "grammar",
            `Custom term match found: \"${findWord}\"`,
            "Possible typo or incorrect brand name",
            matchSnippet
          );
        }

        if (requiredPrecursor && phraseToCheck) {
          const regex = new RegExp(
            `(?<!${requiredPrecursor})${phraseToCheck}`,
            "gi"
          );
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            const context = fullText
              .substring(Math.max(0, match.index - 40), match.index + 40)
              .trim();
            recordIssue(
              url,
              "grammar",
              `Missing precursor \"${requiredPrecursor}\" before \"${phraseToCheck}\"`,
              `Consider rewriting as \"${requiredPrecursor}${phraseToCheck}\"`,
              context
            );
          }
        }


        if (!findWord) {
          const chunks = [];
          for (let i = 0; i < fullText.length; i += 4000) {
            chunks.push(fullText.slice(i, i + 4000));
          }
          for (const chunk of chunks) {
            await checkGrammar(url, chunk);
          }
        }

        if (findBrokenLinks) {
          const links = $("a[href]")
            .map((_, el) => $(el).attr("href"))
            .get()
            .filter(
              (href) =>
                href &&
                !href.match(/^(mailto:|tel:|javascript:|#|\/+$$)/i) &&
                !href.match(/\.(jpg|jpeg|png|svg|gif|webp)$/i)
            )
            .map((href) =>
              new URL(href, baseDomain).toString().replace(/\/+$/, "")
            );

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
          if (
            !href ||
            href.startsWith("mailto:") ||
            href.startsWith("javascript:") ||
            href.startsWith("#") ||
            href.match(/\.(jpg|jpeg|png|svg|gif|webp)$/i)
          )
            return;

          const fullUrl = new URL(href, baseDomain)
            .toString()
            .replace(/\/+$/, "");
          if (!visited.has(fullUrl) && !toVisit.has(fullUrl))
            toVisit.add(fullUrl);
        });
      } catch (err) {
        
      }
    }

    async function checkGrammar(url, text) {
      try {
        const res = await axios.post(
          "https://api.languagetoolplus.com/v2/check",
          new URLSearchParams({
            text,
            language: "en-US",
          }).toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );

        res.data.matches.forEach((match) => {
          const context = match.context.text.toLowerCase();
          const skip =
            [/javascript/, /cdn-cgi/].some((r) => r.test(context)) ||
            ignoreWords.some((w) => context.includes(w.toLowerCase()));

          if (!skip) {
            const type = /spelling/i.test(match.rule.id)
              ? "spelling"
              : "grammar";
            recordIssue(
              url,
              type,
              match.message,
              match.replacements.map((r) => r.value).join(", ") || "N/A",
              match.context.text
            );
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

      let output = "Grammar Crawler Results\n";
      output += "===========================\n\n";
      output += `Domain: ${baseDomain}\n`;
      output += `Pages Analyzed: ${visited.size}\n`;
      output += `Scan Duration: ${duration} seconds\n\n`;

      if (grammar.length > 0) {
        output += "GRAMMAR ISSUES FOUND:\n---------------------\n";
        grammar.forEach((issue, i) => {
          output += `${i + 1}. Page: ${
            new URL(issue.url).pathname
          }\n   Issue: ${issue.message}\n   Line: \"${issue.context}\"\n\n`;
        });
      }

      if (spelling.length > 0) {
        output += "SPELLING ERRORS:\n----------------\n";
        spelling.forEach((issue, i) => {
          output += `${i + 1}. Page: ${
            new URL(issue.url).pathname
          }\n   Error: ${issue.message}\n\n`;
        });
      }

      if (broken.length > 0) {
        output += "BROKEN LINKS:\n-------------\n";
        broken.forEach((issue, i) => {
          output += `${i + 1}. Page: ${new URL(issue.url).pathname}\n   Link: ${
            issue.context
          }\n   Status: ${issue.message}\n\n`;
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
  };
}

const crawlStandard = createCrawler((url) => axios.get(url));
const crawlOctane = createCrawler((url) =>
  axios.post(
    url,
    new URLSearchParams({ password: octanePassword }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 5,
    }
  )
);

async function crawlAndGenerateReport(options) {
  const isPreview = options.baseDomain.includes("preview.octanesites");
  return isPreview ? crawlOctane(options) : crawlStandard(options);
}

module.exports = {
  crawlAndGenerateReport,
  getCrawlProgress,
};
