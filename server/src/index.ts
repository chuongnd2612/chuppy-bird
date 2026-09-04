import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const { config, warnings } = loadConfig();
const app = await buildApp({ config });

for (const warning of warnings) app.log.warn(warning);
if (config.DEMO_MODE) app.log.warn('DEMO_MODE is on: serving fixtures, not real Azure DevOps data.');

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}
