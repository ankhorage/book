import type { BookBlock, BookInline } from './parseMarkdownDocument.js';
import { parseMarkdownDocument } from './parseMarkdownDocument.js';

/*** Render the shared semantic document as safe EPUB XHTML. */
export function renderMarkdownAsXhtml(markdown: string): string {
  return parseMarkdownDocument(markdown).map(renderBlock).join('');
}

/*** Render one structural block using its corresponding XHTML element. */
function renderBlock(block: BookBlock): string {
  if (block.kind === 'heading')
    return `<h${block.depth}>${inlines(block.children)}</h${block.depth}>`;
  if (block.kind === 'paragraph') return `<p>${inlines(block.children)}</p>`;
  if (block.kind === 'list')
    return `<${block.ordered ? 'ol' : 'ul'}>${block.items.map((item) => `<li>${inlines(item)}</li>`).join('')}</${block.ordered ? 'ol' : 'ul'}>`;
  if (block.kind === 'table')
    return `<table>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlines(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
  if (block.kind === 'blockquote')
    return `<blockquote>${block.children.map(renderBlock).join('')}</blockquote>`;
  return `<pre><code>${escape(block.value)}</code></pre>`;
}

/*** Render inline semantics while escaping literal author-provided text. */
function inlines(nodes: readonly BookInline[]): string {
  return nodes.map(inline).join('');
}

/*** Render one inline semantic node. */
function inline(node: BookInline): string {
  switch (node.kind) {
    case 'text':
      return escape(node.value);
    case 'strong':
      return `<strong>${inlines(node.children)}</strong>`;
    case 'emphasis':
      return `<em>${inlines(node.children)}</em>`;
    case 'delete':
      return `<del>${inlines(node.children)}</del>`;
    case 'code':
      return `<code>${escape(node.value)}</code>`;
    case 'link':
      return `<a href="${attribute(node.url)}">${inlines(node.children)}</a>`;
    case 'image':
      return `<img src="${attribute(node.url)}" alt="${attribute(node.alt)}"/>`;
  }
}

/*** Escape XML character data. */
function escape(value: string): string {
  return value.replace(/[&<>]/gu, escapeCharacter);
}

/*** Escape one XML-reserved character. */
function escapeCharacter(character: string): string {
  if (character === '&') return '&amp;';
  if (character === '<') return '&lt;';
  return '&gt;';
}

/*** Escape a quoted XHTML attribute. */
function attribute(value: string): string {
  return escape(value).replace(/["']/gu, (character) => (character === '"' ? '&quot;' : '&apos;'));
}
