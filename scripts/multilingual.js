'use strict';

const { createSha1Hash, Permalink, slugize, url_for } = require('hexo-util');
const pathUtil = require('path');

const LANG_ORDER = ['en', 'zh-TW', 'zh-CN', 'my'];
const LANG_LABELS = {
  en: 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  my: 'Bahasa Melayu'
};
const LANG_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/');
}

function stripExtension(path) {
  return path.replace(/\.[^/.]+$/, '');
}

function trimSlashes(path) {
  return path.replace(/^\/+|\/+$/g, '');
}

function withTrailingSlash(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

function langRank(lang) {
  const index = LANG_ORDER.indexOf(lang);
  return index === -1 ? LANG_ORDER.length : index;
}

function sortLanguages(a, b) {
  const rank = langRank(a.lang) - langRank(b.lang);
  return rank || a.lang.localeCompare(b.lang);
}

function parseLangSource(source) {
  const normalized = normalizePath(source);
  const parts = stripExtension(normalized).split('/');
  const lang = parts[parts.length - 1];

  if (!LANG_PATTERN.test(lang) || parts.length < 2) return null;

  if ((parts[0] === '_posts' || parts[0] === '_drafts') && parts.length >= 3) {
    const slug = parts.slice(1, -1).join('/');
    return {
      type: 'post',
      collection: parts[0],
      slug,
      lang,
      key: `${parts[0]}/${slug}`
    };
  }

  const slug = parts.slice(0, -1).join('/');
  if (!slug) return null;

  return {
    type: 'page',
    slug,
    lang,
    key: slug
  };
}

function itemArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.toArray === 'function') return collection.toArray();
  if (Array.isArray(collection.data)) return collection.data;
  return [];
}

function categorySlug(post, defaultCategory) {
  const categories = post.categories;
  if (categories && categories.length) return categories.last().slug;
  return defaultCategory;
}

function defaultPostPermalink(hexo, data) {
  const { id, _id, slug, title, date } = data;
  let { __permalink } = data;
  const { post_asset_folder } = hexo.config;

  if (__permalink) {
    if (post_asset_folder && !__permalink.endsWith('/') && !__permalink.endsWith('.html')) {
      __permalink += '/';
    }
    return __permalink.startsWith('/') ? __permalink : `/${__permalink}`;
  }

  const hash = slug && date
    ? createSha1Hash().update(slug + date.unix().toString()).digest('hex').slice(0, 12)
    : null;
  const meta = {
    id: id || _id,
    title: slug,
    name: typeof slug === 'string' ? pathUtil.basename(slug) : '',
    post_title: slugize(title, { transform: 1 }),
    year: date.format('YYYY'),
    month: date.format('MM'),
    day: date.format('DD'),
    hour: date.format('HH'),
    minute: date.format('mm'),
    second: date.format('ss'),
    i_month: date.format('M'),
    i_day: date.format('D'),
    timestamp: date.format('X'),
    hash,
    category: hexo.config.default_category
  };

  if (data.categories && data.categories.length) {
    meta.category = data.categories.last().slug;
  }

  const keys = Object.keys(data);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) continue;
    Object.defineProperty(meta, key, Object.getOwnPropertyDescriptor(data, key));
  }

  if (hexo.config.permalink_defaults) {
    for (const key of Object.keys(hexo.config.permalink_defaults)) {
      if (!Object.prototype.hasOwnProperty.call(meta, key)) {
        meta[key] = hexo.config.permalink_defaults[key];
      }
    }
  }

  let result = new Permalink(hexo.config.permalink, {}).stringify(meta);
  if (post_asset_folder && !result.endsWith('/') && !result.endsWith('.html')) result += '/';
  return result;
}

function postBasePath(hexo, post, slug) {
  const originalSlug = post.slug;
  post.slug = slug;
  const result = defaultPostPermalink(hexo, post);
  post.slug = originalSlug;
  return withTrailingSlash(trimSlashes(result));
}

function pageBasePath(source) {
  return withTrailingSlash(trimSlashes(source.slug));
}

function groupForPost(hexo, source) {
  return itemArray(hexo.model('Post')).map(item => ({ item, source: parseLangSource(item.source) }))
    .filter(entry => entry.source && entry.source.type === 'post' && entry.source.key === source.key)
    .sort((a, b) => sortLanguages(a.source, b.source));
}

