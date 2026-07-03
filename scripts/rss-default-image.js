'use strict';

const DEFAULT_IMAGE_DESCRIPTION = '<p><img src="/images/blog-background.png" alt="Blog background"></p>';

function hasImage(data) {
  return Boolean(
    data.image ||
    /<img\b/i.test(data.content || '') ||
    /<img\b/i.test(data.excerpt || '') ||
    /!\[[^\]]*\]\([^)]+\)/.test(data.raw || '')
  );
}

hexo.extend.filter.register('after_post_render', function(data) {
  const feedConfig = this.config.feed || {};

  if (feedConfig.type === 'rss2' && !hasImage(data)) {
    data.description = DEFAULT_IMAGE_DESCRIPTION;
  }

  return data;
}, 20);
