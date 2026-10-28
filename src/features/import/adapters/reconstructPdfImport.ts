interface PdfLine {
  readonly page: number;
  readonly size: number;
  readonly text: string;
  readonly y: number;
}

interface ReconstructedSection {
  readonly source: string;
  readonly title: string;
}

/*** Reconstruct ordered editable sections and visible cover metadata from PDF text geometry. */
export function reconstructPdfImport(input: { readonly lines: readonly PdfLine[] }): {
  readonly author?: string;
  readonly sections: readonly ReconstructedSection[];
} {
  const chapterMarkers = input.lines.flatMap((line, index) =>
    isChapterMarker(line.text) ? [{ index, title: chapterTitle(input.lines, index) }] : [],
  );
  if (chapterMarkers.length === 0)
    return {
      ...visibleAuthor(input.lines),
      sections: [{ title: 'Manuscript', source: paragraphs(input.lines) }],
    };
  const frontMatter = input.lines.slice(0, chapterMarkers[0]?.index ?? 0);
  const chapters = chapterMarkers.map((chapter, index) => {
    const start = chapter.index + 1 + chapter.title.lines;
    const end = chapterMarkers[index + 1]?.index ?? input.lines.length;
    return { title: chapter.title.text, source: paragraphs(input.lines.slice(start, end)) };
  });
  const appendix = splitAppendix(chapters);
  return {
    ...visibleAuthor(input.lines),
    sections: [
      ...(paragraphs(frontMatter) === ''
        ? []
        : [{ title: 'Front matter', source: paragraphs(frontMatter) }]),
      ...appendix.chapters,
      ...appendix.sections,
    ],
  };
}

/*** Recognize spaced or unspaced visible German chapter labels. */
function isChapterMarker(value: string): boolean {
  return /^K\s*A\s*P\s*I\s*T\s*E\s*L\s*(?:\d\s*){1,2}$/iu.test(value);
}

/*** Collect a chapter title from its large visible line following a chapter marker. */
function chapterTitle(
  lines: readonly PdfLine[],
  index: number,
): { readonly lines: number; readonly text: string } {
  const following = lines.slice(index + 1);
  const titleLines = following.slice(0, 3).filter((line, lineIndex) => {
    const previous = lineIndex === 0 ? lines.at(index) : following.at(lineIndex - 1);
    return line.page === previous?.page && line.size >= 16 && !/^\d+\.\d+/u.test(line.text);
  });
  const text = titleLines
    .map((line) => line.text)
    .join(' ')
    .trim();
  return { lines: titleLines.length, text: text || 'Untitled chapter' };
}

/*** Separate appendix material from the final numbered chapter at explicit visible section labels. */
function splitAppendix(chapters: readonly ReconstructedSection[]): {
  readonly chapters: readonly ReconstructedSection[];
  readonly sections: readonly ReconstructedSection[];
} {
  const last = chapters.at(-1);
  if (last === undefined) return { chapters, sections: [] };
  const boundaries = [
    ...last.source.matchAll(
      /^\s*(?:ANHANG|A\.\s*GLOSSAR|B\.\s*FORMELSAMMLUNG|C\.\s*QUELLEN(?:\s+UND\s+WEITERFÜHRENDE\s+INFORMATIONEN)?|D\.\s*IMPRESSUM(?:\s+UND\s+HINWEISE)?)\s*$/gimu,
    ),
  ];
  if (boundaries.length === 0) return { chapters, sections: [] };
  const retained = last.source.slice(0, boundaries[0]?.index).trim();
  const appendixSections = boundaries.map((boundary, index) => ({
    title: appendixTitle(boundary[0]),
    source: last.source
      .slice(boundary.index, boundaries[index + 1]?.index)
      .trim()
      .concat('\n'),
  }));
  return {
    chapters: [...chapters.slice(0, -1), { ...last, source: retained.concat('\n') }],
    sections: appendixSections,
  };
}

/*** Give recognized appendix labels stable human-readable project titles. */
function appendixTitle(value: string): string {
  if (/GLOSSAR/iu.test(value)) return 'Appendix: Glossary';
  if (/FORMELSAMMLUNG/iu.test(value)) return 'Appendix: Formula collection';
  if (/QUELLEN/iu.test(value)) return 'Appendix: Sources';
  if (/IMPRESSUM/iu.test(value)) return 'Appendix: Imprint';
  return 'Appendix';
}

/*** Recover a plausible author only from the final title-cased line on the visible cover. */
function visibleAuthor(lines: readonly PdfLine[]): { readonly author?: string } {
  const candidates = lines
    .filter((line) => line.page === 1)
    .map((line) => line.text.trim())
    .filter(isPersonName);
  const author = candidates.at(-1);
  return author === undefined ? {} : { author };
}

/*** Avoid treating all-caps labels, headings, and sentences as a visible personal name. */
function isPersonName(value: string): boolean {
  return /^(?:[A-ZÀ-ÖØ-Þ][\p{Ll}'’-]+\s+){1,3}[A-ZÀ-ÖØ-Þ][\p{Ll}'’-]+$/u.test(value);
}

/*** Rebuild paragraphs from vertical spacing while repairing only clear line-break hyphenation. */
function paragraphs(lines: readonly PdfLine[]): string {
  return repairHyphenation(
    lines
      .map((line, index) => {
        const previous = index === 0 ? undefined : lines[index - 1];
        const separator = previous?.page !== line.page || previous.y - line.y > 20 ? '\n\n' : '\n';
        return `${separator}${line.text}`;
      })
      .join(''),
  )
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/*** Repair only clear end-of-line word breaks from extracted selectable text. */
function repairHyphenation(value: string): string {
  return value.replace(/(\p{L})[‐-]\n(\p{Ll})/gu, '$1$2');
}
