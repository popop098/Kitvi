// Package the approved Kitvi fox face. Rebuilding never redraws or replaces it.
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'assets'), { recursive: true });
await copyFile(resolve(root, 'assets/branding/icon-fox-v1.ico'), resolve(root, 'assets/kitvi.ico'));
await copyFile(resolve(root, 'assets/branding/icons/fox-256.png'), resolve(root, 'assets/kitvi-icon.png'));
