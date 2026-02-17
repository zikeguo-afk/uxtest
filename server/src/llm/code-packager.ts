import type { CollectedSourceBundle, PackagedCodeChunk, PackagedCodeResult } from '../types/domain';

function estimateTokensFromBytes(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 4));
}

function buildArtifactBlock(
  artifactId: string,
  artifactType: string,
  url: string,
  hash: string,
  content: string,
): string {
  return [
    `### Artifact ${artifactId}`,
    `type: ${artifactType}`,
    `url: ${url}`,
    `hash: ${hash}`,
    'content:',
    content,
    '',
  ].join('\n');
}

function pushChunk(
  chunks: PackagedCodeChunk[],
  content: string,
  artifactIds: string[],
): void {
  const bytes = Buffer.byteLength(content, 'utf8');
  chunks.push({
    chunkId: `chunk-${chunks.length + 1}`,
    artifactIds: [...new Set(artifactIds)],
    content,
    bytes,
    tokenEstimate: estimateTokensFromBytes(bytes),
  });
}

export function packageCollectedCode(
  bundle: CollectedSourceBundle,
  tokenBudgetPerChunk: number,
): PackagedCodeResult {
  const safeTokenBudget = Math.max(600, tokenBudgetPerChunk);
  const maxChunkBytes = safeTokenBudget * 4;
  const chunks: PackagedCodeChunk[] = [];

  const documents = [
    bundle.mainDocument,
    ...bundle.artifacts.filter((artifact) => artifact.status === 'fetched'),
  ];

  for (const doc of documents) {
    const block = buildArtifactBlock(
      doc.artifactId,
      doc.type,
      doc.url,
      doc.hash,
      doc.content,
    );
    const blockBytes = Buffer.byteLength(block, 'utf8');

    if (blockBytes <= maxChunkBytes) {
      pushChunk(chunks, block, [doc.artifactId]);
      continue;
    }

    let cursor = 0;
    while (cursor < block.length) {
      const slice = block.slice(cursor, cursor + maxChunkBytes);
      if (!slice.trim()) {
        break;
      }
      pushChunk(chunks, slice, [doc.artifactId]);
      cursor += Math.max(1, maxChunkBytes);
    }
  }

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const totalTokenEstimate = chunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0);

  return {
    chunks,
    chunkCount: chunks.length,
    artifactCount: documents.length,
    totalBytes,
    totalTokenEstimate,
  };
}
