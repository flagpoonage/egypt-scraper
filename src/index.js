// import puppeteer from "puppeteer";
import got from 'got';
import { JSDOM } from 'jsdom';
import { resolve } from 'url';
import path from 'path';
import mkdirp from 'mkdirp';
import { fstat, writeFileSync } from 'fs';

const fof = `http://ancient-egypt.org/e404.html`;
const DMN = 'http://ancient-egypt.org';

const output_base = path.resolve(
  `${process.env.HOME}/scrapes/ancient-egypt.org`
);

const page = (v) => `${DMN}${v.startsWith('/') ? v : `/${v}`}`;

const browse_cache = { [page('/')]: null };

async function browsePage(url) {
  console.log('Slowing down...');
  const timeout = await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log('Requesting', url);
  const rest = await got(url, {
    headers: {
      'User-Agent':
        'James Hay / Web Scraper / Delicate mode, 1 page every 2 seconds (james@nusrah.me)',
    },
  });

  if (rest.redirectUrls?.length > 0) {
    if (rest.redirectUrls.find((a) => a.href === fof)) {
      console.log(`Page not found for ${url}`);
      browse_cache[url] = {
        error: '404',
      };
    } else {
      console.log(`Page is redirected for ${url}`);
      browse_cache[url] = {
        redirects: rest.redirectUrls,
      };
    }
  } else if (rest.statusCode === 200) {
    console.log(`Page loaded for ${url}`);
    browse_cache[url] = {
      path: new URL(url).pathname,
      body: rest.body,
    };

    const dom = new JSDOM(rest.body);
    const links = dom.window.document.querySelectorAll('a');

    const internal_links = Array.from(links)
      .map((a) => a.href)
      .filter((a) => !a.match(/^https?:\/\/|^about:blank|^mailto:/))
      .map((a) => resolve(url, a).split('#')[0])
      .filter((a) => browse_cache[a] === undefined);

    const unique_links = Array.from(new Set(internal_links));

    unique_links.forEach((link) => (browse_cache[link] = null));

    return unique_links;
  } else {
    console.log(`Unexpected status ${rest.statusCode} for ${url}`);
    browse_cache[url] = {
      error: rest.statusCode,
    };
  }
}

let browseable_links = [page('/index.html')];

(async () => {
  while (browseable_links.length > 0) {
    const next_link = browseable_links.shift();
    const links = await browsePage(next_link);
    const cache = browse_cache[next_link];

    if (cache && cache.body && cache.path) {
      mkdirp.sync(path.join(output_base, path.dirname(cache.path)));
      writeFileSync(path.join(output_base, cache.path), cache.body);
    }

    if (links) {
      browseable_links = [...browseable_links, ...links];
      console.log(
        `Found ${links.length} more pages. Remaining pages: ${browseable_links.length}`
      );
    } else {
      console.log(
        `No new pages found. Remaining pages: ${browseable_links.length}`
      );
    }
  }
})();
