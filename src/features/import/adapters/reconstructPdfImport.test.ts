import { expect, test } from 'bun:test';

import { reconstructPdfImport } from './reconstructPdfImport.js';

test('preserves front matter, ordered numbered chapters, and distinct appendix sections', () => {
  const reconstructed = reconstructPdfImport({ lines: fixtureLines() });

  expect(reconstructed.author).toBe('Arti Phishle');
  expect(reconstructed.sections.map((section) => section.title)).toEqual([
    'Front matter',
    ...Array.from({ length: 14 }, (_, index) => `Chapter ${index + 1}`),
    'Appendix',
    'Appendix: Glossary',
    'Appendix: Formula collection',
    'Appendix: Sources',
    'Appendix: Imprint',
  ]);
  expect(reconstructed.sections[0]?.source).toContain('Front-matter introduction');
  expect(reconstructed.sections[14]?.source).toContain('Chapter 14 body');
  expect(reconstructed.sections[15]?.source).toContain('Appendix introduction');
  expect(reconstructed.sections[16]?.source).toContain('Term definition');
  expect(reconstructed.sections[18]?.source).toContain('Official source');
  expect(reconstructed.sections[19]?.source).toContain('Publication notice');
});

/*** Supply a rights-cleared, geometry-shaped regression fixture with every boundary used by PDF reconstruction. */
function fixtureLines(): readonly {
  readonly page: number;
  readonly size: number;
  readonly text: string;
  readonly y: number;
}[] {
  const chapters = Array.from({ length: 14 }, (_, index) => {
    const chapter = index + 1;
    const page = chapter + 1;
    return [
      { page, size: 12, text: 'KAPITEL ' + String(chapter).padStart(2, '0'), y: 700 },
      { page, size: 18, text: `Chapter ${chapter}`, y: 670 },
      { page, size: 10, text: `Chapter ${chapter} body`, y: 630 },
    ];
  });
  return [
    { page: 1, size: 28, text: 'Leads Understand', y: 700 },
    { page: 1, size: 12, text: 'Arti Phishle', y: 100 },
    { page: 2, size: 10, text: 'Front-matter introduction', y: 700 },
    ...chapters.flat(),
    { page: 17, size: 16, text: 'ANHANG', y: 700 },
    { page: 17, size: 10, text: 'Appendix introduction', y: 650 },
    { page: 18, size: 16, text: 'A. Glossar', y: 700 },
    { page: 18, size: 10, text: 'Term definition', y: 650 },
    { page: 19, size: 16, text: 'B. Formelsammlung', y: 700 },
    { page: 19, size: 10, text: 'Formula definition', y: 650 },
    { page: 20, size: 16, text: 'C. Quellen und weiterführende Informationen', y: 700 },
    { page: 20, size: 10, text: 'Official source', y: 650 },
    { page: 21, size: 16, text: 'D. Impressum und Hinweise', y: 700 },
    { page: 21, size: 10, text: 'Publication notice', y: 650 },
  ];
}
