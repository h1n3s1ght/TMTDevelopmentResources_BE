// shared/migrationScanner.js
const axios = require("axios");
const cheerio = require("cheerio");
const { createObjectCsvStringifier } = require("csv-writer");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const { URL } = require("url");

const NodeCache = require("node-cache");
const scanProgress = new NodeCache({ stdTTL: 86400 }); // 24 hours

function extractContent($) {
  return $("article, .content, .postcontent")
    .map((_, el) => $(el).html())
    .get()
    .join("");
}

function getFirstImage($) {
  return $("article img, .postcontent img, .content img").first().attr("src") || "";
}

function isNoIndexed($) {
  return $('meta[name="robots"]').attr("content")?.includes("noindex") || false;
}

function ensureScanId(scanId) {
  return scanId || String(Date.now());
}

async function extractBlogLinks(baseUrl, isPreview = false, maxPages = 100) {
  const visited = new Set();
  const queue = [baseUrl];
  const links = [];

  const jar = new tough.CookieJar();
  const client = isPreview
    ? wrapper(axios.create({ jar, headers: { "User-Agent": "Mozilla/5.0" } }))
    : axios.create({ headers: { "User-Agent": "Mozilla/5.0" } });

  if (isPreview) {
    try {
      await client.post(
        new URL(baseUrl).origin,
        new URLSearchParams({ password: "takealook" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
    } catch (err) {
      console.warn("⚠️ Preview login failed.");
    }
  }

  while (queue.length && links.length < maxPages) {
    const currentUrl = queue.shift();
    if (visited.has(currentUrl)) continue;

    visited.add(currentUrl);
    try {
      const res = await client.get(currentUrl);
      const $ = cheerio.load(res.data);
      const foundLinks = $("a[href]").map((_, a) => $(a).attr("href")).get();

      for (const href of foundLinks) {
        if (!href || href.startsWith("mailto:") || href.startsWith("#")) continue;

        let fullUrl;
        try {
          fullUrl = new URL(href, baseUrl).href;
        } catch (e) {
          continue;
        }

        if (fullUrl.includes("/blog/") && !visited.has(fullUrl)) {
          links.push(fullUrl);
        }

        if (fullUrl.startsWith(baseUrl) && !visited.has(fullUrl)) {
          queue.push(fullUrl);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Failed to crawl ${currentUrl}`);
    }
  }

  return links.slice(0, maxPages);
}

async function parseBlogPage(url, isPreview = false) {
  try {
    let res;
    const jar = new tough.CookieJar();
    const client = isPreview ? wrapper(axios.create({ jar })) : axios;

    if (isPreview) {
      const loginUrl = new URL(url).origin;
      await client.post(
        loginUrl,
        new URLSearchParams({ password: "takealook" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
          },
        }
      );
    }

    res = await client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(res.data);
    const pagetitle = $("meta[property='og:title']").attr("content") || $("h1").first().text().trim();
    const titletag = $("title").text().trim();
    const metadesc = $("meta[name='description']").attr("content") || "";
    const publishdate =
      $("meta[property='article:published_time']").attr("content") ||
      $("meta[name='pubdate']").attr("content") ||
      $("time").first().attr("datetime") ||
      $("time").first().text().trim() || "";
    const content = extractContent($);
    const imagefile = getFirstImage($);
    const slug = new URL(url).pathname.replace(/^\//, "");

    return {
      pageid: "",
      pageparent: 0,
      pagetitle,
      pagelive: "live",
      pageintrash: 0,
      titletag,
      metadesc,
      publishdate,
      oldurl: url,
      pagedata: JSON.stringify({
        title: pagetitle,
        "display-title": pagetitle,
        "article-author": "",
        "preview-image": { imagefile, alt: pagetitle },
        "hero-image": { imagefile, alt: pagetitle },
        content,
      }),
      post_type: "post",
      published: "yes",
      fix_images: "TRUE",
      blogcategories: "blog/category/general",
      tags: "",
      overrideurl: slug,
      noindex: isNoIndexed($) ? "yes" : "no",
      imagefile,
    };
  } catch (err) {
    return {
      pageid: "",
      pageparent: 0,
      pagetitle: "",
      pagelive: "live",
      pageintrash: 0,
      titletag: "",
      metadesc: "",
      publishdate: "",
      oldurl: url,
      pagedata: "",
      post_type: "post",
      published: "no",
      fix_images: "FALSE",
      blogcategories: "",
      tags: "",
      overrideurl: "",
      noindex: "unknown",
      imagefile: "",
    };
  }
}

async function getAllBlogs(indexUrl, maxPages = 100, scanId = null) {
  scanId = ensureScanId(scanId);
  if (scanProgress.get(scanId)) throw new Error(`Scan ID "${scanId}" is already in use. Please use a unique ID.`);

  const isPreview = indexUrl.includes("preview.octanesites.com");
  const blogLinks = await extractBlogLinks(indexUrl, isPreview, maxPages);
  const records = [];
  const total = blogLinks.length;

  scanProgress.set(scanId, { current: 0, total });

  for (let i = 0; i < blogLinks.length; i++) {
    const url = blogLinks[i];
    const data = await parseBlogPage(url, isPreview);
    if (data.pagetitle) records.push(data);
    scanProgress.set(scanId, { current: i + 1, total });
  }

  scanProgress.del(scanId);

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: "pageid", title: "pageid" },
      { id: "pageparent", title: "pageparent" },
      { id: "pagetitle", title: "pagetitle" },
      { id: "pagelive", title: "pagelive" },
      { id: "pageintrash", title: "pageintrash" },
      { id: "titletag", title: "titletag" },
      { id: "metadesc", title: "metadesc" },
      { id: "publishdate", title: "publishdate" },
      { id: "oldurl", title: "oldurl" },
      { id: "pagedata", title: "pagedata" },
      { id: "post_type", title: "post_type" },
      { id: "published", title: "published" },
      { id: "fix_images", title: "fix_images" },
      { id: "blogcategories", title: "blogcategories" },
      { id: "tags", title: "tags" },
      { id: "overrideurl", title: "overrideurl" },
      { id: "noindex", title: "noindex" },
    ],
  });

  const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

  return {
    summary: `Crawled ${records.length} blog posts from ${indexUrl}`,
    csv,
    scanId,
  };
}

async function getSpecificBlogs(baseUrl, blogUrlList, scanId = null) {
  scanId = ensureScanId(scanId);
  if (scanProgress.get(scanId)) throw new Error(`Scan ID "${scanId}" is already in use. Please use a unique ID.`);

  const isPreview = baseUrl.includes("preview.octanesites.com");
  const jar = new tough.CookieJar();
  const client = isPreview
    ? wrapper(axios.create({ jar, headers: { "User-Agent": "Mozilla/5.0" } }))
    : axios.create({ headers: { "User-Agent": "Mozilla/5.0" } });

  if (isPreview) {
    try {
      await client.post(
        new URL(baseUrl).origin,
        new URLSearchParams({ password: "takealook" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
    } catch (e) {
      console.warn("⚠️ Preview login failed.");
    }
  }

  const records = [];
  const total = blogUrlList.length;
  scanProgress.set(scanId, { current: 0, total });

  for (let i = 0; i < blogUrlList.length; i++) {
    const slug = blogUrlList[i];
    const fullUrl = baseUrl + (slug.endsWith("/") ? slug : slug + "/");
    const data = await parseBlogPage(fullUrl, isPreview);
    if (data?.pagetitle) records.push(data);
    scanProgress.set(scanId, { current: i + 1, total });
  }

  scanProgress.del(scanId);

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: "pageid", title: "pageid" },
      { id: "pageparent", title: "pageparent" },
      { id: "pagetitle", title: "pagetitle" },
      { id: "pagelive", title: "pagelive" },
      { id: "pageintrash", title: "pageintrash" },
      { id: "titletag", title: "titletag" },
      { id: "metadesc", title: "metadesc" },
      { id: "publishdate", title: "publishdate" },
      { id: "oldurl", title: "oldurl" },
      { id: "pagedata", title: "pagedata" },
      { id: "post_type", title: "post_type" },
      { id: "published", title: "published" },
      { id: "fix_images", title: "fix_images" },
      { id: "blogcategories", title: "blogcategories" },
      { id: "tags", title: "tags" },
      { id: "overrideurl", title: "overrideurl" },
      { id: "noindex", title: "noindex" },
      { id: "imagefile", title: "imagefile" },
    ],
  });

  const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

  return {
    summary: `Processed ${records.length} selected blog posts from ${baseUrl}`,
    csv,
    scanId,
  };
}

function getScanProgress(scanId) {
  const progress = scanProgress.get(scanId);
  if (!progress) return { progress: 100 };
  const percentage = Math.floor((progress.current / progress.total) * 100);
  return { progress: percentage };
}

function clearScan(scanId) {
  return scanProgress.del(scanId);
}

module.exports = { getAllBlogs, getSpecificBlogs, getScanProgress, clearScan };