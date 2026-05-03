import path from 'node:path';
import { config } from '../config.js';

export const paths = {
  requests:      path.join(config.dataDir, 'requests'),
  decisions:     path.join(config.dataDir, 'decisions'),
  senators:      path.join(config.dataDir, 'senators'),
  providers:     path.join(config.dataDir, 'providers'),
  contributions: path.join(config.dataDir, 'contributions'),
  audit:         path.join(config.dataDir, 'audit'),
};
