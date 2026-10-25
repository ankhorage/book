import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

/*** Convert an EPUB XHTML content document into editable semantic Markdown through ASTs. */
export function importXhtmlAsMarkdown(xhtml: string): string {
  return String(
    unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify)
      .processSync(xhtml),
  );
}
