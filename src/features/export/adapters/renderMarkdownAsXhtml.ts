import type { BookBlock, BookInline } from './parseMarkdownDocument.js';
import { parseMarkdownDocument } from './parseMarkdownDocument.js';

/*** Render the shared semantic document as safe EPUB XHTML. */
export function renderMarkdownAsXhtml(
  markdown: string,
  imageUrl: (url: string) => string = (url) => url,
): string {
  return parseMarkdownDocument(markdown)
    .map((block) => renderBlock(block, imageUrl))
    .join('');
}

/*** Render one structural block using its corresponding XHTML element. */
function renderBlock(block: BookBlock, imageUrl: (url: string) => string): string {
  if (block.kind === 'heading')
    return `<h${block.depth}>${inlines(block.children, imageUrl)}</h${block.depth}>`;
  if (block.kind === 'paragraph') return `<p>${inlines(block.children, imageUrl)}</p>`;
  if (block.kind === 'list')
    return `<${block.ordered ? 'ol' : 'ul'}>${block.items.map((item) => `<li>${inlines(item, imageUrl)}</li>`).join('')}</${block.ordered ? 'ol' : 'ul'}>`;
  if (block.kind === 'table')
    return `<table>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlines(cell, imageUrl)}</td>`).join('')}</tr>`).join('')}</table>`;
  if (block.kind === 'blockquote')
    return `<blockquote>${block.children.map((child) => renderBlock(child, imageUrl)).join('')}</blockquote>`;
  return `<pre><code>${escape(block.value)}</code></pre>`;
}

/*** Render inline semantics while escaping literal author-provided text. */
function inlines(nodes: readonly BookInline[], imageUrl: (url: string) => string): string {
  return nodes.map((node) => inline(node, imageUrl)).join('');
}

/*** Render one inline semantic node. */
function inline(node: BookInline, imageUrl: (url: string) => string): string {
  switch (node.kind) {
    case 'text':
      return escape(node.value);
    case 'strong':
      return `<strong>${inlines(node.children, imageUrl)}</strong>`;
    case 'emphasis':
      return `<em>${inlines(node.children, imageUrl)}</em>`;
    case 'delete':
      return `<del>${inlines(node.children, imageUrl)}</del>`;
    case 'code':
      return `<code>${escape(node.value)}</code>`;
    case 'link':
      return `<a href="${attribute(node.url)}">${inlines(node.children, imageUrl)}</a>`;
    case 'image':
      return `<img src="${attribute(imageUrl(node.url))}" alt="${attribute(node.alt)}"/>`;
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
