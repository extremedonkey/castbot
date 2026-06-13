import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateExportHTML } from '../channelExport.js';

// Render a single message's content and return the generated HTML.
function render(content, { mentions = [], resolver = {} } = {}) {
  return generateExportHTML('test', [{
    author: { id: '1', username: 'A', global_name: 'A' },
    timestamp: '2026-06-13T12:00:00Z',
    content,
    mentions,
  }], resolver);
}

describe('channelExport — mention resolution (baked at archive time)', () => {
  it('resolves a user mention to its name from the message mentions[]', () => {
    const html = render('hi <@813130551254056960>', { mentions: [{ id: '813130551254056960', global_name: 'Hayden' }] });
    assert.match(html, /<span class="mention">@Hayden<\/span>/);
    assert.doesNotMatch(html, /&lt;@813/); // no raw mention leaked
  });

  it('handles <@!id> nickname-style mentions', () => {
    const html = render('<@!42>', { mentions: [{ id: '42', username: 'nick' }] });
    assert.match(html, /<span class="mention">@nick<\/span>/);
  });

  it('falls back to unknown-user when not resolvable', () => {
    const html = render('<@999>');
    assert.match(html, /@unknown-user/);
  });

  it('resolves role mentions with the role colour', () => {
    const html = render('<@&777>', { resolver: { roles: { '777': { name: 'Hosts', color: 0xe67e22 } } } });
    assert.match(html, /<span class="mention role" style="color:#e67e22;">@Hosts<\/span>/);
  });

  it('resolves channel mentions', () => {
    const html = render('<#555>', { resolver: { channels: { '555': 'general' } } });
    assert.match(html, /<span class="mention channel">#general<\/span>/);
  });

  it('styles @everyone / @here', () => {
    assert.match(render('@everyone'), /<span class="mention">@everyone<\/span>/);
    assert.match(render('@here'), /<span class="mention">@here<\/span>/);
  });
});

describe('channelExport — markdown & tokens', () => {
  it('renders custom emoji as a CDN image (png + gif)', () => {
    assert.match(render('<:wave:123>'), /<img class="emoji" src="https:\/\/cdn\.discordapp\.com\/emojis\/123\.png\?size=24"/);
    assert.match(render('<a:spin:456>'), /emojis\/456\.gif\?size=24/);
  });

  it('renders <t:unix:style> timestamps', () => {
    assert.match(render('<t:1700000000:D>'), /<span class="md-time">🕒 .*2023/);
  });

  it('wraps spoilers', () => {
    assert.match(render('||secret||'), /<span class="spoiler">secret<\/span>/);
  });

  it('renders fenced code blocks as <pre>', () => {
    assert.match(render('```\nblock 42 code\n```'), /<pre class="code-block">block 42 code<\/pre>/);
  });

  it('renders bold/italic/strike/underline', () => {
    assert.match(render('**b**'), /<strong>b<\/strong>/);
    assert.match(render('*i*'), /<em>i<\/em>/);
    assert.match(render('~~s~~'), /<del>s<\/del>/);
    assert.match(render('__u__'), /<u>u<\/u>/);
  });

  it('renders headings, blockquotes and lists', () => {
    assert.match(render('# Title'), /<div class="md-h md-h1">Title<\/div>/);
    assert.match(render('> quoted'), /<blockquote>quoted<\/blockquote>/);
    assert.match(render('- item'), /<ul><li>item<\/li><\/ul>/);
    assert.match(render('1. first'), /<ol><li>first<\/li><\/ol>/);
  });
});

describe('channelExport — no placeholder/digit corruption', () => {
  it('does not corrupt bare digits in text (placeholder collision regression)', () => {
    const html = render('Top 5 players and 100 points');
    assert.match(html, /Top 5 players and 100 points/);
  });

  it('keeps digits inside code blocks and inline code intact', () => {
    const html = render('see `id 7` then\n```\ncount 42\n```');
    assert.match(html, /<code>id 7<\/code>/);
    assert.match(html, /count 42/);
  });

  it('escapes HTML in plain content', () => {
    const html = render('a < b & c > d');
    assert.match(html, /a &lt; b &amp; c &gt; d/);
  });
});
