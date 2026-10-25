export interface BookProject {
  readonly metadata: BookMetadata;
  readonly chapters: readonly BookChapter[];
  readonly export: BookExportSettings;
}

interface BookMetadata {
  readonly title: string;
  readonly subtitle?: string;
  readonly author: string;
  readonly language: string;
  readonly cover?: string;
}

interface BookChapter {
  readonly id: string;
  readonly title: string;
  readonly file: string;
}

interface BookExportSettings {
  readonly pdf: { readonly pageSize: 'A5' };
  readonly epub: { readonly version: '3.0' };
}

export interface ImportReport {
  readonly source: string;
  readonly format: 'epub' | 'markdown' | 'pdf';
  readonly generatedAt: string;
  readonly warnings: readonly string[];
  readonly metadata?: Partial<
    Record<
      'author' | 'language' | 'title',
      { readonly confidence: 'high' | 'medium' | 'low'; readonly source: string }
    >
  >;
  readonly chapters: readonly {
    readonly id: string;
    readonly source: string;
    readonly confidence: 'high' | 'medium' | 'low';
  }[];
}
