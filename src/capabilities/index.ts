import type { Capability } from '@ankhorage/contracts/capability';

/*** Publish Book's canonical authoring-provider capability catalog for discovery and bindings. */
export const CAPABILITIES = [
  {
    id: 'book.init',
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Create an editable book project.',
    description: 'Create an editable book project.',
  },
  {
    id: 'book.import',
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Import PDF, EPUB, or Markdown.',
    description: 'Import PDF, EPUB, or Markdown.',
  },
  {
    id: 'book.preview',
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Preview actual EPUB and PDF output locally.',
    description: 'Preview actual EPUB and PDF output locally.',
  },
  {
    id: 'book.export',
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Export EPUB and PDF.',
    description: 'Export EPUB and PDF.',
  },
  {
    id: 'book.validate',
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Validate an editable book project.',
    description: 'Validate an editable book project.',
  },
] as const satisfies readonly Capability[];
