import fs from 'node:fs';
import { Octokit } from 'octokit';
import type { AppConfig, DownloadOptions } from '../types.ts';

export function buildCommitMessage(opts: DownloadOptions): string {
  let msg = `yt-dlp: ${opts.url}`;
  if (opts.quality && opts.quality !== 'best') msg += ` quality: ${opts.quality}`;
  if (opts.audioOnly) msg += ` audio-only: true`;
  if (opts.subtitles) msg += ` subtitles: true`;
  if (opts.playlist) msg += ` playlist: true`;
  if (opts.sponsorblock === false) msg += ` sponsorblock: false`;
  return msg;
}

export async function triggerDownload(config: AppConfig, opts: DownloadOptions): Promise<string> {
  const octokit = new Octokit({ auth: config.token });
  const { owner, repo } = config;

  // Get the current file (we'll update README.md as a dummy trigger)
  const { data: fileData } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: 'README.md',
  });

  if (Array.isArray(fileData) || fileData.type !== 'file') {
    throw new Error('Unexpected response for README.md');
  }

  const commitMessage = buildCommitMessage(opts);

  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'README.md',
    message: commitMessage,
    content: fileData.content, // same content, no actual change
    sha: fileData.sha,
  });

  return commitData.commit.sha!;
}

export async function getLatestWorkflowRun(config: AppConfig, commitSha: string) {
  const octokit = new Octokit({ auth: config.token });
  const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner: config.owner,
    repo: config.repo,
    per_page: 5,
  });

  return data.workflow_runs.find((run) => run.head_sha === commitSha) ?? null;
}

// Update the existing listDownloads function signature:
export async function listDownloads(config: AppConfig, subPath = 'downloads') {
  const octokit = new Octokit({ auth: config.token });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: subPath,
    });

    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export async function deleteFile(config: AppConfig, filePath: string, sha: string): Promise<void> {
  const octokit = new Octokit({ auth: config.token });

  await octokit.rest.repos.deleteFile({
    owner: config.owner,
    repo: config.repo,
    path: filePath,
    message: `Remove ${filePath.split('/').pop()} [skip ci]`,
    sha,
  });
}

export async function downloadFileViaApi(
  config: AppConfig,
  sha: string,
  savePath: string,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/git/blobs/${sha}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body!.getReader();
  const fileStream = fs.createWriteStream(savePath);
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
    received += value.byteLength;
    onProgress(received, contentLength);
  }

  await new Promise<void>((res, rej) => {
    fileStream.end((err?: Error | null) => (err ? rej(err) : res()));
  });
}

export async function downloadBlob(
  config: AppConfig,
  sha: string,
  savePath: string,
  fileSize: number,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/git/blobs/${sha}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Empty response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let jsonText = '';
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    received += value.byteLength;

    jsonText += decoder.decode(value, { stream: true });

    // Base64 transport overhead estimate
    const estimatedDecoded = Math.min(Math.floor(received * 0.75), Math.floor(fileSize * 0.95));

    onProgress(estimatedDecoded, fileSize);
  }

  jsonText += decoder.decode();

  const json = JSON.parse(jsonText) as {
    content: string;
    encoding: string;
    size: number;
  };

  // Free JSON text memory ASAP
  jsonText = '';

  if (json.encoding !== 'base64') {
    throw new Error(`Unexpected encoding: ${json.encoding}`);
  }

  // Remove GitHub inserted line breaks
  const base64 = json.content.replace(/\n/g, '');

  // Free original JSON object content ASAP
  json.content = '';

  const buffer = Buffer.from(base64, 'base64');

  await new Promise<void>((resolve, reject) => {
    fs.writeFile(savePath, buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  onProgress(buffer.byteLength, buffer.byteLength);
}
