# Public API

## BookProject

Kind: `type`
Module: `src/types/book.ts`
Source: `src/types/book.ts:1:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| chapters | property | `readonly BookChapter[]` | yes |  |
| export | property | `BookExportSettings` | yes |  |
| metadata | property | `BookMetadata` | yes |  |

## createProjectAsync

Kind: `function`
Module: `src/features/project/application/createProjectAsync.ts`
Source: `src/features/project/application/createProjectAsync.ts:7:1`

Create a new semantic book project, refusing accidental replacement.

### Signatures

- `(input: { readonly directory: string; readonly force: boolean; }) => Promise<void>`
  - input: `{ readonly directory: string; readonly force: boolean; }`
  - returns: `Promise<void>`

## exportBookAsync

Kind: `function`
Module: `src/features/export/application/exportBookAsync.ts`
Source: `src/features/export/application/exportBookAsync.ts:23:1`

Render the same canonical project to one or both publishable output formats.

### Signatures

- `(input: { readonly directory: string; readonly formats: readonly ("epub" | "pdf")[]; readonly outputDirectory?: string; readonly force: boolean; }, port: ExportBookPort) => Promise<readonly string[]>`
  - input: `{ readonly directory: string; readonly formats: readonly ("epub" | "pdf")[]; readonly outputDirectory?: string; readonly force: boolean; }`
  - port: `ExportBookPort`
  - returns: `Promise<readonly string[]>`

## importBookAsync

Kind: `function`
Module: `src/features/import/application/importBookAsync.ts`
Source: `src/features/import/application/importBookAsync.ts:22:1`

Import a supported source into an editable, source-independent book project.

### Signatures

- `(input: { readonly source: string; readonly outputDirectory?: string; readonly force: boolean; }, port: ImportBookPort) => Promise<string>`
  - input: `{ readonly source: string; readonly outputDirectory?: string; readonly force: boolean; }`
  - port: `ImportBookPort`
  - returns: `Promise<string>`

## ImportReport

Kind: `type`
Module: `src/types/book.ts`
Source: `src/types/book.ts:26:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| chapters | property | `readonly { readonly id: string; readonly source: string; readonly confidence: "high" \| "medium" \| "low"; }[]` | yes |  |
| format | property | `"epub" \| "pdf" \| "markdown"` | yes |  |
| generatedAt | property | `string` | yes |  |
| source | property | `string` | yes |  |
| warnings | property | `readonly string[]` | yes |  |

## readProjectAsync

Kind: `function`
Module: `src/features/project/application/readProjectAsync.ts`
Source: `src/features/project/application/readProjectAsync.ts:9:1`

Read and validate a normalized, editable book project.

### Signatures

- `(directory: string) => Promise<BookProject>`
  - directory: `string`
  - returns: `Promise<BookProject>`

## validateProjectAsync

Kind: `function`
Module: `src/features/validation/application/validateProjectAsync.ts`
Source: `src/features/validation/application/validateProjectAsync.ts:7:1`

Validate editable project inputs and report each missing canonical chapter.

### Signatures

- `(directory: string) => Promise<readonly string[]>`
  - directory: `string`
  - returns: `Promise<readonly string[]>`
