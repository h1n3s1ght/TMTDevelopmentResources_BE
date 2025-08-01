// shared/crawler.js
import axios from 'axios';
import cheerio from 'cheerio';
import { performance } from 'perf_hooks';

const octanePassword = 'takealook';

export async function crawlAndGenerateReport(options) {
  const {
    baseDomain,
    findWord = '',
    findBrokenLinks = false,
    maxPages = 10,
    requiredPrecursor = '',
    phraseToCheck = '',
    ignoreWords = []
  } = options;

  const visited = new Set();
  const toVisit = new Set([baseDomain]);
  const allIssues = [];
  const groupedIssues = {};
  let processedPages = 0;

  const start = performance.now();

  while (toVisit.size > 0 && visited.size < maxPages) {
    const url = Array.from(toVisit)[0];
    toVisit.delete(url);
    await crawl(url);
  }

  const duration = ((performance.now() - start) / 1000).toFixed(1);

  return formatReport(duration);

  async function crawl(url) {
    if (visited.has(url) || visited.size >= maxPages || url.includes('/cdn-cgi/')) return;

    visited.add(url);
    processedPages++;

    try {
      const isPreview = baseDomain.includes('preview.octanesites');
      let data;

      if (isPreview) {
        const postResponse = await axios.post(url, new URLSearchParams({ password: octanePassword }).toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          maxRedirects: 5,
        });
        data = postResponse.data;
      } else {
        const getResponse = await axios.get(url);
        data = getResponse.data;
      }

      const $ = cheerio.load(data);
      $('script, style, noscript').remove();
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const altTexts = $('img[alt]').map((_, el) => $(el).attr('alt')).get().filter(Boolean).join(' ');
      const fullText = `${bodyText} ${altTexts}`.trim();
      const clippedText = fullText.length > 18000 ? fullText.slice(0, 18000) : fullText;

      if (findWord && fullText.toLowerCase().includes(findWord.toLowerCase())) {
        const matchSnippet = fullText.split('.').find(s => s.toLowerCase().includes(findWord.toLowerCase()));
        const issue = {
          type: 'grammar', url,
          message: `Custom term match found: "${findWord}"`,
          suggestions: 'Possible typo or incorrect brand name',
          context: matchSnippet ? matchSnippet.trim() : 'Context not found'
        };
        allIssues.push(issue);
        groupedIssues[url] = groupedIssues[url] || [];
        groupedIssues[url].push(issue);
      }

      if (requiredPrecursor && phraseToCheck) {
        const regex = new RegExp(`(?<!${requiredPrecursor})${phraseToCheck}`, 'gi');
        let match;
        while ((match = regex.exec(fullText)) !== null) {
          const contextSnippet = fullText.substring(Math.max(0, match.index - 40), match.index + 40).trim();
          const issue = {
            type: 'grammar', url,
            message: `Missing precursor "${requiredPrecursor}" before "${phraseToCheck}"`,
            suggestions: `Consider rewriting as "${requiredPrecursor}${phraseToCheck}"`,
            context: contextSnippet
          };
          allIssues.push(issue);
          groupedIssues[url] = groupedIssues[url] || [];
          groupedIssues[url].push(issue);
        }
      }

      const links = $('a[href]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .filter(href => href && !href.match(/^(mailto:|tel:|javascript:|#|\/$)/i))
        .map(href => (href.startsWith('/') ? baseDomain + href : href));

      links.forEach(link => {
        if (!visited.has(link)) toVisit.add(link);
      });
    } catch (err) {
      console.error(`❌ Error crawling ${url}:`, err.message);
    }
  }

  function formatReport(duration) {
    const grammar = allIssues.filter(i => i.type === 'grammar');
    const spelling = allIssues.filter(i => i.type === 'spelling');
    const broken = allIssues.filter(i => i.type === 'broken');

    let output = 'Grammar Crawler Results\n';
    output += '===========================\n\n';
    output += `Domain: ${baseDomain}\n`;
    output += `Pages Analyzed: ${visited.size}\n`;
    output += `Scan Duration: ${duration} seconds\n\n`;

    if (grammar.length > 0) {
      output += 'GRAMMAR ISSUES FOUND:\n---------------------\n';
      grammar.forEach((issue, i) => {
        output += `${i + 1}. Page: ${new URL(issue.url).pathname}\n   Issue: ${issue.message}\n   Line: "${issue.context}"\n\n`;
      });
    }

    output += `Total Issues: ${allIssues.length}\n`;
    return output;
  }
}
