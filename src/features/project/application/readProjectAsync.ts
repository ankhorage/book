import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { parse } from 'yaml';

import type { BookProject } from '../../../types/book.js';

/*** Read and validate a normalized, editable book project. */
export async function readProjectAsync(directory: string): Promise<BookProject> {
  const source = await readFile(join(resolve(directory), 'book.yaml'), 'utf8');
  const parsed = parse(source) as unknown;
  return parseProject(parsed);
}

/*** Validate the persisted project shape before it reaches conversion adapters. */
function parseProject(value: unknown): BookProject {
  if (
    !isRecord(value) ||
    !isRecord(value.metadata) ||
    !Array.isArray(value.chapters) ||
    !isRecord(value.export)
  ) {
    throw new Error('book.yaml must contain metadata, chapters, and export settings.');
  }
  const { metadata } = value;
  const title = stringAt(metadata, 'title');
  const author = stringAt(metadata, 'author');
  const language = stringAt(metadata, 'language');
  const chapters = value.chapters.map((chapter, index) => parseChapter(chapter, index));
  if (chapters.length === 0) throw new Error('book.yaml must declare at least one chapter.');
  return {
    metadata: {
      title,
      author,
      language,
      ...(optionalStringAt(metadata, 'subtitle') === undefined
        ? {}
        : { subtitle: optionalStringAt(metadata, 'subtitle') }),
      ...(optionalStringAt(metadata, 'cover') === undefined
        ? {}
        : { cover: optionalStringAt(metadata, 'cover') }),
    },
    chapters,
    export: { epub: { version: '3.0' }, pdf: { pageSize: 'A5' } },
  };
}

/*** Parse one persisted chapter entry. */
function parseChapter(value: unknown, index: number): BookProject['chapters'][number] {
  if (!isRecord(value)) throw new Error(`chapters[${index}] must be an object.`);
  const id = stringAt(value, 'id');
  const title = stringAt(value, 'title');
  const file = stringAt(value, 'file');
  if (!isProjectRelativePath(file))
    throw new Error(`chapters[${index}].file must stay inside the project.`);
  return { id, title, file };
}

/*** Reject absolute and parent-traversing paths before chapter files reach the filesystem. */
function isProjectRelativePath(file: string): boolean {
  const resolved = resolve('/book-project', file);
  const path = relative('/book-project', resolved);
  return path !== '' && !isAbsolute(file) && !path.startsWith(`..${sep}`) && path !== '..';
}

/*** Read a required non-empty string property. */
function stringAt(record: Record<string, unknown>, key: string): string {
  const value = optionalStringAt(record, key);
  if (value === undefined) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

/*** Read an optional non-empty string property. */
function optionalStringAt(record: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = Object.getOwnPropertyDescriptor(record, key)?.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/*** Check whether an unknown value is a record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
