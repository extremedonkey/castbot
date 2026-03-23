/**
 * Channel Export — HTML Generator
 * Generates a self-contained HTML file styled like Discord for viewing archived channel messages.
 * No external dependencies — all CSS is inline.
 */

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert basic Discord markdown to HTML
 */
function markdownToHtml(text) {
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // URLs
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

/**
 * Generate a unique color from a user ID (deterministic)
 */
function userColor(userId) {
  const colors = ['#e91e63', '#9c27b0', '#2196f3', '#00bcd4', '#4caf50', '#ff9800', '#f44336', '#3f51b5', '#009688', '#ff5722', '#795548', '#607d8b'];
  let hash = 0;
  for (const ch of userId) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Format a timestamp for display
 */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Check if two messages should be grouped (same author, within 7 minutes)
 */
function shouldGroup(prev, curr) {
  if (!prev) return false;
  if (prev.author?.id !== curr.author?.id) return false;
  const gap = new Date(curr.timestamp) - new Date(prev.timestamp);
  return gap < 7 * 60 * 1000;
}

/**
 * Generate a complete self-contained HTML file for a channel export
 * @param {string} channelName - Channel name
 * @param {Array} messages - Array of Discord message objects (sorted oldest first)
 * @returns {string} Complete HTML document
 */
export function generateExportHTML(channelName, messages) {
  const messageHtml = [];
  let prevMsg = null;

  for (const msg of messages) {
    const author = msg.author?.global_name || msg.author?.username || 'Unknown';
    const authorId = msg.author?.id || '0';
    const color = userColor(authorId);
    const time = formatDate(msg.timestamp);
    const grouped = shouldGroup(prevMsg, msg);

    const contentParts = [];

    // Message content
    if (msg.content) {
      contentParts.push(`<div class="content">${markdownToHtml(msg.content)}</div>`);
    }

    // Embeds
    if (msg.embeds?.length) {
      for (const embed of msg.embeds) {
        const embedColor = embed.color ? `border-left-color: #${embed.color.toString(16).padStart(6, '0')}` : '';
        contentParts.push(`<div class="embed" style="${embedColor}">
          ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
          ${embed.description ? `<div class="embed-desc">${markdownToHtml(embed.description)}</div>` : ''}
        </div>`);
      }
    }

    // Attachments
    if (msg.attachments?.length) {
      for (const att of msg.attachments) {
        const isImage = att.content_type?.startsWith('image/');
        if (isImage) {
          contentParts.push(`<div class="attachment"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.filename)}" loading="lazy"></div>`);
        } else {
          contentParts.push(`<div class="attachment file">📎 <a href="${escapeHtml(att.url)}" target="_blank">${escapeHtml(att.filename)}</a> (${(att.size / 1024).toFixed(1)} KB)</div>`);
        }
      }
    }

    // Reactions
    if (msg.reactions?.length) {
      const reactionHtml = msg.reactions.map(r => {
        const emoji = r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name;
        return `<span class="reaction">${emoji} ${r.count}</span>`;
      }).join('');
      contentParts.push(`<div class="reactions">${reactionHtml}</div>`);
    }

    if (contentParts.length === 0) {
      contentParts.push(`<div class="content system">[no content]</div>`);
    }

    if (grouped) {
      messageHtml.push(`<div class="msg grouped"><div class="msg-body"><span class="time-inline">${time}</span>${contentParts.join('')}</div></div>`);
    } else {
      const avatarUrl = msg.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${authorId}/${msg.author.avatar}.png?size=40`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(authorId) >> 22n) % 6n}.png`;
      messageHtml.push(`<div class="msg">
        <img class="avatar" src="${avatarUrl}" alt="" loading="lazy">
        <div class="msg-body">
          <div class="header"><span class="author" style="color:${color}">${escapeHtml(author)}</span><span class="time">${time}</span></div>
          ${contentParts.join('')}
        </div>
      </div>`);
    }

    prevMsg = msg;
  }

  // Date separators — inject between messages on different days
  const withDates = [];
  let lastDate = '';
  let msgIndex = 0;
  for (const msg of messages) {
    const dateStr = new Date(msg.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (dateStr !== lastDate) {
      withDates.push(`<div class="date-sep"><span>${dateStr}</span></div>`);
      lastDate = dateStr;
    }
    withDates.push(messageHtml[msgIndex]);
    msgIndex++;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>#${escapeHtml(channelName)} — Export</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #313338; color: #dbdee1; font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.375; }
.header-bar { background: #2b2d31; border-bottom: 1px solid #1e1f22; padding: 12px 16px; position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px; }
.header-bar .hash { color: #80848e; font-size: 24px; }
.header-bar .name { color: #f2f3f5; font-weight: 600; font-size: 16px; }
.header-bar .count { color: #80848e; font-size: 13px; margin-left: auto; }
.search-bar { background: #2b2d31; padding: 8px 16px; border-bottom: 1px solid #1e1f22; position: sticky; top: 49px; z-index: 9; }
.search-bar input { width: 100%; background: #1e1f22; border: none; color: #dbdee1; padding: 8px 12px; border-radius: 4px; font-size: 14px; outline: none; }
.search-bar input::placeholder { color: #80848e; }
.messages { padding: 16px 0; }
.msg { display: flex; padding: 2px 16px; gap: 16px; position: relative; }
.msg:hover { background: #2e3035; }
.msg.grouped { padding-left: 72px; }
.msg.grouped .time-inline { display: none; font-size: 11px; color: #80848e; position: absolute; left: 16px; width: 40px; text-align: right; }
.msg.grouped:hover .time-inline { display: block; }
.avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
.msg-body { min-width: 0; flex: 1; }
.msg-body .header { display: flex; align-items: baseline; gap: 8px; }
.author { font-weight: 600; font-size: 15px; cursor: pointer; }
.author:hover { text-decoration: underline; }
.time { font-size: 12px; color: #80848e; }
.content { white-space: pre-wrap; word-wrap: break-word; }
.content.system { color: #80848e; font-style: italic; }
.content a { color: #00a8fc; text-decoration: none; }
.content a:hover { text-decoration: underline; }
.content code { background: #2b2d31; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
.content strong { color: #f2f3f5; }
.embed { border-left: 4px solid #4f545c; background: #2b2d31; border-radius: 4px; padding: 8px 12px; margin: 4px 0; max-width: 520px; }
.embed-title { font-weight: 600; color: #00a8fc; margin-bottom: 4px; }
.embed-desc { font-size: 14px; }
.attachment { margin: 4px 0; }
.attachment img { max-width: 400px; max-height: 300px; border-radius: 8px; cursor: pointer; }
.attachment.file { background: #2b2d31; padding: 8px 12px; border-radius: 8px; display: inline-block; }
.attachment.file a { color: #00a8fc; text-decoration: none; }
.reactions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.reaction { background: #2b2d31; border: 1px solid #3f4147; border-radius: 8px; padding: 2px 6px; font-size: 13px; }
.date-sep { display: flex; align-items: center; margin: 16px 16px; }
.date-sep::before, .date-sep::after { content: ''; flex: 1; border-top: 1px solid #3f4147; }
.date-sep span { padding: 0 8px; font-size: 12px; font-weight: 600; color: #80848e; white-space: nowrap; }
.no-results { text-align: center; color: #80848e; padding: 40px; font-size: 16px; display: none; }
</style>
</head>
<body>
<div class="header-bar">
  <span class="hash">#</span>
  <span class="name">${escapeHtml(channelName)}</span>
  <span class="count">${messages.length} messages</span>
</div>
<div class="search-bar">
  <input type="text" id="search" placeholder="Search messages..." autocomplete="off">
</div>
<div class="messages" id="messages">
${withDates.join('\n')}
</div>
<div class="no-results" id="noResults">No messages match your search.</div>
<script>
const search = document.getElementById('search');
const msgs = document.querySelectorAll('.msg');
const dateSeps = document.querySelectorAll('.date-sep');
const noResults = document.getElementById('noResults');
search.addEventListener('input', () => {
  const q = search.value.toLowerCase();
  let visible = 0;
  msgs.forEach(m => {
    const show = !q || m.textContent.toLowerCase().includes(q);
    m.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  dateSeps.forEach(d => {
    let next = d.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('date-sep')) {
      if (next.classList.contains('msg') && next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    d.style.display = hasVisible ? '' : 'none';
  });
  noResults.style.display = visible === 0 && q ? 'block' : 'none';
});
</script>
</body>
</html>`;
}
