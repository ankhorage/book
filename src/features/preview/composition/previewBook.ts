import { exportBook } from '../../export/composition/exportBook.js';
import { previewBookAsync } from '../application/previewBookAsync.js';

/*** Compose loopback preview delivery with the publication composition root. */
export async function previewBook(input: Parameters<typeof previewBookAsync>[0]): Promise<void> {
  await previewBookAsync(input, { exportBook });
}