function groupForPage(site, source) {
  return itemArray(site.pages).map(item => ({ item, source: parseLangSource(item.source) }))
    .filter(entry => entry.source && entry.source.type === 'page' && entry.source.key === source.key)
    .sort((a, b) => sortLanguages(a.source, b.source));
}

function defaultEntry(entries) {
  return entries.find(entry => entry.source.lang === 'en') || entries[0];
}

function postPath(hexo, post, source) {
  const entries = groupForPost(hexo, source);
  const defaultLang = entries.length ? defaultEntry(entries).source.lang : source.lang;
  const basePath = postBasePath(hexo, post, source.slug);

  return source.lang === defaultLang ? basePath : withTrailingSlash(`${basePath}${source.lang}`);
}

function pagePath(source) {
  const basePath = pageBasePath(source);
  return source.lang === 'en' ? basePath : withTrailingSlash(`${basePath}${source.lang}`);
}

function languageUrlFor(item, source) {
  if (source.type === 'post') return item.path;
  return pagePath(source);
}

function aliasPathFor(item, source) {
  const basePath = source.type === 'post'
    ? withTrailingSlash(trimSlashes(item.path).replace(new RegExp(`/${source.lang}/?$`), ''))
    : pageBasePath(source);

  return source.lang === 'en' ? withTrailingSlash(`${basePath}en`) : withTrailingSlash(`${basePath}${source.lang}`);
}

function isDefaultVariant(hexo, item, source) {
  if (source.type === 'post') {
    return defaultEntry(groupForPost(hexo, source)).source.lang === source.lang;
  }

  const site = hexo.locals.toObject();
  return defaultEntry(groupForPage(site, source)).source.lang === source.lang;
}

function fallback404Html(root) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirecting...</title>
</head>
<body>
<script>
(function () {
  var pattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;
  var path = window.location.pathname.replace(/\\/+$/, '');
  var parts = path.split('/');
  var last = parts[parts.length - 1];
  if (pattern.test(last)) {
    parts.pop();
    var fallback = parts.join('/') + '/';
    window.location.replace(fallback + window.location.search + window.location.hash);
    return;
  }
  window.location.replace(${JSON.stringify(root || '/')} + window.location.search + window.location.hash);
})();
</script>
</body>
</html>`;
}

const postPermalinkFilters = hexo.extend.filter.store.post_permalink;
if (postPermalinkFilters) postPermalinkFilters.length = 0;

hexo.extend.filter.register('post_permalink', function multilingualPostPermalink(data) {
  const source = parseLangSource(data.source);
  if (!source || source.type !== 'post') return defaultPostPermalink(hexo, data);
  return postPath(hexo, data, source);
});

hexo.extend.generator.register('multilingual_aliases', function multilingualAliases(locals) {
  const routes = [];

  itemArray(locals.posts).forEach(post => {
    const source = parseLangSource(post.source);
    if (!source || source.type !== 'post' || !isDefaultVariant(hexo, post, source)) return;

    post.__post = true;
    routes.push({
      path: aliasPathFor(post, source),
      layout: ['post', 'page', 'index'],
      data: post
    });
  });

  itemArray(locals.pages).forEach(page => {
    const source = parseLangSource(page.source);
    if (!source || source.type !== 'page' || !isDefaultVariant(hexo, page, source)) return;

    page.__page = true;
    routes.push({
      path: aliasPathFor(page, source),
      layout: ['page', 'post', 'index'],
      data: page
    });
  });

  routes.push({
    path: '404.html',
    data: fallback404Html(hexo.config.root || '/')
  });

  return routes;
});

hexo.extend.helper.register('language_variants', function languageVariants(item) {
  const source = parseLangSource(item && item.source);
  if (!source) return [];

  const entries = source.type === 'post'
    ? groupForPost(hexo, source)
    : groupForPage(this.site, source);

  if (entries.length <= 1) return [];

  return entries.map(entry => ({
    lang: entry.source.lang,
    label: LANG_LABELS[entry.source.lang] || entry.source.lang,
    url: url_for.call(this, languageUrlFor(entry.item, entry.source)),
    active: entry.source.lang === source.lang
  }));
});