export type Screen = 'home' | 'config' | 'download' | 'status' | 'files';

export interface AppConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface DownloadOptions {
  url: string;
  quality?: 'best' | '1080' | '720' | '480';
  audioOnly?: boolean;
  subtitles?: boolean;
  playlist?: boolean;
  sponsorblock?: boolean;
  impersonate?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  size: number;
  sha: string; // needed for deletion
}
