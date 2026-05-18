'use strict';

const ADMONITION_TYPES = [
  'note',
  'info',
  'todo',
  'warning',
  'attention',
  'caution',
  'failure',
  'missing',
  'fail',
  'error',
  'danger',
  'tip',
  'success',
  'question',
  'example',
  'quote'
];

const TYPE_PATTERN = ADMONITION_TYPES.join('|');
const BLOCK_RE = new RegExp(
  `^(\\s*)!!!(?:\\s+(${TYPE_PATTERN}))?(?:\\s+["“](.*?)["”])?\\s*$`,
  'i'
);

hexo.extend.filter.register('before_post_render', function renderAdmonitions(data) {
  const lines = data.content.split(/\r?\n/);
  const result = [];

  for (let i = 0; i < lines.length;) {
    const match = lines[i].match(BLOCK_RE);

    if (!match) {
      result.push(lines[i]);
      i += 1;
      continue;
    }

    const [, indent, rawType, rawTitle] = match;
    const type = rawType ? rawType.toLowerCase() : 'note';
    const title = rawTitle || type[0].toUpperCase() + type.slice(1);
    const contentLines = [];
    const contentIndent = new RegExp(`^${escapeRegExp(indent)}(?: {4}|\t)`);

    i += 1;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') {
        contentLines.push('');
        i += 1;
        continue;
      }

      if (!contentIndent.test(line)) {
        break;
      }

      contentLines.push(line.replace(contentIndent, ''));
      i += 1;
    }

    const body = hexo.render.renderSync({
      text: contentLines.join('\n').trim(),
      engine: 'markdown'
    });

    result.push(
      `<div class="admonition ${type}">` +
      `<p class="admonition-title">${escapeHtml(title)}</p>` +
      body +
      '</div>',
      ''
    );
  }

  data.content = result.join('\n');
  return data;
}, 1);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
