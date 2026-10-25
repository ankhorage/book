import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type BookInline =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'strong' | 'emphasis' | 'delete'; readonly children: readonly BookInline[] }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'link'; readonly url: string; readonly children: readonly BookInline[] }
  | { readonly kind: 'image'; readonly url: string; readonly alt: string };
export type BookBlock =
  | { readonly kind: 'heading'; readonly depth: number; readonly children: readonly BookInline[] }
  | { readonly kind: 'paragraph'; readonly children: readonly BookInline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly BookInline[])[];
    }
  | { readonly kind: 'table'; readonly rows: readonly (readonly (readonly BookInline[])[])[] }
  | { readonly kind: 'blockquote'; readonly children: readonly BookBlock[] }
  | { readonly kind: 'code'; readonly value: string };

/*** Parse editable Markdown once into the semantic document consumed by publication adapters. */
export function parseMarkdownDocument(markdown: string): readonly BookBlock[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
  return tree.children.flatMap(blockFromNode);
}

/*** Translate one supported Markdown block without flattening its publication semantics. */
function blockFromNode(node: MarkdownNode): readonly BookBlock[] {
  if (node.type === 'heading')
    return [{ kind: 'heading', depth: node.depth ?? 1, children: inlineFromNodes(node.children) }];
  if (node.type === 'paragraph')
    return [{ kind: 'paragraph', children: inlineFromNodes(node.children) }];
  if (node.type === 'list')
    return [
      {
        kind: 'list',
        ordered: node.ordered === true,
        items: node.children.map((item) => inlineFromNodes(item.children.flatMap(blockChildren))),
      },
    ];
  if (node.type === 'table')
    return [
      {
        kind: 'table',
        rows: node.children.map((row) =>
          row.children.map((cell) => inlineFromNodes(cell.children)),
        ),
      },
    ];
  if (node.type === 'blockquote')
    return [{ kind: 'blockquote', children: node.children.flatMap(blockFromNode) }];
  return node.type === 'code' ? [{ kind: 'code', value: node.value ?? '' }] : [];
}

/*** Extract inline content from a list item's paragraph children. */
function blockChildren(node: MarkdownNode): readonly MarkdownNode[] {
  return node.type === 'paragraph' ? node.children : [node];
}

/*** Translate inline Markdown nodes while retaining formatting and destinations. */
function inlineFromNodes(nodes: readonly MarkdownNode[]): readonly BookInline[] {
  return nodes.flatMap<BookInline>((node) => {
    if (node.type === 'text') return [{ kind: 'text' as const, value: node.value ?? '' }];
    if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete')
      return [{ kind: node.type, children: inlineFromNodes(node.children) }];
    if (node.type === 'inlineCode') return [{ kind: 'code' as const, value: node.value ?? '' }];
    if (node.type === 'link')
      return [
        { kind: 'link' as const, url: node.url ?? '', children: inlineFromNodes(node.children) },
      ];
    if (node.type === 'image')
      return [{ kind: 'image' as const, url: node.url ?? '', alt: node.alt ?? '' }];
    return node.type === 'break' ? [{ kind: 'text' as const, value: '\n' }] : [];
  });
}

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly depth?: number;
  readonly ordered?: boolean;
  readonly url?: string;
  readonly alt?: string;
  readonly children: readonly MarkdownNode[];
}
