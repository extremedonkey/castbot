import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateExportHTML, partitionThreads } from '../channelExport.js';

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

  it('renders -# subtext as small muted text (not raw)', () => {
    const html = render('-# Thursday 21st May 2026');
    assert.match(html, /<div class="md-sub">Thursday 21st May 2026<\/div>/);
    assert.doesNotMatch(html.replace(/"c":"[\s\S]*?"}/, ''), /-# /); // no raw -# in displayed body
  });
});

describe('channelExport — image lightbox', () => {
  function withImage() {
    return generateExportHTML('test', [{
      author: { id: '1', username: 'A' }, timestamp: '2026-06-13T12:00:00Z',
      attachments: [{ url: 'https://cdn.example/x.png', filename: 'x.png', content_type: 'image/png', size: 100 }],
    }], {});
  }
  it('includes the lightbox overlay markup', () => {
    const html = withImage();
    assert.match(html, /<div class="lightbox" id="lightbox">/);
    assert.match(html, /id="lbImg"/);
    assert.match(html, /id="lbClose"/);
  });
  it('wires attachment/embed images to open the lightbox and closes on Escape', () => {
    const html = withImage();
    assert.match(html, /\.attachment img, \.embed img/);
    assert.match(html, /lb\.classList\.add\('open'\)/);
    assert.match(html, /e\.key === 'Escape'/);
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

describe('channelExport — partitionThreads', () => {
  const messages = [{ id: '100' }, { id: '200' }];
  it('attaches a thread to its parent message (thread.id === message.id)', () => {
    const { byParentId, orphans } = partitionThreads(messages, [{ id: '100', name: 'T', messages: [] }]);
    assert.equal(byParentId.get('100')?.name, 'T');
    assert.deepEqual(orphans, []);
  });
  it('treats a thread with no matching parent as an orphan', () => {
    const { byParentId, orphans } = partitionThreads(messages, [{ id: '999', name: 'Orphan', messages: [] }]);
    assert.equal(byParentId.size, 0);
    assert.equal(orphans[0].name, 'Orphan');
  });
  it('dedupes threads by id', () => {
    const { byParentId } = partitionThreads(messages, [{ id: '100', name: 'A' }, { id: '100', name: 'B' }]);
    assert.equal(byParentId.size, 1);
    assert.equal(byParentId.get('100').name, 'A'); // first wins
  });
  it('handles empty/undefined threads', () => {
    assert.equal(partitionThreads(messages, []).orphans.length, 0);
    assert.equal(partitionThreads(messages, undefined).orphans.length, 0);
  });
});

describe('channelExport — thread rendering', () => {
  const parent = { id: '500', author: { id: '1', username: 'A' }, timestamp: '2026-06-13T12:00:00Z', content: 'parent msg' };
  const thread = {
    id: '500', name: 'S14 AWARD GRAPHICS',
    messages: [{ id: '501', author: { id: '2', username: 'Red' }, timestamp: '2026-06-13T13:00:00Z', content: 'HOGUE wins' }],
  };

  it('renders an attached thread as a collapsible card with name + count', () => {
    const html = generateExportHTML('graphics', [parent], {}, [thread]);
    assert.match(html, /<details class="thread" data-tid="500">/);
    assert.match(html, /S14 AWARD GRAPHICS/);
    assert.match(html, /1 message<\/span>/);
    assert.match(html, /HOGUE wins/);          // thread content present
    assert.match(html, /data-mid="501"/);      // thread message carries its id
  });

  it('puts a thread with no parent in the orphan Threads section', () => {
    const html = generateExportHTML('graphics', [{ id: '999', author: { id: '1', username: 'A' }, timestamp: '2026-06-13T12:00:00Z', content: 'x' }], {}, [thread]);
    assert.match(html, /🧵 Threads<\/span>/);   // orphan section header
    assert.match(html, /HOGUE wins/);
  });

  it('adds data-mid to top-level messages', () => {
    const html = generateExportHTML('graphics', [parent], {}, []);
    assert.match(html, /data-mid="500"/);
  });
});
