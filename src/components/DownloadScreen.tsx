import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';
import { getConfig } from '../lib/config.ts';
import { triggerDownload } from '../lib/github.ts';
import type { DownloadOptions, Screen } from '../types.ts';

type Step = 'url' | 'quality' | 'flags' | 'confirm' | 'loading' | 'done' | 'error';

const qualityItems = [
  { label: 'Best (default)', value: 'best' },
  { label: '1080p', value: '1080' },
  { label: '720p', value: '720' },
  { label: '480p', value: '480' },
];

export default function DownloadScreen({
  onNav,
  onCommit,
}: {
  onNav: (s: Screen) => void;
  onCommit: (sha: string) => void;
}) {
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [opts, setOpts] = useState<Partial<DownloadOptions>>({});
  const [error, setError] = useState('');

  const handleUrl = (val: string) => {
    setUrl(val);
    setOpts((o) => ({ ...o, url: val }));
    setStep('quality');
  };

  const handleQuality = (item: { value: string }) => {
    setOpts((o) => ({ ...o, quality: item.value as DownloadOptions['quality'] }));
    setStep('flags');
  };

  const flagItems = [
    { label: opts.audioOnly ? '✅ Audio only (MP3)' : '⬜ Audio only (MP3)', value: 'audioOnly' },
    { label: opts.subtitles ? '✅ Download subtitles' : '⬜ Download subtitles', value: 'subtitles' },
    { label: opts.playlist ? '✅ Full playlist' : '⬜ Full playlist', value: 'playlist' },
    { label: opts.impersonate ? '✅ Impersonate' : '⬜ Impersonate', value: 'impersonate' },
    { label: '→  Continue', value: 'done' },
  ];

  const handleFlag = (item: { value: string }) => {
    if (item.value === 'done') {
      setStep('confirm');
      return;
    }
    setOpts((o) => ({ ...o, [item.value]: !o[item.value as keyof DownloadOptions] }));
  };

  const handleConfirm = async (item: { value: string }) => {
    if (item.value === 'cancel') {
      onNav('home');
      return;
    }
    setStep('loading');
    try {
      const config = getConfig() as any;
      const sha = await triggerDownload(config, { ...opts, url } as DownloadOptions);
      onCommit(sha);
    } catch (e: any) {
      setError(e.message);
      setStep('error');
    }
  };

  return (
    <Box flexDirection='column' padding={1} gap={1}>
      <Text bold color='yellow'>
        ⬇ New Download
      </Text>

      {step === 'url' && (
        <Box flexDirection='column'>
          <Text>YouTube URL:</Text>
          <TextInput value={url} onChange={setUrl} onSubmit={handleUrl} />
        </Box>
      )}

      {step === 'quality' && (
        <Box flexDirection='column'>
          <Text>Select quality:</Text>
          <SelectInput items={qualityItems} onSelect={handleQuality} />
        </Box>
      )}

      {step === 'flags' && (
        <Box flexDirection='column'>
          <Text dimColor>Space to toggle, select "Continue" when done:</Text>
          <SelectInput items={flagItems} onSelect={handleFlag} />
        </Box>
      )}

      {step === 'confirm' && (
        <Box flexDirection='column' gap={1}>
          <Text>Commit message will be:</Text>
          <Text color='cyan'>
            {' '}
            yt-dlp: {url}
            {opts.quality && opts.quality !== 'best' ? ` quality: ${opts.quality}` : ''}
            {opts.audioOnly ? ' audio-only: true' : ''}
            {opts.subtitles ? ' subtitles: true' : ''}
            {opts.playlist ? ' playlist: true' : ''}
            {opts.impersonate ? ' impersonate: true' : ''}
          </Text>
          <SelectInput
            items={[
              { label: '✅ Trigger download', value: 'go' },
              { label: '❌ Cancel', value: 'cancel' },
            ]}
            onSelect={handleConfirm}
          />
        </Box>
      )}

      {step === 'loading' && (
        <Box gap={1}>
          <Text color='green'>
            <Spinner type='dots' />
          </Text>
          <Text>Pushing commit to GitHub...</Text>
        </Box>
      )}

      {step === 'error' && (
        <Box flexDirection='column' gap={1}>
          <Text color='red'>❌ Error: {error}</Text>
          <Text dimColor>Press Q to go home</Text>
        </Box>
      )}
    </Box>
  );
}
