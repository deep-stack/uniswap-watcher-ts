import fs from 'fs-extra';
import toml from 'toml';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { DEFAULT_CONFIG_PATH } from '@vulcanize/util';

const getConfig = () => {
  const config = toml.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  const dbConfig = {
    ...config.database,
    namingStrategy: new SnakeNamingStrategy(),
    entities: ['dist/entity/*'],
    migrations: ['dist/migration/*'],
    cli: {
      migrationsDir: 'src/migration'
    }
  };

  return dbConfig;
};

const dbconfig = getConfig();
export default dbconfig;
