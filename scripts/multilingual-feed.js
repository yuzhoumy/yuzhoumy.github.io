'use strict';

const { generateRssFeed } = require('feedsmith');
const { encodeURL, full_url_for, gravatar, url_for } = require('hexo-util');

const FEEDS = [
  { lang: 'en', rssLang: 'en', path: 'rss-en.xml', title: "Yuzhou's Playground English" },
  { lang: 'zh-TW', rssLang: 'zh-TW', path: 'rss-zh-tw.xml', title: "Yuzhou's Playground 繁體中文" },
  { lang: 'zh-CN', rssLang: 'zh-CN', path: 'rss-zh-cn.xml', title: "Yuzhou's Playground 简体中文" },
  { lang: 'my', rssLang: 'ms', path: 'rss-my.xml', title: "Yuzhou's Playground Bahasa Melayu" }
];
const DEFAULT_FEED = { path: 'rss.xml', title: "Yuzhou's Playground" };
const EMPTY_FEED_DATE = new Date('2026-03-10T00:00:00.000Z');
const FALLBACK_LANGS = ['en', 'zh-TW', 'zh-CN', 'my'];
const LANG_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function stripExtension(path) {
  return path.replace(/\.[^/.]+$/, '');
}

function parsePostSource(source) {
  const normalized = String(source || '').replace(/\\/g, '/');
  const parts = stripExtension(normalized).split('/');
  const lang = parts[parts.length - 1];

  if (!LANG_PATTERN.test(lang) || parts.length < 3) return null;
  if (parts[0] !== '_posts' && parts[0] !== '_drafts') return null;

  return {
    key: `${parts[0]}/${parts.slice(1, -1).join('/')}`,
    lang
  };
}

function toArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.toArray === 'function') return collection.toArray();
  if (Array.isArray(collection.data)) return collection.data;
  return [];
}

function langRank(lang) {
  const index = FALLBACK_LANGS.indexOf(lang);
  return index === -1 ? FALLBACK_LANGS.length : index;
}

function byDateDesc(a, b) {
  return b.date.valueOf() - a.date.valueOf();
}

function groupPosts(posts) {
  const groups = new Map();

  posts.forEach(post => {
    if (post.draft === true) return;

    const source = parsePostSource(post.source);
    const key = source ? source.key : post.source || post.path;
    const lang = source ? source.lang : 'en';

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ post, lang });
  });

  return Array.from(groups.values()).map(group => group.sort((a, b) => {
    const rank = langRank(a.lang) - langRank(b.lang);
    return rank || a.lang.localeCompare(b.lang);
  }));
}

function pickVariant(group, targetLang) {
  const variant = group.find(entry => entry.lang === targetLang);
  return variant ? variant.post : null;
}

function selectPosts(posts, targetLang, feedConfig) {
  const grouped = groupPosts(toArray(posts));
  let selected = grouped
    .map(group => pickVariant(group, targetLang))
    .filter(Boolean)
    .sort(byDateDesc);

  if (feedConfig.limit) selected = selected.slice(0, feedConfig.limit);
  return selected;
}

function itemDescription(post, feedConfig) {
  const { content_limit, content_limit_delim } = feedConfig;

  if (post.description) return post.description;
  if (post.intro) return post.intro;
  if (post.excerpt) return post.excerpt;

  if (post.content) {
    const shortContent = post.content.substring(0, content_limit || 140);
    if (content_limit_delim) {
      const delimPos = shortContent.lastIndexOf(content_limit_delim);
      if (delimPos > -1) return shortContent.substring(0, delimPos);
    }
    return shortContent;
  }

  return '';
}

function itemContent(post, feedConfig) {
  if (feedConfig.content && post.content) {
    return post.content.replace(/[\x00-\x1F\x7F]/g, '');
  }
  return '';
}

function itemCategories(post) {
  const items = [
    ...post.categories ? post.categories.toArray() : [],
    ...post.tags ? post.tags.toArray() : []
  ];
  return items.map(item => ({ name: item.name, domain: item.permalink }));
}

function siteUrlFor(hexo) {
  let siteUrl = hexo.config.url;
  if (siteUrl[siteUrl.length - 1] !== '/') siteUrl += '/';
  return siteUrl;
}

function feedIcon(hexo) {
  const { feed: feedConfig, email } = hexo.config;
  if (feedConfig.icon) return full_url_for.call(hexo, feedConfig.icon);
  if (email) return gravatar(email);
  return '';
}

function feedMeta(hexo, feed, posts) {
  const { config } = hexo;
  const { feed: feedConfig } = config;
  const currentYear = new Date().getFullYear();
  const siteUrl = siteUrlFor(hexo);
  const icon = feedIcon(hexo);
  const newest = posts[0];

  return {
    title: feed.title,
    description: config.subtitle || config.description,
    url: siteUrl,
    feedUrl: full_url_for.call(hexo, feed.path),
    icon,
    hub: feedConfig.hub,
    language: feed.rssLang,
    author: { name: config.author, email: config.email },
    copyright: config.author && `All rights reserved ${currentYear}, ${config.author}`,
    updated: newest ? (newest.updated ? newest.updated.toDate() : newest.date.toDate()) : EMPTY_FEED_DATE
  };
}

function rssItem(hexo, post, feedConfig, meta) {
  const link = encodeURL(full_url_for.call(hexo, post.path));

  return {
    title: post.title,
    link,
    guid: link,
    description: itemDescription(post, feedConfig),
    pubDate: post.date.toDate(),
    authors: [meta.author],
    content: { encoded: itemContent(post, feedConfig) },
    enclosures: post.image && [{ url: full_url_for.call(hexo, post.image) }],
    categories: itemCategories(post)
  };
}

function renderFeed(hexo, feed, posts) {
  const feedConfig = hexo.config.feed;
  const meta = feedMeta(hexo, feed, posts);

  return generateRssFeed({
    title: meta.title,
    description: meta.description,
    link: encodeURL(meta.url),
    language: meta.language,
    copyright: meta.copyright,
    generator: 'Hexo',
    lastBuildDate: meta.updated,
    image: meta.icon && {
      url: meta.icon,
      title: meta.title,
      link: encodeURL(meta.url)
    },
    atom: {
      links: [{ href: encodeURL(meta.feedUrl), rel: 'self', type: 'application/rss+xml' }]
    },
    items: posts.map(post => rssItem(hexo, post, feedConfig, meta))
  }, { lenient: true });
}

function rssAutodiscovery(data) {
  if (data.match(/type=['|"]?application\/(atom|rss)\+xml['|"]?/i)) return;

  const feeds = [DEFAULT_FEED, ...FEEDS];
  const tags = feeds.map(feed => `<link rel="alternate" href="${url_for.call(this, feed.path)}" title="${feed.title}" type="application/rss+xml">`).join('\n');
  return data.replace(/<head>(?!<\/head>).+?<\/head>/s, str => str.replace('</head>', `${tags}\n</head>`));
}

hexo.config.feed.autodiscovery = false;

hexo.extend.generator.register('rss2', function multilingualRssGenerator(locals) {
  const routes = [];

  FEEDS.forEach(feed => {
    const posts = selectPosts(locals.posts, feed.lang, hexo.config.feed);

    routes.push({
      path: feed.path,
      data: renderFeed(hexo, feed, posts)
    });
  });

  return routes;
});

hexo.extend.filter.register('after_render:html', rssAutodiscovery, 20);